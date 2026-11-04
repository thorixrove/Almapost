import type { Editor, TLRecord, TLStoreSnapshot } from "tldraw";
import { record } from "zod";

const PREVIEW_MAX_CHARS = 120

function collectInlineText(node: unknown, parts: string[]) {
    if (Array.isArray(node)) {
        for (const item of node) collectInlineText(item, parts)
        return
    }
    if (!node || typeof node !== "object") return

    const { text, content, rows, cells } = node as Record<string, unknown>
    if (typeof text === "string") parts.push(text)
    collectInlineText(content, parts)
    if (Array.isArray(rows)) {
        for (const row of rows) collectInlineText(row, parts)
    }
    if (Array.isArray(cells)) {
        for (const cell of cells) {
            collectInlineText(cell, parts)
            parts.push(" ")
        }
    }
}

function collectLines(blocks: unknown, lines: string[], budget: { left: number }) {
    if (!Array.isArray(blocks)) return

    for (const block of blocks) {
        if (budget.left <= 0) return
        if (!block || typeof block !== "object") continue

        const { content, children } = block as Record<string, unknown>
        const parts: string[] = []
        collectInlineText(content, parts)
        const line = parts.join("").replace(/\s+/g, " ").trim()
        if (line) {
            lines.push(line)
            budget.left -= line.length + 1
        }
        collectLines(children, lines, budget)
    }
}

export function extractDocPreview(blocks: unknown): string | null {
    const lines: string[] = []
    collectLines(blocks, lines, { left: PREVIEW_MAX_CHARS })

    const preview = lines.join(" ")
    if (!preview) return null
    return preview.length > PREVIEW_MAX_CHARS ? `${preview.slice(0, PREVIEW_MAX_CHARS).trimEnd()}…` : preview
}

export function countShapes(snapshot: unknown): number {
    const store = (snapshot as { document?: { store?: Record<string, unknown> } } | null)?.document?.store
    if (!store || typeof store !== "object") return 0

    return Object.values(store).filter(
        (record) => (record as { typName?: unknown } | null)?.typName === "shape"
    ).length
}

const RESTORED_TYPES = new Set<string>(["shape", "binding", "asset"])

export function restoreCanvasSnapshot(
    editor: Pick<Editor, "store" | "run" | "markHistoryStoppingPoint">,
    snapshot: { document: TLStoreSnapshot } | null
) {
    const { store } = editor
    let target: TLRecord[] = []
    if (snapshot) {
        const migration = store.schema.migrateStoreSnapshot(snapshot.document)
        if (migration.type !== "success") {
            throw new Error(`Canvas version can't be loaded: ${migration.reason}`)
        }
        target = Object.values(migration.value) as TLRecord[]
    }

    const wanted = target.filter((record) => RESTORED_TYPES.has(record.typeName))
    const wantedIds = new Set<string>(wanted.map((record) => record.id))
    const missingPages = target.filter((record) => record.typeName === "page" && !store.has(record.id))
    const stale = store
        .allRecords()
        .filter((record) => RESTORED_TYPES.has(record.typeName) && !wantedIds.has(record.id))
        .map((record) => record.id)

    editor.markHistoryStoppingPoint("restore veersion")
    editor.run(() => {
        if (stale.length > 0) store.remove(stale)
        store.put([...missingPages, ...wanted])
    })
}