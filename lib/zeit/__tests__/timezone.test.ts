import { describe, it, expect } from "vitest";
import {
  startOfDayInAppTz,
  startOfDayInAppTzFromDateKey,
  dateKeyInAppTz,
  getDayOfWeekInAppTz,
  startOfMonthInAppTz,
  startOfYearInAppTz,
  addDaysToStartOfDayInAppTz,
  addMonthsToStartOfMonthInAppTz,
} from "@/lib/zeit/timezone";

describe("timezone helpers (Europe/Berlin)", () => {
  it("startOfDayInAppTz: Sommerzeit (UTC+2) → 00:00 Berlin = 22:00 UTC Vortag", () => {
    // Eintrag um 23:30 Berlin am 26.05.2026 → 21:30 UTC.
    const ref = new Date("2026-05-26T21:30:00Z");
    expect(startOfDayInAppTz(ref).toISOString()).toBe("2026-05-25T22:00:00.000Z");
  });

  it("startOfDayInAppTz: Winterzeit (UTC+1) → 00:00 Berlin = 23:00 UTC Vortag", () => {
    const ref = new Date("2026-01-15T10:00:00Z"); // mittags Berlin
    expect(startOfDayInAppTz(ref).toISOString()).toBe("2026-01-14T23:00:00.000Z");
  });

  it("startOfDayInAppTz: kurz nach Berliner Mitternacht in UTC (Vortag) liefert den richtigen Berlin-Tag", () => {
    // 00:30 Berlin am 26.05.2026 = 22:30 UTC am 25.05.
    const ref = new Date("2026-05-25T22:30:00Z");
    expect(startOfDayInAppTz(ref).toISOString()).toBe("2026-05-25T22:00:00.000Z");
  });

  it("dateKeyInAppTz: UTC-Instant kurz vor Berliner Mitternacht ist noch der Vortag-Berlin", () => {
    // 23:30 Berlin am 26.05.2026 = 21:30 UTC.
    expect(dateKeyInAppTz(new Date("2026-05-26T21:30:00Z"))).toBe("2026-05-26");
  });

  it("dateKeyInAppTz: UTC-Instant kurz nach Berliner Mitternacht ist der neue Berlin-Tag", () => {
    // 00:30 Berlin am 27.05.2026 = 22:30 UTC am 26.05.
    expect(dateKeyInAppTz(new Date("2026-05-26T22:30:00Z"))).toBe("2026-05-27");
  });

  it("DST-Beginn 2026-03-29: Stunden-Sprung 02:00→03:00, Tagesgrenze trotzdem korrekt", () => {
    // Sa 28.03.2026 22:00 UTC = So 29.03.2026 00:00 Berlin (vor Sprung, MEZ).
    const sundayStart = startOfDayInAppTzFromDateKey("2026-03-29");
    expect(sundayStart.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    // Tagesende = Mo 30.03.2026 00:00 Berlin = So 29.03.2026 22:00 UTC (Sommerzeit MESZ).
    expect(addDaysToStartOfDayInAppTz(sundayStart, 1).toISOString()).toBe("2026-03-29T22:00:00.000Z");
  });

  it("DST-Ende 2026-10-25: Stunden-Sprung 03:00→02:00, Tagesgrenze trotzdem korrekt", () => {
    // Sa 24.10.2026 22:00 UTC = So 25.10.2026 00:00 Berlin (Sommerzeit MESZ).
    const sundayStart = startOfDayInAppTzFromDateKey("2026-10-25");
    expect(sundayStart.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    // Tagesende = Mo 26.10.2026 00:00 Berlin = So 25.10.2026 23:00 UTC (MEZ).
    expect(addDaysToStartOfDayInAppTz(sundayStart, 1).toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });

  it("getDayOfWeekInAppTz: 26.05.2026 ist Dienstag (=2)", () => {
    expect(getDayOfWeekInAppTz(new Date("2026-05-26T10:00:00Z"))).toBe(2);
  });

  it("getDayOfWeekInAppTz: 00:30 Berlin am Montag ist Montag, nicht Sonntag (Vortag UTC)", () => {
    // 00:30 Berlin Mo 25.05.2026 = 22:30 UTC So 24.05.2026.
    expect(getDayOfWeekInAppTz(new Date("2026-05-24T22:30:00Z"))).toBe(1);
  });

  it("startOfMonthInAppTz: 1.5.2026 00:00 Berlin = 30.4.2026 22:00 UTC (Sommerzeit)", () => {
    expect(startOfMonthInAppTz(new Date("2026-05-15T12:00:00Z")).toISOString()).toBe("2026-04-30T22:00:00.000Z");
  });

  it("startOfYearInAppTz: 1.1.2026 00:00 Berlin = 31.12.2025 23:00 UTC (Winterzeit)", () => {
    expect(startOfYearInAppTz(new Date("2026-05-15T12:00:00Z")).toISOString()).toBe("2025-12-31T23:00:00.000Z");
  });

  it("addMonthsToStartOfMonthInAppTz: Jan→Feb ueberspringt nicht den DST-Wechsel", () => {
    const jan = startOfYearInAppTz(new Date("2026-05-15T12:00:00Z"));
    const feb = addMonthsToStartOfMonthInAppTz(jan, 1);
    expect(feb.toISOString()).toBe("2026-01-31T23:00:00.000Z"); // 1.2.2026 00:00 Berlin
  });

  it("addDaysToStartOfDayInAppTz: 7 Tage ueber Sommerzeit-Beginn bleibt Mitternacht-Berlin", () => {
    // Start Mo 23.03.2026 00:00 Berlin = So 22.03.2026 23:00 UTC.
    const start = startOfDayInAppTzFromDateKey("2026-03-23");
    // +7 Tage = Mo 30.03.2026 00:00 Berlin = So 29.03.2026 22:00 UTC (jetzt Sommerzeit).
    expect(addDaysToStartOfDayInAppTz(start, 7).toISOString()).toBe("2026-03-29T22:00:00.000Z");
  });
});
