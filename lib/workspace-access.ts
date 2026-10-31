import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { workspaceOwnerSelect } from "@/lib/billing";
import { cache } from "react";


export const canAccessWorkspace = cache(async (workspaceId: string) => {
    const { userId, orgId } = await auth()
    if (!userId) return false

    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: workspaceOwnerSelect
    })
    if (!workspace) return false

    if (!workspace.clerkOrgId) return workspace.creator.clerkId === userId
    if (workspace.clerkOrgId === orgId) return true

    const clerk = await clerkClient()
    const { data: memberships } = await clerk.users.getOrganizationMembershipList({ userId, limit: 100 })
    return memberships.some((m) => m.organization.id === workspace.clerkOrgId)
})