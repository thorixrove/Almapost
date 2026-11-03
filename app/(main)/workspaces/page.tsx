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

export default async function WorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const user = await checkUser()
  if (!user) redirect("/sign-in")

  const { query, statuses } = parseFilterParams(await searchParams)

  const { orgName, where } = await getWorkspaceScope(user.id);

  const workspaces = await prisma.workspace.findMany({
    where,
    select: { ...workspaceCardSelect, position: true },
    orderBy: { position: "asc" },
  });

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