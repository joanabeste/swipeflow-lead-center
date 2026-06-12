import { describe, it, expect } from "vitest";
import { matchesCompanyName } from "../checker";

describe("matchesCompanyName — einwortiger Eintrag 'Henkel'", () => {
  it("trifft den Konzern mit Rechtsform", () => {
    expect(matchesCompanyName("Henkel AG", "Henkel")).toBe(true);
    expect(matchesCompanyName("Henkel AG & Co. KGaA", "Henkel")).toBe(true);
    expect(matchesCompanyName("Henkel KGaA", "Henkel")).toBe(true);
  });

  it("ignoriert den Inhaber-Nachnamen in Klammern (gemeldeter Fall)", () => {
    expect(
      matchesCompanyName(
        "RundUm Ergotherapie - Kunsttherapie - Beratung (Rebekka Wildenmann-Henkel)",
        "Henkel",
      ),
    ).toBe(false);
  });

  it("trifft kein Einzelunternehmen ohne Rechtsform", () => {
    expect(matchesCompanyName("Praxis Henkel", "Henkel")).toBe(false);
    expect(matchesCompanyName("Henkel & Söhne", "Henkel")).toBe(false);
  });

  it("trifft nicht innerhalb eines Bindestrich-Nachnamens", () => {
    expect(matchesCompanyName("Wildenmann-Henkel GmbH", "Henkel")).toBe(false);
  });

  it("trifft kein längeres Wort, das nur mit dem Eintrag beginnt", () => {
    expect(matchesCompanyName("Henkelmann GmbH", "Henkel")).toBe(false);
  });

  it("ist umlaut-sicher und behandelt &/. als Trenner", () => {
    expect(matchesCompanyName("Henkel Wäsche GmbH", "Henkel")).toBe(true);
    expect(matchesCompanyName("Henkel.de GmbH", "Henkel")).toBe(true);
  });
});

describe("matchesCompanyName — mehrwortiger Eintrag 'Siemens Energy'", () => {
  it("trifft die zusammenhängende Phrase mit Rechtsform", () => {
    expect(matchesCompanyName("Siemens Energy GmbH", "Siemens Energy")).toBe(true);
  });

  it("trifft nicht bei fehlendem Wort / falscher Reihenfolge / Lücke", () => {
    expect(matchesCompanyName("Siemens AG", "Siemens Energy")).toBe(false);
    expect(matchesCompanyName("Energy Siemens Service GmbH", "Siemens Energy")).toBe(false);
    expect(matchesCompanyName("Siemens Gamesa Energy AG", "Siemens Energy")).toBe(false);
  });

  it("trifft nicht ohne Rechtsform", () => {
    expect(matchesCompanyName("Siemens Energy", "Siemens Energy")).toBe(false);
  });
});

describe("matchesCompanyName — Randfälle", () => {
  it("leere Eingaben → kein Treffer", () => {
    expect(matchesCompanyName("", "Henkel")).toBe(false);
    expect(matchesCompanyName("Henkel AG", "")).toBe(false);
  });

  it("akzeptierte Grenze: gleichnamige Kapitalgesellschaft wird gefiltert", () => {
    expect(matchesCompanyName("Henkel GmbH", "Henkel")).toBe(true);
  });
});
