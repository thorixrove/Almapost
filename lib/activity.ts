import type { PrismaClient } from "@/lib/generated/prisma/client";

export type ActivityType =
    | "WORKSPACE_CREATED"
    | "WORKSPACE_RENAMED"
    | "STATUS_CHANGED"
    | "WORKSPACE_TRASHED"
    | "WORKSPACE_RESTORED"
    | "SHARING_ENABLED"
    | "SHARING_DISABLED"
    | "VERSION_SAVED"
    | "VERSION_RESTORED"
    | "TEMPLATE_SAVED"
    | "WORKSPACE_DUPLICATED"
    | "COMMENT_ADDED"
    | "THREAD_RESOLVED"
    | "ACCESS_CHANGED"
    | "AGENT_PROMPT"

export type ActivityData = Record<string, string | number | boolean | null>

const STATUS_LABELS: Record<string, string> = {
    PLANNING: "Planning",
    IN_PROGRESS: "In progress",
    IN_REVIEW: "In review",
    DONE: "Done"
}

const ROLE_LABELS: Record<string, string> = { EDITOR: "can edit", VIEWER: "view only" }

const quote = (value: unknown) => (typeof value === "string" && value ? `${value}` : "")

export function describeActivity(type: string, data: ActivityData | null): string {
    const d = data ?? {}
    switch (type) {
        case "WORKSPACE_CREATED":
            if (typeof d.from === "string") return `created this workspace as a copy of ${quote(d.from)}`
            if (typeof d.template === "string") return `created this workspace from the template ${quote(d.template)}`
            return "created this workspace"
        case "WORKSPACE_RENAMED":
            return d.from && d.to ? `renamed the workspace from ${quote(d.from)} to ${quote(d.to)}` : "renamed the workspace"
        case "STATUS_CHANGED":
            return `moved the workspace from ${STATUS_LABELS[String(d.from)] ?? "one column"} to ${STATUS_LABELS[String(d.to)] ?? "another"}`
        case "WORKSPACE_TRASHED":
            return "moved the workspace to the trash"
        case "WORKSPACE_RESTORED":
            return "restored the workspace from the trash"
        case "SHARING_ENABLED":
            return "turned on the public share link"
        case "SHARING_DISABLED":
            return "turned off the public share link"
        case "VERSION_SAVED":
            return d.label ? `saved the version ${quote(d.label)}` : "saved a version"
        case "VERSION_RESTORED": {
            // Label dari klien berbentuk: Before restoring “Nama versi”
            const match = typeof d.label === "string" ? /^Before restoring “(.*)”$/.exec(d.label) : null
            return match ? `restored the version ${quote(match[1])}` : "restored an earlier version"
        }
        case "TEMPLATE_SAVED":
            return d.name ? `saved the workspace as the template ${quote(d.name)}` : "saved the workspace as a template"
        case "WORKSPACE_DUPLICATED":
            return d.copyName ? `duplicated the workspace as ${quote(d.copyName)}` : "duplicated the workspace"
        case "COMMENT_ADDED":
            return d.reply ? "replied to a comment" : "added a comment"
        case "THREAD_RESOLVED":
            return d.resolved === false ? "reopened a comment thread" : "resolved a comment thread"
        case "ACCESS_CHANGED": {
            const role = ROLE_LABELS[String(d.role)]
            if (d.scope === "default") return `set organization members to ${role ?? "the default role"}`
            if (!d.target) return "changed someone's access"
            return role
                ? `set ${d.target} to ${role}`
                : `reset ${d.target} to the workspace default`
        }
        case "AGENT_PROMPT":
            return "asked the agent for help"
        default:
            return "did something"
    }
}

function actorLabel(actor: { name: string | null; email: string } | null) {
    return actor ? actor.name?.trim() || actor.email.split("@")[0] : "Someone"
}

export async function logActivity(
    db: PrismaClient,
    input: { workspaceId: string; actorId: string | null; type: ActivityType; data?: ActivityData }
) {
    try {
        await db.activityEvent.create({
            data: {
                workspaceId: input.workspaceId,
                actorId: input.actorId,
                type: input.type,
                ...(input.data && { data: input.data }),
            },
        })
        return true
    } catch (error) {
        console.error("[activity] couldn't log", input.type, error)
        return false
    }
}

export const ACTIVITY_LIMIT = 100

export async function listActivity(db: PrismaClient, workspaceId: string, limit = ACTIVITY_LIMIT) {
    const userSelect = { select: { name: true, email: true } } as const
    const [event, prompts] = await Promise.all([
        db.activityEvent.findMany({
            where: { workspaceId },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: { id: true, type: true, data: true, createdAt: true, actor: userSelect },
        }),
        db.agentPrompt.findMany({
            where: { workspaceId },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: { id: true, createdAt: true, user: userSelect },
        })
    ])

    return [
        ...event.map((event) => ({
            id: event.id,
            type: event.type,
            text: describeActivity(event.type, event.data as ActivityData | null),
            createdAt: event.createdAt,
            actorName: actorLabel(event.actor),
        })),
        ...prompts.map((prompt) => ({
            id: `agent:${prompt.id}`,
            type: "AGENT_PROMPT",
            text: describeActivity("AGENT_PROMPT", null),
            createdAt: prompt.createdAt,
            actorName: actorLabel(prompt.user),
        }))
    ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)
}