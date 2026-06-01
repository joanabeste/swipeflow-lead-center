// Code-definierter Katalog der Projekt-Features. Quelle der Wahrheit dafür,
// WELCHE Features es gibt; die admin-definierten project_types entscheiden, welche
// ein Typ aktiviert. Treibt sowohl die Tabs der Projekt-Detailseite als auch die
// Feature-Checkboxen in der Typ-Verwaltung (DRY).

export const FEATURE_KEYS = ["social", "tasks", "mails", "notes"] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface ProjectFeature {
  key: FeatureKey;
  label: string;
  /** lucide-Icon-Name (String) für Tabs/Checkboxen. */
  icon: string;
  /** URL-/Tab-Slug auf der Projekt-Detailseite (Back-compat: notes → "notizen"). */
  slug: string;
}

export const FEATURE_CATALOG: ProjectFeature[] = [
  { key: "social", label: "Social Media", icon: "Megaphone", slug: "social" },
  { key: "tasks", label: "Tasks", icon: "CheckSquare", slug: "tasks" },
  { key: "mails", label: "E-Mails", icon: "Mail", slug: "mails" },
  { key: "notes", label: "Notizen", icon: "StickyNote", slug: "notizen" },
];

const KNOWN: Set<string> = new Set(FEATURE_KEYS);

export function isFeatureKey(v: string): v is FeatureKey {
  return KNOWN.has(v);
}

/** Aktive, bekannte Feature-Keys eines Typs — in Katalog-Reihenfolge, ohne veraltete. */
export function typeFeatures(type: { features?: string[] | null } | null | undefined): FeatureKey[] {
  const raw = type?.features ?? [];
  return FEATURE_CATALOG.map((f) => f.key).filter((k) => raw.includes(k));
}

export function featureBySlug(slug: string): ProjectFeature | undefined {
  return FEATURE_CATALOG.find((f) => f.slug === slug);
}

export function featureByKey(key: FeatureKey): ProjectFeature | undefined {
  return FEATURE_CATALOG.find((f) => f.key === key);
}
