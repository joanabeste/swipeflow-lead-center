import { describe, it, expect } from "vitest";
import {
  mediaKindForMime,
  maxBytesForMime,
  isImageMime,
  isVideoMime,
  validateMediaForFormat,
  sanitizeFileName,
  SOCIAL_IMAGE_MAX_BYTES,
  SOCIAL_VIDEO_MAX_BYTES,
} from "../format";

describe("mediaKindForMime", () => {
  it("erkennt Bilder", () => {
    expect(mediaKindForMime("image/jpeg")).toBe("image");
    expect(mediaKindForMime("image/webp")).toBe("image");
  });
  it("erkennt Videos", () => {
    expect(mediaKindForMime("video/mp4")).toBe("video");
    expect(mediaKindForMime("video/quicktime")).toBe("video");
  });
  it("gibt null für unbekannte Typen", () => {
    expect(mediaKindForMime("application/pdf")).toBeNull();
    expect(mediaKindForMime("")).toBeNull();
  });
});

describe("maxBytesForMime", () => {
  it("nutzt das Video-Limit für Videos", () => {
    expect(maxBytesForMime("video/mp4")).toBe(SOCIAL_VIDEO_MAX_BYTES);
  });
  it("nutzt das Bild-Limit für Bilder (und Unbekanntes)", () => {
    expect(maxBytesForMime("image/png")).toBe(SOCIAL_IMAGE_MAX_BYTES);
    expect(maxBytesForMime("application/pdf")).toBe(SOCIAL_IMAGE_MAX_BYTES);
  });
});

describe("isImageMime / isVideoMime", () => {
  it("trennt Bild und Video sauber", () => {
    expect(isImageMime("image/gif")).toBe(true);
    expect(isImageMime("video/mp4")).toBe(false);
    expect(isVideoMime("video/webm")).toBe(true);
    expect(isVideoMime("image/jpeg")).toBe(false);
  });
});

describe("validateMediaForFormat", () => {
  const img = { media_kind: "image" as const };
  const vid = { media_kind: "video" as const };

  it("feed_single verlangt genau 1 Bild", () => {
    expect(validateMediaForFormat("feed_single", [img])).toBeNull();
    expect(validateMediaForFormat("feed_single", [])).not.toBeNull();
    expect(validateMediaForFormat("feed_single", [img, img])).not.toBeNull();
    expect(validateMediaForFormat("feed_single", [vid])).not.toBeNull();
  });

  it("carousel verlangt 2–10 Bilder, keine Videos", () => {
    expect(validateMediaForFormat("carousel", [img, img])).toBeNull();
    expect(validateMediaForFormat("carousel", [img])).not.toBeNull();
    expect(validateMediaForFormat("carousel", Array(11).fill(img))).not.toBeNull();
    expect(validateMediaForFormat("carousel", [img, vid])).not.toBeNull();
  });

  it("reel und video verlangen genau 1 Video", () => {
    expect(validateMediaForFormat("reel", [vid])).toBeNull();
    expect(validateMediaForFormat("video", [vid])).toBeNull();
    expect(validateMediaForFormat("reel", [img])).not.toBeNull();
    expect(validateMediaForFormat("video", [vid, vid])).not.toBeNull();
  });

  it("story verlangt genau 1 Medium (Bild oder Video)", () => {
    expect(validateMediaForFormat("story", [img])).toBeNull();
    expect(validateMediaForFormat("story", [vid])).toBeNull();
    expect(validateMediaForFormat("story", [])).not.toBeNull();
    expect(validateMediaForFormat("story", [img, img])).not.toBeNull();
  });
});

describe("sanitizeFileName", () => {
  it("ersetzt Sonderzeichen und behält die Endung", () => {
    expect(sanitizeFileName("Mein Bild (1).JPG")).toMatch(/^Mein-Bild-1\.jpg$/);
  });
  it("liefert einen Fallback für leere Namen", () => {
    expect(sanitizeFileName("")).toBe("datei");
  });
  it("kürzt überlange Namen", () => {
    const long = "a".repeat(200) + ".png";
    const out = sanitizeFileName(long);
    expect(out.length).toBeLessThanOrEqual(80 + 4);
    expect(out.endsWith(".png")).toBe(true);
  });
});
