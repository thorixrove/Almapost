import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { WorkspaceRole } from "@/lib/generated/prisma/enums";


export type WorkspaceAccessLevel = "OWNER" | "EDITOR" | "VIEWER"


export function resolveWorkspaceRole(input: {
    isCreator: boolean
    isOrgAdmin: boolean
    override: WorkspaceRole | null
    memberRole: WorkspaceRole
}): WorkspaceAccessLevel {
    if (input.isCreator || input.isOrgAdmin) return "OWNER"
    return input.override ?? input.memberRole
}

export function canEditRole(role: WorkspaceAccessLevel | null) {
    return role === "OWNER" || role === "EDITOR"
}

export async function loadRoleInputs(db: PrismaClient, workspaceId: string, clerkUserId: string) {
    const workspace = await db.workspace.findUnique({
        where: { id: workspaceId },
        select: {
            clerkOrgId: true,
            deletedAt: true,
            memberRole: true,
            creator: { select: { clerkId: true } },
            access: { where: { user: { clerkId: clerkUserId } }, select: { role: true } },
        },
    })
    if (!workspace) return null

    return {
        clerkOrgId: workspace.clerkOrgId,
        deletedAt: workspace.deletedAt,
        memberRole: workspace.memberRole,
        creatorClerkId: workspace.creator.clerkId,
        override: workspace.access[0]?.role ?? null,
    }
}


export async function setMemberAccess(
    db: PrismaClient,
    input: { workspaceId: string; userId: string; role: WorkspaceRole | null }
) {
    if (input.role === null) {
        await db.workspaceAccess.deleteMany({ where: { workspaceId: input.workspaceId, userId: input.userId } })
        return
    }
    await db.workspaceAccess.upsert({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
        create: { workspaceId: input.workspaceId, userId: input.userId, role: input.role },
        update: { role: input.role },
    })
}

export async function setDefaultMemberRole(db: PrismaClient, input: { workspaceId: string; role: WorkspaceRole }) {
    await db.workspace.update({ where: { id: input.workspaceId }, data: { memberRole: input.role } })
}

export async function listAccessOverrides(db: PrismaClient, workspaceId: string) {
    const rows = await db.workspaceAccess.findMany({
        where: { workspaceId }, select: { userId: true, role: true }
    })
    return new Map(rows.map((row) => [row.userId, row.role]))
}
