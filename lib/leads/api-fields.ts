/**
 * Kuratierte Spalten-Auswahl für die externen Lead-APIs (Liste + Detail).
 *
 * Bewusst KEIN `SELECT *`: nützliche Stammdaten-Felder für externe Konsumenten,
 * ohne interne/schwere Spalten (Screenshots, Tech-Stack, Blacklist-/Cancel-Gründe,
 * hubspot_company_id, created_by, Logo/Brand …). Liste und Detail teilen dieselbe
 * Liste, damit das Detail nicht versehentlich mehr preisgibt als die Liste.
 */
export const LEAD_API_COLS = [
  "id", "status", "company_name", "website", "phone", "phone_source", "email",
  "street", "city", "zip", "state", "country",
  "industry", "company_size", "legal_form", "register_id", "career_page_url", "description",
  "vertical", "crm_status_id", "source_import_id", "source_type", "source_url",
  "traffic_light_rating", "traffic_light_score", "traffic_light_reason",
  "has_ssl", "is_mobile_friendly", "page_speed_score", "google_rating", "google_review_count",
  "latitude", "longitude", "lifecycle_stage", "assigned_to",
  "enriched_at", "created_at", "updated_at",
].join(", ");

/**
 * Schlanke Spalten-Auswahl für die "Neue Leads"-Liste (app/(dashboard)/leads).
 *
 * Bewusst KEIN `SELECT *`: die Tabelle rendert nur diese Felder (siehe COLUMNS
 * in lead-table.tsx + getCellValue). Schwere Felder wie `description`,
 * `website_meta_description`, Screenshot-/Tech-JSONB etc. werden NICHT geladen —
 * das halbiert die Übertragungsgröße pro Zeile (×50/Seite), spürbar bei
 * schlechter Verbindung. Das Lead-Detail lädt seine Felder separat
 * (lib/leads/load-lead-detail.ts), die Liste muss sie nicht tragen.
 */
export const LEAD_LIST_COLS = [
  "id", "company_name", "website", "city", "zip",
  "industry", "company_size", "legal_form", "phone", "email",
  "has_ssl", "is_mobile_friendly", "website_tech", "website_age_estimate",
  "traffic_light_rating", "traffic_light_score", "traffic_light_reason",
  "source_type", "status", "blacklist_reason", "cancel_reason",
  "updated_at", "created_at",
].join(", ");

/**
 * Schlanke Spalten-Auswahl für das CRM-Board (app/(dashboard)/crm).
 * Genau die Felder, die in CrmLead (rows-Mapping) gebraucht werden — Call-,
 * Notiz- und Todo-Aggregate kommen aus separaten Queries.
 */
export const CRM_LIST_COLS = [
  "id", "company_name", "website", "city", "zip",
  "industry", "company_size", "phone", "email",
  "crm_status_id", "updated_at", "created_at",
].join(", ");
