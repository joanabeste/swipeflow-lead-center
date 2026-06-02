export type UserRole = "admin" | "sales" | "viewer" | "employee";
export type UserStatus = "active" | "inactive";

export type ServiceMode = "recruiting" | "webdev";

export type BreakMode = "manual" | "auto_deduct";

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  service_mode: ServiceMode;
  lead_table_columns: string[] | null;
  dashboard_widgets: string[] | null;
  phonemondo_extension: string | null;
  /** Verschluesselter pro-Nutzer-PhoneMondo-Token (nur server-seitig entschluesseln; NULL = Team-Token). */
  phonemondo_api_token?: string | null;
  // Zeit-Modul (Migration 062). Optional, weil Migration zum Zeitpunkt der UI-Verifikation
  // noch nicht zwingend ausgefuehrt ist — Defaults werden in lib/zeit/profile.ts ergaenzt.
  hours_mon?: number | null;
  hours_tue?: number | null;
  hours_wed?: number | null;
  hours_thu?: number | null;
  hours_fri?: number | null;
  hours_sat?: number | null;
  hours_sun?: number | null;
  vacation_days_per_year?: number | null;
  break_mode?: BreakMode | null;
  // Provisions-/Auszahlungs-Modul (Migration 065). Optional, da Migration evtl.
  // noch nicht ausgefuehrt ist — UI defaultet auf null/0.
  hourly_wage_cents?: number | null;
  wage_currency?: string | null;
  // Sektion-Berechtigungen (Migration 075). Admins haben immer Zugriff (siehe permissionsFromProfile).
  can_vertrieb?: boolean | null;
  can_fulfillment?: boolean | null;
  can_zeit?: boolean | null;
  // Learning-Modul (Migration 085). Admins haben implizit beides.
  can_learning?: boolean | null;
  can_learning_edit?: boolean | null;
  // Verträge-Modul (Migration 103). Restriktiver Default (false), Admins immer Zugriff.
  can_vertraege?: boolean | null;
  created_at: string;
  updated_at: string;
}

/** Sektion-Berechtigungen pro User. Admins haben immer Zugriff (Code-Override). */
export interface SectionPermissions {
  can_vertrieb: boolean;
  can_fulfillment: boolean;
  can_zeit: boolean;
  can_learning: boolean;
  can_vertraege: boolean;
}

/** Permissions aus dem Profile ableiten, mit Defensiv-Defaults wenn Migration 075/085/103 fehlt. */
export function permissionsFromProfile(
  profile: Pick<Profile, "role" | "can_vertrieb" | "can_fulfillment" | "can_zeit" | "can_learning" | "can_vertraege">,
): SectionPermissions {
  if (profile.role === "admin")
    return { can_vertrieb: true, can_fulfillment: true, can_zeit: true, can_learning: true, can_vertraege: true };
  if (profile.role === "employee") {
    return {
      can_vertrieb: profile.can_vertrieb ?? false,
      can_fulfillment: profile.can_fulfillment ?? false,
      can_zeit: profile.can_zeit ?? true,
      can_learning: profile.can_learning ?? false,
      can_vertraege: profile.can_vertraege ?? false,
    };
  }
  // sales / viewer
  return {
    can_vertrieb: profile.can_vertrieb ?? true,
    can_fulfillment: profile.can_fulfillment ?? true,
    can_zeit: profile.can_zeit ?? true,
    can_learning: profile.can_learning ?? false,
    can_vertraege: profile.can_vertraege ?? false,
  };
}

/** Editor-Rechte fuer Learning (Admin oder explizites Flag). */
export function canEditLearning(profile: Pick<Profile, "role" | "can_learning_edit">): boolean {
  if (profile.role === "admin") return true;
  return profile.can_learning_edit === true;
}

export type LeadStatus =
  | "imported"
  | "filtered"
  | "cancelled"
  | "enrichment_pending"
  | "enriched"
  | "qualified"
  | "exported";

/** Anzeige-Optionen fuer LeadStatus — Label + Tailwind-Klassen fuer Status-Pille.
 *  Wird in lead-detail-panel und lead-profile-panel verwendet (DRY). */
