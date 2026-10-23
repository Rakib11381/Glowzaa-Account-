export type RecordType = 'investment' | 'sale' | 'purchase' | 'expense' | 'withdrawal' | 'loan' | 'other';
export type EntryStatus = 'draft' | 'posted' | 'void';
export type Role = 'admin' | 'investor';

export interface Investor {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  active: boolean;
  demo?: boolean;
  notes?: string;
  createdAt?: any;
}

export interface Product {
  id: string;
  name: string;
  sku?: string;
  unit: string;
  currentStock: number;
  averageCost: number;
  sellingPrice: number;
  imageUrl?: string;
  demo?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface Entry {
  id: string;
  type: RecordType;
  title: string;
  amount: number; // In BDT (positive number)
  date: string; // YYYY-MM-DD
  status: EntryStatus;
  investorId?: string;
  productId?: string;
  quantity?: number;
  unitCost?: number;
  unitPrice?: number;
  cogsAmount?: number; // Cost of goods sold for sales
  grossProfit?: number; // Sales amount - COGS
  profit?: number; // Direct profit amount (alias for grossProfit)
  category?: string;
  notes?: string;
  demo?: boolean;
  createdAt?: any;
  createdBy?: string;
  updatedAt?: any;
  updatedBy?: string;
  voidReason?: string;
  voidedBy?: string;
  voidedAt?: any;
}

export interface PartnerShare {
  investorId: string;
  investorName: string;
  sharePercent: number;
  allocatedAmount: number;
  withdrawnAmount?: number;
}

export interface ProfitDistribution {
  id: string;
  periodName: string;
  date: string;
  totalNetProfit: number;
  distributedAmount: number;
  retainedAmount: number;
  status: EntryStatus;
  shares: PartnerShare[];
  demo?: boolean;
  createdAt?: any;
  createdBy?: string;
}

export interface BusinessSettings {
  name: string;
  type: string;
  address: string;
  phone: string;
  currencySymbol?: string;
  superAdminEmail?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  recordId: string;
  actor: string;
  actorEmail?: string;
  reason?: string;
  createdAt: any;
  formattedTime?: string;
  maker?: string;
  makerName?: string;
  approver?: string;
  approverName?: string;
  approvedAtFormatted?: string;
  details?: Record<string, any>;
}

export type ApprovalActionType =
  | 'create_entry'
  | 'edit_entry'
  | 'delete_entry'
  | 'create_product'
  | 'edit_product'
  | 'delete_product'
  | 'create_investor'
  | 'edit_investor'
  | 'delete_investor'
  | 'distribute_profit'
  | 'record_waste';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRequest {
  id: string;
  actionType: ApprovalActionType;
  targetCollection: 'entries' | 'products' | 'investors' | 'profitDistributions';
  targetId?: string;
  title: string;
  description: string;
  reason: string;
  requestedBy: 'Rakib' | 'Limon';
  requestedByName: string;
  requestedAt: string; // ISO string
  requestedAtFormatted: string; // Bengali formatted date-time e.g., "২৩/১০/২০২৬, ৯:৫৭:০৩ PM"
  targetApprover: 'Rakib' | 'Limon';
  targetApproverName: string;
  status: ApprovalStatus;
  reviewedBy?: 'Rakib' | 'Limon';
  reviewedByName?: string;
  reviewedAt?: string;
  reviewedAtFormatted?: string;
  reviewNote?: string;
  payload: any;
  previousData?: any;
  createdAt?: any;
}

export interface UserProfile {
  uid: string;
  email: string;
  role: Role;
  active: boolean;
  displayName?: string;
  investorId?: string;
  createdAt?: any;
}