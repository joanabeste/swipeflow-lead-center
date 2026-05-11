import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyDomainOwnership, normalizeText } from "../domain-verifier";

describe("normalizeText", () => {
  it("entfernt HTML-Tags und normalisiert Umlaute", () => {
    const html = "<p>Bückeburg <b>GmbH</b></p>";
    expect(normalizeText(html)).toBe(" bueckeburg gmbh ");
  });

  it("entfernt script- und style-Bloecke komplett", () => {
    const html = "<style>.x{}</style>Hallo<script>x=1</script>Welt";
    expect(normalizeText(html)).toBe(" hallo welt");
  });
});

describe("verifyDomainOwnership", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetch(htmlByUrl: Record<string, string | null>) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      const html = htmlByUrl[url];
      if (html === undefined || html === null) throw new Error("not found");
      return new Response(html, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }) as unknown as Response;
    });
  }

  it("verifiziert bei Token + PLZ-Match (score >= 5)", async () => {
    mockFetch({
      "https://muster-galabau.de/impressum": `
        <html><body>
          <h1>Impressum</h1>
          <p>Muster Galabau GmbH<br>Hauptstr. 1<br>12345 Berlin</p>
        </body></html>
      `,
      "https://muster-galabau.de": "<html><body>Startseite</body></html>",
    });
    const r = await verifyDomainOwnership("muster-galabau.de", "Muster Galabau GmbH", "Berlin", "12345");
    expect(r.verified).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(5);
    expect(r.evidence).toContain("plz \"12345\" gefunden");
  });

  it("nicht verifiziert wenn nur PLZ matcht aber kein Firmenname-Token", async () => {
    mockFetch({
      "https://fremde-firma.de/impressum": `
        <html><body>
          <h1>Impressum</h1>
          <p>Andere AG<br>12345 Berlin</p>
        </body></html>
      `,
    });
    const r = await verifyDomainOwnership("fremde-firma.de", "Muster Galabau GmbH", "Berlin", "12345");
    expect(r.verified).toBe(false);
  });

  it("verifiziert bei Token + Stadt + Impressum (auch ohne PLZ)", async () => {
    mockFetch({
      "https://galabau-pagel.de": `
        <html><body>
          Galabau Pagel — Ihr Partner in Bückeburg.
          <a href="/impressum">Impressum</a>
        </body></html>
      `,
    });
    const r = await verifyDomainOwnership("galabau-pagel.de", "Galabau Pagel", "Bückeburg");
    expect(r.verified).toBe(true);
  });

  it("liefert verified=false wenn die Domain gar nicht erreichbar ist", async () => {
    mockFetch({});
    const r = await verifyDomainOwnership("nicht-erreichbar.invalid", "Muster GmbH", "Berlin", "12345");
    expect(r.verified).toBe(false);
    expect(r.reachedUrls).toEqual([]);
  });
});
