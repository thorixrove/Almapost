"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { getWorkspaceRole } from "@/lib/workspace-access";
import { prisma } from "@/lib/prisma";
import { WorkspaceRole } from "@/lib/generated/prisma/enums";
import { listAccessOverrides, setDefaultMemberRole, setMemberAccess } from "@/lib/workspace-role";
import { getActorId, recordActivity } from "@/lib/actor";
import { notify } from "@/lib/notification-store";

async function requireOwner(workspaceId: string) {
    const role = await getWorkspaceRole(workspaceId)
    if (!role) throw new Error("Workspace not found")
    if (role !== "OWNER") throw new Error("Only the creator or an org admin can cahnges access")

    const workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { clerkOrgId: true, memberRole: true, creator: { select: { id: true } } },
    })
    if (!workspace.clerkOrgId) throw new Error("Roles apply to organizations workspace only")

    return { clerkOrgId: workspace.clerkOrgId, memberRole: workspace.memberRole, creatorId: workspace.creator.id }
}

const MEMBERS_LIMIT = 100

async function orgMemberships(clerkOrgId: string) {
    const { data } = await (await clerkClient()).organizations.getOrganizationMembershipList({
        organizationId: clerkOrgId,
        limit: MEMBERS_LIMIT
    })
    return data.flatMap((membership) =>
        membership.publicUserData?.userId
            ? [{ clerkId: membership.publicUserData.userId, isAdmin: membership.role === "org:admin" }]
            : []
    )
}

function parseRole(role: unknown) {
    if (!Object.values(WorkspaceRole).includes(role as WorkspaceRole)) throw new Error("Invalid role")
    return role as WorkspaceRole
}

export async function getAccessSettings(workspaceId: string) {
    const workspace = await requireOwner(workspaceId)

    const [membership, overrides] = await Promise.all([
        orgMemberships(workspace.clerkOrgId),
        listAccessOverrides(prisma, workspaceId),
    ])
    const adminClerkIds = new Set(membership.filter((m) => m.isAdmin).map((m) => m.clerkId))

    const users = await prisma.user.findMany({
        where: { clerkId: { in: membership.map((m) => m.clerkId) } },
        select: { id: true, clerkId: true, name: true, email: true },
    })

    const members = users
        .map((user) => {
            const isOwner = user.id === workspace.creatorId || adminClerkIds.has(user.clerkId)
            const override = overrides.get(user.id) ?? null
            return {
                userId: user.id,
                name: user.name?.trim() || user.email.split("@")[0],
                isOwner,
                override: isOwner ? null : override,
            }
        })
        .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name))

    return { memberRole: workspace.memberRole, members, truncated: membership.length >= MEMBERS_LIMIT }
}

export type AccessSettings = Awaited<ReturnType<typeof getAccessSettings>>

export async function changeDefaultRole(workspaceId: string, role: WorkspaceRole) {
    await requireOwner(workspaceId)
    const parsedRole = parseRole(role)
    await setDefaultMemberRole(prisma, { workspaceId, role: parsedRole })

    // Perubahan bawaan mengenai semua anggota, jadi hanya dicatat dan tidak mengirim notifikasi satu per satu.
    await recordActivity(workspaceId, "ACCESS_CHANGED", { scope: "default", role: parsedRole })
}

export async function changeMemberAccess(workspaceId: string, userId: string, role: WorkspaceRole | null) {
    const workspace = await requireOwner(workspaceId)
    const parsedRole = role === null ? null : parseRole(role)

    const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, clerkId: true, name: true, email: true },
    })
    const membership = target && target && (await orgMemberships(workspace.clerkOrgId)).find((m) => m.clerkId === target.clerkId)
    if (!target || !membership) throw new Error("That person isn't a member of this organization")
    if (target.id === workspace.creatorId || membership.isAdmin) throw new Error("Owner can't be restricted")

    await setMemberAccess(prisma, { workspaceId, userId: target.id, role: parsedRole })
    await setMemberAccess(prisma, { workspaceId, userId: target.id, role: parsedRole })

    const actorId = await getActorId()
    await recordActivity(
        workspaceId,
        "ACCESS_CHANGED",
        { scope: "member", target: target.name?.trim() || target.email.split("@")[0], role: parsedRole },
        actorId
    )
    // Orang yang perannya diubah diberi tahu.
    await notify(prisma, { userId: target.id, workspaceId, actorId, type: "ROLE_CHANGED", data: { role: parsedRole } })
}