import type { WorkspaceStatus } from "@/lib/generated/prisma/enums";
import { WORKSPACE_STATUSES } from "@/lib/workspace-status";

type Searchable = { name: string; description: string | null }

function normalize(text: string) {
    return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}

export function matchesQuery(workspace: Searchable, query: string) {
    const words = normalize(query).split(/\s+/).filter(Boolean)
    if (words.length === 0) return true

    const haystack = normalize(`${workspace.name} ${workspace.description ?? ""}`)
    return words.every((word) => haystack.includes(word))
}

const VALID_STATUSES = new Set<string>(WORKSPACE_STATUSES.map((s) => s.status))

export function parseStatuses(raw: string | undefined): WorkspaceStatus[] {
    if (!raw) return []
    const found = raw.split(",").filter((value) => VALID_STATUSES.has(value)) as WorkspaceStatus[]
    return WORKSPACE_STATUSES.map((s) => s.status).filter((status) => found.includes(status))
}

type RawParams = { [key: string]: string | string[] | undefined }

function firstValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value
}

export function parseFilterParams(params: RawParams) {
    return {
        query: (firstValue(params.q) ?? "").slice(0, 100),
        statuses: parseStatuses(firstValue(params.status))
    }
}

export function buildFilterSearch(query: string, statuses: WorkspaceStatus[]) {
    const parts: string[] = []
    const trimmed = query.trim()
    if (trimmed) parts.push(`q=${encodeURIComponent(trimmed)}`)
    if (statuses.length > 0) parts.push(`status=${statuses.join(",")}`)
    return parts.length > 0 ? `?${parts.join("&")}` : ""
}