import { redirect } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { checkUser } from "@/actions/check-user";
import { prisma } from "@/lib/prisma";
import { getWorkspaceScope } from "@/lib/workspace-scope";
import { parseFilterParams } from "@/lib/workspace-filter";
import { withLastActivity, workspaceCardSelect } from "@/lib/workspace-status";
import { Button } from "@/components/ui/button";
import { WorkspaceDialog } from "@/components/WorkspaceDialog";
import { WorkspaceBoard } from "./_components/WorkspaceBoard";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { canEditRole, resolveWorkspaceRole } from "@/lib/workspace-role";
import { trashCutoff } from "@/lib/trash";

export default async function WorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const user = await checkUser()
  if (!user) redirect("/sign-in")

  const { query, statuses } = parseFilterParams(await searchParams)
  const { orgId, orgRole } = await auth()

  const { orgName, where, trashWhere } = await getWorkspaceScope(user.id)
  const [rows, trashCount] = await Promise.all([prisma.workspace.findMany({
    where,
    select: {
      ...workspaceCardSelect,
      position: true,
      creatorId: true,
      memberRole: true,
      access: { where: { userId: user.id }, select: { role: true } },
    },
    orderBy: { position: "asc" }
  }),
  prisma.workspace.count({ where: { ...trashWhere, deletedAt: { gte: trashCutoff() } } })
  ])

  const workspaces = rows.map(({ creatorId, memberRole, access, ...workspace }) => ({
    ...workspace,
    canEdit: canEditRole(
      resolveWorkspaceRole({
        isCreator: creatorId === user.id,
        isOrgAdmin: !!orgId && orgRole === "org:admin",
        override: access[0]?.role ?? null,
        memberRole,
      })
    ),
  }))

  return (
    <div className="p-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{orgName}</p>
          <h1 className="text-2xl font-semibold">All workspaces</h1>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="gap-2">
            <Link href="/workspaces/trash">

              <Trash2 className="size-4" />
              Trash
              {trashCount > 0 && (
                <span
                  aria-label={`${trashCount} in trash`}
                  className="rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground"
                >
                  {trashCount}
                </span>
              )}
            </Link>


          </Button>
          <WorkspaceDialog
            trigger={
              <Button className="gap-2">
                <Plus className="size-4" />
                New workspace
              </Button>
            }
          />
        </div>
      </div>

      {workspaces.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 py-16 text-center text-sm text-muted-foreground">
          No workspaces yet. Start one from the dashboard or with New workspace.
        </p>
      ) : (
        <WorkspaceBoard
          workspaces={workspaces.map(withLastActivity)}
          initialQuery={query}
          initialStatuses={statuses}
        />
      )}
    </div>
  );
}