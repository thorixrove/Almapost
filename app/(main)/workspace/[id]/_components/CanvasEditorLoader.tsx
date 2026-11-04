"use client";

import dynamic from "next/dynamic";

// tldraw itu besar. Dengan dynamic import, header workspace dan editor dokumen tampil dulu,
// dan kode canvas dimuat terpisah. Pola yang sama dengan DocEditorLoader.
export const CanvasEditor = dynamic(
  () => import("./CanvasEditor").then((m) => m.CanvasEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Memuat canvas...
      </div>
    ),
  },
);