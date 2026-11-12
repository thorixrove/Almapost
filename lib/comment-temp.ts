import type { CommentView } from "@/actions/comment";

// What the comment box remembers about a pinned block or shape (the label is only for display).
export type PanelAnchor = { type: "BLOCK" | "SHAPE"; id: string; label: string };

// A comment shown before the server has confirmed it. Its id starts with "pending-".
let tempCounter = 0;

export function buildTempComment(input: {
    meId?: string;
    meName?: string;
    body: string;
    parentId: string | null;
    pinned: PanelAnchor | null;
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

export const isPendingComment = (id: unknown) => String(id).startsWith("pending-")