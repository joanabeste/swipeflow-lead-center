import type { ServiceMode } from "@/lib/types";

// Mapping User-Modus -> DB-Vertikale. Achtung: User-Modus heisst `webdev`,
// die Lead-Vertikale (custom_lead_statuses.vertical / leads.vertical) heisst
// historisch `webdesign`.
export const MODE_TO_VERTICAL = {
  recruiting: "recruiting",
  webdev: "webdesign",
} as const satisfies Record<ServiceMode, "recruiting" | "webdesign">;

export type LeadVertical = (typeof MODE_TO_VERTICAL)[ServiceMode];

// Default-CRM-Status, in den ein Lead beim Bulk-„Ins CRM" geschoben wird.
export const DEFAULT_QUALIFY_STATUS_BY_MODE = {
  recruiting: "recruiting-manuelle-ueberpruefung",
  webdev: "webdesign-manuelle-ueberpruefung",
} as const satisfies Record<ServiceMode, string>;

// Default-Status beim Bulk-„Aussortieren" (Passt-nicht).
export const ARCHIVE_STATUS_BY_MODE = {
  recruiting: "recruiting-passt-nicht",
  webdev: "webdesign-passt-nicht",
} as const satisfies Record<ServiceMode, string>;
