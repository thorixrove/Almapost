"use server";

import { requireEditAccess } from "@/lib/workspace-access";
import { createAssetUpload } from "@/lib/asset-storage";

export async function requestAssetUpload(workspaceId: string, mimeType: string, size: number) {
    await requireEditAccess(workspaceId)
    return createAssetUpload(workspaceId, mimeType, size)
}