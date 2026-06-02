import { describe, it, expect } from "vitest";
import { normalizePhone } from "../normalizer";

describe("normalizePhone", () => {
  it("normalisiert deutsche Inlandsnummern (0… → +49…)", () => {
    expect(normalizePhone("0571 82945300")).toBe("+4957182945300");
    expect(normalizePhone("0162 6893843")).toBe("+491626893843");
  });

  it("normalisiert die internationale Wählform 0049 → +49", () => {
    expect(normalizePhone("0049 571 82945300")).toBe("+4957182945300");
  });

  it("normalisiert sonstige 00<Ländercode>-Nummern → +<Ländercode> (vorher unverändert durchgereicht)", () => {
    expect(normalizePhone("001 555 0123")).toBe("+15550123");
    expect(normalizePhone("0041 44 1234567")).toBe("+41441234567");
  });

  it("liefert für dieselbe Nummer in allen Schreibweisen denselben Wert (Dedup-Invariante)", () => {
    const canonical = "+4957182945300";
    expect(normalizePhone("0571 82945300")).toBe(canonical);
    expect(normalizePhone("0571-829-453-00")).toBe(canonical);
    expect(normalizePhone("(0571) 82945300")).toBe(canonical);
    expect(normalizePhone("0049/571/82945300")).toBe(canonical);
    expect(normalizePhone("+49 571 82945300")).toBe(canonical);
  });

  it("entfernt Excel-Apostroph-Prefix vor der Format-Logik", () => {
    expect(normalizePhone("'0571 82945300")).toBe("+4957182945300");
    expect(normalizePhone("'+49 571 82945300")).toBe("+4957182945300");
  });

  it("lässt bereits normalisierte +49-Nummern unverändert", () => {
    expect(normalizePhone("+4957182945300")).toBe("+4957182945300");
  });

  it("liefert null für leere Eingaben", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
  });
});
