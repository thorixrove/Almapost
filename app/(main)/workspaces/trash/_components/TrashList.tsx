"use client";

import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import type { WorkspaceStatus } from "@/lib/generated/prisma/enums";
import { purgeWorkspace, restoreWorkspace } from "@/actions/trash";
import { daysLeftInTrash } from "@/lib/trash";
import { statusTitle } from "@/lib/workspace-status";
import { UPGRADE_REASONS } from "@/lib/plan-limits";
import { useUpgradeDialog } from "@/components/UpgradeDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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


type TrashItem = {
    id: string
    name: string
    description: string | null
    status: WorkspaceStatus
    deletedAt: Date
    canPurge: boolean
}

export function TrashList({ items: initialItems }: { items: TrashItem[] }) {
    const [items, setItems] = useState(initialItems)
    const [busyId, setBusyId] = useState<string | null>(null)

    const [toPurge, setToPurge] = useState<TrashItem | null>(null)
    const [purgeOpen, setPurgeOpen] = useState(false)
    const openUpgrade = useUpgradeDialog()

    const remove = (id: string) => setItems((current) => current.filter((item) => item.id !== id))

    const handleRestore = async (item: TrashItem) => {
        setBusyId(item.id)
        try {
            const result = await restoreWorkspace(item.id)
            if ("limit" in result) {
                openUpgrade(UPGRADE_REASONS[result.limit])
                return
            }
            remove(item.id)
            toast.success(`Restored “${item.name}”`)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Couldn't restore workspace")
        } finally {
            setBusyId(null)
        }
    }

    const handlePurge = async (e: React.MouseEvent) => {
        e.preventDefault()
        if (!toPurge) return

        const item = toPurge
        setBusyId(item.id)
        try {
            await purgeWorkspace(item.id)
            remove(item.id)
            setPurgeOpen(false)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Couldn't delete workspace")
        } finally {
            setBusyId(null)
        }
    }

    if (items.length === 0) {
        return (
            <p className="rounded-xl border border-dashed border-white/10 py-16 text-center text-sm text-muted-foreground">
                Couldn't delete workspace
            </p>
        )
    }


    return (
        <>
            <ul className="flex flex-col gap-2">
                {items.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 rounded-lg border border-white/6 bg-white/3 p-4">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="truncate font-medium">{item.name}</span>
                                <Badge variant="secondary">{item.status}</Badge>
                            </div>
                            {item.description && <p className="truncate text-sm text-muted-foreground">{item.description}</p>}
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                Moved to trash {formatDistanceToNow(item.deletedAt, { addSuffix: true })} ·{" "}
                                {daysLeftInTrash(item.deletedAt)} {daysLeftInTrash(item.deletedAt) === 1 ? "day" : "days"} left
                            </p>
                        </div>

                        <Button
                            variant="secondary"
                            size="sm"
                            className="gap-1.5"
                            disabled={busyId === item.id}
                            onClick={() => handleRestore(item)}
                        >
                            <RotateCcw />
                            Restore
                        </Button>
                        {item.canPurge && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1.5 text-destructive hover:text-destructive"
                                disabled={busyId === item.id}
                                onClick={() => {
                                    setToPurge(item);
                                    setPurgeOpen(true);
                                }}
                            >
                                <Trash2 className="size-4" />
                                Delete forever
                            </Button>
                        )}
                    </li>
                ))}
            </ul>

            <AlertDialog open={purgeOpen} onOpenChange={setPurgeOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete &ldquo;{toPurge?.name}&rdquo; forever?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This permanently deletes the workspace, including its doc, canvas, and saved versions. It can&apos;t be
                            undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={handlePurge}>
                            Delete forever
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}