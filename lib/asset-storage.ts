import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
    ASSET_BUCKET,
    MAX_ASSET_BYTES,
    WORKSPACE_ASSET_QUOTA_BYTES,
    assetPath,
    assetSrc,
    isAllowedAssetType,
    parseAssetSrc,
} from "@/lib/asset-config";

// Signed URL berlaku 10 menit; route akses hanya men-cache redirect-nya 5 menit.
export const SIGNED_URL_TTL_SECONDS = 600

const LIST_PAGE = 100

let admin: SupabaseClient | null = null
function bucket() {
    if (!admin) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.SUPABASE_SECRET_KEY
        if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SECRET_KEY harus diatur")
        admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    }
    return admin.storage.from(ASSET_BUCKET)
}

export async function workspaceAssetBytes(workspaceId: string) {
    let total = 0
    for (let offset = 0; ; offset += LIST_PAGE) {
        const { data, error } = await bucket().list(workspaceId, { limit: LIST_PAGE, offset })
        if (error) throw new Error(`Gagal membaca penyimpanan: ${error.message}`)
        for (const file of data) total += Number(file.metadata?.size ?? 0)
        if (data.length < LIST_PAGE) return total
    }
}

export async function createAssetUpload(workspaceId: string, mimeType: string, size: number) {
    if (!isAllowedAssetType(mimeType)) throw new Error("Tipe gambar tidak didukung (PNG, JPEG, WebP, GIF)")
    if (!Number.isFinite(size) || size <= 0) throw new Error("Ukuran gambar tidak valid")
    if (size > MAX_ASSET_BYTES) throw new Error(`Ukuran gambar maksimal ${MAX_ASSET_BYTES / 1024 / 1024} MB`)

    const used = await workspaceAssetBytes(workspaceId)
    if (used + size > WORKSPACE_ASSET_QUOTA_BYTES) throw new Error("Kuota gambar workspace ini sudah penuh")

    const assetId = randomUUID()
    const path = assetPath(workspaceId, assetId)
    const { data, error } = await bucket().createSignedUploadUrl(path)
    if (error || !data) throw new Error("Gagal menyiapkan gambar")

    return { path, token: data.token, src: assetSrc(workspaceId, assetId) }
}

export async function signAssetUrl(workspaceId: string, assetId: string) {
    const { data, error } = await bucket().createSignedUrl(assetPath(workspaceId, assetId), SIGNED_URL_TTL_SECONDS)
    if (error || !data) return null
    return data.signedUrl
}

export async function uploadAssetBytes(workspaceId: string, assetId: string, bytes: Buffer, contentType: string) {
    const { error } = await bucket().upload(assetPath(workspaceId, assetId), bytes, { contentType, upsert: true })
    if (error) throw Error(`Gagal mengunggah aset: ${error.message}`)
}

export async function deleteWorkspaceAssets(workspaceIds: string[]) {
    for (const workspaceId of workspaceIds) {
        try {
            for (; ;) {
                const { data, error } = await bucket().list(workspaceId, { limit: LIST_PAGE })
                if (error) throw error
                if (data.length === 0) break
                const { error: removeError } = await bucket().remove(data.map((file) => assetPath(workspaceId, file.name)))
                if (removeError) throw removeError
            }
        } catch (error) {
            console.error(`Gagal menghapus aset workspace ${workspaceId}`, error)
        }
    }
}

type JsonRecord = Record<string, unknown>

const isRecord = (value: unknown): value is JsonRecord => typeof value === "object" && value !== null

export async function cloneCanvasAssets<T>(content: T, toWorkspaceId: string): Promise<T> {
    const records = isRecord(content) && isRecord(content.document) ? content.document.store : null
    if (!isRecord(records)) return content

    const next = structuredClone(content)
    const nextRecords = (next as { document: { store: JsonRecord } }).document.store
    const copied = new Map<string, string>()
    let changed = false

    for (const record of Object.values(nextRecords)) {
        if (!isRecord(record) || record.typeName !== "asset" || !isRecord(record.props)) continue
        const src = record.props.src
        const ref = typeof src === "string" ? parseAssetSrc(src) : null
        if (!ref || ref.workspaceId === toWorkspaceId) continue

        const key = `${ref.workspaceId}/${ref.assetId}`
        let newId = copied.get(key)
        if (!newId) {
            newId = randomUUID()
            const { error } = await bucket().copy(assetPath(ref.workspaceId, ref.assetId), assetPath(toWorkspaceId, newId))
            if (error) {
                console.error(`Gagal menyalin aset ${key}`, error)
                continue
            }
            copied.set(key, newId)
        }
        record.props.src = assetSrc(toWorkspaceId, newId)
        changed = true
    }
    return changed ? next : content
}