import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ArrowLeft } from "lucide-react";
import { checkUser } from "@/actions/check-user";
import { prisma } from "@/lib/prisma";
import { getWorkspaceScope } from "@/lib/workspace-scope";
import { TRASH_RETENTION_DAYS, trashCutoff } from "@/lib/trash";
import { TrashList } from "./_components/TrashList";
import { deleteWorkspaceAssets } from "@/lib/asset-storage";

export default async function TrashPage() {
    const user = await checkUser()
    if (!user) redirect("/sign-in")

    const { userId, orgId, orgRole } = await auth()
    const { orgName, trashWhere } = await getWorkspaceScope(user.id)


    const expiredWhere = { ...trashWhere, deletedAt: { lt: trashCutoff()}}
    const expired = await prisma.workspace.findMany({ where: expiredWhere, select: { id: true}})
    await prisma.workspace.deleteMany({ where: expiredWhere})
    await deleteWorkspaceAssets(expired.map((workspace) => workspace.id))

    const rows = await prisma.workspace.findMany({
        where: trashWhere,
        orderBy: { deletedAt: "desc" },
        select: {
            id: true,
            name: true,
            description: true,
            status: true,
            deletedAt: true,
            clerkOrgId: true,
            creator: { select: { clerkId: true } },
        },
    })

    const items = rows.map(({ creator, clerkOrgId, deletedAt, ...workspace }) => ({
        ...workspace,
        deletedAt: deletedAt as Date,
        canPurge: creator.clerkId === userId || (orgRole === "org:admin" && clerkOrgId === orgId),
    }))

    return (
        <div className="p-8">
            <div className="mb-6">
                <Link
                    href="/workspaces"
                    className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="size-4" />
                    All workspaces
                </Link>
                <p className="text-sm text-muted-foreground">{orgName}</p>
                <h1 className="text-2xl font-semibold">Trash</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Workspaces are deleted permanently {TRASH_RETENTION_DAYS} days after they&apos;re moved here.
                </p>
            </div>

            <TrashList items={items} />
        </div>
    )
}