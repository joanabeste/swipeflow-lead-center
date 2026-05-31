# Lead-Import-API (extern)

Externe HTTP-Schnittstelle, über die ein anderes System (z. B. **Claude Cowork**) neue Leads
ins Lead-Center importieren kann — gebündelt wie ein CSV-Import. Jeder Aufruf landet als **ein
Batch** in der Import-Historie (`/import`) und ist dort als Gruppe löschbar.

> **Maschinenlesbare Spezifikation:** [`lead-import-api.openapi.yaml`](./lead-import-api.openapi.yaml)
> (OpenAPI 3.1) — direkt in Swagger UI, Postman oder von einem API-Client/Agenten einlesbar.

## Endpunkt

```
POST /api/leads/import
```

| | |
|---|---|
| **Auth** | `Authorization: Bearer <LEADS_IMPORT_API_KEY>` |
| **Content-Type** | `application/json` |
| **Runtime** | Node.js |

Der Schlüssel liegt in der Umgebungsvariable `LEADS_IMPORT_API_KEY` (lokal in `.env.local`,
in Produktion auf Vercel). Vergleich erfolgt timing-safe.

## Verhalten

- Jeder angelegte Lead bekommt **`status: "imported"`** ("Importiert" / neue Leads) und
  **`source_type: "manual"`**.
- Alle Leads eines Aufrufs teilen sich eine `source_import_id` → ein Batch in `/import`
  (`import_type: "api"`).
- **Duplikate werden strikt übersprungen:** Existiert bereits ein Lead mit gleicher
  Domain, E-Mail, Telefonnummer oder (fuzzy) Firmenname, wird er **nicht** verändert — nur
  komplett neue Firmen werden angelegt.
- Blacklist- und Cancel-Regeln greifen wie beim CSV-Import (gefilterte Leads bekommen
  `status: "filtered"` bzw. `"cancelled"`).
- Felder werden normalisiert: Telefon → `+49…`, E-Mail → lowercase, `website` → nackte Domain,
  `country` Default „Deutschland".

## Request

```jsonc
{
  "source": "claude-cowork",          // optional, nur fuer die Batch-Bezeichnung in der Historie
  "leads": [
    {
      "company_name": "Beispiel GmbH", // PFLICHT
      "website": "beispiel.de",        // optional (nackte Domain oder volle URL)
      "phone": "0571 123456",          // optional
      "email": "info@beispiel.de",     // optional
      "street": "Hauptstr. 1",         // optional
      "city": "Espelkamp",             // optional
      "zip": "32339",                  // optional
      "state": "NRW",                  // optional
      "country": "Deutschland",        // optional (Default: Deutschland)
      "industry": "Maschinenbau",      // optional
      "company_size": "11-50",         // optional
      "legal_form": "GmbH",            // optional
      "register_id": "HRB 12345",      // optional
      "description": "Notizen",        // optional
      "traffic_light_rating": "green", // optional: "green" | "amber" | "red" (Webdesign-Ampel)
      "traffic_light_reason": "…",     // optional: Begründung zur Ampel
      "contacts": [                    // optional, max. 3 pro Lead
        { "name": "Max Mustermann", "role": "Geschäftsführer" }
      ]
    }
  ]
}
```

- `leads` muss ein **nicht-leeres Array** sein. Leads ohne `company_name` zählen als Fehler.
- **`traffic_light_rating`** (optional, nur Webdesign): Ampel-Bewertung vorbelegen —
  `green` = heißer Lead (Seite alt / Relaunch-Bedarf), `amber` = unsicher/okay, `red` =
  uninteressant (Seite top oder Firma inaktiv). Ungültige Werte werden ignoriert (kein Fehler).
  Wird als `traffic_light_source: "api"` markiert.
- **Max. 10.000 Leads pro Aufruf.** Praxis-Richtwert wegen des Request-Body-Limits von Vercel
  (~4,5 MB): **≤ 1.000 Leads pro Aufruf**, größere Mengen auf mehrere Calls aufteilen.

## Response

**201 Created**
```json
{
  "success": true,
  "import_log_id": "fe3e1455-8158-41dc-a47f-edb248a21996",
  "imported": 1,
  "skipped": 0,
  "duplicates": 0,
  "updated": 0,
  "archived": 0,
  "errors": 0,
  "contacts_imported": 1,
  "error_details": []
}
```

| Feld | Bedeutung |
|---|---|
| `imported` | neu angelegte Leads |
| `duplicates` / `skipped` | übersprungene, weil bereits vorhanden |
| `errors` + `error_details` | abgelehnte Zeilen (z. B. fehlender `company_name`) |

**Fehler:**

| Status | Wann |
|---|---|
| `401` | Key fehlt oder falsch |
| `400` | kein/kaputtes JSON, `leads` leer/kein Array, oder > 10.000 Leads |
| `500` | interner Fehler (z. B. Import-Log konnte nicht angelegt werden) |

## Beispiel (curl)

```bash
curl -X POST https://<deine-domain>/api/leads/import \
  -H "Authorization: Bearer $LEADS_IMPORT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "claude-cowork",
    "leads": [
      { "company_name": "Beispiel GmbH", "website": "beispiel.de",
        "phone": "0571 123456", "city": "Espelkamp",
        "contacts": [{ "name": "Max Mustermann", "role": "Geschäftsführer" }] }
    ]
  }'
```

## Einrichtung

1. Schlüssel erzeugen: `openssl rand -hex 32`
2. Lokal in `.env.local`: `LEADS_IMPORT_API_KEY=<schlüssel>`
3. Produktion: `vercel env add LEADS_IMPORT_API_KEY` (Production + Preview), neu deployen.
4. Denselben Schlüssel dem aufrufenden System (Claude Cowork) hinterlegen.

## Implementierung (Referenz)

- Route: [`app/api/leads/import/route.ts`](../app/api/leads/import/route.ts)
- Gemeinsame Import-Logik (mit CSV-Import geteilt): [`lib/leads/ingest.ts`](../lib/leads/ingest.ts)
- Proxy-Allowlist (Route ist vom Session-Gate ausgenommen): [`proxy.ts`](../proxy.ts)
