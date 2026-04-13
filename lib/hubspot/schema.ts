export interface HubSpotField {
  key: string;
  label: string;
  type: "text" | "number" | "email" | "phone" | "url";
  required: boolean;
}

export const hubspotFields: HubSpotField[] = [
  { key: "company_name", label: "Firmenname", type: "text", required: true },
  { key: "domain", label: "Domain", type: "url", required: false },
  { key: "phone", label: "Telefon", type: "phone", required: false },
  { key: "email", label: "E-Mail", type: "email", required: false },
  { key: "street", label: "Straße", type: "text", required: false },
  { key: "city", label: "Ort", type: "text", required: false },
  { key: "zip", label: "PLZ", type: "text", required: false },
  { key: "state", label: "Bundesland", type: "text", required: false },
  { key: "country", label: "Land", type: "text", required: false },
  { key: "industry", label: "Branche", type: "text", required: false },
  { key: "company_size", label: "Unternehmensgröße", type: "text", required: false },
  { key: "legal_form", label: "Rechtsform", type: "text", required: false },
  { key: "register_id", label: "Handelsregister-Nr.", type: "text", required: false },
  { key: "website", label: "Website", type: "url", required: false },
  { key: "description", label: "Beschreibung", type: "text", required: false },
];

/** Bekannte Spaltenbezeichnungen -> HubSpot-Feld. Wird für Auto-Mapping genutzt. */
export const knownColumnAliases: Record<string, string> = {
  // GaLaBau-Format
  "firmenname": "company_name",
  "firma": "company_name",
  "name": "company_name",
  "company": "company_name",
  "company name": "company_name",
  "unternehmen": "company_name",
  "rechtsform": "legal_form",
  "ort": "city",
  "stadt": "city",
  "city": "city",
  "straße": "street",
  "strasse": "street",
  "street": "street",
  "adresse": "street",
  "telefon": "phone",
  "phone": "phone",
  "tel": "phone",
  "e-mail": "email",
  "email": "email",
  "mail": "email",
  "website": "website",
  "webseite": "website",
  "url": "website",
  "homepage": "website",
  "domain": "domain",
  "branche": "industry",
  "industry": "industry",
  "plz": "zip",
  "postleitzahl": "zip",
  "zip": "zip",
  "bundesland": "state",
  "land": "country",
  "country": "country",
  "geschäftsvertreter": "description",
  "register-id": "register_id",
  "register_id": "register_id",
  "handelsregister": "register_id",
  "hr-amtsgericht": "register_id",
  // NorthData-Format
  "mitarbeiterzahl": "company_size",
  "mitarbeiter": "company_size",
  "employees": "company_size",
  "umsatz": "description",
  "unternehmensgegenstand": "description",
  "ust.-id": "register_id",
};
