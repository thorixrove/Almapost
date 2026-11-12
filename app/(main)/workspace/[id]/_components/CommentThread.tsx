"use client";

import type { CommentView } from "@/actions/comment";
import type { CommentActions } from "@/hooks/use-workspace-comments";
import type { Mentionable } from "@/lib/comment-body";
import { useState } from "react";
import { CommentComposer } from "./CommentComposer";
import { CommentItem } from "./CommentItem";

// A thread: the first comment, its replies, and the box for a new reply (opened by the Reply link).
export function CommentThread({
    root,
    replies,
    meId,
    members,
    actions,
}: {
    root: CommentView,
    replies: CommentView[],
    meId?: string,
    members: Mentionable[],
    actions: CommentActions,
}) {
    const [replying, setReplying] = useState(false)
    // Text of a reply that failed to send, so reopening the box brings it back.
    const [draft, setDraft] = useState<string | null>(null)

    const startReply = () => {
        setDraft(null)
        setReplying(true)
    }

    const stopReply = () => {
        setDraft(null)
        setReplying(false)
    }

    const submitReply = async (body: string) => {
        setReplying(false)
        try {
            await actions.postReply(root.id, body)
        } catch (error) {
            setDraft(body)
            setReplying(true)
            throw error
        }
    }

    return (
        <div className={`space-y-3 rounded-lg bg-white/3 p-3 ${root.resolvedAt ? "opacity-70" : ""}`}>
            <CommentItem comment={root} isRoot meId={meId} members={members} actions={actions} onReply={startReply} />

            {replies.length > 0 && (
                <div className="space-y-3 border-l border-white/10 pl-3">
                    {replies.map((reply) => (
                        <CommentItem key={reply.id} comment={reply} isRoot={false} meId={meId} members={members} actions={actions} />
                    ))}
                </div>
            )}

            {replying && (
                <CommentComposer
                    members={members}
                    initialBody={draft ?? ""}
                    placeholder="Reply"
                    submitLabel="Reply"
                    autoFocus
                    onSubmit={submitReply}
                    onCancel={stopReply}
                />
            )}
        </div>
    )
}