"use client";

import {
    editComment,
    getCommentSummary,
    loadComments,
    markCommentsRead,
    postComment,
    removeComment,
    resolveComment,
    type CommentView,
} from "@/actions/comment";
import { useWorkspaceEditors } from "@/components/WorkspaceEditorsContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { splitBody } from "@/lib/comment-body";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, Pin, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { TLShapeId } from "tldraw";
import { CommentComposer } from "./CommentComposer";

const REFRESH_MS = 15_000;
const SUMMARY_MS = 2 * 60 * 1000;

type Loaded = Awaited<ReturnType<typeof loadComments>>;
type Anchor = { type: "BLOCK" | "SHAPE"; id: string; label: string };

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export function CommentPanel({ workspaceId }: { workspaceId: string }) {
    const { docEditor, canvasEditor } = useWorkspaceEditors();
    const [open, setOpen] = useState(false);
    const [data, setData] = useState<Loaded | null>(null);
    const [summary, setSummary] = useState<Awaited<ReturnType<typeof getCommentSummary>> | null>(null);
    const [filter, setFilter] = useState<"open" | "resolved">("open");
    const [anchor, setAnchor] = useState<Anchor | null>(null);
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const refresh = useCallback(async () => {
        try {
            setData(await loadComments(workspaceId))
        } catch (error) {
            toast.error(errorMessage(error, "Couldn't load comment"))
        }
    }, [workspaceId])

    useEffect(() => {
        if (open) return
        const load = () => {
            if (document.visibilityState !== "visible") return
            getCommentSummary(workspaceId).then(setSummary).catch(() => { })
        }
        load()
        const interval = setInterval(load, SUMMARY_MS)
        return () => clearInterval(interval)
    }, [workspaceId, open])

    useEffect(() => {
        if (!open) return
        const interval = setInterval(() => {
            if (document.visibilityState === "visible") void refresh()
        }, REFRESH_MS)
        return () => clearInterval(interval)
    }, [open, refresh])



    const openPanel = () => {
        setOpen(true)
        void refresh()
        markCommentsRead(workspaceId)
            .then(() => setSummary((current) => (current ? { ...current, unreadMention: 0 } : current)))
            .catch(() => { })
    }


    const threads = useMemo(() => {
        const repliesByParent = new Map<string, CommentView[]>()
        const roots: CommentView[] = []
        for (const comment of data?.comment ?? []) {
            if (!comment.parentId) {
                roots.push(comment)
            } else {
                repliesByParent.set(comment.parentId, [...(repliesByParent.get(comment.parentId) ?? []), comment])
            }
        }
        return roots.map((root) => ({ root, replies: repliesByParent.get(root.id) ?? [] }))
    }, [data])

    const openCount = threads.filter((t) => !t.root.resolvedAt).length
    const resolvedCount = threads.length - openCount
    const visibleThreads = threads.filter((t) => (filter === "open" ? !t.root.resolvedAt : !!t.root.resolvedAt))

    const members = data?.members ?? []

    const attachBlock = () => {
        if (!docEditor) return
        try {
            const { block } = docEditor.getTextCursorPosition()
            const text = Array.isArray(block.content)
                ? block.content.map((part) => ("text" in part ? part.text : "")).join("") : ""
            const preview = text.trim().slice(0, 40) || block.type
            setAnchor({ type: "BLOCK", id: block.id, label: `Block: ${preview}` })
        } catch {
            toast.info("Click inside the document first.")
        }
    }

    const attachShape = () => {
        if (!canvasEditor) return
        const [id] = canvasEditor.getSelectedShapeIds()
        if (!id) {
            toast.info("Select a shape on the canvas first.")
            return
        }
        setAnchor({ type: "SHAPE", id, label: `Shape: ${canvasEditor.getShape(id)?.type ?? "shape"}` })
    }


    const showAnchor = (type: "BLOCK" | "SHAPE", id: string) => {
        if (type === "SHAPE") {
            const shapeId = id as TLShapeId
            if (!canvasEditor) return toast.info("Open the Canvas or Both view to see this shape.")
            if (!canvasEditor.getShape(shapeId)) return toast.info("That shape no longer exists.")
            canvasEditor.setSelectedShapes([shapeId])
            canvasEditor.zoomToSelection({ animation: { duration: 300 } })
            return
        }
        const element = document.querySelector(`[data-id="${CSS.escape(id)}"]`)
        if (element) element.scrollIntoView({ block: "center", behavior: "smooth" })
        else toast.info(docEditor ? "That block no longer exists." : "Open the Document or Both view to see this block.")
    }

    const submitThreads = async (body: string) => {
        try {
            await postComment(workspaceId, body, anchor ? { anchor: { type: anchor.type, id: anchor.id } } : undefined)
            setAnchor(null)
            setFilter("open")
            await refresh()
            requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }))
        } catch (error) {
            toast.error(errorMessage(error, "Couln't post comment"))
        }
    }

    const submitReply = (parentId: string) => async (body: string) => {
        try {
            await postComment(workspaceId, body, { parentId })
            setReplyingTo(null)
            await refresh()
        } catch (error) {
            toast.error(errorMessage(error, "Couldn't post reply"))
            throw error
        }
    }

    const submitEdit = (commentId: string) => async (body: string) => {
        try {
            await editComment(workspaceId, commentId, body)
            setEditingId(null)
            await refresh()
        } catch (error) {
            toast.error(errorMessage(error, "Couldn't save changes"))
            throw error
        }
    }

    const handleDelete = async (comment: CommentView) => {
        if (confirmingId !== comment.id) {
            setConfirmingId(comment.id)
            return
        }
        setConfirmingId(null)
        try {
            await removeComment(workspaceId, comment.id)
            await refresh
        } catch (error) {
            toast.error(errorMessage(error, "Coulddn't delete comment"))
        }
    }

    const toggleResolved = async (root: CommentView) => {
        try {
            await resolveComment(workspaceId, root.id, !root.resolvedAt)
            await refresh()
        } catch (error) {
            toast.error(errorMessage(error, "Couldn't update thread"))
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



    const renderComment = (comment: CommentView, isRoot: boolean) => {
        const isEditing = editingId === comment.id

        return (
            <div key={comment.id} className="space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 text-xs">
                    <span className="font-medium">{comment.author.name}</span>
                    <span className="text-muted-foreground">
                        {formatDistanceToNow(comment.createdAt, { addSuffix: true })}
                        {comment.editedAt ? " · edited" : ""}
                    </span>
                    {comment.unreadMention && <Badge className="h-4 px-1.5 text-[10px]">Mentioned you</Badge>}
                </div>

                {isEditing ? (
                    <CommentComposer
                        members={members}
                        initialBody={comment.body}
                        placeholder="Edit comment"
                        submitLabel="Save"
                        autoFocus
                        onSubmit={submitEdit(comment.id)}
                        onCancel={() => setEditingId(null)}
                    />
                ) : (
                    <p className="text-sm break-words whitespace-pre-wrap">
                        {splitBody(comment.body).map((segment, index) =>
                            segment.type === "text" ? (
                                <span key={index}>{segment.text}</span>
                            ) : (
                                <span
                                    key={index}
                                    className={`rounded-sm px-0.5 font-medium text-primary ${segment.userId === data?.meId ? "bg-primary/20" : ""
                                        }`}
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
                        onClick={() => showAnchor(comment.anchorType!, comment.anchorId!)}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                        <Pin className="size-3" />
                        {comment.anchorType === "BLOCK" ? "Show block" : "Show shape"}
                    </button>
                )}

                {!isEditing && (
                    <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                        {isRoot && (
                            <button type="button" className="hover:text-foreground" onClick={() => setReplyingTo(comment.id)}>
                                Reply
                            </button>
                        )}
                        {isRoot && (
                            <button type="button" className="hover:text-foreground" onClick={() => toggleResolved(comment)}>
                                {comment.resolvedAt ? "Reopen" : "Resolve"}
                            </button>
                        )}
                        {comment.canEdit && (
                            <button type="button" className="hover:text-foreground" onClick={() => setEditingId(comment.id)}>
                                Edit
                            </button>
                        )}
                        {comment.canDelete && (
                            <button
                                type="button"
                                className={confirmingId === comment.id ? "text-destructive" : "hover:text-foreground"}
                                onClick={() => handleDelete(comment)}
                            >
                                {confirmingId === comment.id ? (isRoot ? "Delete thread?" : "Delete?") : "Delete"}
                            </button>
                        )}
                    </div>
                )}
            </div>
        )
    }

    return (
        <>
            <Button variant="ghost" size="sm" className="gap-2" onClick={() => (open ? setOpen(false) : openPanel())}>
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
                        <Button size="icon" variant="ghost" className="size-7" aria-label="Close comments" onClick={() => setOpen(false)}>
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
                                <div key={root.id} className={`space-y-3 rounded-lg bg-white/3 p-3 ${root.resolvedAt ? "opacity-70" : ""}`}>
                                    {renderComment(root, true)}
                                    {replies.length > 0 && (
                                        <div className="space-y-3 border-l border-white/10 pl-3">{replies.map((reply) => renderComment(reply, false))}</div>
                                    )}
                                    {replyingTo === root.id && (
                                        <CommentComposer
                                            members={members}
                                            placeholder="Reply"
                                            submitLabel="Reply"
                                            autoFocus
                                            onSubmit={submitReply(root.id)}
                                            onCancel={() => setReplyingTo(null)}
                                        />
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    <div className="border-t border-white/6 px-4 py-3">
                        <CommentComposer
                            members={members}
                            placeholder={members.length > 0 ? "Add a comment. Type @ to mention someone." : "Add a comment"}
                            submitLabel="Comment"
                            onSubmit={submitThreads}
                            extra={
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {anchor ? (
                                        <span className="flex items-center gap-1 rounded-full bg-white/8 py-0.5 pr-1 pl-2 text-[11px]">
                                            <Pin className="size-3" />
                                            <span className="max-w-48 truncate">{anchor.label}</span>
                                            <button type="button" aria-label="Remove attachment" onClick={() => setAnchor(null)}>
                                                <X className="size-3" />
                                            </button>
                                        </span>
                                    ) : (
                                        <>
                                            {docEditor && (
                                                <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px]" onClick={attachBlock}>
                                                    <Pin className="size-3" /> Attach current block
                                                </Button>
                                            )}
                                            {canvasEditor && (
                                                <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px]" onClick={attachShape}>
                                                    <Pin className="size-3" /> Attach selected shape
                                                </Button>
                                            )}
                                        </>
                                    )}
                                </div>
                            }
                        />
                    </div>
                </aside>
            )}
        </>
    )

}
