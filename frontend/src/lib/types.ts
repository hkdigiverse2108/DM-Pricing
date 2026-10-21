export interface UserOut {
  id: string;
  email: string;
  full_name: string;
  role: "user" | "admin";
  is_active: boolean;
  created_at: string;
}

export interface PlanSummary {
  name: string;
  slug: string;
  max_instagram_accounts: number;
  max_keywords: number;
  max_dm_per_month: number;
}

export interface Me {
  user: UserOut;
  plan: PlanSummary | null;
  usage: { instagram_accounts: number; keywords: number; dm_this_month: number };
}

export interface PlanFeature {
  feature_key: string;
  feature_name: string;
  is_included: boolean;
}

export interface Plan {
  id: string;
  name: string;
  slug: string;
  price_monthly: string | number;
  price_yearly: string | number;
  description: string | null;
  max_instagram_accounts: number;
  max_keywords: number;
  max_dm_per_month: number;
  is_active: boolean;
  sort_order: number;
  features: PlanFeature[];
}

export interface Addon {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_monthly: string | number;
  is_active: boolean;
}

export interface PricingData {
  plans: Plan[];
  addons: Addon[];
}

export type Platform = "instagram" | "facebook";
export type EventType = "match" | "public_reply" | "dm_sent" | "follow_gate_shown" | "follow_gate_passed" | "error";

export interface Account {
  id: string;
  platform: Platform;
  external_id: string;
  username: string;
  is_active: boolean;
  token_expires_at: string | null;
  created_at: string;
}

export interface Keyword {
  id: string;
  connected_account_id: string;
  keyword: string;
  message: string;
  comment_reply1: string | null;
  comment_reply2: string | null;
  comment_reply3: string | null;
  follow_gate_message: string | null;
  follow_gate_button_text: string | null;
  media_id: string | null;
  require_follow: boolean;
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminStats {
  users: number;
  active_users: number;
  connected_accounts: number;
  keywords: number;
  plans: number;
  dm_this_month: number;
}

export interface UserList {
  total: number;
  items: UserOut[];
}

export interface Overview {
  days: number;
  totals: Record<EventType, number>;
  daily: Array<{ date: string; matches: number; dm_sent: number }>;
}

export interface KeywordStat {
  keyword_id: string;
  match: number;
  public_reply: number;
  dm_sent: number;
  follow_gate_shown: number;
  follow_gate_passed: number;
  error: number;
  last_event_at: string | null;
}
