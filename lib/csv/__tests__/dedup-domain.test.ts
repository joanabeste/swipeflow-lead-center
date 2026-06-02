import { describe, it, expect } from "vitest";
import { isDomainMatch, isGenericDomain, computeSharedDomains } from "../dedup";

describe("isGenericDomain", () => {
  it("erkennt Social-/Verzeichnis-Domains (inkl. Sub-Domain & Pfad)", () => {
    expect(isGenericDomain("facebook.com")).toBe(true);
    expect(isGenericDomain("https://www.facebook.com/youngtimerbox")).toBe(true);
    expect(isGenericDomain("m.facebook.com")).toBe(true);
    expect(isGenericDomain("instagram.com")).toBe(true);
    expect(isGenericDomain("linkedin.com")).toBe(true);
    expect(isGenericDomain("gelbeseiten.de")).toBe(true);
    // Bekannte Branchenverzeichnisse / Vermittler (statisch gelistet).
    expect(isGenericDomain("malerfinder.de")).toBe(true);
    expect(isGenericDomain("https://www.myhammer.de/firma/xyz")).toBe(true);
    expect(isGenericDomain("das-telefonbuch.de")).toBe(true);
    expect(isGenericDomain("check24.de")).toBe(true);
  });
  it("lässt echte Firmen-Domains durch", () => {
    expect(isGenericDomain("kracht-kfztechnik.de")).toBe(false);
    expect(isGenericDomain("werkstatt-mester.de")).toBe(false);
    expect(isGenericDomain(null)).toBe(false);
    expect(isGenericDomain("")).toBe(false);
  });
});

describe("isDomainMatch — keine Treffer bei leer/generisch", () => {
  it("leere Domains matchen nie", () => {
    expect(isDomainMatch("", "")).toBe(false);
    expect(isDomainMatch("firma.de", "")).toBe(false);
  });
  it("zwei Leads mit facebook.com sind KEIN Domain-Duplikat", () => {
    expect(isDomainMatch("facebook.com", "facebook.com")).toBe(false);
    expect(isDomainMatch("https://facebook.com/a", "https://facebook.com/b")).toBe(false);
  });
  it("echte gleiche/Sub-Domains matchen weiterhin", () => {
    expect(isDomainMatch("firma.de", "www.firma.de")).toBe(true);
    expect(isDomainMatch("karriere.firma.de", "firma.de")).toBe(true);
    expect(isDomainMatch("firma.de", "andere.de")).toBe(false);
  });
});

describe("computeSharedDomains — Verzeichnis-/Portal-Domains erkennen", () => {
  it("flaggt eine (nicht gelistete) Domain mit ≥3 unterschiedlichen Firmennamen", () => {
    // Unbekanntes Portal — wird NICHT statisch gelistet, nur über die Häufigkeit erkannt.
    const shared = computeSharedDomains([
      { website: "regio-branchen-portal.de", company_name: "Malerbetrieb Blinde" },
      { website: "regio-branchen-portal.de", company_name: "WM Maler GmbH" },
      { website: "regio-branchen-portal.de", company_name: "Malermeister Koschnick" },
      { website: "regio-branchen-portal.de", company_name: "Fieseler Maler-und Lackierermeister" },
      { website: "kracht-kfztechnik.de", company_name: "Kracht-KFZ-Technik" },
    ]);
    expect(shared.has("regio-branchen-portal.de")).toBe(true);
    // Eine echte Firmen-Domain (nur 1 Name) bleibt erlaubt.
    expect(shared.has("kracht-kfztechnik.de")).toBe(false);
  });
  it("flaggt NICHT eine Domain mit mehreren Duplikaten DESSELBEN Namens", () => {
    const shared = computeSharedDomains([
      { website: "firma.de", company_name: "Firma GmbH" },
      { website: "firma.de", company_name: "Firma GmbH" },
      { website: "firma.de", company_name: "Firma GmbH" },
    ]);
    expect(shared.has("firma.de")).toBe(false);
  });
});
