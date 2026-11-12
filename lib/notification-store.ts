import { toPlainText } from "@/lib/comment-body";
import type { PrismaClient } from "@/lib/generated/prisma/client";

export type NotificationType = "COMMENT_REPLY" | "THREAD_RESOLVED" | "ROLE_CHANGED" | "WORKSPACE_TRASHED"

export type NotificationData = Record<string, string | number | boolean | null>

function personaLabel(person: { name: string | null; email: string } | null) {
    return person ? person.name?.trim() || person.email.split("@")[0] : "Someone"
}

export function describeNotification(type: string, data: NotificationData | null, actorName: string) {
    const d = data ?? {}
    switch (type) {
        case "COMMENT_REPLY":
            return `${actorName} replied to your comment`
        case "THREAD_RESOLVED":
            return `${actorName} resolved your comment thread`
        case "ROLE_CHANGED":
            return d.role === "EDITOR"
                ? `${actorName} gave you edit access`
                : d.role === "VIEWER"
                    ? `${actorName} changed your access to view only`
                    : `${actorName} reset your access to the workspace default`
        case "WORKSPACE_TRASHED":
            return `${actorName} moved your workspace to the trash`
        default:
            return `${actorName} did something that involves you`
    }
}


export async function notify(
    db: PrismaClient,
    input: { userId: string; workspaceId: string; actorId: string | null; type: NotificationType; data?: NotificationData }
) {
    if (input.actorId && input.userId === input.actorId) return false
    try {
        await db.notification.create({
            data: {
                userId: input.userId,
                workspaceId: input.workspaceId,
                actorId: input.actorId,
                type: input.type,
                ...(input.data && { data: input.data }),
            }
        })
        return true
    } catch (error) {
        console.error("[notification] couldn't create", input.type, error)
        return false
    }
}

export type NotificationItem = {
    // "n:<id>" untuk tabel Notification, "m:<commentId>" untuk mention.
    key: string
    source: "notification" | "mention"
    type: NotificationType | "MENTION"
    id: string
    workspaceId: string
    workspaceName: string
    text: string
    // Cuplikan teks komentar, hanya untuk mention.
    snippet: string | null
    href: string
    createdAt: Date
    unread: boolean
}

const SNIPPET_LENGTH = 90

export async function listNotifications(db: PrismaClient, input: { userId: string; limit: number }): Promise<NotificationItem[]> {
    const person = { select: { name: true, email: true } } as const
    const [notifications, mentions] = await Promise.all([
        db.notification.findMany({
            where: { userId: input.userId },
            orderBy: { createdAt: "desc" },
            take: input.limit,
            select: {
                id: true,
                type: true,
                data: true,
                readAt: true,
                createdAt: true,
                workspaceId: true,
                workspace: { select: { name: true } },
                actor: person,
            },
        }),
        db.commentMention.findMany({
            where: { userId: input.userId },
            orderBy: { comment: { createdAt: "desc" } },
            take: input.limit,
            select: {
                readAt: true,
                comment: {
                    select: {
                        id: true,
                        body: true,
                        createdAt: true,
                        workspaceId: true,
                        workspace: { select: { name: true } },
                        author: person,
                    }
                }
            }
        })
    ])


    const items: NotificationItem[] = [
        ...notifications.map((n) => ({
            key: `n:${n.id}`,
            source: "notification" as const,
            type: n.type as NotificationType,
            id: n.id,
            workspaceId: n.workspaceId,
            workspaceName: n.workspace.name,
            text: describeNotification(n.type, n.data as NotificationData | null, personaLabel(n.actor)),
            snippet: null,
            // Yang di sampah dibuka lewat halaman sampah, karena halaman workspace-nya sudah tidak bisa dibuka.
            href: n.type === "WORKSPACE_TRASHED" ? "/workspaces/trash" : `/workspace/${n.workspaceId}`,
            createdAt: n.createdAt,
            unread: n.readAt === null,
        })),
        ...mentions.map((m) => ({
            key: `m:${m.comment.id}`,
            source: "mention" as const,
            type: "MENTION" as const,
            id: m.comment.id,
            workspaceId: m.comment.workspaceId,
            workspaceName: m.comment.workspace.name,
            text: `${personaLabel(m.comment.author)} mentioned you`,
            snippet: toPlainText(m.comment.body).slice(0, SNIPPET_LENGTH),
            href: `/workspace/${m.comment.workspaceId}`,
            createdAt: m.comment.createdAt,
            unread: m.readAt === null,
        }))
    ]

    return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, input.limit)
}


export async function markNotificationsRead(
    db: PrismaClient,
    input: { userId: string; items?: { source: "notification" | "mention"; id: string }[] }
) {
    const now = new Date()
    const only = input.items
    const notificationIds = only?.filter((i) => i.source === "notification").map((i) => i.id)
    const commentIds = only?.filter((i) => i.source === "mention").map((i) => i.id)

    await Promise.all([
        !only || notificationIds!.length > 0
            ? db.notification.updateMany({
                where: { userId: input.userId, readAt: null, ...(only && { id: { in: notificationIds } }) },
                data: { readAt: now }
            }) : null,
        !only || commentIds!.length > 0
            ? db.commentMention.updateMany({
                where: { userId: input.userId, readAt: null, ...(only && { commentId: { in: commentIds } }) },
                data: { readAt: now },
            })
            : null
    ])
}

export async function markCommentNotificationsRead(db: PrismaClient, input: { userId: string; workspaceId: string }) {
    await db.notification.updateMany({
        where: {
            userId: input.userId,
            workspaceId: input.workspaceId,
            readAt: null,
            type: { in: ["COMMENT_REPLY", "THREAD_RESOLVED"] }
        },
        data: { readAt: new Date() }
    })
}

