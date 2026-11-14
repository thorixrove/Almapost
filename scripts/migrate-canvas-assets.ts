import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { uploadAssetBytes } from "@/lib/asset-storage";
import { MAX_ASSET_BYTES, assetSrc, isAllowedAssetType } from "@/lib/asset-config";
import type { Prisma } from "@/lib/generated/prisma/client";

const DRY_RUN = process.argv.includes("--dry-run")
const PAGE_SIZE = 5
const DATA_URL = /^data:([\w.+/-]+);base64,([\s\S]*)$/

type JsonRecord = Record<string, unknown>
const isRecord = (value: unknown): value is JsonRecord => typeof value === "object" && value !== null

const stats = { rows: 0, rowsChanged: 0, images: 0, uploaded: 0, skippedType: 0, skippedSize: 0, bytesBefore: 0, bytesAfter: 0 }

const uploadKeys = new Set<string>()

async function migrateSnapshot(workspaceId: string, content: unknown): Promise<Prisma.InputJsonValue | null> {
    const records = isRecord(content) && isRecord(content.document) ? content.document.store : null
    if (!isRecord(records)) return null

    const next = structuredClone(content) as { document: { store: JsonRecord } }
    let changed = false

    for (const record of Object.values(next.document.store)) {
        if (!isRecord(record) || record.typeName !== "asset" || !isRecord(record.props)) continue
        const src = record.props.src
        if (typeof src !== "string" || !src.startsWith("data:")) continue

        stats.images++
        const match = DATA_URL.exec(src)
        if (!match || !isAllowedAssetType(match[1])) {
            stats.skippedType++
            continue
        }
        const bytes = Buffer.from(match[2], "base64")
        if (bytes.length > MAX_ASSET_BYTES) {
            stats.skippedSize++
            continue
        }

        const assetId = createHash("sha256").update(bytes).digest("hex").slice(0, 40)
        const key = `${workspaceId}/${assetId}`
        if (!DRY_RUN && !uploadKeys.has(key)) {
            await uploadAssetBytes(workspaceId, assetId, bytes, match[1])
            uploadKeys.add(key)
            stats.uploaded++
        }
        record.props.src = assetSrc(workspaceId, assetId)
        changed = true
    }

    return changed ? (next as unknown as Prisma.InputJsonArray) : null
}

const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value ?? null))

async function migrateCanvases() {
    let cursor: string | undefined
    for (; ;) {
        const rows = await prisma.canvas.findMany({
            take: PAGE_SIZE,
            ...(cursor && { skip: 1, cursor: { id: cursor } }),
            orderBy: { id: "asc" },
            select: { id: true, workspaceId: true, content: true },
        })
        if (rows.length === 0) return

        for (const row of rows) {
            stats.rows++
            const next = await migrateSnapshot(row.workspaceId, row.content)
            if (!next) continue
            stats.rowsChanged++
            stats.bytesBefore += size(row.content)
            stats.bytesAfter += size(next)
            if (!DRY_RUN) await prisma.canvas.update({ where: { id: row.id }, data: { content: next } })
        }
        cursor = rows[rows.length - 1].id
    }
}

async function migrateVersions() {
    let cursor: string | undefined
    for (; ;) {
        const rows = await prisma.workspaceVersion.findMany({
            take: PAGE_SIZE,
            ...(cursor && { skip: 1, cursor: { id: cursor } }),
            orderBy: { id: "asc" },
            select: { id: true, workspaceId: true, canvasContent: true },
        })
        if (rows.length === 0) return
        for (const row of rows) {
            stats.rows++
            const next = await migrateSnapshot(row.workspaceId, row.canvasContent)
            if (!next) continue
            stats.rowsChanged++
            stats.bytesBefore += size(row.canvasContent)
            stats.bytesAfter += size(next)
            if (!DRY_RUN) await prisma.workspaceVersion.update({ where: { id: row.id }, data: { canvasContent: next } })
        }
        cursor = rows[rows.length - 1].id
    }
}

async function main() {
    console.log(DRY_RUN ? "DRY RUN: tidak ada yang diubah" : "Memigrasikan gambar ke Supabase Storage...")
    await migrateCanvases()
    await migrateVersions()


    const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(2)
    console.log(`Baris diperiksa      : ${stats.rows}`)
    console.log(`Baris berisi base64  : ${stats.rowsChanged}`)
    console.log(`Gambar base64        : ${stats.images}`)
    console.log(`Diunggah (unik)      : ${stats.uploaded}`)
    console.log(`Dilewati (tipe)      : ${stats.skippedType}  (mis. SVG, tetap base64)`)
    console.log(`Dilewati (> ${MAX_ASSET_BYTES / 1024 / 1024} MB)    : ${stats.skippedSize}`)
    console.log(`Ukuran JSON          : ${mb(stats.bytesBefore)} MB -> ${mb(stats.bytesAfter)} MB`)
}

main()
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect)