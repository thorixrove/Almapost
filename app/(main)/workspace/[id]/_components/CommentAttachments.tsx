"use client";

import { useWorkspaceEditors } from "@/components/WorkspaceEditorsContext";
import { Button } from "@/components/ui/button";
import { blockAnchor, shapeAnchor } from "@/lib/comment-anchors";
import type { PanelAnchor } from "@/lib/comment-temp";
import { Pin, X } from "lucide-react";

// Under the new-comment box: pin the comment to the block at the cursor or to the selected shape,
// or show what it is pinned to, with a button to remove it.
export function CommentAttachments({
    anchor,
    onChange,
}: {
    anchor: PanelAnchor | null,
    onChange: (anchor: PanelAnchor | null) => void,
}) {
    const { docEditor, canvasEditor } = useWorkspaceEditors()

    if (anchor) {
        return (
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 rounded-full bg-white/8 py-0.5 pr-1 pl-2 text-[11px]">
                    <Pin className="size-3" />
                    <span className="max-w-48 truncate">{anchor.label}</span>
                    <button type="button" aria-label="Remove attachment" onClick={() => onChange(null)}>
                        <X className="size-3" />
                    </button>
                </span>
            </div>
        )
    }

    const attach = (found: PanelAnchor | null) => {
        if (found) onChange(found)
    }

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {docEditor && (
                <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px]" onClick={() => attach(blockAnchor(docEditor))}>
                    <Pin className="size-3" /> Attach current block
                </Button>
            )}
            {canvasEditor && (
                <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px]" onClick={() => attach(shapeAnchor(canvasEditor))}>
                    <Pin className="size-3" /> Attach selected shape
                </Button>
            )}
        </div>
    )
}