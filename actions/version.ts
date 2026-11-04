"use server";

import { checkUser } from "@/actions/check-user";
import { canAccessWorkspace } from "@/lib/workspace-access";
import { prisma } from "@/lib/prisma";
import { VersionKind } from "@/lib/generated/prisma/enums";
import { countShapes, extractDocPreview } from "@/lib/version-snapshot";

// Versi MANUAL tidak pernah dihapus otomatis, tapi dibatasi jumlahnya.
const MAX_MANUAL_VERSIONS = 50
// Versi AUTO dan BEFORE_RESTORE: hanya yang terbaru yang disimpan.
const MAX_AUTOMATIC_VERSIONS = 30
// Dua versi AUTO tidak dibuat berdekatan, walau beberapa orang membuka workspace yang sama.
const AUTO_MIN_INTERVAL_MS = 5 * 60 * 1000
const MAX_LABEL_LENGTH = 80
const LIST_LIMIT = 100

async function requireAccess(workspaceId: string) {
    if (!(await canAccessWorkspace(workspaceId))) throw new Error("Workspace not found")
}

export async function listVersions(workspaceId: string) {
    await requireAccess(workspaceId)

    return prisma.workspaceVersion.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: LIST_LIMIT,
        select: {
            id: true,
            kind: true,
            label: true,
            preview: true,
            shapeCount: true,
            createdAt: true,
            createdBy: { select: { name: true } },
        },
    })
}

export type VersionSummary = Awaited<ReturnType<typeof listVersions>>[number]

export type CreateVersionResult =
    | { version: { id: string } }
    | { skipped: "unchanged" | "recent" }
    | { limit: "manual" }

export async function createVersion(
    workspaceId: string,
    kind: VersionKind,
    label?: string
): Promise<CreateVersionResult> {
    const user = await checkUser()
    if (!user) throw new Error("Not signed in")
    await requireAccess(workspaceId)
    if (!Object.values(VersionKind).includes(kind)) throw new Error("Invalid version")

    const [workspace, latest] = await Promise.all([
        prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                doc: { select: { content: true, updatedAt: true } },
                canvas: { select: { content: true, updatedAt: true } }
            },
        }),
        prisma.workspaceVersion.findFirst({
            where: { workspaceId },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
        })
    ])
    if (!workspace) throw new Error("Workspace not found")

    const docContent = workspace.doc?.content ?? null
    const canvasContent = workspace.canvas?.content ?? null

    if (kind === "AUTO") {
        if (docContent === null && canvasContent === null) return { skipped: "unchanged" }
        if (latest) {
            if (Date.now() - latest.createdAt.getTime() < AUTO_MIN_INTERVAL_MS) return { skipped: "recent" }
            const lastEdit = Math.max(
                workspace.doc?.updatedAt.getTime() ?? 0,
                workspace.canvas?.updatedAt.getTime() ?? 0
            )
            if (lastEdit <= latest.createdAt.getTime()) return { skipped: "unchanged" }
        }
    }

    if (kind === "MANUAL") {
        const manualCount = await prisma.workspaceVersion.count({ where: { workspaceId, kind: "MANUAL" } })
        if (manualCount >= MAX_AUTOMATIC_VERSIONS) return { limit: "manual" }
    }

    const version = await prisma.workspaceVersion.create({
        data: {
            workspaceId,
            kind,
            label: label?.trim().slice(0, MAX_LABEL_LENGTH) || null,
            preview: extractDocPreview(docContent),
            shapeCount: countShapes(canvasContent),
            ...(docContent !== null && { docContent }),
            ...(canvasContent !== null && { canvasContent }),
            createdById: user.id
        },
        select: { id: true }
    })

    if (kind !== "MANUAL") {
        const stale = await prisma.workspaceVersion.findMany({
            where: { workspaceId, kind: { in: ["AUTO", "BEFORE_RESTORE"] } },
            orderBy: { createdAt: "desc" },
            skip: MAX_AUTOMATIC_VERSIONS,
            select: { id: true },
        })
        if (stale.length > 0) {
            await prisma.workspaceVersion.deleteMany({ where: { id: { in: stale.map((v) => v.id) } } })
        }
    }

    return { version }
}

export async function getVersionContent(workspaceId: string, versionId: string) {
    await requireAccess(workspaceId)

    const version = await prisma.workspaceVersion.findFirst({
        where: { id: versionId, workspaceId },
        select: { docContent: true, canvasContent: true },
    })
    if (!version) throw new Error("Vaersion not found")

    return { doc: version.docContent, canvas: version.canvasContent }
}

export async function deleteVersion(workspaceId: string, versionId: string) {
    await requireAccess(workspaceId)
    await prisma.workspaceVersion.deleteMany({ where: { id: versionId, workspaceId } })
}