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
import { announceCommentsRead } from "@/lib/notification-events";
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

let tempCounter = 0
function buildTemptComment(input: {
    meId?: string
    meName?: string
    body: string
    parentId: string | null
    pinned: Anchor | null
}): CommentView {
    tempCounter += 1
    return {
        id: `pending-${tempCounter}`,
        parentId: input.parentId,
        body: input.body,
        anchorType: input.pinned?.type ?? null,
        anchorId: input.pinned?.id ?? null,
        resolvedAt: null,
        createdAt: new Date(),
        editedAt: null,
        author: { id: input.meId ?? "", name: input.meName ?? "You", imageUrl: null },
        unreadMention: false,
        canEdit: false,
        canDelete: false,
    }
}

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
    // Text of a reply or edit that failed to send, so reopening its box brings the text back.
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const listRef = useRef<HTMLDivElement>(null);
    // How many of our own changes are still on their way to the server.
    const inflight = useRef(0);

    const refresh = useCallback(async () => {
        try {
            const result = await loadComments(workspaceId)
            // An older list from the server would undo a change that is still on its way, on screen.
            if (inflight.current > 0) return
            const hasUnread = result.comment.some((comment: CommentView) => comment.unreadMention)
            // Having the panel open counts as reading, so the "Mentioned you" labels go away at once.
            setData(
                hasUnread
                    ? { ...result, comment: result.comment.map((c: CommentView) => (c.unreadMention ? { ...c, unreadMention: false } : c)) }
                    : result
            )
            if (hasUnread) {
                markCommentsRead(workspaceId).catch(() => { })
                announceCommentsRead(workspaceId)
            }
        } catch (error) {
            toast.error(errorMessage(error, "Couldn't load comment"))
        }
    }, [workspaceId])

    // Runs a server change; once none are left in flight, the list is re-read quietly in the background.
    const track = async <T,>(work: () => Promise<T>) => {
        inflight.current += 1
        try {
            return await work()
        } finally {
            inflight.current -= 1
            if (inflight.current === 0) void refresh()
        }
    }

    const patchLocal = (id: string, patch: Partial<CommentView>) =>
        setData((current) =>
            current && { ...current, comment: current.comment.map((c: CommentView) => (c.id === id ? { ...c, ...patch } : c)) }
        )

    const dropLocal = (id: string) =>
        setData((current) => current && { ...current, comment: current.comment.filter((c: CommentView) => c.id !== id) })

    const clearDraft = (id: string) =>
        setDrafts((current) => {
            if (!(id in current)) return current
            const rest = { ...current }
            delete rest[id]
            return rest
        })

    const makeTemp = (body: string, parentId: string | null, pinned: Anchor | null) =>
        buildTemptComment({ meId: data?.meId, meName: data?.meName, body, parentId, pinned })

    const addLocal = (temp: CommentView) =>
        setData((current) => {
            if (!current) return current
            // A reply reopens its thread on the server, so do the same here.
            const comments = temp.parentId
                ? current.comment.map((c: CommentView) => (c.id === temp.parentId ? { ...c, resolvedAt: null } : c))
                : current.comment
            return { ...current, comment: [...comments, temp] }
        })

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
        // Clear the badges right away; the server catches up in the background.
        setSummary((current) => (current ? { ...current, unreadMention: 0 } : current))
        announceCommentsRead(workspaceId)
        void refresh()
        markCommentsRead(workspaceId).catch(() => {
            getCommentSummary(workspaceId).then(setSummary).catch(() => { })
        })
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
        const pinned = anchor
        const temp = makeTemp(body, null, pinned)
        addLocal(temp)
        setAnchor(null)
        setFilter("open")
        requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }))
        try {
            const created = await track(() =>
                postComment(workspaceId, body, pinned ? { anchor: { type: pinned.type, id: pinned.id } } : undefined)
            )
            patchLocal(temp.id, { id: created.id, canEdit: true, canDelete: true })
        } catch (error) {
            dropLocal(temp.id)
            setAnchor(pinned)
            toast.error(errorMessage(error, "Couldn't post comment"))
            throw error
        }
    }

    const submitReply = (parentId: string) => async (body: string) => {
        const temp = makeTemp(body, parentId, null)
        addLocal(temp)
        setReplyingTo(null)
        try {
            const created = await track(() => postComment(workspaceId, body, { parentId }))
            patchLocal(temp.id, { id: created.id, canEdit: true, canDelete: true })
        } catch (error) {
            dropLocal(temp.id)
            setDrafts((current) => ({ ...current, [parentId]: body }))
            setReplyingTo(parentId)
            toast.error(errorMessage(error, "Couldn't post reply"))
            throw error
        }
    }

    const submitEdit = (commentId: string) => async (body: string) => {
        const previous = data?.comment.find((c: CommentView) => c.id === commentId)
        patchLocal(commentId, { body, editedAt: new Date() })
        setEditingId(null)
        try {
            await track(() => editComment(workspaceId, commentId, body))
        } catch (error) {
            if (previous) patchLocal(commentId, { body: previous.body, editedAt: previous.editedAt })
            setDrafts((current) => ({ ...current, [commentId]: body }))
            setEditingId(commentId)
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
        // Gone from the screen at once (a thread takes its replies with it); put back if it fails.
        const snapshot = data
        setData((current) =>
            current && { ...current, comment: current.comment.filter((c: CommentView) => c.id !== comment.id && c.parentId !== comment.id) }
        )
        try {
            await track(() => removeComment(workspaceId, comment.id))
        } catch (error) {
            setData(snapshot)
            toast.error(errorMessage(error, "Couldn't delete comment"))
        }
    }

    const toggleResolved = async (root: CommentView) => {
        const wasResolvedAt = root.resolvedAt
        patchLocal(root.id, { resolvedAt: wasResolvedAt ? null : new Date() })
        try {
            await track(() => resolveComment(workspaceId, root.id, !wasResolvedAt))
        } catch (error) {
            patchLocal(root.id, { resolvedAt: wasResolvedAt })
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
        const isPending = String(comment.id).startsWith("pending-")

        return (
            <div key={comment.id} className="space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 text-xs">
                    <span className="font-medium">{comment.author.name}</span>
                    <span className="text-muted-foreground">
                        {isPending ? "Sending…" : formatDistanceToNow(comment.createdAt, { addSuffix: true })}
                        {comment.editedAt && !isPending ? " · edited" : ""}
                    </span>
                    {comment.unreadMention && <Badge className="h-4 px-1.5 text-[10px]">Mentioned you</Badge>}
                </div>

                {isEditing ? (
                    <CommentComposer
                        members={members}
                        initialBody={drafts[comment.id as string] ?? comment.body}
                        placeholder="Edit comment"
                        submitLabel="Save"
                        autoFocus
                        onSubmit={submitEdit(comment.id)}
                        onCancel={() => {
                            clearDraft(comment.id as string)
                            setEditingId(null)
                        }}
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

                {!isEditing && !isPending && (
                    <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                        {isRoot && (
                            <button type="button" className="hover:text-foreground" onClick={() => {
                                clearDraft(comment.id as string)
                                setReplyingTo(comment.id as string)
                            }}>
                                Reply
                            </button>
                        )}
                        {isRoot && (
                            <button type="button" className="hover:text-foreground" onClick={() => toggleResolved(comment)}>
                                {comment.resolvedAt ? "Reopen" : "Resolve"}
                            </button>
                        )}
                        {comment.canEdit && (
                            <button type="button" className="hover:text-foreground" onClick={() => {
                                clearDraft(comment.id as string)
                                setEditingId(comment.id as string)
                            }}>
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
                                            initialBody={drafts[root.id as string] ?? ""}
                                            placeholder="Reply"
                                            submitLabel="Reply"
                                            autoFocus
                                            onSubmit={submitReply(root.id)}
                                            onCancel={() => {
                                                clearDraft(root.id as string)
                                                setReplyingTo(null)
                                            }}
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
