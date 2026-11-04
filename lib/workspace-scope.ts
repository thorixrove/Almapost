import { cache } from "react";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { ttlCache } from "@/lib/ttl-cache";
import type { Prisma } from "@/lib/generated/prisma/client";

function ownerWhere(orgId: string | null | undefined, userId: string): Prisma.WorkspaceWhereInput {
    return orgId ? { clerkOrgId: orgId } : { clerkOrgId: null, creatorId: userId }
}

export function scopeWhere(orgId: string | null | undefined, userId: string): Prisma.WorkspaceWhereInput {
    return { ...ownerWhere(orgId, userId), deletedAt: null }
}

export function trashScopeWhere(orgId: string | null | undefined, userId: string): Prisma.WorkspaceWhereInput {
    return { ...ownerWhere(orgId, userId), deletedAt: { not: null } }
}

const orgNameCache = ttlCache<string>(5 * 60_000)

export const getWorkspaceScope = cache(async (userId: string) => {
    const { orgId } = await auth()
    const orgName = orgId
        ? await orgNameCache(orgId, async () =>
            (await (await clerkClient()).organizations.getOrganization({ organizationId: orgId })).name)
        : "Personal"

    return { orgName, where: scopeWhere(orgId, userId), trashWhere: trashScopeWhere(orgId, userId) }
}) 