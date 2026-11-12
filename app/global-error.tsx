"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Catches errors in the root layout itself, which app/error.tsx cannot. It replaces the whole
// document, so it renders its own <html> and <body>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="id" className="dark">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#0a0a0a", color: "#fafafa", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Terjadi kesalahan</h1>
          <p style={{ opacity: 0.7, marginBottom: 16 }}>Maaf, ada yang tidak beres. Silakan coba lagi.</p>
          <button onClick={reset} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #404040", background: "transparent", color: "inherit", cursor: "pointer" }}>
            Coba lagi
          </button>
        </div>
      </body>
    </html>
  );
}