import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { scopeWhere } from "@/lib/workspace-scope";
import { FREE_WORKSPACE_LIMIT } from "@/lib/plan-limits";
import { cloneCanvasAssets } from "@/lib/asset-storage";

export function asJsonInput(value: Prisma.JsonValue | null | undefined) {
    return (value ?? null) as Prisma.InputJsonValue | null
}


export type NewWorkspace = {
    creatorId: string
    clerkOrgId: string | null
    name: string
    description: string | null
    docContent?: Prisma.InputJsonValue | null
    canvasContent?: Prisma.InputJsonValue | null
    unlimited: boolean
}

export async function createWorkspaceWithContent(
    db: PrismaClient,
    input: NewWorkspace
): Promise<{ workspace: { id: string } } | { limit: "workspaces" }> {
    const scope = scopeWhere(input.clerkOrgId, input.creatorId)

    if (!input.unlimited && (await db.workspace.count({ where: scope })) >= FREE_WORKSPACE_LIMIT) {
        return { limit: "workspaces" }
    }

    const top = await db.workspace.findFirst({
        where: { status: "PLANNING", ...scope },
        orderBy: { position: "asc" },
        select: { position: true },
    })

    const workspace = await db.workspace.create({
        data: {
            name: input.name,
            description: input.description,
            creatorId: input.creatorId,
            clerkOrgId: input.clerkOrgId,
            position: top ? top.position - 1 : 0,
            doc: { create: input.docContent != null ? { content: input.docContent } : {} },
            canvas: { create: input.canvasContent != null ? { content: input.canvasContent } : {} },
        },
        select: { id: true },
    })
    if (input.canvasContent != null) {
        const canvasContent = await cloneCanvasAssets(input.canvasContent, workspace.id)
        if (canvasContent !== input.canvasContent) {
            await db.canvas.update({ where: {workspaceId: workspace.id}, data: { content: canvasContent}})
        }
    }
    return { workspace }
}