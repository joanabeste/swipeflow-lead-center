import { describe, it, expect } from "vitest";
import { detectLinkType, linkTypeLabel } from "../link-platforms";

describe("detectLinkType", () => {
  it("erkennt Social-Profile", () => {
    expect(detectLinkType("https://www.facebook.com/firma")).toBe("facebook");
    expect(detectLinkType("instagram.com/firma")).toBe("instagram");
    expect(detectLinkType("https://x.com/firma")).toBe("twitter");
    expect(detectLinkType("linkedin.com/company/firma")).toBe("linkedin");
  });
  it("erkennt Google-Maps-/Business-Links", () => {
    expect(detectLinkType("https://maps.google.com/?cid=123")).toBe("google_maps");
    expect(detectLinkType("https://www.google.com/maps/place/Firma")).toBe("google_maps");
    expect(detectLinkType("https://g.page/firma")).toBe("google_maps");
    expect(detectLinkType("https://maps.app.goo.gl/abc123")).toBe("google_maps");
  });
  it("erkennt Branchenverzeichnisse/Portale", () => {
    expect(detectLinkType("https://www.gelbeseiten.de/gsbiz/123")).toBe("directory");
    expect(detectLinkType("malerfinder.de/firma")).toBe("directory");
    expect(detectLinkType("https://www.dasoertliche.de/xyz")).toBe("directory");
  });
  it("normale Firmen-Website bleibt 'website'", () => {
    expect(detectLinkType("https://mustermann.de")).toBe("website");
    expect(detectLinkType("kracht-kfztechnik.de")).toBe("website");
  });
  it("Labels stimmen", () => {
    expect(linkTypeLabel("google_maps")).toBe("Google Maps");
    expect(linkTypeLabel("directory")).toBe("Branchenverzeichnis");
    expect(linkTypeLabel("facebook")).toBe("Facebook");
  });
});
