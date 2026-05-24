/**
 * Initial-Quality-Score & Faktor-Snapshot.
 *
 * WICHTIG: Der Score basiert ausschliesslich auf Daten-Vollstaendigkeit,
 * Erreichbarkeit und Fit — NICHT auf Sales-Outcome. Ein Lead mit "kein
 * Interesse" kann hohen Score haben. Ziel ist, dass die Pre-CRM-Pipeline
 * besser darin wird, recherchierens-werte Leads ins CRM zu lassen.
 *
 * Score-Bestandteile sind transparent und werden im Faktor-Snapshot mit
 * Begruendung gespeichert, damit der Lern-Cron Muster erkennen kann.
 */

import type { WebsiteAnalysis } from "./website-analyzer";
import { isHrContact } from "@/lib/recruiting/hr-contact";
import type { ServiceMode } from "@/lib/types";

export interface ExtractedContact {
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface ExtractedJob {
  title: string;
  url?: string | null;
  posted_date?: string | null;
}

export interface ExtractedCompanyDetails {
  company_size_estimate?: string | null;
  founding_year?: number | string | null;
  legal_form?: string | null;
  register_id?: string | null;
  company_phone?: string | null;
  company_email?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  state?: string | null;
  industry?: string | null;
  specializations?: string[] | null;
}

export interface QualityFactorInput {
  serviceMode: ServiceMode;
  lead: {
    company_name: string;
    industry?: string | null;
    company_size?: string | null;
    legal_form?: string | null;
    register_id?: string | null;
    city?: string | null;
    zip?: string | null;
    street?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  website: WebsiteAnalysis | null;
  contacts: ExtractedContact[];
  contactsTotal: number;       // inkl. BA-Import + bestehende
  jobs: ExtractedJob[];
  jobsTotal: number;            // inkl. BA-Import + bestehende
  companyDetails: ExtractedCompanyDetails;
  websiteVerified: boolean;
}

export interface FactorScore {
  /** Punktwert tatsaechlich vergeben */
  awarded: number;
  /** Maximal moeglicher Punktwert dieses Faktors */
  max: number;
  /** Kurz-Begruendung fuer Snapshot */
  note: string;
}

export interface QualityFactors {
  reachability: FactorScore;
  ssl: FactorScore;
  mobile: FactorScore;
  contact_email: FactorScore;
  contact_phone: FactorScore;
  hr_contact: FactorScore;          // Recruiting
  jobs: FactorScore;                 // Recruiting
  design_issues: FactorScore;        // Webdev: viele Issues = hohe Punkte
  company_size_known: FactorScore;
  industry_known: FactorScore;
  legal_form_known: FactorScore;
  address_complete: FactorScore;
  email_domain_match: FactorScore;
  social_presence: FactorScore;
  trust_pages: FactorScore;          // Impressum + Datenschutz
  data_richness: FactorScore;        // viele Datenpunkte gefuellt
}

export interface FactorSnapshot {
  service_mode: ServiceMode;
  score: number;                     // 0-100
  factors: QualityFactors;
  contacts: {
    count: number;
    with_email: number;
    with_phone: number;
    hr_count: number;
    total_db: number;
  };
  jobs: {
    count: number;
    with_dates: number;
    total_db: number;
  };
  website: {
    reachable: boolean;
    ssl: boolean;
    mobile: boolean;
    load_ms: number;
    tech: string | null;
    design_estimate: string;
    design_score: number | null;
    issues: string[];
    visual_issues: string[];
    language: string | null;
    has_impressum: boolean;
    has_privacy: boolean;
    has_contact_form: boolean;
    image_count: number;
    internal_link_count: number;
    external_link_count: number;
    has_screenshot: boolean;
    socials: string[];
    page_title: string | null;
    meta_description: string | null;
  } | null;
  company: {
    name: string;
    size_estimate: string | null;
    industry: string | null;
    legal_form: string | null;
    register_id: string | null;
    founding_year: number | null;
    address_complete: boolean;
    email_domain_match: boolean;
  };
  decision: {
    outcome: "qualified" | "enriched" | "cancelled";
    reason_code: string | null;
    reason_text: string | null;
    criteria_met: Record<string, boolean | null>;
    rule_id: string | null;
    config_snapshot: Record<string, unknown>;
  };
}

const WEBDEV_WEIGHTS = {
  reachability: 12,
  ssl: 4,
  mobile: 3,
  contact_email: 14,
  contact_phone: 6,
  hr_contact: 0,        // irrelevant fuer Webdev
  jobs: 0,
  design_issues: 14,    // Webdev braucht Probleme
  company_size_known: 5,
  industry_known: 4,
  legal_form_known: 3,
  address_complete: 6,
  email_domain_match: 5,
  social_presence: 4,
  trust_pages: 6,
  data_richness: 14,
} as const;

const RECRUITING_WEIGHTS = {
  reachability: 10,
  ssl: 2,
  mobile: 2,
  contact_email: 14,
  contact_phone: 4,
  hr_contact: 12,
  jobs: 16,
  design_issues: 0,     // irrelevant fuer Recruiting
  company_size_known: 7,
  industry_known: 5,
  legal_form_known: 3,
  address_complete: 6,
  email_domain_match: 5,
  social_presence: 4,
  trust_pages: 5,
  data_richness: 5,
} as const;

function emailDomainMatchesWebsite(emails: string[], websiteDomain: string | null): boolean {
  if (!websiteDomain) return false;
  const dom = websiteDomain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
  return emails.some((e) => {
    const at = e.indexOf("@");
    if (at < 0) return false;
    const emailDom = e.slice(at + 1).toLowerCase();
    return emailDom === dom || dom.endsWith(emailDom) || emailDom.endsWith(dom);
  });
}

function countFilled(obj: Record<string, unknown>, keys: string[]): { filled: number; total: number } {
  let filled = 0;
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim() !== "") filled++;
  }
  return { filled, total: keys.length };
}

