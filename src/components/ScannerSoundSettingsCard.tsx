import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Music,
  PlayCircle,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  loadScannerSoundConfig,
  playScannerSound,
  saveScannerSoundConfig,
  SCANNER_SOUND_UPDATED_EVENT,
  unlockScannerAudio,
  type ScannerSoundConfig,
  type ScannerSoundPreset,
} from '../scannerSound';
import { toBengaliNumerals } from '../accounting';

interface ScannerSoundSettingsCardProps {
  onStatusMessage?: (msg: string) => void;
  compact?: boolean;
}

export default function ScannerSoundSettingsCard({
  onStatusMessage,
  compact = false,
}: ScannerSoundSettingsCardProps) {
  const [config, setConfig] = useState<ScannerSoundConfig>(() => loadScannerSoundConfig());
  const [uploadError, setUploadError] = useState<string>('');

  useEffect(() => {
    const handleSync = () => {
      setConfig(loadScannerSoundConfig());
    };
    window.addEventListener(SCANNER_SOUND_UPDATED_EVENT, handleSync);
    return () => window.removeEventListener(SCANNER_SOUND_UPDATED_EVENT, handleSync);
  }, []);

  function handleUploadAudioFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadError('');
    unlockScannerAudio();

    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|aac|webm)$/i.test(file.name)) {
      setUploadError('অনুগ্রহ করে একটি সঠিক অডিও ফাইল (MP3, WAV, OGG, M4A) নির্বাচন করুন।');
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setUploadError('অডিও ফাইলটি সর্বোচ্চ ৪ মেগাবাইট (4MB)-এর মধ্যে হতে হবে।');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl || !dataUrl.startsWith('data:')) {
        setUploadError('অডিও ফাইল লোড করতে সমস্যা হয়েছে।');
        return;
      }
      const next = saveScannerSoundConfig({
        enabled: true,
        preset: 'custom',
        customAudioDataUrl: dataUrl,
        customFileName: file.name,
      });
      setConfig(next);
      setTimeout(() => {
        playScannerSound('success', true);
      }, 60);
      onStatusMessage?.(`🔊 নতুন স্ক্যানার সাউন্ড "${file.name}" সফলভাবে আপলোড ও সেট করা হয়েছে!`);
    };
    reader.onerror = () => {
      setUploadError('অডিও ফাইল রিড করা যায়নি, আবার চেষ্টা করুন।');
    };
    reader.readAsDataURL(file);
  }

  function handlePresetChange(preset: ScannerSoundPreset) {
    unlockScannerAudio();
    const next = saveScannerSoundConfig({
      enabled: true,
      preset,
    });
    setConfig(next);
    setTimeout(() => {
      playScannerSound('success', true);
    }, 40);
  }

  function handleRemoveCustomSound() {
    const next = saveScannerSoundConfig({
      preset: 'default_beep',
      customAudioDataUrl: '',
      customFileName: '',
    });
    setConfig(next);
    onStatusMessage?.('🔄 কাস্টম সাউন্ড মুছে ডিফল্ট সুপারশপ লেজার বিপ সেট করা হয়েছে।');
  }

  return (
    <div
      className={compact ? '' : 'brand-popup-setting-card'}
      style={
        compact
          ? {
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '12px',
              padding: '12px',
              color: '#f8fafc',
            }
          : { marginTop: '16px' }
      }
    >
      {!compact && (
        <div className="brand-popup-setting-top">
          <div className="brand-popup-setting-info">
            <div
              className="brand-popup-setting-icon"
              style={{
                background: 'linear-gradient(135deg, #0d9488, #059669)',
                color: '#ffffff',
              }}
            >
              {config.enabled ? <Volume2 size={22} /> : <VolumeX size={22} />}
            </div>
            <div className="brand-popup-setting-text">
              <div className="brand-popup-setting-title-row">
                <h3>🔊 SKU ও ক্যামেরা স্ক্যানার সাউন্ড সেটিংস (কাস্টম সাউন্ড আপলোড)</h3>
                <span
                  className={`brand-popup-status-pill ${
                    config.enabled ? 'is-on' : 'is-off'
                  }`}
                >
                  {config.enabled ? 'সাউন্ড চালু (ON)' : 'সাউন্ড বন্ধ (OFF)'}
                </span>
              </div>
              <p>
                প্রতিটি প্রডাক্টের <b>SKU কোড / বারকোড</b> বা ছবি সঠিক ম্যাচ হয়ে সেল কনফার্ম হওয়ার সাথে সাথে এই সাউন্ড বাজবে। আপনি নিজের পছন্দমতো যেকোনো সাউন্ড ফাইল (MP3, WAV, OGG, M4A) আপলোড করে রাখতে পারবেন।
              </p>
            </div>
          </div>

          <div className="brand-popup-setting-controls">
            <button
              type="button"
              role="switch"
              aria-checked={config.enabled}
              className={`brand-toggle-switch-btn ${config.enabled ? 'active' : ''}`}
              onClick={() => {
                const next = saveScannerSoundConfig({ enabled: !config.enabled });
                setConfig(next);
                if (next.enabled) playScannerSound('success', true);
              }}
            >
              <span className="brand-toggle-knob" />
              <span className="brand-toggle-label">
                {config.enabled ? 'স্ক্যান সাউন্ড: ON' : 'স্ক্যান সাউন্ড: OFF'}
              </span>
            </button>

            <button
              type="button"
              className="brand-preview-trigger-btn"
              onClick={() => {
                unlockScannerAudio();
                playScannerSound('success', true);
              }}
            >
              <PlayCircle size={16} />
              <span>সাউন্ড বাজিয়ে টেস্ট করুন</span>
            </button>
          </div>
        </div>
      )}

      {/* Custom Audio Upload & Preset Controls */}
      <div
        style={{
          marginTop: compact ? 0 : '14px',
          paddingTop: compact ? 0 : '14px',
          borderTop: compact ? 'none' : '1px dashed #cbd5e1',
          display: 'grid',
          gap: '12px',
        }}
      >
        {/* Row 1: Upload Custom Sound Button + Current Uploaded Sound Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            background: compact ? '#0f172a' : '#f0fdfa',
            border: compact ? '1px solid #334155' : '1.5px solid #99f6e4',
            borderRadius: '11px',
            padding: '10px 13px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '9px',
                background: 'linear-gradient(135deg, #10b981, #0d9488)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Music size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 800,
                  color: compact ? '#f8fafc' : '#0f172a',
                }}
              >
                {config.customAudioDataUrl
                  ? `🎵 আপলোডকৃত সাউন্ড: ${config.customFileName || 'Custom Sound'}`
                  : '🎵 কাস্টম স্ক্যান সাউন্ড আপলোড করুন (MP3 / WAV / OGG / M4A)'}
              </div>
              <div
                style={{
                  fontSize: '11.5px',
                  color: compact ? '#94a3b8' : '#0f766e',
                  marginTop: '1px',
                }}
              >
                {config.customAudioDataUrl && config.preset === 'custom'
                  ? '✅ বর্তমানে আপনার আপলোড করা কাস্টম সাউন্ড সক্রিয় আছে'
                  : 'আপনার ফোন বা কম্পিউটার থেকে যেকোনো বিপ/টিউন আপলোড করতে পারেন'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <label
              style={{
                background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '9px',
                padding: '7px 13px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                margin: 0,
                boxShadow: '0 2px 8px rgba(13, 148, 136, 0.25)',
              }}
            >
              <Upload size={14} />
              <span>{config.customAudioDataUrl ? 'নতুন সাউন্ড পরিবর্তন' : 'সাউন্ড আপলোড করুন'}</span>
              <input
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
                onChange={handleUploadAudioFile}
                style={{ display: 'none' }}
              />
            </label>

            {compact && (
              <button
                type="button"
                onClick={() => {
                  unlockScannerAudio();
                  playScannerSound('success', true);
                }}
                style={{
                  background: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '9px',
                  padding: '7px 11px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <PlayCircle size={14} />
                <span>টেস্ট</span>
              </button>
            )}

            {config.customAudioDataUrl && (
              <button
                type="button"
                onClick={handleRemoveCustomSound}
                title="আপলোড করা সাউন্ড মুছে ডিফল্ট বিপ সাউন্ডে ফিরে যান"
                style={{
                  background: compact ? '#450a0a' : '#fef2f2',
                  color: compact ? '#fca5a5' : '#dc2626',
                  border: `1px solid ${compact ? '#dc2626' : '#fecaca'}`,
                  borderRadius: '9px',
                  padding: '7px 10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Trash2 size={13} />
                <span>ডিফল্ট করুন</span>
              </button>
            )}
          </div>
        </div>

        {uploadError && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              borderRadius: '8px',
              padding: '7px 11px',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            ⚠️ {uploadError}
          </div>
        )}

        {/* Row 2: Sound Mode Selector Chips + Volume Control */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: compact ? '#cbd5e1' : '#334155',
              }}
            >
              সাউন্ড টোন নির্বাচন:
            </span>

            {config.customAudioDataUrl && (
              <button
                type="button"
                onClick={() => handlePresetChange('custom')}
                style={{
                  background:
                    config.preset === 'custom'
                      ? '#059669'
                      : compact
                      ? '#0f172a'
                      : '#ffffff',
                  color:
                    config.preset === 'custom'
                      ? '#ffffff'
                      : compact
                      ? '#cbd5e1'
                      : '#0f172a',
                  border: `1.5px solid ${
                    config.preset === 'custom' ? '#10b981' : '#cbd5e1'
                  }`,
                  borderRadius: '8px',
                  padding: '5px 10px',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <CheckCircle2 size={13} />
                <span>আপলোডকৃত সাউন্ড</span>
              </button>
            )}

            {(
              [
                { id: 'default_beep', label: '⚡ সুপারশপ লেজার বিপ' },
                { id: 'cash_register', label: '🔔 ক্যাশ রেজিস্টার বেল' },
                { id: 'double_chime', label: '🎵 ডাবল সাকসেস টিউন' },
              ] as Array<{ id: ScannerSoundPreset; label: string }>
            ).map((item) => {
              const active = config.preset === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handlePresetChange(item.id)}
                  style={{
                    background: active ? '#0d9488' : compact ? '#0f172a' : '#ffffff',
                    color: active ? '#ffffff' : compact ? '#cbd5e1' : '#334155',
                    border: `1.5px solid ${
                      active ? '#14b8a6' : compact ? '#334155' : '#cbd5e1'
                    }`,
                    borderRadius: '8px',
                    padding: '5px 10px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Volume Slider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              minWidth: '180px',
            }}
          >
            <Volume2 size={15} color={compact ? '#34d399' : '#0d9488'} />
            <span
              style={{
                fontSize: '11.5px',
                fontWeight: 700,
                color: compact ? '#cbd5e1' : '#475569',
                whiteSpace: 'nowrap',
              }}
            >
              ভলিউম ({toBengaliNumerals(Math.round(config.volume * 100))}%):
            </span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={config.volume}
              onChange={(e) => {
                const vol = Number(e.target.value) || 0.9;
                const next = saveScannerSoundConfig({ volume: vol });
                setConfig(next);
              }}
              style={{
                flex: 1,
                accentColor: '#0d9488',
                cursor: 'pointer',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
