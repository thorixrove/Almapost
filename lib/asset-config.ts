// Konfigurasi aset (gambar) canvas yang dipakai bersama oleh server dan klien.
// Gambar disimpan di bucket Supabase Storage yang private, bukan lagi sebagai base64 di dalam canvas.

export const ASSET_BUCKET = "workspace-assets"

// Batas per file. Nilai yang sama harus dipasang di bucket (lihat supabase/storage-setup.sql).
export const MAX_ASSET_BYTES = 5 * 1024 * 1024

// Total ukuran semua gambar dalam satu workspace.
export const WORKSPACE_ASSET_QUOTA_BYTES = 50 * 1024 * 1024

// SVG sengaja tidak diizinkan: file SVG bisa memuat script.
export const ALLOWED_ASSET_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const

export type AllowedAssetType = (typeof ALLOWED_ASSET_TYPES)[number]

export function isAllowedAssetType(type: string): type is AllowedAssetType {
    return (ALLOWED_ASSET_TYPES as readonly string[]).includes(type)
}

// Id workspace (cuid) dan id aset (uuid atau hash) sama-sama lolos pola ini.
const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

export function isAssetId(value: string) {
    return ID_PATTERN.test(value)
}

export function assetPath(workspaceId: string, assetId: string) {
    return `${workspaceId}/${assetId}`
}

// Alamat yang disimpan di record aset tldraw. Alamat ini stabil, tidak berisi token,
// dan selalu dicek hak aksesnya oleh app/api/assets/[workspaceId]/[assetId]/route.ts.
export function assetSrc(workspaceId: string, assetId: string) {
    return `/api/assets/${workspaceId}/${assetId}`
}

const SRC_PATTERN = /^\/api\/assets\/([A-Za-z0-9_-]{8,64})\/([A-Za-z0-9_-]{8,64})$/

export function parseAssetSrc(src: string) {
    const match = SRC_PATTERN.exec(src)
    return match ? { workspaceId: match[1], assetId: match[2] } : null
}