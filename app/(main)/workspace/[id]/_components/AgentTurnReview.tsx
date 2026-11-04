"use client";

import { Eye, Redo2, Undo2 } from "lucide-react";
import type { ChangeCounts, TurnSummary } from "@/lib/agent-turn";
import { Button } from "@/components/ui/button";


function describe({ added, changed, removed }: ChangeCounts, noun: string) {
    const parts = [
        added > 0 && `${added} added`,
        changed > 0 && `${changed} edited`,
        removed > 0 && `${removed} removed`,
    ].filter(Boolean)
    return parts.length > 0 ? `${noun}: ${parts.join(", ")}` : null
}

export function AgentTurnReview({
    summary,
    undone,
    onShow,
    onUndo,
    onRedo,
}: {
    summary: TurnSummary
    undone: boolean
    onShow: () => void
    onUndo: () => void
    onRedo: () => void
}) {
    const lines = [describe(summary.shapes, "Canvas Shapes"), describe(summary.blocks, "Doc blocks")].filter(Boolean)

    return (
        <div className="space-y-2 rounded-md border border-white/10 bg-white/3 p-3 text-xs">
            <p className="font-medium">{undone ? "Agent changes undone" : "Agent changes"}</p>
            <ul className="space-y-0.5 text-muted-foreground">
                {lines.map((line) => (
                    <li key={line}>{line}</li>
                ))}
            </ul>

            <div className="flex items-center gap-1.5">
                {undone ? (
                    <Button size="sm" variant="secondary" className="h-7 gap-1.5" onClick={onRedo}>
                        <Redo2 className="size-3.5" />
                        Redo
                    </Button>
                ) : (
                    <>
                        <Button size="sm" variant="secondary" className="h-7 gap-1.5" onClick={onShow}>
                            <Eye className="size-3.5" />
                            Show
                        </Button>
                        <Button size="sm" variant="secondary" className="h-7 gap-1.5" onClick={onUndo}>
                            <Undo2 className="size-3.5" />
                            Undo
                        </Button>
                    </>
                )}
            </div>

            {!undone && (
                <p className="text-[11px] text-muted-foreground">
                    Undo returns the doc and canvas to how they were before this request, including edits anyone made since.
                </p>
            )}
        </div>
    )
}