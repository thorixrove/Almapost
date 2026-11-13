import type { TLAssetStore } from "tldraw";
import { requestAssetUpload } from "@/actions/asset";
import { ASSET_BUCKET, parseAssetSrc } from "@/lib/asset-config";
import { supabase } from "@/lib/supabase";

const MAX_DIMENSION = 2000
const SKIP_COMPRESS_BELOW = 300 * 1024
const WEBP_QUALITY = 0.85

async function prepareImage(file: File): Promise<File> {
    if (file.type === "image/gif" || file.size < SKIP_COMPRESS_BELOW) return file

    try {
        const bitmap = await createImageBitmap(file)
        const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
        const canvas = document.createElement("canvas")
        canvas.width = Math.max(1, Math.round(bitmap.width * scale))
        canvas.height = Math.max(1, Math.round(bitmap.height * scale))

        const context = canvas.getContext("2d")
        if (!context) return file
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        bitmap.close()

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", WEBP_QUALITY))
        if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return file
        return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" })
    } catch {
        return file
    }
}

export async function uploadWorkspaceImage(workspaceId: string, original: File): Promise<string> {
    const file = await prepareImage(original)
    const { path, token, src } = await requestAssetUpload(workspaceId, file.type, file.size)

    const { error } = await supabase.storage
        .from(ASSET_BUCKET)
        .uploadToSignedUrl(path, token, file, { contentType: file.type })
    if (error) throw new Error("Gagal mengunggah gambar")
    return src
}

export function createWorkspaceAssetStore(workspaceId: string): TLAssetStore {
    return {
        async upload(_asset, file, abortSignal) {
            abortSignal?.throwIfAborted()
            return { src: await uploadWorkspaceImage(workspaceId, file) }
        },
        resolve: (asset) => asset.props.src,
    }
}

export function createSharedAssetStore(shareToken: string): TLAssetStore {
    return {
        async upload() {
            throw new Error("Canvas ini hanya bisa dilihat")
        },
        resolve(asset) {
            const src = asset.props.src
            if (!src || !parseAssetSrc(src)) return src
            return `${src}?share=${encodeURIComponent(shareToken)}`
        }
    }
}