# Lead-API (extern)

Externe HTTP-Schnittstelle, über die ein anderes System (z. B. **Claude Cowork**) Leads
ins Lead-Center **importieren**, **auslesen** und **aktualisieren** kann.

> **Maschinenlesbare Spezifikation:** [`lead-import-api.openapi.yaml`](./lead-import-api.openapi.yaml)
> (OpenAPI 3.1) — direkt in Swagger UI, Postman oder von einem API-Client/Agenten einlesbar.

## Endpunkte

| Methode | Pfad | Zweck |
|---|---|---|
| `POST` | `/api/leads/import` | Leads importieren (gebündelt wie ein CSV-Import) |
| `GET` | `/api/leads` | Leads auflisten (filterbar, paginiert) — z. B. die neuen Leads |
| `GET` | `/api/leads/:id` | einzelnen Lead inkl. Kontakte + Links lesen |
| `PATCH` | `/api/leads/:id` | Stammdaten eines Leads aktualisieren |

Alle Endpunkte:

| | |
|---|---|
| **Auth** | `Authorization: Bearer <LEADS_IMPORT_API_KEY>` |
| **Content-Type** | `application/json` (bei Body) |
| **Runtime** | Node.js |

Der Schlüssel liegt in der Umgebungsvariable `LEADS_IMPORT_API_KEY` (lokal in `.env.local`,
in Produktion auf Vercel). Vergleich erfolgt timing-safe.

---

## `POST /api/leads/import` — importieren

