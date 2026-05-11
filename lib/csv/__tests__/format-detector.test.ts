import { describe, it, expect } from "vitest";
import { buildColumnIndex, GOOGLE_MAPS_COLUMNS } from "../format-detector";

describe("buildColumnIndex", () => {
  it("findet alle Google-Maps-Spalten im 'kompakten' Layout (google (44).csv)", () => {
    const headers = [
      "hfpxzc href", "qBF1Pd", "MW4etd", "UY7F9", "W4Efsd", "W4Efsd 2",
      "W4Efsd 3", "W4Efsd 4", "W4Efsd 5", "W4Efsd 6", "UsdlK", "lcr4fd href",
      "Cw1rxd", "R8c4Qb", "Cw1rxd 2", "R8c4Qb 2", "doJOZc", "ah5Ghc",
      "W4Efsd 7", "Jn12ke src",
    ];
    const idx = buildColumnIndex(headers, GOOGLE_MAPS_COLUMNS);
    expect(idx.companyName).toBe(1);
    expect(idx.address).toBe(6);
    expect(idx.phone).toBe(10);
    expect(idx.website).toBe(11);
  });

  it("findet alle Google-Maps-Spalten im 'erweiterten' Layout (google (43).csv)", () => {
    const headers = [
      "hfpxzc href", "qBF1Pd", "MW4etd", "UY7F9", "W4Efsd", "W4Efsd 2",
      "doJOZc", "W4Efsd 3", "W4Efsd 4", "W4Efsd 5", "W4Efsd 6", "W4Efsd 7",
      "UsdlK", "lcr4fd href", "Cw1rxd", "R8c4Qb", "Cw1rxd 2", "R8c4Qb 2",
      "Jn12ke src", "ah5Ghc",
    ];
    const idx = buildColumnIndex(headers, GOOGLE_MAPS_COLUMNS);
    expect(idx.companyName).toBe(1);
    expect(idx.address).toBe(7);
    expect(idx.phone).toBe(12);
    expect(idx.website).toBe(13);
  });

  it("liefert -1 für unbekannte Header", () => {
    const idx = buildColumnIndex(["foo", "bar"], { phone: "UsdlK", name: "foo" });
    expect(idx.phone).toBe(-1);
    expect(idx.name).toBe(0);
  });

  it("ist case-insensitive und ignoriert Whitespace", () => {
    const idx = buildColumnIndex(["  QBF1PD  ", "usdlk"], GOOGLE_MAPS_COLUMNS);
    expect(idx.companyName).toBe(0);
    expect(idx.phone).toBe(1);
  });
});
