import { describe, it, expect } from "vitest";
import { extractPhoneSafe, looksLikePhone } from "../import-helpers";

describe("looksLikePhone", () => {
  it("akzeptiert deutsche Telefonnummern", () => {
    expect(looksLikePhone("0571 82945300")).toBe(true);
    expect(looksLikePhone("+49 (0571) 829-453")).toBe(true);
  });
  it("rejected Öffnungszeiten-Strings aus Google Maps", () => {
    expect(looksLikePhone("Schließt um 17:00")).toBe(false);
    expect(looksLikePhone("· Schließt um 18:00")).toBe(false);
    expect(looksLikePhone("Geöffnet")).toBe(false);
    expect(looksLikePhone("Rund um die Uhr geöffnet")).toBe(false);
  });
  it("rejected Bewertungen und Review-Counts", () => {
    expect(looksLikePhone("4,8")).toBe(false);
    expect(looksLikePhone("(210)")).toBe(false);
  });
});

describe("extractPhoneSafe", () => {
  it("nimmt die Telefonnummer aus der erwarteten Position", () => {
    const row = [
      "https://maps…", "Firma", "4,8", "(210)", "Autowerkstatt", "·",
      "60 Rodenbecker Str.", "Geöffnet", "· Schließt um 18:00", "·",
      "0571 82945300",
    ];
    expect(extractPhoneSafe(row, 10)).toBe("0571 82945300");
  });

  it("ignoriert „Schließt um …\" in der Primär-Position und sucht weiter", () => {
    const row = [
      "https://maps…", "Firma", "4,8", "(210)", "Autowerkstatt", "·",
      "·", "Geöffnet", "· Schließt um 17:00", "0571 82945300",
      "Schließt um 17:00",
    ];
    expect(extractPhoneSafe(row, 10)).toBe("0571 82945300");
  });

  it("gibt null zurück, wenn keine Zelle wie eine Telefonnummer aussieht", () => {
    const row = [
      "https://maps…", "Firma", "4,8", "(210)", "Autowerkstatt", "·",
      "·", "Geöffnet",
    ];
    expect(extractPhoneSafe(row, 10)).toBeNull();
  });

  it("ignoriert URLs (z.B. wenn die Website-Spalte versehentlich gescannt wird)", () => {
    const row = [
      "https://maps…", "Firma", "", "", "", "", "", "", "", "",
      "https://example.de/kontakt",
      "0571 82945300",
    ];
    expect(extractPhoneSafe(row, 10)).toBe("0571 82945300");
  });
});
