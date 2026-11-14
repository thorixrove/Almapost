"use client";
import { useMemo } from "react";
import { Tldraw, type Editor, type TLEditorSnapshot } from "tldraw";
import "tldraw/tldraw.css";
import { EntityTableShapeUtil } from "@/components/EntityTable/EntityTableShapeUtil";
import { createSharedAssetStore } from "@/lib/canvas-asset-store";

const shapeUtils = [EntityTableShapeUtil];

// Read-only canvas from the last saved snapshot in Postgres — used by the public shared link,
// so it never joins the live sync room.
export function CanvasViewer({ snapshot, shareToken }: { snapshot: TLEditorSnapshot | null; shareToken: string }) {
  const assets = useMemo(() => createSharedAssetStore(shareToken), [shareToken])
  const handleMount = (editor: Editor) => {
    editor.updateInstanceState({ isReadonly: true });
    editor.zoomToFit();
  };

  // isolate keeps tldraw's high z-index layers inside the canvas (see CanvasEditor).
  return (
    <div className="isolate h-full">
      <Tldraw
        snapshot={snapshot ?? undefined}
        assets={assets}
        shapeUtils={shapeUtils}
        onMount={handleMount}
        colorScheme="dark"
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
      />
    </div>
  );
}