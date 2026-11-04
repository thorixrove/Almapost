import type { Block, BlockNoteEditor } from "@blocknote/core";
import type { Editor, TLShapeId, TLStoreSnapshot } from "tldraw";
import { restoreCanvasSnapshot } from "@/lib/version-snapshot";


export type Editors = { canvasEditor: Editor | null; docEditor: BlockNoteEditor | null }

export type SurfaceSnapshot = { doc: Block[] | null; canvas: TLStoreSnapshot | null }

export type ChangeCounts = { added: number; changed: number; removed: number }

export type TurnSummary = {
    shapes: ChangeCounts
    blocks: ChangeCounts

    shapeIds: string[]
    blockIds: string[]
}

export function captureSurfaces({ canvasEditor, docEditor }: Editors): SurfaceSnapshot {
    return {
        doc: docEditor ? docEditor.document : null,
        canvas: canvasEditor ? canvasEditor.store.getStoreSnapshot() : null
    }
}

const sameJson = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

function emptyCounts(): ChangeCounts {
    return { added: 0, changed: 0, removed: 0 }
}

function diffById(before: Map<string, unknown>, after: Map<string, unknown>, touched: string[]) {
    const counts = emptyCounts()
    for (const [id, record] of after) {
        if (!before.has(id)) {
            counts.added += 1
            touched.push(id)
        } else if (!sameJson(before.get(id), record)) {
            counts.changed += 1
            touched.push(id)
        }
    }
    for (const id of before.keys()) {
        if (!after.has(id)) counts.removed += 1
    }
    return counts
}

function shapeRecords(snapshot: TLStoreSnapshot) {
    const shapes = new Map<string, unknown>()
    for (const [id, record] of Object.entries(snapshot.store)) {
        if (record.typeName === "shape") shapes.set(id, record)
    }
    return shapes
}

function isBlankDooc(blocks: Block[]) {
    const [first] = blocks
    return blocks.length === 1 && first.type === "paragraph" && first.children.length === 0 &&
        Array.isArray(first.content) && first.content.length === 0
}

function blockRecords(blocks: Block[]) {
    return new Map<string, unknown>(isBlankDooc(blocks) ? [] : blocks.map((block) => [block.id, block]))
}


export function summarizeTurn(before: SurfaceSnapshot, after: SurfaceSnapshot): TurnSummary {
    const shapeIds: string[] = []
    const blockIds: string[] = []
    return {
        shapes: before.canvas && after.canvas
            ? diffById(shapeRecords(before.canvas), shapeRecords(after.canvas), shapeIds)
            : emptyCounts(),
        blocks: before.doc && after.doc
            ? diffById(blockRecords(before.doc), blockRecords(after.doc), blockIds)
            : emptyCounts(),
        shapeIds,
        blockIds
    }
}

const total = ({ added, changed, removed }: ChangeCounts) => added + changed + removed

export function hasChanges(summary: TurnSummary) {
    return total(summary.shapes) + total(summary.blocks) > 0
}

export function restoreSurfaces(editors: Editors, snapshot: SurfaceSnapshot) {
    const restored = { doc: false, canvas: false }

    if (snapshot.doc && editors.docEditor) {
        editors.docEditor.replaceBlocks(
            editors.docEditor.document,
            snapshot.doc.length > 0 ? snapshot.doc : [{ type: "paragraph" }]
        )
        restored.doc = true
    }
    if (snapshot.canvas && editors.canvasEditor) {
        restoreCanvasSnapshot(editors.canvasEditor, { document: snapshot.canvas })
        restored.canvas = true
    }
    return restored
}

export function isPartialRestore(snapshot: SurfaceSnapshot, restored: { doc: boolean; canvas: boolean }) {
    return (!!snapshot.doc && !restored.doc) || (!!snapshot.canvas && !restored.canvas)
}

export function revealChanges({ canvasEditor }: Editors, summary: TurnSummary) {
    if (canvasEditor) {
        const ids = summary.shapeIds.filter((id) => canvasEditor.getShape(id as TLShapeId)) as TLShapeId[]
        if (ids.length > 0) {
            canvasEditor.setSelectedShapes(ids)
            canvasEditor.zoomToSelection({ animation: { duration: 300 } })
        }
    }

    const firstBlocksId = summary.blockIds[0]
    if (firstBlocksId) {
        document
            .querySelector(`[data-id="${CSS.escape(firstBlocksId)}"]`)
            ?.scrollIntoView({ block: "center", behavior: "smooth" })
    }
}