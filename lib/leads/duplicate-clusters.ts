import { normalizeName, normalizeDomain, isDomainMatch, isGenericDomain } from "@/lib/csv/dedup";

export interface LeadForCluster {
  id: string;
  company_name: string | null;
  website: string | null;
  city: string | null;
  crm_status_id: string | null;
  lifecycle_stage: string | null;
  created_at: string;
  /** Anzahl gewichteter Aktivitaeten (Anrufe, Vertraege, Deals, Projekte) */
  activity: number;
}

/** Reduzierte Domain auf die letzten zwei Labels (firma.de), damit
 *  karriere.firma.de und firma.de im selben Bucket landen. */
function coreDomain(website: string | null): string | null {
  if (!website) return null;
  const d = normalizeDomain(website);
  // Generische Domains (facebook.com …) nicht als Bucket nutzen — sonst ein
  // riesiger Sammel-Bucket aller Social-Leads (O(n²)) + keine echte Identität.
  if (!d || isGenericDomain(d)) return null;
  const parts = d.split(".");
  if (parts.length <= 2) return d;
  return parts.slice(-2).join(".");
}

function sameCityOrUnknown(a: LeadForCluster, b: LeadForCluster): boolean {
  if (!a.city || !b.city) return true;
  return a.city.toLowerCase() === b.city.toLowerCase();
}

/** Zwei Leads gehoeren zusammen, wenn (strikt):
 *  - die Domains matchen, ODER
 *  - der normalisierte Name exakt gleich ist UND weder Stadt noch Domain widersprechen. */
function isSameCompany(a: LeadForCluster, b: LeadForCluster): boolean {
  if (a.website && b.website && isDomainMatch(a.website, b.website)) return true;

  if (a.company_name && b.company_name &&
      normalizeName(a.company_name) === normalizeName(b.company_name)) {
    // Widersprechende ECHTE Domains schliessen einen Namens-Match aus.
    // Generische Domains (facebook.com …) sind uninformativ → kein Ausschluss.
    if (
      a.website && b.website &&
      !isGenericDomain(a.website) && !isGenericDomain(b.website) &&
      !isDomainMatch(a.website, b.website)
    ) {
      return false;
    }
    return sameCityOrUnknown(a, b);
  }
  return false;
}

/** Gruppiert Leads in Duplikat-Cluster (Union-Find ueber Buckets, damit nicht
 *  jedes Paar global verglichen werden muss). Gibt nur Cluster mit >= 2 Leads zurueck. */
export function buildDuplicateClusters(leads: LeadForCluster[]): LeadForCluster[][] {
  const parent = new Map<string, string>();
  const byId = new Map<string, LeadForCluster>();
  for (const l of leads) {
    parent.set(l.id, l.id);
    byId.set(l.id, l);
  }

  function find(x: string): string {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  function union(a: string, b: string) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  // Kandidaten-Paare nur innerhalb gemeinsamer Buckets pruefen.
  const buckets = new Map<string, LeadForCluster[]>();
  const addToBucket = (key: string, l: LeadForCluster) => {
    const arr = buckets.get(key);
    if (arr) arr.push(l);
    else buckets.set(key, [l]);
  };
  for (const l of leads) {
    const cd = coreDomain(l.website);
    if (cd) addToBucket(`d:${cd}`, l);
    if (l.company_name) addToBucket(`n:${normalizeName(l.company_name)}`, l);
  }

  for (const group of buckets.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (isSameCompany(group[i], group[j])) union(group[i].id, group[j].id);
      }
    }
  }

  const clusters = new Map<string, LeadForCluster[]>();
  for (const l of leads) {
    const root = find(l.id);
    const arr = clusters.get(root);
    if (arr) arr.push(l);
    else clusters.set(root, [l]);
  }

  return [...clusters.values()].filter((c) => c.length >= 2);
}

/** Survivor-Auswahl: 1. meiste Aktivitaet · 2. weiter im Lifecycle / CRM-Status ·
 *  3. aeltestes created_at. (Archivierte Leads werden vorher ausgefiltert.) */
export function pickSurvivor(cluster: LeadForCluster[]): LeadForCluster {
  const stageRank: Record<string, number> = { archived: 0, lead: 1, deal: 2, customer: 3 };
  return [...cluster].sort((a, b) => {
    if (b.activity !== a.activity) return b.activity - a.activity;
    const sa = stageRank[a.lifecycle_stage ?? "lead"] ?? 1;
    const sb = stageRank[b.lifecycle_stage ?? "lead"] ?? 1;
    if (sb !== sa) return sb - sa;
    const ca = (a.crm_status_id ? 1 : 0);
    const cb = (b.crm_status_id ? 1 : 0);
    if (cb !== ca) return cb - ca;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  })[0];
}
