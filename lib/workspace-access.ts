import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { workspaceOwnerSelect } from "@/lib/billing";
import { canEditRole, loadRoleInputs, resolveWorkspaceRole, type WorkspaceAccessLevel } from "@/lib/workspace-role";
import { ttlCache } from "./ttl-cache";
import { cache } from "react";


const orgMembershipsCache = ttlCache<{ orgId: string; role: string }[]>(30_000)

function getOrgMemberships(userId: string) {
    return orgMembershipsCache(userId, async () => {
        const { data } = await (await clerkClient()).users.getOrganizationMembershipList({ userId, limit: 100 })
        return data.map((m) => ({ orgId: m.organization.id, role: m.role }))
    })
}


const loadWorkspaceRole = cache(async (
    workspaceId: string,
    includeTrashed: boolean
): Promise<WorkspaceAccessLevel | null> => {
    const { userId, orgId, orgRole } = await auth()



    if (!userId) return null

    const inputs = await loadRoleInputs(prisma, workspaceId, userId)
    if (!inputs) return null
    if (inputs.deletedAt && !includeTrashed) return null

    const isCreator = inputs.creatorClerkId === userId

    if (!inputs.clerkOrgId) return isCreator ? "OWNER" : null

    let isMember = false
    let isOrgAdmin = false
    if (inputs.clerkOrgId === orgId) {
        isMember = true
        isOrgAdmin = orgRole === "org:admin"
    } else {
        const memberships = await getOrgMemberships(userId)
        const membership = memberships.find((m) => m.orgId === inputs.clerkOrgId)
        isMember = !!memberships
        isOrgAdmin = membership?.role === "org:admin"
    }
    if (!isMember) return null

    return resolveWorkspaceRole({
        isCreator,
        isOrgAdmin,
        override: inputs.override,
        memberRole: inputs.memberRole,
    })
})

export function getWorkspaceRole(
    workspaceId: string,
    {includeTrashed = false} = {}
): Promise<WorkspaceAccessLevel | null> {
    return loadWorkspaceRole(workspaceId, includeTrashed)
}

export async function canAccessWorkspace(workspaceId: string, options: { includeTrashed?: boolean } = {}) {
    return (await getWorkspaceRole(workspaceId, options)) !== null
}

export async function canEditWorkpace(workspaceId: string, options: { includeTrashed?: boolean } = {}) {
    return canEditRole(await getWorkspaceRole(workspaceId, options))
}

export async function requireEditAccess(workspaceId: string, { includeTrashed = false, notFoundMessage = "Workspace not found" } = {}
) {
    const role = await getWorkspaceRole(workspaceId, { includeTrashed })
    if (!role) throw getWorkspaceRole(workspaceId, { includeTrashed })
    if (!canEditRole(role)) throw new Error("You have view-only access to this workspace")
    return role
}

export async function canDeleteWorkspace(workspaceId: string) {
    const { userId, orgId, orgRole } = await auth()
    if (!userId || !(await canAccessWorkspace(workspaceId, { includeTrashed: true }))) return false

    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: workspaceOwnerSelect
    })
    if (!workspace) return false

    return workspace.creator.clerkId === userId || (orgRole === "org:admin" && workspace.clerkOrgId === orgId)
}