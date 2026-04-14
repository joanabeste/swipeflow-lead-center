export type UserRole = "admin" | "sales" | "viewer";
export type UserStatus = "active" | "inactive";

export type ServiceMode = "recruiting" | "webdev";

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  service_mode: ServiceMode;
  lead_table_columns: string[] | null;
  created_at: string;
  updated_at: string;
}

export type LeadStatus =
  | "imported"
  | "filtered"
  | "cancelled"
  | "enrichment_pending"
  | "enriched"
  | "qualified"
  | "exported";

export type LeadSourceType = "csv" | "url" | "directory";

export interface Lead {
  id: string;
  status: LeadStatus;
  company_name: string;
  domain: string | null;
  phone: string | null;
  email: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  state: string | null;
  country: string | null;
  industry: string | null;
  company_size: string | null;
  legal_form: string | null;
  register_id: string | null;
  website: string | null;
  career_page_url: string | null;
  description: string | null;
  hubspot_company_id: string | null;
  source_import_id: string | null;
  source_type: LeadSourceType;
  source_url: string | null;
  blacklist_hit: boolean;
  blacklist_reason: string | null;
  cancel_reason: string | null;
  cancel_rule_id: string | null;
  has_ssl: boolean | null;
  is_mobile_friendly: boolean | null;
  page_speed_score: number | null;
  website_tech: string | null;
  website_age_estimate: string | null;
  website_issues: string[];
  enriched_at: string | null;
  enrichment_source: string | null;
  latitude: number | null;
  longitude: number | null;
  geocoded_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadChange {
  id: string;
  lead_id: string;
  user_id: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export type BlacklistMatchType = "name" | "domain" | "register_id";

export interface BlacklistEntry {
  id: string;
  match_type: BlacklistMatchType;
  match_value: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export type RuleOperator = "equals" | "contains" | "starts_with" | "in_list";

export interface BlacklistRule {
  id: string;
  name: string;
  field: string;
  operator: RuleOperator;
  value: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface FilterLog {
  id: string;
  lead_id: string;
  rule_id: string | null;
  blacklist_entry_id: string | null;
  reason: string;
  overridden: boolean;
  overridden_by: string | null;
  overridden_at: string | null;
  created_at: string;
}

export type ImportStatus = "pending" | "processing" | "completed" | "failed";

export type ImportType = "csv" | "url" | "directory";

export interface ImportLog {
  id: string;
  file_name: string;
  file_path: string;
  row_count: number;
  imported_count: number;
  skipped_count: number;
  duplicate_count: number;
  error_count: number;
  mapping_template_id: string | null;
  import_type: ImportType;
  source_url: string | null;
  updated_count: number;
  status: ImportStatus;
  errors: { row: number; field: string; message: string }[];
  created_by: string | null;
  created_at: string;
}

export interface MappingTemplate {
  id: string;
  name: string;
  mapping: Record<string, string>;
  delimiter: string;
  encoding: string;
  created_by: string | null;
  created_at: string;
}

export type ExportStatus = "pending" | "success" | "failed" | "duplicate";

export interface ExportLog {
  id: string;
  lead_id: string;
  hubspot_company_id: string | null;
  status: ExportStatus;
  error_message: string | null;
  response_data: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

export interface RequiredFieldProfile {
  id: string;
  name: string;
  required_fields: string[];
  is_default: boolean;
  created_by: string | null;
  created_at: string;
}

export interface LeadContact {
  id: string;
  lead_id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  source_url: string | null;
  created_at: string;
}

export interface LeadJobPosting {
  id: string;
  lead_id: string;
  title: string;
  url: string | null;
  location: string | null;
  posted_date: string | null;
  created_at: string;
}

export type EnrichmentStatus = "pending" | "running" | "completed" | "failed";

export interface LeadEnrichment {
  id: string;
  lead_id: string;
  status: EnrichmentStatus;
  source: string | null;
  career_page_url: string | null;
  raw_response: Record<string, unknown> | null;
  error_message: string | null;
  pages_fetched: string[] | null;
  config: EnrichmentConfig | null;
  created_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

// ============================================================
// Enrichment-Konfiguration
// ============================================================

export interface EnrichmentConfig {
  contacts_management: boolean;
  contacts_all: boolean;
  job_postings: boolean;
  career_page: boolean;
  company_details: boolean;
}

export const DEFAULT_ENRICHMENT_CONFIG: EnrichmentConfig = {
  contacts_management: true,
  contacts_all: false,
  job_postings: true,
  career_page: true,
  company_details: true,
};

export type WebdevStrictness = "lax" | "normal" | "strict";

export interface WebdevScoringConfig {
  strictness: WebdevStrictness;
  design_focus: string | null;
  min_issues_to_qualify: number;
  slow_load_threshold_ms: number;
  very_slow_load_threshold_ms: number;
  check_ssl: boolean;
  check_responsive: boolean;
  check_meta_tags: boolean;
  check_alt_tags: boolean;
  check_outdated_html: boolean;
}

export const DEFAULT_WEBDEV_SCORING: WebdevScoringConfig = {
  strictness: "normal",
  design_focus: null,
  min_issues_to_qualify: 2,
  slow_load_threshold_ms: 3000,
  very_slow_load_threshold_ms: 5000,
  check_ssl: true,
  check_responsive: true,
  check_meta_tags: true,
  check_alt_tags: true,
  check_outdated_html: true,
};

// ============================================================
// Cancel-Rules (Ausschlussregeln)
// ============================================================

export type CancelRuleCategory = "import" | "enrichment" | "both";

export type CancelOperator =
  | "equals"
  | "contains"
  | "starts_with"
  | "in_list"
  | "greater_than"
  | "less_than"
  | "is_empty"
  | "is_not_empty";

export interface CancelRule {
  id: string;
  name: string;
  description: string | null;
  category: CancelRuleCategory;
  field: string;
  operator: CancelOperator;
  value: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}
