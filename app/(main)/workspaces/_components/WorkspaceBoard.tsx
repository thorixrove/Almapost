"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { deleteWorkspace, moveWorkspace } from "@/actions/workspace";
import type { WorkspaceStatus } from "@/lib/generated/prisma/enums";
import { WORKSPACE_STATUSES } from "@/lib/workspace-status";
import { buildFilterSearch, matchesQuery } from "@/lib/workspace-filter";
import { WorkspaceDialog } from "@/components/WorkspaceDialog";
import { WorkspaceCard, type WorkspaceCardData } from "@/components/WorkspaceCard";
import { WorkspaceFilterBar } from "./WorkspaceFilterBar";
import { Button } from "@/components/ui/button";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type BoardWorkspace = WorkspaceCardData & { position: number };

function columnItems(workspaces: BoardWorkspace[], status: WorkspaceStatus) {
  return workspaces.filter((w) => w.status === status).sort((a, b) => a.position - b.position);
}

// Midpoint between the new neighbors, so only the dropped card needs saving.
function positionBetween(before?: BoardWorkspace, after?: BoardWorkspace) {
  if (before && after) return (before.position + after.position) / 2;
  if (before) return before.position + 1;
  if (after) return after.position - 1;
  return 0;
}

export function WorkspaceBoard({
  workspaces,
  initialQuery,
  initialStatuses = []
}: {
  workspaces: BoardWorkspace[]
  initialQuery?: string
  initialStatuses?: WorkspaceStatus[]
}) {
  const [items, setItems] = useState(workspaces)

  // Re-sync when the server sends a fresh list (e.g. after creating a workspace).
  const [prevWorkspaces, setPrevWorkspaces] = useState(workspaces);
  if (workspaces !== prevWorkspaces) {
    setPrevWorkspaces(workspaces);
    setItems(workspaces);
  }

  const [query, setQuery] = useState(initialQuery ?? "")
  const [statuses, setStatuses] = useState<WorkspaceStatus[]>(initialStatuses)
  const isFiltering = query.trim() !== "" || statuses.length > 0

  const queryMatches = useMemo(() => items.filter((w) => matchesQuery(w, query)), [items, query])
  const visibleItems = useMemo(
    () => (statuses.length > 0 ? queryMatches.filter((w) => statuses.includes(w.status)) : queryMatches),
    [queryMatches, statuses],
  )
  const visibleColumns = statuses.length > 0 ? WORKSPACE_STATUSES.filter((c) => statuses.includes(c.status)) : WORKSPACE_STATUSES
  const statusCounts = useMemo(() => {
    const counts: Record<WorkspaceStatus, number> = { PLANNING: 0, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 0 }
    for (const w of queryMatches) counts[w.status] += 1
    return counts
  }, [queryMatches])

  const clearFilters = () => {
    setQuery("")
    setStatuses([])
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      const search = buildFilterSearch(query, statuses)
      if (search !== window.location.search) {
        window.history.replaceState(null, "", `${window.location.pathname}${search}`);
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, statuses])







  // `selected` outlives the open flag, so dialog text doesn't blank out during the close animation.
  const [selected, setSelected] = useState<BoardWorkspace | null>(null);
  const [openDialog, setOpenDialog] = useState<"edit" | "delete" | null>(null);

  const openFor = (workspace: BoardWorkspace, dialog: "edit" | "delete") => {
    setSelected(workspace);
    setOpenDialog(dialog);
  };

  // Optimistic: kartu hilang dan dialog tertutup seketika, penghapusan berjalan di latar belakang.
  // Kalau gagal, kartu dikembalikan dan toast error muncul.
  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!selected) return;

    const previous = items;
    const id = selected.id;
    setItems(items.filter((w) => w.id !== id));
    setOpenDialog(null);

    try {
      await deleteWorkspace(id);
    } catch (err) {
      setItems(previous);
      toast.error(err instanceof Error ? err.message : "Gagal menghapus workspace");
    }
  };

  const handleDragEnd = async ({ draggableId, source, destination }: DropResult) => {
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const status = destination.droppableId as WorkspaceStatus;
    const target = columnItems(visibleItems, status).filter((w) => w.id !== draggableId);
    const position = positionBetween(target[destination.index - 1], target[destination.index]);

    const previous = items;
    setItems(items.map((w) => (w.id === draggableId ? { ...w, status, position } : w)));

    try {
      await moveWorkspace(draggableId, status, position);
    } catch {
      setItems(previous);
      toast.error("Couldn't move workspace");
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      {items.length > 0 && (
        <WorkspaceFilterBar
          query={query}
          onQueryChange={setQuery}
          statuses={statuses}
          onStatusesChange={setStatuses}
          counts={statusCounts}
          resultCount={visibleItems.length}
          totalCount={items.length}
          onClear={clearFilters}
        />
      )}
      {isFiltering && visibleItems.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/10 py-16 text-center text-sm text-muted-foreground">
          <p>No workspaces match your search.</p>
          <Button variant="link" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )}

      <div
        className={`grid gap-4 md:grid-cols-2 xl:grid-cols-4 ${isFiltering && visibleItems.length === 0 ? "hidden" : ""
          }`}
      >
        {visibleColumns.map((column) => {
          const columnWorkspaces = columnItems(visibleItems, column.status);
          const columnTotal = items.filter((w) => w.status === column.status).length;
          return (
            <div key={column.status} className="flex flex-col rounded-lg bg-white/3">
              <div className="flex items-center gap-2 px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {column.title}
                <span className="font-normal">
                  {isFiltering ? `${columnWorkspaces.length}/${columnTotal}` : columnWorkspaces.length}
                </span>
              </div>
              <Droppable droppableId={column.status}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex min-h-40 flex-1 flex-col gap-1.5 rounded-b-lg p-2 transition-colors ${snapshot.isDraggingOver ? "bg-primary/5" : ""
                      }`}
                  >
                    {columnWorkspaces.map((workspace, index) => (
                      <Draggable key={workspace.id} draggableId={workspace.id} index={index}>
                        {(provided, snapshot) => (
                          <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
                            <WorkspaceCard
                              workspace={workspace}
                              highlighted={snapshot.isDragging}
                              actions={
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label="Workspace options"
                                      className="absolute top-2 right-2 size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                                    >
                                      <MoreHorizontal className="size-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onSelect={() => openFor(workspace, "edit")}>
                                      <Pencil className="size-4" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem variant="destructive" onSelect={() => openFor(workspace, "delete")}>
                                      <Trash2 className="size-4" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              }
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>

      {
        selected && (
          <WorkspaceDialog
            workspace={selected}
            open={openDialog === "edit"}
            onOpenChange={(open) => !open && setOpenDialog(null)}
          />
        )
      }

      <AlertDialog open={openDialog === "delete"} onOpenChange={(open) => !open && setOpenDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{selected?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the workspace, including its doc and canvas. It can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DragDropContext >
  );
}