"use server";

import { revalidatePath } from "next/cache";
import { checkUser } from "@/actions/check-user";
import { requireEditAccess , canDeleteWorkspace } from "@/lib/workspace-access";
import { scopeWhere } from "@/lib/workspace-scope";
import { prisma } from "@/lib/prisma";
import { getEntitlements, workspaceOwnerId, workspaceOwnerSelect } from "@/lib/billing";
import { FREE_WORKSPACE_LIMIT, type LimitError } from "@/lib/plan-limits";
import { recordActivity } from "@/lib/actor";

function revalidateTrashViews() {
    revalidatePath("/dashboard")
    revalidatePath("/workspaces")
    revalidatePath("/workspaces/trash")
}



export async function restoreWorkspace(
    workspaceId: string
): Promise<{ restored: true } | { limit: LimitError }> {
    const user = await checkUser()
    if (!user) throw new Error("Not signed in")
    await requireEditAccess(workspaceId, { includeTrashed: true})

    const workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { ...workspaceOwnerSelect, creatorId: true, status: true, deletedAt: true },
    })

    if (!workspace.deletedAt) return { restored: true }

    const scope = scopeWhere(workspace.clerkOrgId, workspace.creatorId)
    const { unlimitedWorkspaces } = await getEntitlements(workspaceOwnerId(workspace))
    if (!unlimitedWorkspaces && (await prisma.workspace.count({ where: scope })) >= FREE_WORKSPACE_LIMIT) {
        return { limit: "workspaces" }
    }

    const top = await prisma.workspace.findFirst({
        where: { status: workspace.status, ...scope },
        orderBy: { position: "asc" },
        select: { position: true }
    })

    await prisma.workspace.update({
        where: { id: workspaceId },
        data: { deletedAt: null, position: top ? top.position - 1 : 0 }
    })

    await recordActivity(workspaceId, "WORKSPACE_RESTORED", undefined, user.id)

    revalidateTrashViews()
    return { restored: true }
}

export async function purgeWorkspace(workspaceId: string) {
    if (!(await canDeleteWorkspace(workspaceId))) {
        throw new Error("Only the creator or an org admin can delete this workspace")
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { deletedAt: true } })
    if (!workspace?.deletedAt) throw new Error("Only workspaces in the trash can be deleted permanently")

    await prisma.workspace.delete({ where: { id: workspaceId } })
    revalidateTrashViews()
}