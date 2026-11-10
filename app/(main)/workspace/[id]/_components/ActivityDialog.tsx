"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { getActivity } from "@/actions/activity";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

type Entry = Awaited<ReturnType<typeof getActivity>>[number];

export function ActivityDialog({ workspaceId }: { workspaceId: string }) {
    const [entries, setEntries] = useState<Entry[] | null>(null)

    const handleOpenChange = async (open: boolean) => {
        if (!open) return
        setEntries(null)
        try {
            setEntries(await getActivity(workspaceId))
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Couldn't load activity")
            setEntries([])
        }
    }

    return (
        <Dialog onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                    <Activity className="size-4" />
                    Activity
                </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Activity</DialogTitle>
                    <DialogDescription>
                        What happened in this workspace. Edits to the doc and canvas aren&apos;t listed; use version history to
                        go back to an earlier state.
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-96 overflow-y-auto">
                    {entries === null ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
                    ) : entries.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">No activity yet.</p>
                    ) : (
                        <ul className="space-y-3">
                            {entries.map((entry) => (
                                <li key={entry.id} className="text-sm">
                                    <span className="font-medium">{entry.actorName}</span> {entry.text}
                                    <span className="block text-xs text-muted-foreground">
                                        {formatDistanceToNow(entry.createdAt, { addSuffix: true})}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}