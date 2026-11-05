"use client";

import {
    getCommentSummary,
    loadComments
} from "@/actions/comment";
import { useWorkspaceEditors } from "@/components/WorkspaceEditorsContext";
import { refresh } from "next/cache";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
}


useEffect(() => {
    if (!open) return
    const interval = setInterval(() => {
        if (document.visibilityState === "visible") void refresh()
    }, REFRESH_MS)
    return () => clearInterval(interval)
}, [open, refresh])

