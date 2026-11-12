import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { userLabel } from "@/lib/comment-store";
import { ttlCache } from "@/lib/ttl-cache";

const orgMemberClerkIds = ttlCache<string[]>(60_000)

export async function getMentionableMembers(workspace: { clerkOrgId: string | null }, meId: string) {
    if (!workspace.clerkOrgId) return []


    const orgId = workspace.clerkOrgId
    const clerkIds = await orgMemberClerkIds(orgId, async () => {
        const { data: memberships } = await (await clerkClient()).organizations.getOrganizationMembershipList({
            organizationId: orgId,
            limit: 100,
        })
        return memberships.flatMap((m) => (m.publicUserData?.userId ? [m.publicUserData.userId] : []))
    })
    if (clerkIds.length === 0) return []

    const users = await prisma.user.findMany({
        where: { clerkId: { in: clerkIds }, id: { not: meId } },
        select: { id: true, name: true, email: true, imageUrl: true },
        orderBy: { createdAt: "asc" }
    })
    return users.map((user) => ({ id: user.id, name: userLabel(user), imageUrl: user.imageUrl }))
}