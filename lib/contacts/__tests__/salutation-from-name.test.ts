import { describe, it, expect } from "vitest";
import {
  extractFirstName,
  extractLastName,
  guessSalutationFromName,
  guessSalutationFromEmailLocalpart,
  guessSalutation,
  normalizeSalutationString,
} from "../salutation-from-name";

describe("extractFirstName", () => {
  it("liefert den ersten Vornamen (lowercased per Default)", () => {
    expect(extractFirstName("Thomas Müller")).toBe("thomas");
  });
  it("überspringt akademische Titel", () => {
    expect(extractFirstName("Dr. Thomas Müller")).toBe("thomas");
    expect(extractFirstName("Prof. Dr. Sabine Meier")).toBe("sabine");
    expect(extractFirstName("Dr. med. Thomas Müller")).toBe("thomas");
  });
  it("behandelt Komma-Format Nachname, Vorname", () => {
    expect(extractFirstName("Müller, Thomas")).toBe("thomas");
  });
  it("teilt Bindestrich-Vornamen auf den ersten Teil", () => {
    expect(extractFirstName("Hans-Peter Schmidt")).toBe("hans");
  });
  it("überspringt Adelsprädikate", () => {
    expect(extractFirstName("von Bismarck, Otto")).toBe("otto");
  });
  it("gibt mit preserveCase die Original-Schreibweise zurück", () => {
    expect(extractFirstName("Dr. Thomas Müller", { preserveCase: true })).toBe("Thomas");
    expect(extractFirstName("Hans-Peter Schmidt", { preserveCase: true })).toBe("Hans");
  });
  it("liefert null, wenn nur Anrede-Prefix + Nachname vorliegt", () => {
    // "Herr Özdemir" — das verbleibende Token ist der Nachname, kein Vorname.
    expect(extractFirstName("Herr Özdemir")).toBeNull();
    expect(extractFirstName("Frau Nguyen")).toBeNull();
  });
  it("gibt null bei leerem oder null-Input", () => {
    expect(extractFirstName("")).toBeNull();
    expect(extractFirstName(null)).toBeNull();
    expect(extractFirstName(undefined)).toBeNull();
    expect(extractFirstName("   ")).toBeNull();
  });
});

describe("extractLastName", () => {
  it("liefert den Nachnamen aus 'Vorname Nachname'", () => {
    expect(extractLastName("Thomas Müller")).toBe("Müller");
  });
  it("funktioniert bei Komma-Format", () => {
    expect(extractLastName("Müller, Thomas")).toBe("Müller");
  });
  it("überspringt Titel am Anfang", () => {
    expect(extractLastName("Dr. Thomas Müller")).toBe("Müller");
    expect(extractLastName("Prof. Dr. Sabine Meier")).toBe("Meier");
  });
  it("bewahrt Original-Schreibweise", () => {
    expect(extractLastName("thomas MÜLLER")).toBe("MÜLLER");
  });
  it("liefert null bei Einzel-Token ohne Komma", () => {
    expect(extractLastName("Thomas")).toBeNull();
  });
  it("liefert bei 'Herr Özdemir' das Token als Nachnamen", () => {
    expect(extractLastName("Herr Özdemir")).toBe("Özdemir");
    expect(extractLastName("Frau Nguyen")).toBe("Nguyen");
  });
  it("gibt null bei leerem Input", () => {
    expect(extractLastName("")).toBeNull();
    expect(extractLastName(null)).toBeNull();
  });
});

describe("guessSalutationFromName — Regressions-Lock (bestehendes Verhalten)", () => {
  it("erkennt eindeutige männliche Vornamen", () => {
    expect(guessSalutationFromName("Thomas Müller")).toBe("herr");
    expect(guessSalutationFromName("Max Mustermann")).toBe("herr");
  });
  it("erkennt eindeutige weibliche Vornamen", () => {
    expect(guessSalutationFromName("Sabine Meier")).toBe("frau");
    expect(guessSalutationFromName("Anna Schmidt")).toBe("frau");
  });
  it("gibt null bei mehrdeutigen Namen", () => {
    expect(guessSalutationFromName("Andrea Schmidt")).toBeNull();
    expect(guessSalutationFromName("Kim Park")).toBeNull();
    expect(guessSalutationFromName("Sascha Müller")).toBeNull();
  });
  it("gibt null bei leerem/ungültigem Input", () => {
    expect(guessSalutationFromName("")).toBeNull();
    expect(guessSalutationFromName(null)).toBeNull();
    expect(guessSalutationFromName(undefined)).toBeNull();
  });
});

describe("guessSalutationFromName — Schicht A (Prefix-Anrede)", () => {
  it("erkennt 'Herr X' auch ohne bekannten Vornamen", () => {
    expect(guessSalutationFromName("Herr Özdemir")).toBe("herr");
    expect(guessSalutationFromName("Hr. Schmidt")).toBe("herr");
    expect(guessSalutationFromName("Herrn Dr. Nguyen")).toBe("herr");
  });
  it("erkennt 'Frau Y' auch ohne bekannten Vornamen", () => {
    expect(guessSalutationFromName("Frau Nguyen")).toBe("frau");
    expect(guessSalutationFromName("Fr. Kowalski")).toBe("frau");
  });
});

