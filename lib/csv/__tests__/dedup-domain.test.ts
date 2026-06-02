import { describe, it, expect } from "vitest";
import { isDomainMatch, isGenericDomain } from "../dedup";

describe("isGenericDomain", () => {
  it("erkennt Social-/Verzeichnis-Domains (inkl. Sub-Domain & Pfad)", () => {
    expect(isGenericDomain("facebook.com")).toBe(true);
    expect(isGenericDomain("https://www.facebook.com/youngtimerbox")).toBe(true);
    expect(isGenericDomain("m.facebook.com")).toBe(true);
    expect(isGenericDomain("instagram.com")).toBe(true);
    expect(isGenericDomain("linkedin.com")).toBe(true);
    expect(isGenericDomain("gelbeseiten.de")).toBe(true);
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
