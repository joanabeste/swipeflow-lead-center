const HUBSPOT_API_BASE = "https://api.hubapi.com";

export async function createHubSpotCompany(
  token: string,
  properties: Record<string, string>,
) {
  const res = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/companies`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ properties }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message ?? `HubSpot API Fehler: ${res.status}`);
  }

  return res.json();
}

export async function searchHubSpotCompany(
  token: string,
  domain: string,
): Promise<{ id: string; properties: Record<string, string> } | null> {
  const res = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/companies/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            { propertyName: "domain", operator: "EQ", value: domain },
          ],
        },
      ],
      properties: ["name", "domain", "city"],
      limit: 1,
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  return data.results?.[0] ?? null;
}

/** Erstellt einen HubSpot-Kontakt und verknüpft ihn mit einer Company */
export async function createHubSpotContact(
  token: string,
  companyId: string,
  contact: {
    firstname: string;
    lastname: string;
    email?: string;
    phone?: string;
    jobtitle?: string;
    hs_lead_status?: string;
    company?: string;
  },
): Promise<{ id: string } | null> {
  // Kontakt erstellen
  const properties: Record<string, string> = {
    firstname: contact.firstname,
    lastname: contact.lastname,
  };
  if (contact.email) properties.email = contact.email;
  if (contact.phone) properties.phone = contact.phone;
  if (contact.jobtitle) properties.jobtitle = contact.jobtitle;
  if (contact.hs_lead_status) properties.hs_lead_status = contact.hs_lead_status;
  if (contact.company) properties.company = contact.company;

  const res = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/contacts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties,
      associations: [
        {
          to: { id: companyId },
          types: [
            {
              associationCategory: "HUBSPOT_DEFINED",
              associationTypeId: 280, // Contact → Company
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    // Kontakt-Erstellung kann fehlschlagen (z.B. Duplikat) — nicht abbrechen
    return null;
  }

  return res.json();
}

/** Erstellt eine Notiz und verknüpft sie mit einer Company */
export async function createHubSpotNote(
  token: string,
  companyId: string,
  noteBody: string,
): Promise<{ id: string } | null> {
  const res = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/notes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        hs_note_body: noteBody,
        hs_timestamp: new Date().toISOString(),
      },
      associations: [
        {
          to: { id: companyId },
          types: [
            {
              associationCategory: "HUBSPOT_DEFINED",
              associationTypeId: 190, // Note → Company
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) return null;

  return res.json();
}

/** Splittet einen vollen Namen in Vor- und Nachname */
export function splitName(fullName: string): { firstname: string; lastname: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstname: parts[0], lastname: "" };
  const lastname = parts.pop()!;
  return { firstname: parts.join(" "), lastname };
}
