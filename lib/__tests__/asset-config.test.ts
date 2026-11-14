import { describe, expect, it } from "vitest";
import { assetPath, assetSrc, isAllowedAssetType, isAssetId, parseAssetSrc } from "@/lib/asset-config";

describe("asset-config", () => {
    it("membentuk dan membaca alamat aset", () => {
        const src = assetSrc("cmabc123def456ghi789jkl0", "3f1c2a9e-1111-4222-8333-944455556666")
        expect(src).toBe("/api/assets/cmabc123def456ghi789jkl0/3f1c2a9e-1111-4222-8333-944455556666")
        expect(parseAssetSrc(src)).toEqual({
            workspaceId: "cmabc123def456ghi789jkl0",
            assetId: "3f1c2a9e-1111-4222-8333-944455556666",
        })
    })

    it("menolak alamat yang bukan milik route aset", () => {
        expect(parseAssetSrc("data:image/png;base64,AAAA")).toBeNull()
        expect(parseAssetSrc("https://evil.example/api/assets/aaaaaaaa/bbbbbbbb")).toBeNull()
        expect(parseAssetSrc("/api/assets/aaaaaaaa/bbbbbbbb?share=x")).toBeNull()
        expect(parseAssetSrc("/api/assets/../../etc/passwd")).toBeNull()
    })

    it("id aset tidak boleh memuat pemisah path", () => {
        expect(isAssetId("abcDEF12_-")).toBe(true)
        expect(isAssetId("../secret")).toBe(false)
        expect(isAssetId("a/b")).toBe(false)
        expect(isAssetId("short")).toBe(false)
    })

    it("hanya mengizinkan gambar raster, bukan SVG", () => {
        expect(isAllowedAssetType("image/webp")).toBe(true)
        expect(isAllowedAssetType("image/svg+xml")).toBe(false)
        expect(isAllowedAssetType("text/html")).toBe(false)
    })

    it("path storage = workspace/aset", () => {
        expect(assetPath("ws1", "a1")).toBe("ws1/a1")
    })
})