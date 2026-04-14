import { describe, it, expect } from "vitest";
import { mapEventToCallStatus } from "../client";

describe("mapEventToCallStatus", () => {
  it("mapped 'ringing' → ringing, hasEnded=false", () => {
    const r = mapEventToCallStatus({ call_id: "x", event: "ringing" });
    expect(r.status).toBe("ringing");
    expect(r.hasEnded).toBe(false);
  });

  it("mapped 'ended' → ended, hasEnded=true", () => {
    const r = mapEventToCallStatus({ call_id: "x", event: "ended" });
    expect(r.hasEnded).toBe(true);
  });

  it("unbekannter Event-Typ → fällt auf sinnvollen Default zurück", () => {
    const r = mapEventToCallStatus({ call_id: "x", event: "wat-soll-das" });
    expect(r.status).toBeTypeOf("string");
  });
});
