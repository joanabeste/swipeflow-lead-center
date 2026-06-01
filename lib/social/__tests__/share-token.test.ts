import { describe, it, expect, afterEach } from "vitest";
import { generateShareToken, buildShareLink } from "../share-token";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("generateShareToken", () => {
  it("liefert ein URL-sicheres base64url-Token (32 Byte → 43 Zeichen)", () => {
    const t = generateShareToken();
    expect(t).toHaveLength(43);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("ist bei jedem Aufruf unterschiedlich", () => {
    expect(generateShareToken()).not.toBe(generateShareToken());
  });
});

describe("buildShareLink", () => {
  it("nutzt APP_BASE_URL und hängt /freigabe/<token> an", () => {
    process.env.APP_BASE_URL = "https://app.swipeflow.de";
    delete process.env.CONTRACT_PUBLIC_BASE_URL;
    expect(buildShareLink("abc")).toBe("https://app.swipeflow.de/freigabe/abc");
  });
  it("entfernt einen abschließenden Slash der Basis-URL", () => {
    process.env.APP_BASE_URL = "https://app.swipeflow.de/";
    expect(buildShareLink("xyz")).toBe("https://app.swipeflow.de/freigabe/xyz");
  });
  it("fällt auf CONTRACT_PUBLIC_BASE_URL zurück", () => {
    delete process.env.APP_BASE_URL;
    process.env.CONTRACT_PUBLIC_BASE_URL = "https://vertrag.swipeflow.de";
    expect(buildShareLink("t")).toBe("https://vertrag.swipeflow.de/freigabe/t");
  });
});