export function computeFactors(input: QualityFactorInput): {
  score: number;
  factors: QualityFactors;
  emailDomainMatch: boolean;
} {
  const weights = input.serviceMode === "webdev" ? WEBDEV_WEIGHTS : RECRUITING_WEIGHTS;
  const w = input.website;

  // Reachability
  const reachable = !!w && !w.issues.includes("Website nicht erreichbar");
  const reachability: FactorScore = {
    awarded: reachable ? weights.reachability : 0,
    max: weights.reachability,
    note: reachable ? "Website erreichbar" : "Website nicht erreichbar",
  };

  // SSL
  const ssl: FactorScore = {
    awarded: w?.hasSsl ? weights.ssl : 0,
    max: weights.ssl,
    note: w?.hasSsl ? "SSL aktiv" : "Kein SSL",
  };

  // Mobile
  const mobile: FactorScore = {
    awarded: w?.isMobileFriendly ? weights.mobile : 0,
    max: weights.mobile,
    note: w?.isMobileFriendly ? "Mobilfreundlich" : "Nicht mobilfreundlich",
  };

  // Kontakt-Email
  const withEmail = input.contacts.filter((c) => !!c.email).length;
  const contact_email: FactorScore = {
    awarded: withEmail > 0 ? weights.contact_email : 0,
    max: weights.contact_email,
    note: withEmail > 0 ? `${withEmail} Kontakt(e) mit Email` : "Kein Email-Kontakt",
  };

  // Kontakt-Telefon
  const withPhone = input.contacts.filter((c) => !!c.phone).length;
  const contact_phone: FactorScore = {
    awarded: withPhone > 0 ? weights.contact_phone : 0,
    max: weights.contact_phone,
    note: withPhone > 0 ? `${withPhone} Kontakt(e) mit Telefon` : "Kein Telefon-Kontakt",
  };

  // HR-Kontakt
  const hrCount = input.contacts.filter((c) => isHrContact(c.role)).length;
  const hr_contact: FactorScore = {
    awarded: hrCount > 0 ? weights.hr_contact : 0,
    max: weights.hr_contact,
    note: hrCount > 0 ? `${hrCount} HR-Kontakt(e)` : "Kein HR-Kontakt",
  };

  // Jobs (gesamt inkl. BA-Import)
  const jobScale = Math.min(1, input.jobsTotal / 3); // 3+ Jobs = volle Punkte
  const jobs: FactorScore = {
    awarded: Math.round(jobScale * weights.jobs),
    max: weights.jobs,
    note: input.jobsTotal > 0 ? `${input.jobsTotal} offene Stelle(n)` : "Keine offenen Stellen",
  };

  // Design-Issues fuer Webdev (mehr Issues = hoeherer Anreiz)
  const issueCount = w?.issues.length ?? 0;
  const issueScale = Math.min(1, issueCount / 4); // 4+ Issues = volle Punkte
  const design_issues: FactorScore = {
    awarded: Math.round(issueScale * weights.design_issues),
    max: weights.design_issues,
    note: weights.design_issues > 0
      ? `${issueCount} Website-Probleme${w?.designScore != null ? `, Design-Score ${w.designScore}` : ""}`
      : "n/a fuer Recruiting",
  };

  // Company-Daten
  const company_size_known: FactorScore = {
    awarded: input.companyDetails.company_size_estimate || input.lead.company_size ? weights.company_size_known : 0,
    max: weights.company_size_known,
    note: input.companyDetails.company_size_estimate || input.lead.company_size || "unbekannt",
  };
  const industry_known: FactorScore = {
    awarded: input.companyDetails.industry || input.lead.industry ? weights.industry_known : 0,
    max: weights.industry_known,
    note: input.companyDetails.industry || input.lead.industry || "unbekannt",
  };
  const legal_form_known: FactorScore = {
    awarded: input.companyDetails.legal_form || input.lead.legal_form ? weights.legal_form_known : 0,
    max: weights.legal_form_known,
    note: input.companyDetails.legal_form || input.lead.legal_form || "unbekannt",
  };

  // Adresse vollstaendig: Strasse + PLZ + Ort vorhanden
  const addr = countFilled(
    {
      street: input.companyDetails.street ?? input.lead.street,
      zip: input.companyDetails.zip ?? input.lead.zip,
      city: input.companyDetails.city ?? input.lead.city,
    },
    ["street", "zip", "city"],
  );
  const addrScale = addr.filled / addr.total;
  const address_complete: FactorScore = {
    awarded: Math.round(addrScale * weights.address_complete),
    max: weights.address_complete,
    note: `${addr.filled}/${addr.total} Adressfelder gefuellt`,
  };

  // Email-Domain matched Website (starkes Konsistenz-Signal)
  const allEmails = [
    input.lead.email,
    input.companyDetails.company_email,
    ...input.contacts.map((c) => c.email ?? null),
  ].filter((e): e is string => !!e);
  const websiteDom = w?.finalUrl ?? null;
  const emailMatch = emailDomainMatchesWebsite(allEmails, websiteDom);
  const email_domain_match: FactorScore = {
    awarded: emailMatch ? weights.email_domain_match : 0,
    max: weights.email_domain_match,
    note: emailMatch ? "Email-Domain passt zur Website" : "Kein Domain-Match",
  };

  // Social-Presence: mind. eine Platform gefunden
  const socials = w?.socialLinks;
  const socialCount = socials
    ? Object.values(socials).filter((v) => !!v).length
    : 0;
  const socialScale = Math.min(1, socialCount / 2);
  const social_presence: FactorScore = {
    awarded: Math.round(socialScale * weights.social_presence),
    max: weights.social_presence,
    note: `${socialCount} Social-Profile gefunden`,
  };

  // Trust-Pages (Impressum + Datenschutz)
  const trustCount = (w?.hasImpressum ? 1 : 0) + (w?.hasPrivacy ? 1 : 0);
  const trust_pages: FactorScore = {
    awarded: Math.round((trustCount / 2) * weights.trust_pages),
    max: weights.trust_pages,
    note: `Impressum=${w?.hasImpressum ? "ja" : "nein"}, Datenschutz=${w?.hasPrivacy ? "ja" : "nein"}`,
  };

  // Daten-Reichhaltigkeit (wie viele optionale Felder hat das LLM gefuellt)
  const richKeys = [
    "founding_year",
    "register_id",
    "company_phone",
    "company_email",
    "state",
    "specializations",
  ];
  const richObj: Record<string, unknown> = { ...input.companyDetails };
  const rich = countFilled(richObj, richKeys);
  const data_richness: FactorScore = {
    awarded: Math.round((rich.filled / rich.total) * weights.data_richness),
    max: weights.data_richness,
    note: `${rich.filled}/${rich.total} Zusatzfelder gefuellt`,
  };

  const factors: QualityFactors = {
    reachability,
    ssl,
    mobile,
    contact_email,
    contact_phone,
    hr_contact,
    jobs,
    design_issues,
    company_size_known,
    industry_known,
    legal_form_known,
    address_complete,
    email_domain_match,
    social_presence,
    trust_pages,
    data_richness,
  };

  const awarded = Object.values(factors).reduce((sum, f) => sum + f.awarded, 0);
  const max = Object.values(factors).reduce((sum, f) => sum + f.max, 0);
  const score = max > 0 ? Math.round((awarded / max) * 100) : 0;

  return { score, factors, emailDomainMatch: emailMatch };
}