describe("guessSalutationFromName — Schicht B (Komma-Swap)", () => {
  it("erkennt 'Nachname, Vorname'", () => {
    expect(guessSalutationFromName("Müller, Thomas")).toBe("herr");
    expect(guessSalutationFromName("Schmidt, Sabine")).toBe("frau");
  });
});

describe("guessSalutationFromName — Schicht D (Diakritika-Fallback)", () => {
  it("erkennt Namen ohne Umlaute/Akzente", () => {
    expect(guessSalutationFromName("Bjorn Andersson")).toBe("herr");
    expect(guessSalutationFromName("Jorg Weber")).toBe("herr");
  });
});

describe("guessSalutationFromName — kombinierte Fälle", () => {
  it("Multi-Prefix (Prof. Dr. …)", () => {
    expect(guessSalutationFromName("Prof. Dr. Sabine Meier")).toBe("frau");
    expect(guessSalutationFromName("Dr. med. Thomas Müller")).toBe("herr");
  });
  it("Bindestrich-Vorname", () => {
    expect(guessSalutationFromName("Hans-Peter Schmidt")).toBe("herr");
    expect(guessSalutationFromName("Anna-Lena Weber")).toBe("frau");
  });
  it("bleibt bei 'Andrea Thomas' null (erster Token mehrdeutig, nicht durch Nachname überstimmen)", () => {
    expect(guessSalutationFromName("Andrea Thomas")).toBeNull();
  });
});

describe("guessSalutationFromEmailLocalpart", () => {
  it("erkennt Vornamen im Localpart", () => {
    expect(guessSalutationFromEmailLocalpart("thomas.mueller@firma.de")).toBe("herr");
    expect(guessSalutationFromEmailLocalpart("sabine.meier@firma.de")).toBe("frau");
  });
  it("akzeptiert Plus-Adressing", () => {
    expect(guessSalutationFromEmailLocalpart("thomas.mueller+news@firma.de")).toBe("herr");
  });
  it("ignoriert Einzelbuchstaben-Initialen", () => {
    expect(guessSalutationFromEmailLocalpart("s.meier@firma.de")).toBeNull();
    expect(guessSalutationFromEmailLocalpart("t.mueller@firma.de")).toBeNull();
  });
  it("lehnt Rollen-Postfächer ab", () => {
    expect(guessSalutationFromEmailLocalpart("info@firma.de")).toBeNull();
    expect(guessSalutationFromEmailLocalpart("hr@firma.de")).toBeNull();
    expect(guessSalutationFromEmailLocalpart("kontakt@firma.de")).toBeNull();
    expect(guessSalutationFromEmailLocalpart("thomas-service@firma.de")).toBeNull();
  });
  it("gibt null bei reinem Nachnamen", () => {
    expect(guessSalutationFromEmailLocalpart("mueller@firma.de")).toBeNull();
  });
  it("gibt null bei null/leerem Input", () => {
    expect(guessSalutationFromEmailLocalpart(null)).toBeNull();
    expect(guessSalutationFromEmailLocalpart("")).toBeNull();
    expect(guessSalutationFromEmailLocalpart(undefined)).toBeNull();
  });
});

describe("guessSalutation (Composite-Priorität)", () => {
  it("rawSalutation gewinnt über alles", () => {
    expect(
      guessSalutation({ rawSalutation: "Herr", name: "Andrea Schmidt", email: "sabine@x.de" }),
    ).toBe("herr");
  });
  it("Name gewinnt über E-Mail", () => {
    expect(
      guessSalutation({ name: "Thomas Müller", email: "sabine@firma.de" }),
    ).toBe("herr");
  });
  it("E-Mail feuert, wenn Name null liefert", () => {
    expect(
      guessSalutation({ name: "Andrea Schmidt", email: "thomas.andrea@firma.de" }),
    ).toBe("herr");
  });
  it("gibt null, wenn alle Quellen null liefern", () => {
    expect(guessSalutation({})).toBeNull();
    expect(guessSalutation({ name: "Andrea Schmidt", email: "info@firma.de" })).toBeNull();
  });
});

describe("normalizeSalutationString", () => {
  it("akzeptiert gängige Varianten", () => {
    expect(normalizeSalutationString("Herr")).toBe("herr");
    expect(normalizeSalutationString("Hr.")).toBe("herr");
    expect(normalizeSalutationString("Mr.")).toBe("herr");
    expect(normalizeSalutationString("Herrn")).toBe("herr");
    expect(normalizeSalutationString("Frau")).toBe("frau");
    expect(normalizeSalutationString("Fr.")).toBe("frau");
    expect(normalizeSalutationString("Mrs.")).toBe("frau");
    expect(normalizeSalutationString("Ms.")).toBe("frau");
  });
  it("gibt null bei unbekannten Werten", () => {
    expect(normalizeSalutationString("Divers")).toBeNull();
    expect(normalizeSalutationString("")).toBeNull();
    expect(normalizeSalutationString(null)).toBeNull();
  });
});
