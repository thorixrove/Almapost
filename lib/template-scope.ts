import type { Prisma } from "@/lib/generated/prisma/client";

export function templateScope(orgId: string | null | undefined, userId: string): Prisma.WorkspaceTemplateWhereInput {
    return orgId ? {clerkOrgId: orgId} : {clerkOrgId: null, creatorId: userId}
}

export const MAX_TEMPLATES_PER_SCOPE  = 30