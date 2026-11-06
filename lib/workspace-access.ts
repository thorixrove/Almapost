import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { workspaceOwnerSelect } from "@/lib/billing";


export async function canAccessWorkspace(workspaceId: string, { includeTrashed = false} = {}) {
    const { userId, orgId } = await auth()
    if (!userId) return false

    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { ...workspaceOwnerSelect, deletedAt: true}
    })
    if (!workspace) return false


    
    if (workspace.deletedAt && !includeTrashed) return false

    if (!workspace.clerkOrgId) return workspace.creator.clerkId === userId
    if (workspace.clerkOrgId === orgId) return true

    const clerk = await clerkClient()
    const { data: memberships } = await clerk.users.getOrganizationMembershipList({ userId, limit: 100 })
    return memberships.some((m) => m.organization.id === workspace.clerkOrgId)
}

export async function canDeleteWorkspace(workspaceId: string) {
    const {userId, orgId, orgRole} = await auth()
    if (!userId || !(await canAccessWorkspace(workspaceId, { includeTrashed:  true}))) return false

    const workspace = await prisma.workspace.findUnique({
        where: {id: workspaceId},
        select: workspaceOwnerSelect
    })
    if (!workspace) return  false

    return workspace.creator.clerkId === userId || (orgRole === "org:admin" && workspace.clerkOrgId === orgId)
}