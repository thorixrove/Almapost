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
import { buildTempComment, type PanelAnchor } from "@/lib/comment-temp";
import { announceCommentsRead } from "@/lib/notification-events";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const REFRESH_MS = 15_000;
const SUMMARY_MS = 2 * 60 * 1000;

type Loaded = Awaited<ReturnType<typeof loadComments>>;
type Summary = Awaited<ReturnType<typeof getCommentSummary>>;

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

// The data side of the comments panel: loading, polling, read state, and every change.
// Changes show on screen at once and are confirmed by the server in the background; if the server
// refuses, the change is undone and a toast says why. Failed post, reply and edit also throw, so the
// box that sent them can bring the text back.
export function useWorkspaceComments(workspaceId: string) {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState<Loaded | null>(null);
    const [summary, setSummary] = useState<Summary | null>(null);
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

    const closePanel = () => setOpen(false)

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

    const makeTemp = (body: string, parentId: string | null, pinned: PanelAnchor | null) =>
        buildTempComment({ meId: data?.meId, meName: data?.meName, body, parentId, pinned })

    const postThread = async (body: string, pinned: PanelAnchor | null) => {
        const temp = makeTemp(body, null, pinned)
        addLocal(temp)
        try {
            const created = await track(() =>
                postComment(workspaceId, body, pinned ? { anchor: { type: pinned.type, id: pinned.id } } : undefined)
            )
            patchLocal(temp.id, { id: created.id, canEdit: true, canDelete: true })
        } catch (error) {
            dropLocal(temp.id)
            toast.error(errorMessage(error, "Couldn't post comment"))
            throw error
        }
    }

    const postReply = async (parentId: string, body: string) => {
        const temp = makeTemp(body, parentId, null)
        addLocal(temp)
        try {
            const created = await track(() => postComment(workspaceId, body, { parentId }))
            patchLocal(temp.id, { id: created.id, canEdit: true, canDelete: true })
        } catch (error) {
            dropLocal(temp.id)
            toast.error(errorMessage(error, "Couldn't post reply"))
            throw error
        }
    }

    const saveEdit = async (commentId: string, body: string) => {
        const previous = data?.comment.find((c: CommentView) => c.id === commentId)
        patchLocal(commentId, { body, editedAt: new Date() })
        try {
            await track(() => editComment(workspaceId, commentId, body))
        } catch (error) {
            if (previous) patchLocal(commentId, { body: previous.body, editedAt: previous.editedAt })
            toast.error(errorMessage(error, "Couldn't save changes"))
            throw error
        }
    }

    // Gone from the screen at once (a thread takes its replies with it); put back if it fails.
    const deleteComment = async (comment: CommentView) => {
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

    return {
        open,
        openPanel,
        closePanel,
        data,
        members: data?.members ?? [],
        meId: data?.meId,
        summary,
        threads,
        actions: { postThread, postReply, saveEdit, deleteComment, toggleResolved },
    }
}

export type CommentActions = ReturnType<typeof useWorkspaceComments>["actions"];