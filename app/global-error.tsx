"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="de">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#111113", color: "#f3f4f6", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
        <div style={{ maxWidth: "28rem", width: "100%", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Kritischer Fehler</h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", opacity: 0.7 }}>
            Die Anwendung konnte nicht geladen werden.
          </p>
          {error.digest && (
            <p style={{ marginTop: "0.75rem", fontFamily: "monospace", fontSize: "0.625rem", opacity: 0.5 }}>
              Digest: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{ marginTop: "1.25rem", padding: "0.5rem 1rem", borderRadius: "0.5rem", border: "1px solid #374151", background: "transparent", color: "inherit", cursor: "pointer" }}
          >
            Neu laden
          </button>
        </div>
      </body>
    </html>
  );
}