export function buildFactorSnapshot(
  input: QualityFactorInput,
  decision: FactorSnapshot["decision"],
): FactorSnapshot {
  const { score, factors } = computeFactors(input);
  const w = input.website;
  const socials = w?.socialLinks;

  return {
    service_mode: input.serviceMode,
    score,
    factors,
    contacts: {
      count: input.contacts.length,
      with_email: input.contacts.filter((c) => !!c.email).length,
      with_phone: input.contacts.filter((c) => !!c.phone).length,
      hr_count: input.contacts.filter((c) => isHrContact(c.role)).length,
      total_db: input.contactsTotal,
    },
    jobs: {
      count: input.jobs.length,
      with_dates: input.jobs.filter((j) => !!j.posted_date).length,
      total_db: input.jobsTotal,
    },
    website: w
      ? {
          reachable: !w.issues.includes("Website nicht erreichbar"),
          ssl: w.hasSsl,
          mobile: w.isMobileFriendly,
          load_ms: w.loadTimeMs,
          tech: w.technology,
          design_estimate: w.designEstimate,
          design_score: w.designScore,
          issues: w.issues,
          visual_issues: w.visualIssues,
          language: w.language,
          has_impressum: w.hasImpressum,
          has_privacy: w.hasPrivacy,
          has_contact_form: w.hasContactForm,
          image_count: w.imageCount,
          internal_link_count: w.internalLinkCount,
          external_link_count: w.externalLinkCount,
          has_screenshot: !!w.screenshotPath,
          socials: socials
            ? Object.entries(socials).filter(([, v]) => !!v).map(([k]) => k)
            : [],
          page_title: w.pageTitle,
          meta_description: w.metaDescription,
        }
      : null,
    company: {
      name: input.lead.company_name,
      size_estimate: input.companyDetails.company_size_estimate ?? input.lead.company_size ?? null,
      industry: input.companyDetails.industry ?? input.lead.industry ?? null,
      legal_form: input.companyDetails.legal_form ?? input.lead.legal_form ?? null,
      register_id: input.companyDetails.register_id ?? input.lead.register_id ?? null,
      founding_year: input.companyDetails.founding_year != null
        ? Number(input.companyDetails.founding_year) || null
        : null,
      address_complete: !!(
        (input.companyDetails.street ?? input.lead.street) &&
        (input.companyDetails.zip ?? input.lead.zip) &&
        (input.companyDetails.city ?? input.lead.city)
      ),
      email_domain_match: factors.email_domain_match.awarded > 0,
    },
    decision,
  };
}
