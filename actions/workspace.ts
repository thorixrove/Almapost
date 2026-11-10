"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { checkUser } from "@/actions/check-user";
import { canAccessWorkspace, canDeleteWorkspace, requireEditAccess } from "@/lib/workspace-access";
import { scopeWhere } from "@/lib/workspace-scope";
import { prisma } from "@/lib/prisma";
import { WorkspaceStatus } from "@/lib/generated/prisma/enums";
import { getEntitlements, getWorkspaceOwnerId } from "@/lib/billing";
import { FREE_WORKSPACE_LIMIT, type LimitError } from "@/lib/plan-limits";
import { getActorId, recordActivity } from "@/lib/actor";
import { notify } from "@/lib/notification-store";

function revalidateWorkspaceLists() {
    revalidatePath("/dashboard");
    revalidatePath("/workspaces");
}

export async function createWorkspace(
    name: string,
    description?: string
): Promise<{ workspace: { id: string } } | { limit: LimitError }> {
    const user = await checkUser()
    if (!user) throw new Error("Not signed in")

    const trimmedName = name.trim()
    if (!trimmedName) throw new Error("Workspace name is required")

    const { orgId } = await auth()
    const scope = scopeWhere(orgId, user.id)

    const { unlimitedWorkspaces } = await getEntitlements(orgId ?? user.clerkId)
    if (!unlimitedWorkspaces && (await
        prisma.workspace.count({ where: scope })) >= FREE_WORKSPACE_LIMIT) {
        return { limit: "workspaces" }
    }

    const top = await prisma.workspace.findFirst({
        where: { status: "PLANNING", ...scope },
        orderBy: { position: "asc" },
        select: { position: true }
    })

    const workspace = await prisma.workspace.create({
        data: {
            name: trimmedName,
            description: description?.trim() || null,
            creatorId: user.id,
            clerkOrgId: orgId ?? null,
            position: top ? top.position - 1 : 0,
            doc: { create: {} },
            canvas: { create: {} }
        },
    })

    await recordActivity(workspace.id, "WORKSPACE_CREATED", undefined, user.id)
    revalidateWorkspaceLists()
    return { workspace: { id: workspace.id } }
}


export async function updateWorkspace(workspaceId: string, name: string, description?: string) {
    await requireEditAccess(workspaceId)

    const trimmedName = name.trim()
    if (!trimmedName) throw new Error("Workspace name is required")

    const before = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } })
    const workspace = await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
            name: trimmedName,
            ...(description !== undefined && { description: description.trim() || null })
        },
    })

    if (before && before.name !== trimmedName) {
        await recordActivity(workspaceId, "WORKSPACE_RENAMED", { from: before.name, to: trimmedName })
    }

    revalidateWorkspaceLists()
    revalidatePath(`/workspace/${workspaceId}`)
    return workspace
}

// Memindahkan workspace ke tempat sampah (bisa dipulihkan 30 hari). Penghapusan permanen ada di actions/trash.ts.
export async function deleteWorkspace(workspaceId: string) {
    if (!(await canAccessWorkspace(workspaceId))) throw new Error("Workspace not found")
    if (!(await canDeleteWorkspace(workspaceId))) {
        throw new Error("Only the creator or an org admin can delete this workspace");
    }

    const workspace = await prisma.workspace.update({
        where: { id: workspaceId },
        data: { deletedAt: new Date() },
        select: { creatorId: true }
    })

    const actorId = await getActorId()

    await recordActivity(workspaceId, "WORKSPACE_TRASHED", undefined, actorId)
    await notify(prisma, { userId: workspace.creatorId, workspaceId, actorId, type: 'WORKSPACE_TRASHED' })
    revalidateWorkspaceLists()
    revalidatePath("/workspaces/trash")
}


export async function moveWorkspace(workspaceId: string, status: WorkspaceStatus, position: number) {
    if (!Object.values(WorkspaceStatus).includes(status) || !Number.isFinite(position)) {
        throw new Error("Invalid move")
    }

    await requireEditAccess(workspaceId, { notFoundMessage: "Invalid move" })

    const before = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { status: true } })

    await prisma.workspace.update({
        where: { id: workspaceId },
        data: { status, position }
    })

    if (before && before.status !== status) {
        await recordActivity(workspaceId, "STATUS_CHANGED", { from: before.status, to: status })
    }
}


export async function setWorkspaceSharing(
    workspaceId: string,
    enabled: boolean
): Promise<{ shareToken: string | null } | { limit: LimitError }> {
    await requireEditAccess(workspaceId)

    if (enabled && !(await getEntitlements(await getWorkspaceOwnerId(workspaceId))).publicSharing) {
        return { limit: "sharing" }
    }

    const { shareToken } = await prisma.workspace.update({
        where: { id: workspaceId },
        data: { shareToken: enabled ? randomBytes(24).toString("base64url") : null },
        select: { shareToken: true }
    })

    await recordActivity(workspaceId, enabled ? "SHARING_ENABLED" : "SHARING_DISABLED")

    revalidatePath(`/workspace/${workspaceId}`);
    return { shareToken };
}