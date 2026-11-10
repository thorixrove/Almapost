import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { logActivity, type ActivityData, type ActivityType } from "@/lib/activity";

export async function getActorId() {
    const { userId } = await auth()
    if (!userId) return null

    const user = await prisma.user.findUnique({ where: { clerkId: userId }, select: { id: true } })
    return user?.id ?? null
}


export async function recordActivity(
    workspaceId: string,
    type: ActivityType,
    data?: ActivityData,
    actorId?: string | null
) {
    return logActivity(prisma, {
        workspaceId,
        actorId: actorId === undefined ? await getActorId() : actorId,
        type,
        data
    })
}