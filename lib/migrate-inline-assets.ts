import type { Editor, TLAsset } from "tldraw";
import { isAllowedAssetType } from "@/lib/asset-config";
import { uploadWorkspaceImage } from "@/lib/canvas-asset-store";

export async function migrateInlineAssets(editor: Editor, workspaceId: string) {
    const inline = editor.store
        .allRecords()
        .filter((record): record is TLAsset => record.typeName === "asset" && record.props.src?.startsWith("data:") === true)

    for (const asset of inline) {
        try {
            const blob = await (await fetch(asset.props.src!)).blob()
            if (!isAllowedAssetType(blob.type)) continue

            const src = await uploadWorkspaceImage(workspaceId, new File([blob], "image", { type: blob.type }))

            editor.run(
                () => editor.updateAssets([{ id: asset.id, type: asset.type, props: { src } } as
                    Parameters<Editor["updateAssets"]>[0][number]
                ]),
                { history: "ignore" }
            )
        } catch (error) {
            console.warn("Gagal migrasikan gambar ke Suppabase Storage", asset.id, error)
        }
    }
}