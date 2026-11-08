"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { checkUser } from "@/actions/check-user";
import { canAccessWorkspace, requireEditAccess  } from "@/lib/workspace-access";
import { prisma } from "@/lib/prisma";
import { getEntitlements } from "@/lib/billing";
import { BUILTIN_TEMPLATES, findBuiltinTemplate } from "@/lib/builtin-templates";
import { MAX_TEMPLATES_PER_SCOPE, templateScope } from "@/lib/template-scope";
import { asJsonInput, createWorkspaceWithContent } from "@/lib/workspace-create";
import type { LimitError } from "@/lib/plan-limits";

const MAX_NAME_LENGTH = 120

function revalidateWorkspaceLists() {
    revalidatePath("/dashboard")
    revalidatePath("/workspaces")
}

export async function duplicateWorkspace(
    workspaceId: string
): Promise<{ workspace: { id: string } } | { limit: LimitError }> {
    const user = await checkUser()
    if (!user) throw new Error("Not signed in")
    if (!(await canAccessWorkspace(workspaceId))) throw new Error("Workspace not found")

    const source = await prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: {
            name: true,
            description: true,
            clerkOrgId: true,
            doc: { select: { content: true } },
            canvas: { select: { content: true } }
        },
    })

    const { unlimitedWorkspaces } = await getEntitlements(source.clerkOrgId ?? user.clerkId)
    const result = await createWorkspaceWithContent(prisma, {
        creatorId: user.id,
        clerkOrgId: source.clerkOrgId,
        name: `Copy of ${source.name}`.slice(0, MAX_NAME_LENGTH),
        description: source.description,
        docContent: asJsonInput(source.doc?.content),
        canvasContent: asJsonInput(source.canvas?.content),
        unlimited: unlimitedWorkspaces,
    })

    if ("workspace" in result) revalidateWorkspaceLists()
    return result
}

export async function saveAsTemplate(
    workspaceId: string,
    name?: string
): Promise<{ template: { id: string; name: string } } | { full: true }> {
    const user = await checkUser()
    if (!user) throw new Error("Not signed in")
    await requireEditAccess(workspaceId)

    const source = await prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: {
            name: true,
            description: true,
            clerkOrgId: true,
            doc: { select: { content: true } },
            canvas: { select: { content: true } },
        },
    })

    const scope = templateScope(source.clerkOrgId, user.id)
    if ((await prisma.workspaceTemplate.count({ where: scope })) >= MAX_TEMPLATES_PER_SCOPE) return { full: true }

    const docContent = asJsonInput(source.doc?.content)
    const canvasContent = asJsonInput(source.canvas?.content)

    const template = await prisma.workspaceTemplate.create({
        data: {
            name: (name?.trim() || source.name).slice(0, MAX_NAME_LENGTH),
            description: source.description,
            clerkOrgId: source.clerkOrgId,
            creatorId: user.id,
            ...(docContent !== null && { docContent }),
            ...(canvasContent !== null && { canvasContent }),
        },
        select: { id: true, name: true }
    })

    return { template }
}


export type TemplateOption = {
    id: string
    name: string
    description: string | null
    builtin: boolean
    canDelete: boolean
}


export async function listTemplates(): Promise<{ builtin: TemplateOption[]; mine: TemplateOption[] }> {
    const user = await checkUser()
    if (!user) throw new Error("Not signed in")
    const { orgId, orgRole } = await auth()

    const rows = await prisma.workspaceTemplate.findMany({
        where: templateScope(orgId, user.id),
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, description: true, clerkOrgId: true, creatorId: true },
    })

    return {
        builtin: BUILTIN_TEMPLATES.map(({ id, name, description }) => ({
            id,
            name,
            description,
            builtin: true,
            canDelete: false,
        })),
        mine: rows.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            builtin: false,
            // Pembuatnya atau admin organisasi, sama seperti menghapus workspace.
            canDelete: row.creatorId === user.id || (orgRole === "org:admin" && row.clerkOrgId === orgId),
        })),
    }
}


export async function deleteTemplate(templateId: string) {
    const user = await checkUser()
    if (!user) throw new Error("Not signed in")
    const { orgId, orgRole } = await auth()

    const template = await prisma.workspaceTemplate.findFirst({
        where: { id: templateId, ...templateScope(orgId, user.id) },
        select: { creatorId: true, clerkOrgId: true },
    })
    if (!template) throw new Error("Template not found")

    const isCreator = template.creatorId === user.id
    const isOrgAdmin = orgRole === "org:admin" && template.clerkOrgId === orgId
    if (!isCreator && !isOrgAdmin) throw new Error("Only the creator or an org admin can delete this template")

    await prisma.workspaceTemplate.delete({ where: { id: templateId } })
}

export async function createWorkspaceFromTemplate(
    templateId: string,
    name: string,
    description?: string
): Promise<{ workspace: { id: string } } | { limit: LimitError }> {
    const user = await checkUser()
    if (!user) throw new Error("Not signed in")

    const trimmedName = name.trim()
    if (!trimmedName) throw new Error("Workspace name is required")

    const { orgId } = await auth()

    let docContent = null as ReturnType<typeof asJsonInput>
    let canvasContent = null as ReturnType<typeof asJsonInput>

    const builtin = findBuiltinTemplate(templateId)
    if (builtin) {
        docContent = builtin.doc as unknown as ReturnType<typeof asJsonInput>
    } else {
        const template = await prisma.workspaceTemplate.findFirst({
            where: { id: templateId, ...templateScope(orgId, user.id) },
            select: { docContent: true, canvasContent: true },
        })
        if (!template) throw new Error("Template not found")
        docContent = asJsonInput(template.docContent)
        canvasContent = asJsonInput(template.canvasContent)
    }

    const { unlimitedWorkspaces } = await getEntitlements(orgId ?? user.clerkId)
    const result = await createWorkspaceWithContent(prisma, {
        creatorId: user.id,
        clerkOrgId: orgId ?? null,
        name: trimmedName.slice(0, MAX_NAME_LENGTH),
        description: description?.trim() || null,
        docContent,
        canvasContent,
        unlimited: unlimitedWorkspaces
    })

    if ("workspace" in result) revalidateWorkspaceLists()
    return result
}