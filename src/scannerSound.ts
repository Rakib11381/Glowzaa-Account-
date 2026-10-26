// Shared Scanner Sound Utility for Camera SKU / POS Auto-Sale
// Supports Custom Uploaded Audio (MP3/WAV/OGG/M4A) + Built-in POS Laser Synthesizers
// Pre-loads custom audio in memory for 0ms sub-second playback on match.

export type ScannerSoundPreset = 'custom' | 'default_beep' | 'cash_register' | 'double_chime';

export interface ScannerSoundConfig {
  enabled: boolean;
  preset: ScannerSoundPreset;
  customAudioDataUrl: string;
  customFileName: string;
  volume: number; // 0.1 to 1.0
}

const STORAGE_KEY = 'glowzaa_scanner_sound_config_v1';
export const SCANNER_SOUND_UPDATED_EVENT = 'glowzaa-scanner-sound-updated';

const DEFAULT_CONFIG: ScannerSoundConfig = {
  enabled: true,
  preset: 'default_beep',
  customAudioDataUrl: '',
  customFileName: '',
  volume: 0.9,
};

let sharedAudioCtx: AudioContext | null = null;
let cachedAudioElement: HTMLAudioElement | null = null;
let cachedAudioUrl = '';

export function loadScannerSoundConfig(): ScannerSoundConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled !== false,
      preset:
        parsed.preset === 'custom' ||
        parsed.preset === 'default_beep' ||
        parsed.preset === 'cash_register' ||
        parsed.preset === 'double_chime'
          ? parsed.preset
          : parsed.customAudioDataUrl
          ? 'custom'
          : 'default_beep',
      customAudioDataUrl:
        typeof parsed.customAudioDataUrl === 'string' ? parsed.customAudioDataUrl : '',
      customFileName: typeof parsed.customFileName === 'string' ? parsed.customFileName : '',
      volume:
        typeof parsed.volume === 'number' && parsed.volume >= 0.05 && parsed.volume <= 1
          ? parsed.volume
          : 0.9,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveScannerSoundConfig(next: Partial<ScannerSoundConfig>): ScannerSoundConfig {
  const current = loadScannerSoundConfig();
  const merged: ScannerSoundConfig = {
    ...current,
    ...next,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {}
  preloadCustomAudio(merged.customAudioDataUrl, merged.volume);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SCANNER_SOUND_UPDATED_EVENT, { detail: merged }));
  }
  return merged;
}

export function preloadCustomAudio(dataUrl?: string, volume = 0.9): HTMLAudioElement | null {
  try {
    const urlToLoad = dataUrl ?? loadScannerSoundConfig().customAudioDataUrl;
    if (!urlToLoad || !urlToLoad.startsWith('data:audio/')) {
      cachedAudioElement = null;
      cachedAudioUrl = '';
      return null;
    }
    if (cachedAudioElement && cachedAudioUrl === urlToLoad) {
      cachedAudioElement.volume = Math.max(0.05, Math.min(1, volume));
      return cachedAudioElement;
    }
    const audio = new Audio(urlToLoad);
    audio.preload = 'auto';
    audio.volume = Math.max(0.05, Math.min(1, volume));
    audio.load();
    cachedAudioElement = audio;
    cachedAudioUrl = urlToLoad;
    return audio;
  } catch {
    return null;
  }
}

export function unlockScannerAudio(): AudioContext | null {
  try {
    const cfg = loadScannerSoundConfig();
    if (cfg.customAudioDataUrl) {
      preloadCustomAudio(cfg.customAudioDataUrl, cfg.volume);
    }
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

function playSynthesizedTone(
  type: 'success' | 'undo',
  preset: ScannerSoundPreset,
  volume: number
) {
  try {
    const ctx = unlockScannerAudio();
    if (!ctx) return;

    const now = ctx.currentTime;
    const safeVol = Math.max(0.05, Math.min(1, volume)) * 0.55;

    if (type === 'undo') {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(540, now);
      osc1.frequency.setValueAtTime(340, now + 0.08);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(270, now);
      osc2.frequency.setValueAtTime(170, now + 0.08);

      gain.gain.setValueAtTime(safeVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.2);
      osc2.stop(now + 0.2);
      return;
    }

    if (preset === 'cash_register') {
      // Classic bright Cash Register Bell (Ding-Chime: 1318Hz E6 -> 2637Hz E7)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1318.5, now);
      osc1.frequency.setValueAtTime(2637, now + 0.07);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1975.5, now);
      osc2.frequency.setValueAtTime(3951, now + 0.07);

      gain.gain.setValueAtTime(safeVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.34);
      osc2.stop(now + 0.34);
      return;
    }

    if (preset === 'double_chime') {
      // Crisp 2-step verification chime (C6 -> G6 -> C7)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, now);
      osc.frequency.setValueAtTime(1568, now + 0.06);
      osc.frequency.setValueAtTime(2093, now + 0.12);

      gain.gain.setValueAtTime(safeVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

      osc.start(now);
      osc.stop(now + 0.26);
      return;
    }

    // Default: Supermarket Laser POS Scanner Beep (1850Hz -> 2480Hz)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1850, now);
    osc1.frequency.setValueAtTime(2480, now + 0.065);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(925, now);
    osc2.frequency.setValueAtTime(1240, now + 0.065);

    gain.gain.setValueAtTime(safeVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.19);
    osc2.stop(now + 0.19);
  } catch {}
}

export function playScannerSound(type: 'success' | 'undo' = 'success', forcePlay = false) {
  const cfg = loadScannerSoundConfig();
  if (!cfg.enabled && !forcePlay) return;

  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(type === 'success' ? [65, 30, 90] : [50, 40, 50]);
    }
  } catch {}

  // When a successful scan occurs and custom uploaded audio is active, play it immediately with 0ms lag
  if (type === 'success' && cfg.preset === 'custom' && cfg.customAudioDataUrl) {
    try {
      const audio = preloadCustomAudio(cfg.customAudioDataUrl, cfg.volume);
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = Math.max(0.05, Math.min(1, cfg.volume));
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            // Fallback to synthesized beep if browser autoplay policy blocks HTMLAudioElement
            playSynthesizedTone('success', 'default_beep', cfg.volume);
          });
        }
        return;
      }
    } catch {
      playSynthesizedTone('success', 'default_beep', cfg.volume);
      return;
    }
  }

  playSynthesizedTone(type, cfg.preset, cfg.volume);
}