export const LEAD_STATUS_OPTIONS: { value: LeadStatus; label: string; color: string }[] = [
  { value: "imported", label: "Importiert", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  { value: "filtered", label: "Gefiltert", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  { value: "cancelled", label: "Ausgeschlossen", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  { value: "enrichment_pending", label: "Anreicherung", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  { value: "enriched", label: "Angereichert", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { value: "qualified", label: "Qualifiziert", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { value: "exported", label: "Exportiert", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
];

/**
 * Ampel-Bewertung für Webdesign-Leads. Semantik INVERTIERT (Lead-Attraktivität,
 * nicht Website-Qualität): green = heißer Lead (Seite alt / Firma aktiv ohne Seite),
 * amber = Mittelding/unsicher, red = uninteressant (Seite top ODER Firma inaktiv).
 */
export type TrafficLightRating = "green" | "amber" | "red";

/** Anzeige-Optionen für die Ampel — Label + Pillen-Klassen + Punkt-Farbe (DRY). */
export const TRAFFIC_LIGHT_OPTIONS: { value: TrafficLightRating; label: string; color: string; dot: string }[] = [
  { value: "green", label: "Grün", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", dot: "bg-green-500" },
  { value: "amber", label: "Orange", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", dot: "bg-orange-500" },
  { value: "red", label: "Rot", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", dot: "bg-red-500" },
];

/**
 * Repräsentativer Score (0-100, invertiert) je Ampelfarbe — Bucket-Mittelwert.
 * Wird für manuell/per-API gesetzte Ratings ohne KI-Score verwendet, damit die
 * Sortierung „nach Ampelfarbe" (ORDER BY traffic_light_score DESC) quellenunabhängig
 * grün→orange→rot ergibt.
 */
export function scoreForRating(rating: TrafficLightRating): number {
  return rating === "green" ? 84 : rating === "amber" ? 50 : 16;
}

export type LeadSourceType = "csv" | "url" | "directory" | "manual";

export interface Lead {
  id: string;
  status: LeadStatus;
  company_name: string;
  website: string | null;
  phone: string | null;
  /** Provenienz der Telefonnummer: 'import' | 'enrichment' | 'manual'.
   *  'manual' wird von der Anreicherung nie automatisch überschrieben (Migration 115).
   *  Optional, da die Migration evtl. noch nicht ausgeführt ist. */
  phone_source?: "import" | "enrichment" | "manual" | null;
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
  career_page_url: string | null;
  description: string | null;
  /** Vertikale aus dem Import-Tab (Webdesign oder Recruiting). Null = generischer Import. */
  vertical: "webdesign" | "recruiting" | "sonstiges" | null;
  /** Alte HubSpot-Referenz — bleibt als Altlast für Migrations-/Audit-Zwecke, wird nicht mehr geschrieben. */
  hubspot_company_id: string | null;
  /** ID aus der custom_lead_statuses-Tabelle — CRM-Workflow-Status (Sales). */
  crm_status_id: string | null;
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
  website_screenshot_path: string | null;
  website_screenshot_taken_at: string | null;
  /** KI-Ampel-Bewertung (Webdesign): grün/orange/rot. Migration 108. */
  traffic_light_rating: TrafficLightRating | null;
  /** 0-100, INVERTIERT (grün hoch, rot niedrig) — für Sortierung nach Ampelfarbe. */
  traffic_light_score: number | null;
  traffic_light_reason: string | null;
  traffic_light_rated_at: string | null;
  /** Herkunft der Ampel: 'ai' (Anreicherung), 'manual' (Korrektur im Detail), 'api'. */
  traffic_light_source: "ai" | "manual" | "api" | null;
  enriched_at: string | null;
  enrichment_source: string | null;
  latitude: number | null;
  longitude: number | null;
  geocoded_at: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  /** Corporate-Identity-Cache für Landing-Pages: Primärfarbe (Hex) aus Lead-Website. */
  primary_color: string | null;
  /** Corporate-Identity-Cache für Landing-Pages: Logo-URL aus Lead-Website (Favicon/Apple-Touch-Icon). */
  logo_url: string | null;
  /** Mitarbeiter, der fuer diesen Lead zustaendig ist — bekommt die Provision,
   *  wenn der Lead einen Provisions-Trigger-Status erreicht (Migration 067). */
  assigned_to: string | null;
  /** Lifecycle: lead → deal → customer → archived. Migration 071. Optional, weil
   *  Migration evtl. noch nicht ausgefuehrt; Default in der DB ist 'lead'. */
  lifecycle_stage?: "lead" | "deal" | "customer" | "archived" | null;
  /** Wann ein Lead zum Kunden wurde (Migration 071). */
  became_customer_at?: string | null;
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
  /** Alte HubSpot-Referenz — bleibt für Altdaten. */
  hubspot_company_id: string | null;
  status: ExportStatus;
  error_message: string | null;
  response_data: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

// ─── CRM ─────────────────────────────────────────────────────────

export type LeadLearningSignal = "positive" | "negative";

export interface CustomLeadStatus {
  id: string;
  label: string;
  color: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  /** Trainingssignal fuer die KI-Scoring-Review:
   *  'positive' = Lead war relevant, 'negative' = Lead war nicht passend, null = ignorieren. */
  learning_signal: LeadLearningSignal | null;
  /** Aussortier-Flag: Leads in einem archivierten Status werden aus /leads und /crm
   *  ausgeblendet und sind nur in den Settings unter „Aussortierte Leads" sichtbar. */
  is_archived: boolean;
  /** Vertikale-Bindung. NULL = beide / agnostisch. Wird vom KI-Scoring-Reviewer
   *  genutzt, um Trainings-Status pro Vertikale zu isolieren. */
  vertical: LeadVertical | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type LeadLinkType =
  | "facebook" | "instagram" | "linkedin" | "xing"
  | "youtube" | "tiktok" | "twitter"
  | "google_maps" | "directory"
  | "website" | "other";

/** Zusätzliche Webseite/Profil eines Leads (Tabelle lead_links). */
export interface LeadLink {
  id: string;
  lead_id: string;
  type: LeadLinkType;
  url: string;
  label: string | null;
  created_at: string;
}

export interface LeadNote {
  id: string;
  lead_id: string;
  content: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Bei Zusammenführung gesetzt: Ursprungs-Lead, aus dem diese Notiz übernommen wurde. */
  merged_from_lead_id?: string | null;
  /** Firmenname des Ursprungs-Leads (zum Zeitpunkt des Merges) — für die Herkunfts-Kennzeichnung. */
  merged_from_company?: string | null;
}

/** Herkunft eines Leads — für den ältesten „Importiert"-Eintrag in der Historie. */
export interface LeadImportInfo {
  /** Zeitpunkt der Anlage (lead.created_at) — sortiert als ältester Eintrag. */
  at: string;
  /** Granularer Typ aus import_logs.import_type (google_maps, api, …) oder null. */
  importType: string | null;
  /** Grobe Quelle aus lead.source_type (Fallback, z.B. 'manual'). */
  sourceType: string | null;
  /** Quell-URL bzw. Dateiname des Imports, falls vorhanden. */
  sourceUrl: string | null;
  fileName: string | null;
}

export interface LeadNoteAttachment {
  id: string;
  note_id: string;
  lead_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_by: string | null;
  created_at: string;
}

/** An den Client gereichte Sicht eines Anhangs: ohne storage_path, mit signed URL. */
export interface LoadedNoteAttachment {
  id: string;
  note_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  signed_url: string | null;
}

/** Aufgabe / Wiedervorlage zu einem Lead. due_date ist Pflicht (Sales-Rhythmus
 *  setzt immer ein Datum voraus). done_at IS NULL = offen. */
export interface LeadTodo {
  id: string;
  lead_id: string;
  title: string;
  due_date: string;        // YYYY-MM-DD
  done_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CallDirection = "outbound" | "inbound";
export type CallStatus =
  | "initiated"
  | "ringing"
  | "answered"
  | "missed"
  | "failed"
  | "ended";

export interface LeadCall {
  id: string;
  lead_id: string;
  contact_id: string | null;
  direction: CallDirection;
  status: CallStatus;
  duration_seconds: number | null;
  notes: string | null;
  phone_number: string | null;
  mondo_call_id: string | null;
  started_at: string;
  ended_at: string | null;
  /** Aufzeichnungs-Felder (Webex Calling, Migration 022) */
  recording_url: string | null;
  recording_id: string | null;
  recording_fetched_at: string | null;
  recording_fetch_attempted_at: string | null;
  recording_fetch_error: string | null;
  /** Transkript- + Provider-Felder (Migration 025) */
  transcript_id: string | null;
  transcript_text: string | null;
  transcript_vtt_url: string | null;
  transcript_fetched_at: string | null;
  transcript_fetch_attempted_at: string | null;
  transcript_fetch_error: string | null;
  call_provider: "phonemondo" | "webex" | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequiredFieldProfile {
  id: string;
  name: string;
  required_fields: string[];
  is_default: boolean;
  created_by: string | null;
  created_at: string;
}

export type ContactSalutation = "herr" | "frau";

export type EmailStatus = "sent" | "failed";

export interface EmailMessage {
  id: string;
  lead_id: string | null;
  contact_id: string | null;
  sent_by: string | null;
  to_email: string;
  from_email: string;
  subject: string;
  body: string;
  status: EmailStatus;
  error: string | null;
  sent_at: string;
}

export interface LeadContact {
  id: string;
  lead_id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  salutation: ContactSalutation | null;
  source_url: string | null;
  /** Herkunft des Kontakts (DB-Spalte aus Migration 061). Optional, da nicht überall
   *  selektiert. 'manual' wird u.a. für die beim Telefon-Swap bewahrte Altnummer genutzt. */
  source?: "enrichment" | "manual" | "ba_import" | "csv_import" | null;
  created_at: string;
}

export type JobPostingSource = "ba_import" | "enrichment" | "manual";

export interface LeadJobPosting {
  id: string;
  lead_id: string;
  title: string;
  url: string | null;
  location: string | null;
  posted_date: string | null;
  source: JobPostingSource;
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

export type CompanyDetailField =
  | "address"
  | "phone"
  | "email"
  | "legal_form"
  | "register_id"
  | "company_size"
  | "industry"
  | "founding_year";

export interface EnrichmentConfig {
  contacts_management: boolean;
  /** HR-/Personal-/Recruiting-/Ausbildungs-/Bewerbungs-Verantwortliche gezielt extrahieren */
  contacts_hr: boolean;
  contacts_all: boolean;
  job_postings: boolean;
  career_page: boolean;
  company_details: boolean;
  /** Optional: wenn gesetzt, werden NUR diese Firmendaten-Felder gesucht/überschrieben */
  company_details_fields?: CompanyDetailField[];
  /** Optional: Freitext-Hinweis an das LLM, worauf es besonders achten soll.
   *  Beispiel: "Suche gezielt nach Ausbildungsplätzen und HR-Ansprechpartner.
   *  Gründungsjahr ist wichtig." Wird dem System-Prompt als Extra-Regel angehängt. */
  focus_query?: string;
  /** Pro-Run Override: erzwingt visuelle Screenshot-Analyse, auch wenn das
   *  Webdesign-Scoring sonst nur HTML-basiert läuft. Nur im Webdev-Modus relevant. */
  capture_screenshot?: boolean;
  /** KI-Ampel-Bewertung (grün/orange/rot) durchführen. Nur im Webdev-Modus.
   *  Erzwingt implizit einen Screenshot, damit die KI das Design visuell beurteilen kann. */
  traffic_light_rating?: boolean;
}

export const DEFAULT_ENRICHMENT_CONFIG: EnrichmentConfig = {
  contacts_management: true,
  contacts_hr: true,
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
  /** Webdesign-Importe: Leads ohne Website akzeptieren statt sie zu cancellen. */
  allow_leads_without_website: boolean;
  /** Visuelle Design-Analyse via Headless-Chromium-Screenshot statt HTML-Snippet. */
  screenshot_visual_analysis: boolean;
}

export interface RecruitingScoringConfig {
  min_job_postings_to_qualify: number;
  require_hr_contact: boolean;
  require_contact_email: boolean;
}

export const DEFAULT_RECRUITING_SCORING: RecruitingScoringConfig = {
  min_job_postings_to_qualify: 1,
  require_hr_contact: false,
  require_contact_email: true,
};

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
  allow_leads_without_website: true,
  screenshot_visual_analysis: false,
};

// ─── Lernende Scoring-Vorschlaege ────────────────────────────────

export type LeadVertical = "webdesign" | "recruiting";
export type ScoringSuggestionStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "superseded";

export interface ScoringSuggestion {
  id: string;
  vertical: LeadVertical;
  current_config: WebdevScoringConfig | RecruitingScoringConfig;
  suggested_config: WebdevScoringConfig | RecruitingScoringConfig;
  reasoning: string;
  key_observations: string[];
  positive_sample_count: number;
  negative_sample_count: number;
  llm_model: string;
  status: ScoringSuggestionStatus;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

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
  /** Optionaler normalisierter Code; bei Match wird er auf den Lead propagiert
   * und vom Lern-Cron zum Erkennen von Override-Mustern genutzt. */
  reason_code: string | null;
}

// ─── Provisions-Modul (Migrationen 065-068) ───────────────────────

export type CommissionScope = "all" | "role" | "user";

export interface CommissionRule {
  id: string;
  name: string;
  trigger_status_id: string;
  amount_cents: number;
  currency: string;
  scope: CommissionScope;
  scope_role: UserRole | null;
  scope_user_id: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommissionEvent {
  id: string;
  rule_id: string;
  lead_id: string;
  user_id: string;
  amount_cents: number;
  currency: string;
  trigger_status_id: string | null;
  earned_at: string;
}

// ─── Learning / E-Learning (Migration 085) ───────────────────────

export type LearningCourseStatus = "draft" | "published";
export type LearningVideoProvider = "youtube" | "loom";
export type LearningLessonType = "video" | "text" | "file" | "mixed";

// ─── V4 Block-Stack (Migration 092) ──────────────────────────────
//
// Jede Lektion ist eine vertikale Liste typisierter Bloecke. Block-IDs sind
// client-generierte UUIDs, stabil ueber die Lebenszeit eines Blocks.
export type LearningBlock =
  | { id: string; type: "text"; html: string }
  | { id: string; type: "video"; provider: "youtube" | "loom"; videoId: string; url: string }
  | {
      id: string;
      type: "image";
      attachmentId: string;
      storagePath: string;
      fileName: string;
      caption: string | null;
    }
  | {
      id: string;
      type: "file";
      attachmentId: string;
      storagePath: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }
  | { id: string; type: "button"; label: string; url: string };

export type LearningBlockType = LearningBlock["type"];

export interface LearningCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface LearningCourse {
  id: string;
  category_id: string | null;
  title: string;
  slug: string;
  summary: string | null;
  cover_image_path: string | null;
  status: LearningCourseStatus;
  sort_order: number;
  /** Lernziele (Migration 088). jsonb-Array von Strings. */
  learning_objectives: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LearningModule {
  id: string;
  course_id: string;
  title: string;
  /** Optional Markdown/Text-Beschreibung (Migration 088). */
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface LearningLesson {
  id: string;
  module_id: string;
  title: string;
  sort_order: number;
  /** Lesson-Typ (Migration 088). Steuert Editor-Layout. */
  lesson_type: LearningLessonType;
  /** Kurzbeschreibung fuer Curriculum-Vorschau (Migration 088). */
  summary: string | null;
  /** Interne Notiz fuer Editoren, nicht fuer Lernende (Migration 088). */
  editor_notes: string | null;
  content_html: string | null;
  video_url: string | null;
  video_provider: LearningVideoProvider | null;
  estimated_minutes: number | null;
  /** V4 Block-Stack (Migration 092). Wenn nicht leer -> Bloecke werden gerendert,
   *  content_html dient nur noch als Legacy-Fallback. */
  blocks: LearningBlock[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LearningLessonAttachment {
  id: string;
  lesson_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  /** Anzeige-Reihenfolge in der Materialien-Liste (Migration 088). */
  sort_order: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface LoadedLearningAttachment {
  id: string;
  lesson_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sort_order: number;
  signed_url: string | null;
}

export interface LearningLessonProgress {
  user_id: string;
  lesson_id: string;
  completed_at: string;
}

