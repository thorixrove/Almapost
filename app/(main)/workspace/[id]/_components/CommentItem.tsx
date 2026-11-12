"use client";

import type { CommentView } from "@/actions/comment";
import { useWorkspaceEditors } from "@/components/WorkspaceEditorsContext";
import { Badge } from "@/components/ui/badge";
import type { CommentActions } from "@/hooks/use-workspace-comments";
import { showAnchor } from "@/lib/comment-anchors";
import { splitBody, type Mentionable } from "@/lib/comment-body";
import { isPendingComment } from "@/lib/comment-temp";
import { formatDistanceToNow } from "date-fns";
import { Pin } from "lucide-react";
import { useState } from "react";
import { CommentComposer } from "./CommentComposer";

// One comment (a thread's first comment or a reply): its text, pin, and the Reply / Resolve /
// Edit / Delete links. Whether it is being edited, or waiting to confirm a delete, is kept here.
export function CommentItem({
    comment,
    isRoot,
    meId,
    members,
    actions,
    onReply,
}: {
    comment: CommentView,
    isRoot: boolean,
    meId?: string,
    members: Mentionable[],
    actions: CommentActions,
    onReply?: () => void,
}) {
    const editors = useWorkspaceEditors()
    const [editing, setEditing] = useState(false)
    // Text of an edit that failed to save, so reopening the box brings it back.
    const [draft, setDraft] = useState<string | null>(null)
    const [confirmingDelete, setConfirmingDelete] = useState(false)
    const isPending = isPendingComment(comment.id)

    const startEdit = () => {
        setDraft(null)
        setEditing(true)
    }

    const stopEdit = () => {
        setDraft(null)
        setEditing(false)
    }

    const saveEdit = async (body: string) => {
        setEditing(false)
        try {
            await actions.saveEdit(comment.id, body)
        } catch (error) {
            setDraft(body)
            setEditing(true)
            throw error
        }
    }

    const handleDelete = () => {
        if (!confirmingDelete) {
            setConfirmingDelete(true)
            return
        }
        setConfirmingDelete(false)
        void actions.deleteComment(comment)
    }

    return (
        <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 text-xs">
                <span className="font-medium">{comment.author.name}</span>
                <span className="text-muted-foreground">
                    {isPending ? "Sending…" : formatDistanceToNow(comment.createdAt, { addSuffix: true })}
                    {comment.editedAt && !isPending ? " · edited" : ""}
                </span>
                {comment.unreadMention && <Badge className="h-4 px-1.5 text-[10px]">Mentioned you</Badge>}
            </div>

            {editing ? (
                <CommentComposer
                    members={members}
                    initialBody={draft ?? comment.body}
                    placeholder="Edit comment"
                    submitLabel="Save"
                    autoFocus
                    onSubmit={saveEdit}
                    onCancel={stopEdit}
                />
            ) : (
                <p className="text-sm break-words whitespace-pre-wrap">
                    {splitBody(comment.body).map((segment, index) =>
                        segment.type === "text" ? (
                            <span key={index}>{segment.text}</span>
                        ) : (
                            <span
                                key={index}
                                className={`rounded-sm px-0.5 font-medium text-primary ${segment.userId === meId ? "bg-primary/20" : ""}`}
                            >
                                @{segment.name}
                            </span>
                        )
                    )}
                </p>
            )}

            {isRoot && comment.anchorType && comment.anchorId && (
                <button
                    type="button"
                    onClick={() => showAnchor(comment.anchorType, comment.anchorId, editors)}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                    <Pin className="size-3" />
                    {comment.anchorType === "BLOCK" ? "Show block" : "Show shape"}
                </button>
            )}

            {!editing && !isPending && (
                <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                    {isRoot && (
                        <button type="button" className="hover:text-foreground" onClick={onReply}>
                            Reply
                        </button>
                    )}
                    {isRoot && (
                        <button type="button" className="hover:text-foreground" onClick={() => actions.toggleResolved(comment)}>
                            {comment.resolvedAt ? "Reopen" : "Resolve"}
                        </button>
                    )}
                    {comment.canEdit && (
                        <button type="button" className="hover:text-foreground" onClick={startEdit}>
                            Edit
                        </button>
                    )}
                    {comment.canDelete && (
                        <button
                            type="button"
                            className={confirmingDelete ? "text-destructive" : "hover:text-foreground"}
                            onClick={handleDelete}
                        >
                            {confirmingDelete ? (isRoot ? "Delete thread?" : "Delete?") : "Delete"}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}