Legt neue Leads an — gebündelt wie ein CSV-Import. Jeder Aufruf landet als **ein Batch** in
der Import-Historie (`/import`) und ist dort als Gruppe löschbar.

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
      ],
      "links": [                       // optional: weitere Webseiten/Profile
        { "url": "https://facebook.com/beispiel" },            // type wird erkannt (facebook)
        { "url": "https://maps.app.goo.gl/x", "label": "Standort" }, // → google_maps
        { "url": "https://gelbeseiten.de/…", "type": "directory" }   // type optional erzwingen
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
- **`links`** (optional): zusätzliche Webseiten/Profile (Facebook, Instagram, LinkedIn,
  Google Maps, Branchenverzeichnis, …). `url` ist Pflicht; `type` wird sonst automatisch
  aus der URL erkannt, `label` ist optional. Werden **auch an bereits bestehende (Duplikat-)
  Leads** angehängt (idempotent pro `lead_id + url`). Mehr siehe [`PATCH`](#patch-apileadsid--aktualisieren)/Links-Verwaltung im Frontend.
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
  "links_imported": 2,
  "error_details": []
}
```

| Feld | Bedeutung |
|---|---|
| `imported` | neu angelegte Leads |
| `duplicates` / `skipped` | übersprungene, weil bereits vorhanden |
| `links_imported` | angelegte Links (neue + an bestehende Leads angehängte) |
| `errors` + `error_details` | abgelehnte Zeilen (z. B. fehlender `company_name`) |

**Fehler:**

| Status | Wann |
|---|---|
| `401` | Key fehlt oder falsch |
| `400` | kein/kaputtes JSON, `leads` leer/kein Array, oder > 10.000 Leads |
| `500` | interner Fehler (z. B. Import-Log konnte nicht angelegt werden) |

### Beispiel (curl)

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

---

## `GET /api/leads` — auflisten

Listet Leads (ohne gelöschte), neueste zuerst. Ideal, um die **neuen Leads** abzuholen:
`?status=imported`.

### Query-Parameter

| Param | Default | Bedeutung |
|---|---|---|
| `status` | – | Status-Filter, z. B. `imported` (neue Leads), `qualified`, `customer` … |
| `vertical` | – | Sparte/Filter |
| `q` | – | Suche über Firmenname / Website / Ort / E-Mail / Telefon |
| `include` | – | `contacts` und/oder `links` (kommasepariert) → reichert jeden Lead an |
| `limit` | `50` | 1..200 |
| `offset` | `0` | Paginierung |

### Response — **200 OK**

```jsonc
{
  "leads": [
    {
      "id": "fe3e1455-…", "status": "imported", "company_name": "Beispiel GmbH",
      "website": "beispiel.de", "phone": "+49571123456", "email": "info@beispiel.de",
      "city": "Espelkamp", "vertical": "webdesign", "source_type": "manual",
      "created_at": "2026-06-01T10:00:00Z", "updated_at": "2026-06-01T10:00:00Z"
      // … kuratierte Stammdaten-Felder; mit include zusätzlich "contacts"/"links"
    }
  ],
  "total": 137,   // Gesamtzahl passender Leads (für Paginierung), unabhängig von limit/offset
  "limit": 50,
  "offset": 0
}
```

### Beispiele (curl)

```bash
# Neue Leads inkl. Kontakte + Links holen
curl "https://<deine-domain>/api/leads?status=imported&include=contacts,links&limit=100" \
  -H "Authorization: Bearer $LEADS_IMPORT_API_KEY"

# Volltextsuche
curl "https://<deine-domain>/api/leads?q=Beispiel" \
  -H "Authorization: Bearer $LEADS_IMPORT_API_KEY"
```

---

## `GET /api/leads/:id` — einzeln lesen

Liefert den vollständigen Lead plus zugehörige Kontakte und Links.

### Response — **200 OK**

```jsonc
{
  "lead": { "id": "fe3e1455-…", "company_name": "Beispiel GmbH", /* … alle Felder … */ },
  "contacts": [ { "id": "…", "name": "Max Mustermann", "role": "Geschäftsführer", "email": null, "phone": null } ],
  "links": [ { "id": "…", "type": "facebook", "url": "https://facebook.com/beispiel", "label": null } ]
}
```

`404`, wenn kein (nicht gelöschter) Lead mit dieser ID existiert.

---

## `PATCH /api/leads/:id` — aktualisieren

Aktualisiert die **Stammdaten** eines Leads. Body = JSON-Objekt mit den zu ändernden Feldern.

### Erlaubte Felder (Whitelist)

`company_name`, `website`, `phone`, `email`, `street`, `city`, `zip`, `state`, `country`,
`industry`, `company_size`, `legal_form`, `register_id`, `career_page_url`, `description`,
`traffic_light_rating`, `traffic_light_score`, `traffic_light_source`, `traffic_light_rated_at`.

Alle anderen Keys (z. B. `status`, `assigned_to`, `deleted_at`, `crm_status_id`) werden
**ignoriert** (Mass-Assignment-Schutz). Status-Wechsel laufen über die App, nicht die API.

Verhalten wie im CRM-Stammdaten-Formular: Telefon-Änderung setzt `phone_source: "manual"`
(die Anreicherung überschreibt sie dann nicht mehr); Adress-Änderung setzt die Geokoordinaten
zurück (Re-Geocoding beim nächsten Aufruf). Änderungen werden protokolliert (Change-Log + Audit).

### Beispiel (curl)

```bash
curl -X PATCH "https://<deine-domain>/api/leads/fe3e1455-…" \
  -H "Authorization: Bearer $LEADS_IMPORT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "phone": "0571 999999", "industry": "Maschinenbau" }'
```

### Response

`200 OK` → `{ "success": true }`. `404`, wenn der Lead nicht existiert. `400` bei kaputtem JSON
oder wenn der Body kein Objekt ist.

> **Links/Kontakte ändern:** Über `PATCH` werden nur Stammdaten geändert. Zusätzliche Links
> hängst du über `POST /api/leads/import` (Feld `links`) an einen bestehenden Lead an; im
> Frontend gibt es dafür die „Profile & Links"-Karte am Lead.

---

## Einrichtung

1. Schlüssel erzeugen: `openssl rand -hex 32`
2. Lokal in `.env.local`: `LEADS_IMPORT_API_KEY=<schlüssel>`
3. Produktion: `vercel env add LEADS_IMPORT_API_KEY` (Production + Preview), neu deployen.
4. Denselben Schlüssel dem aufrufenden System (Claude Cowork) hinterlegen.

## Implementierung (Referenz)

- Import-Route: [`app/api/leads/import/route.ts`](../app/api/leads/import/route.ts)
- Listen-Route: [`app/api/leads/route.ts`](../app/api/leads/route.ts)
- Detail/Update-Route: [`app/api/leads/[id]/route.ts`](../app/api/leads/[id]/route.ts)
- Gemeinsame Bearer-Auth: [`lib/leads/api-auth.ts`](../lib/leads/api-auth.ts)
- Gemeinsame Import-Logik (mit CSV-Import geteilt): [`lib/leads/ingest.ts`](../lib/leads/ingest.ts)
- Update reuse: dieselbe Server-Action wie das CRM-Formular ([`updateLead`](<../app/(dashboard)/leads/actions.ts>))
- Proxy-Allowlist (Routen sind vom Session-Gate ausgenommen): [`proxy.ts`](../proxy.ts)
