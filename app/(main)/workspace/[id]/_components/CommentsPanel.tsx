"use client";

import { Button } from "@/components/ui/button";
import { useWorkspaceComments } from "@/hooks/use-workspace-comments";
import type { PanelAnchor } from "@/lib/comment-temp";
import { MessageSquare, X } from "lucide-react";
import { useRef, useState } from "react";
import { CommentAttachments } from "./CommentAttachments";
import { CommentComposer } from "./CommentComposer";
import { CommentThread } from "./CommentThread";

// The Comments button in the workspace header and the panel it opens. Loading and changing comments
// is in useWorkspaceComments; each thread and comment is drawn by CommentThread and CommentItem.
export function CommentPanel({ workspaceId }: { workspaceId: string }) {
    const { open, openPanel, closePanel, data, members, meId, summary, threads, actions } = useWorkspaceComments(workspaceId)
    const [filter, setFilter] = useState<"open" | "resolved">("open")
    const [anchor, setAnchor] = useState<PanelAnchor | null>(null)
    const listRef = useRef<HTMLDivElement>(null)

    const openCount = threads.filter((t) => !t.root.resolvedAt).length
    const resolvedCount = threads.length - openCount
    const visibleThreads = threads.filter((t) => (filter === "open" ? !t.root.resolvedAt : !!t.root.resolvedAt))

    const submitThread = async (body: string) => {
        const pinned = anchor
        setAnchor(null)
        setFilter("open")
        requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }))
        try {
            await actions.postThread(body, pinned)
        } catch (error) {
            setAnchor(pinned)
            throw error
        }
    }

    const badge =
        summary && summary.unreadMention > 0 ? (
            <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                @{summary.unreadMention}
            </span>
        ) : summary && summary.openThreads > 0 ? (
            <span className="rounded-full bg-white/10 px-1.5 text-[10px]">{summary.openThreads}</span>
        ) : null

    return (
        <>
            <Button variant="ghost" size="sm" className="gap-2" onClick={() => (open ? closePanel() : openPanel())}>
                <MessageSquare className="size-4" />
                Comments
                {badge}
            </Button>

            {open && (
                <aside
                    aria-label="Comments"
                    className="fixed top-16 right-4 bottom-4 z-30 flex w-96 max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-white/10 bg-background shadow-2xl"
                >
                    <div className="flex items-center justify-between gap-2 border-b border-white/6 px-4 py-3">
                        <div className="flex gap-1">
                            <Button size="sm" variant={filter === "open" ? "secondary" : "ghost"} className="h-7" onClick={() => setFilter("open")}>
                                Open ({openCount})
                            </Button>
                            <Button size="sm" variant={filter === "resolved" ? "secondary" : "ghost"} className="h-7" onClick={() => setFilter("resolved")}>
                                Resolved ({resolvedCount})
                            </Button>
                        </div>
                        <Button size="icon" variant="ghost" className="size-7" aria-label="Close comments" onClick={closePanel}>
                            <X className="size-4" />
                        </Button>
                    </div>

                    <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
                        {data === null ? (
                            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
                        ) : visibleThreads.length === 0 ? (
                            <p className="py-8 text-center text-sm text-muted-foreground">
                                {filter === "open" ? "No open comments." : "No resolved comments."}
                            </p>
                        ) : (
                            visibleThreads.map(({ root, replies }) => (
                                <CommentThread key={root.id} root={root} replies={replies} meId={meId} members={members} actions={actions} />
                            ))
                        )}
                    </div>

                    <div className="border-t border-white/6 px-4 py-3">
                        <CommentComposer
                            members={members}
                            placeholder={members.length > 0 ? "Add a comment. Type @ to mention someone." : "Add a comment"}
                            submitLabel="Comment"
                            onSubmit={submitThread}
                            extra={<CommentAttachments anchor={anchor} onChange={setAnchor} />}
                        />
                    </div>
                </aside>
            )}
        </>
    )
}