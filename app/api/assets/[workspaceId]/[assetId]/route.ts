import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getEntitlements, workspaceOwnerId, workspaceOwnerSelect } from "@/lib/billing";
import { canAccessWorkspace } from "@/lib/workspace-access";
import { isAssetId } from "@/lib/asset-config";
import { signAssetUrl } from "@/lib/asset-storage";
import { ttlCache } from "@/lib/ttl-cache";

const accessCache = ttlCache<boolean>(30_000, 1000)

async function canViewShared(workspaceId: string, token: string) {
    const workspace = await prisma.workspace.findUnique({
        where: { shareToken: token },
        select: { id: true, deletedAt: true, ...workspaceOwnerSelect },
    })
    if (!workspace || workspace.id !== workspaceId || workspace.deletedAt) return false
    return (await getEntitlements(workspaceOwnerId(workspace))).publicSharing
}

async function canView(workspaceId: string, shareToken: string | null) {
    if (shareToken && (await accessCache(`share:${workspaceId}:${shareToken}`, () => canViewShared(workspaceId, shareToken)))) {
        return true
    }
    const {userId} = await auth()
    if (!userId) return false
    return accessCache(`user:${userId}:${workspaceId}`, () => canAccessWorkspace(workspaceId))
}

const notFound = () => new Response("Not found", {status: 404})

export async function GET(request: Request, ctx: RouteContext<"/api/assets/[workspaceId]/[assetId]">) {
    const {workspaceId, assetId} = await ctx.params
    if (!isAssetId(workspaceId) || !isAssetId(assetId)) return notFound()

        const shareToken = new URL(request.url).searchParams.get("share")
        if (!(await canView(workspaceId, shareToken))) return notFound()

            const signedUrl = await signAssetUrl(workspaceId, assetId)
            if (!signedUrl) return notFound()

                return  new Response(null, {
                    status: 302,
                    headers: {location: signedUrl, "Cache-Control" : "private, max-age=300"}
                })
}