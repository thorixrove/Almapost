"use server";

import { canAccessWorkspace } from "@/lib/workspace-access";
import { prisma } from "@/lib/prisma";
import { getActorId } from "@/lib/actor";
import { listNotifications, markNotificationsRead } from "@/lib/notification-store";
import { string } from "zod";

const LIST_LIMIT = 20
const MAX_WORKSPACES = 10

export async function getNotifications() {
    const userId = await getActorId()
    if (!userId) return []

    const items = await listNotifications(prisma, { userId, limit: LIST_LIMIT })
    const workspaceId = [...new Set(items.map((item) => item.workspaceId))].slice(0, MAX_WORKSPACES)
    const accessible = new Set(
        (
            await Promise.all(
                workspaceId.map(async (id) => ((await canAccessWorkspace(id, { includeTrashed: true })) ? id : null))
            )
        ).filter((id): id is string => id !== null)
    )

    return items.filter((item) => accessible.has(item.workspaceId))
}

export type NotificationListItem  = Awaited<ReturnType<typeof getNotifications>>[number]

export async function markNotificationsAsRead(items?: { source: "notification" | "mention"; id: string}[]) {
    const userId = await getActorId()
    if (!userId) return
    await markNotificationsRead(prisma, { userId, items})
}