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
