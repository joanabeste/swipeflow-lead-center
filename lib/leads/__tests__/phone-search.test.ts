import { describe, it, expect } from "vitest";
import { canonicalPhoneDigits } from "../phone-search";

describe("canonicalPhoneDigits", () => {
  it("vereinheitlicht ALLE Schreibweisen derselben Nummer (Trenner/Präfix egal)", () => {
    const c = "495719724927";
    expect(canonicalPhoneDigits("0571 9724927")).toBe(c);
    expect(canonicalPhoneDigits("+49 571 9724927")).toBe(c);
    expect(canonicalPhoneDigits("0049571 9724927")).toBe(c);
    expect(canonicalPhoneDigits("(0571) 9724927")).toBe(c);
    expect(canonicalPhoneDigits("0571-972-4927")).toBe(c);
    expect(canonicalPhoneDigits("+495719724927")).toBe(c);
  });

  it("00<Ländercode> → ohne führende 00", () => {
    expect(canonicalPhoneDigits("0049 162 6893843")).toBe("491626893843");
    expect(canonicalPhoneDigits("001 555 0123")).toBe("15550123");
  });

  it("nationale 0… → 49 + Rest", () => {
    expect(canonicalPhoneDigits("0162 6893843")).toBe("491626893843");
  });

  it("ohne Präfix unverändert (nur Ziffern)", () => {
    expect(canonicalPhoneDigits("49 162 6893843")).toBe("491626893843");
    expect(canonicalPhoneDigits("1626893843")).toBe("1626893843");
  });

  it("leere / nicht-numerische Eingabe → leerer String", () => {
    expect(canonicalPhoneDigits("")).toBe("");
    expect(canonicalPhoneDigits("Müller GmbH")).toBe("");
    expect(canonicalPhoneDigits("   ")).toBe("");
  });

  it("Teil-Eingabe bleibt für die Teilstring-Suche nutzbar", () => {
    // "0571" → "49571" matcht phone_norm-Werte, die mit 49571… beginnen.
    expect(canonicalPhoneDigits("0571")).toBe("49571");
    // reine Mittelziffern ohne Präfix bleiben unverändert.
    expect(canonicalPhoneDigits("9724927")).toBe("9724927");
  });
});
