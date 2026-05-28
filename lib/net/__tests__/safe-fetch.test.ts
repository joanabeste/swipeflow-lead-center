import { describe, it, expect } from "vitest";
import { assertSafeUrl, SsrfError } from "../safe-fetch";

// assertSafeUrl löst IP-Literale ohne Netzwerk auf (dns.lookup gibt sie direkt
// zurück), daher sind diese Tests hermetisch.

describe("assertSafeUrl", () => {
  it("blockt Loopback (IPv4)", async () => {
    await expect(assertSafeUrl("http://127.0.0.1/")).rejects.toBeInstanceOf(SsrfError);
  });

  it("blockt die Cloud-Metadata-Adresse 169.254.169.254", async () => {
    await expect(assertSafeUrl("http://169.254.169.254/latest/meta-data/")).rejects.toBeInstanceOf(SsrfError);
  });

  it("blockt private Ranges (10/8, 172.16/12, 192.168/16)", async () => {
    await expect(assertSafeUrl("http://10.0.0.1/")).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeUrl("http://172.16.5.5/")).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeUrl("http://192.168.1.10/")).rejects.toBeInstanceOf(SsrfError);
  });

  it("blockt IPv6-Loopback und ULA", async () => {
    await expect(assertSafeUrl("http://[::1]/")).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeUrl("http://[fc00::1]/")).rejects.toBeInstanceOf(SsrfError);
  });

  it("blockt localhost", async () => {
    await expect(assertSafeUrl("http://localhost/")).rejects.toBeInstanceOf(SsrfError);
  });

  it("blockt Nicht-HTTP-Protokolle", async () => {
    await expect(assertSafeUrl("ftp://example.com/")).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toBeInstanceOf(SsrfError);
  });

  it("erlaubt öffentliche IP-Literale", async () => {
    const url = await assertSafeUrl("https://8.8.8.8/");
    expect(url.hostname).toBe("8.8.8.8");
  });
});
