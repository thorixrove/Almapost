import { extractMentionIds, sanitizeMentions } from "@/lib/comment-body";
import type { PrismaClient } from "@/lib/generated/prisma/client";

type CommentStorePrismaClient = PrismaClient & {
    comment: any
    commentMention: any
}

function asCommentStorePrismaClient(db: PrismaClient): CommentStorePrismaClient {
    return db as CommentStorePrismaClient
}

export const MAX_STORED_BODY_LENGTH = 4000
export const MAX_COMMENTS_LOADED = 500
const MAX_ANCHOR_ID_LENGTH = 200

export type Anchor = { type: "BLOCK" | "SHAPE"; id: string }

export function userLabel(user: { name: string | null; email: string }) {
    return user.name?.trim() || user.email.split("@")[0]
}

function checkBody(raw: string) {
    const body = raw.trim()
    if (!body) throw new Error("comment can't be empty")
    if (body.length > MAX_STORED_BODY_LENGTH) throw new Error("Comment is to long")
    return body
}

export async function createComment(
    db: PrismaClient,
    input: {
        workspaceId: string
        authorId: string
        body: string
        parentId?: string | null
        anchor?: Anchor | null
        mentionableIds: ReadonlySet<string>
    }
) {
    const prisma = asCommentStorePrismaClient(db)
    const body = sanitizeMentions(checkBody(input.body), input.mentionableIds)
    const mentionIds = extractMentionIds(body)

    if (input.parentId) {
        const parent = await prisma.comment.findFirst({
            where: { id: input.parentId, workspaceId: input.workspaceId, parentId: null },
            select: { id: true },
        })
        if (!parent) throw new Error("Thread not found")
    }
    const anchor = input.parentId ? null : input.anchor ?? null
    if (anchor && (!anchor.id || anchor.id.length > MAX_ANCHOR_ID_LENGTH || !["BLOCK", "SHAPE"].includes(anchor.type))) {
        throw new Error("Invalid anchor")
    }

    const [comment] = await db.$transaction([
        prisma.comment.create({
            data: {
                workspaceId: input.workspaceId,
                authorId: input.authorId,
                parentId: input.parentId ?? null,
                body,
                anchorType: anchor?.type ?? null,
                anchorId: anchor?.id ?? null,
                mentions: { create: mentionIds.map((userId) => ({ userId })) },
            },
            select: { id: true },
        }),
        ...(input.parentId
            ? [prisma.comment.update({ where: { id: input.parentId }, data: { resolvedAt: null, resolvedById: null } })]
            : [])
    ])
    return comment
}

export async function updateComment(
    db: PrismaClient,
    input: { commentId: string; workspaceId: string; authorId: string; body: string; mentionableIds: ReadonlySet<string> }
) {
    const prisma = asCommentStorePrismaClient(db)
    const existing = await prisma.comment.findFirst({
        where: { id: input.commentId, workspaceId: input.workspaceId, authorId: input.authorId },
        select: { id: true }
    })
    if (!existing) throw new Error("Comment not found")

    const body = sanitizeMentions(checkBody(input.body), input.mentionableIds)
    const mentionIds = extractMentionIds(body)

    await db.$transaction([
        prisma.comment.update({ where: { id: input.commentId }, data: { body, editedAt: new Date() } }),
        prisma.commentMention.deleteMany({ where: { commentId: input.commentId, userId: { notIn: mentionIds } } }),
        prisma.commentMention.createMany({
            data: mentionIds.map((userId) => ({ commentId: input.commentId, userId })),
            skipDuplicates: true,
        }),
    ])
}


export async function setThreadResolved(
    db: PrismaClient,
    input: { commentId: string; workspaceId: string; userId: string; resolved: boolean }
) {
    const prisma = asCommentStorePrismaClient(db)
    const result = await prisma.comment.updateMany({
        where: { id: input.commentId, workspaceId: input.workspaceId, parentId: null },
        data: input.resolved
            ? { resolvedAt: new Date(), resolvedById: input.userId }
            : { resolvedAt: null, resolvedById: null },
    })
    if (result.count === 0) throw new Error("Thread not found")
}

export async function deleteComment(db: PrismaClient, input: { commentId: string; workspaceId: string }) {
    const prisma = asCommentStorePrismaClient(db)
    await prisma.comment.deleteMany({ where: { id: input.commentId, workspaceId: input.workspaceId } })
}


export async function listComments(db: PrismaClient, input: { workspaceId: string; viewerId: string }) {
    const prisma = asCommentStorePrismaClient(db)
    const rows = await prisma.comment.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { createdAt: "asc" },
        take: MAX_COMMENTS_LOADED,
        select: {
            id: true,
            parentId: true,
            body: true,
            anchorType: true,
            anchorId: true,
            resolvedAt: true,
            createdAt: true,
            editedAt: true,
            authorId: true,
            author: { select: { id: true, name: true, email: true, imageUrl: true } },
            mentions: { where: { userId: input.viewerId, readAt: null }, select: { userId: true } },
        },
    })
    return rows.map(({ mentions, author, ...row }: {
        mentions: { userId: string }[]
        author: { id: string; name: string | null; email: string; imageUrl: string | null }
        [key: string]: unknown
    }) => ({
        ...row,
        author: { id: author.id, name: userLabel(author), imageUrl: author.imageUrl },
        unreadMention: mentions.length > 0,
    }))
}

export async function markWorkspaceMentionsRead(db: PrismaClient, input: { userId: string; workspaceId: string }) {
    const prisma = asCommentStorePrismaClient(db)
    await prisma.commentMention.updateMany({
        where: { userId: input.userId, readAt: null, comment: { workspaceId: input.workspaceId } },
        data: { readAt: new Date() },
    })
}

export async function commentSummary(db: PrismaClient, input: { workspaceId: string; userId: string }) {
    const prisma = asCommentStorePrismaClient(db)
    const [openThreads, unreadMention] = await Promise.all([
        prisma.comment.count({ where: { workspaceId: input.workspaceId, parentId: null, resolvedAt: null } }),
        prisma.commentMention.count({
            where: { userId: input.userId, readAt: null, comment: { workspaceId: input.workspaceId } },
        }),
    ])
    return { openThreads, unreadMention }
}

export async function unreadMentionForUser(db: PrismaClient, input: { userId: string; limit: number }) {
    const prisma = asCommentStorePrismaClient(db)
    const rows = await prisma.commentMention.findMany({
        where: { userId: input.userId, readAt: null },
        orderBy: { comment: { createdAt: "desc" } },
        take: input.limit,
        select: {
            comment: {
                select: {
                    id: true,
                    body: true,
                    createdAt: true,
                    workspaceId: true,
                    workspace: { select: { name: true } },
                    author: { select: { name: true, email: true } },
                },
            },
        },
    })
    return rows.map(({ comment }: { comment: {
        id: string
        body: string
        createdAt: Date
        workspaceId: string
        workspace: { name: string }
        author: { name: string | null; email: string }
    } }) => ({
        commentId: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        workspaceId: comment.workspaceId,
        workspaceName: comment.workspace.name,
        authorName: userLabel(comment.author),
    }))
}