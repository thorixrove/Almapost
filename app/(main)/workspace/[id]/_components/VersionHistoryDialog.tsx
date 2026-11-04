"use client";

import { useEffect, useState } from "react";
import { History, RotateCcw, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import type { PartialBlock } from "@blocknote/core";
import type { TLStoreSnapshot } from "tldraw";
import {
    createVersion,
    deleteVersion,
    getVersionContent,
    listVersions,
    type VersionSummary,
} from "@/actions/version";
import { restoreCanvasSnapshot } from "@/lib/version-snapshot";
import { useWorkspaceEditors } from "@/components/WorkspaceEditorsContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

// Versi otomatis: satu kali tak lama setelah halaman dibuka (menangkap kondisi sebelum sesi ini mengedit),
// lalu berkala. Server melewatinya kalau tidak ada yang berubah atau baru saja dibuat.
const AUTO_FIRST_DELAY_MS = 15_000;
const AUTO_INTERVAL_MS = 10 * 60 * 1000;

function useAutoSnapshots(workspaceId: string) {
    useEffect(() => {
        const run = () => {
            if (document.visibilityState !== "visible") return
            createVersion(workspaceId, "AUTO").catch(() => { })
        }
        const first = setTimeout(run, AUTO_FIRST_DELAY_MS)
        const interval = setInterval(run, AUTO_INTERVAL_MS)
        return () => {
            clearTimeout(first)
            clearInterval(interval)
        }
    }, [workspaceId])
}

function versionTitle(version: VersionSummary) {
    if (version.label) return version.label
    return version.kind === "AUTO" ? "Auto-saved" : version.kind === "BEFORE_RESTORE" ? "Before restore" : "Saved version"
}

export function VersionHistoryDialog({ workspaceId }: { workspaceId: string }) {
    useAutoSnapshots(workspaceId)

    const { docEditor, canvasEditor } = useWorkspaceEditors();
    const [open, setOpen] = useState(false);
    const [versions, setVersions] = useState<VersionSummary[] | null>(null);
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);

    const [target, setTarget] = useState<VersionSummary | null>(null);
    const [restoreDoc, setRestoreDoc] = useState(true);
    const [restoreCanvas, setRestoreCanvas] = useState(true);
    const [restoring, setRestoring] = useState(false);

    const refresh = async () => {
        try {
            setVersions(await listVersions(workspaceId))
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Couldn't load version history")
        }
    }

    const handleOpenChange = (next: boolean) => {
        setOpen(next)
        if (next) {
            setTarget(null)
            void refresh()
        }
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const result = await createVersion(workspaceId, "MANUAL", name)
            if ("limit" in result) {
                toast.error("You've reached the limit of saved versions. Delete an old one first.");
                return;
            }
            setName("")
            toast.success("Version saved")
            await refresh()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Couldn't save version")
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (version: VersionSummary) => {
        const previous = versions
        setVersions((current) => current?.filter((v) => v.id !== version.id) ?? null)
        try {
            await deleteVersion(workspaceId, version.id)
        } catch (error) {
            setVersions(previous)
            toast.error(error instanceof Error ? error.message : "Couldn't delete version")
        }
    }

    const startRestore = (version: VersionSummary) => {
        setTarget(version)
        setRestoreDoc(!!docEditor)
        setRestoreCanvas(!!canvasEditor)
    }

    const handleRestore = async () => {
        if (!target) return
        setRestoring(true)
        try {
            await createVersion(workspaceId, "BEFORE_RESTORE", `Before restoring “${versionTitle(target)}”`)
            const content = await getVersionContent(workspaceId, target.id)

            if (restoreDoc && docEditor) {
                const blocks = Array.isArray(content.doc) && content.doc.length > 0 ? (content.doc as PartialBlock[]) : []
                docEditor.replaceBlocks(docEditor.document, blocks.length > 0 ? blocks : [{ type: "paragraph" }])
            }
            if (restoreCanvas && canvasEditor) {
                restoreCanvasSnapshot(canvasEditor, content.canvas as { document: TLStoreSnapshot } | null)
            }

            toast.success("Version restored")
            setTarget(null)
            await refresh()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Couldn't restore version")
        } finally {
            setRestoring(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                    <History className="size-4" />
                    History
                </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-lg">
                {target ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>Restore &ldquo;{versionTitle(target)}&rdquo;?</DialogTitle>
                            <DialogDescription>
                                This replaces what&apos;s there now for everyone on this workspace. The current state is saved first as
                                &ldquo;Before restore&rdquo;, so you can go back.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between gap-4">
                                <Label htmlFor="restore-doc">Document</Label>
                                <Switch id="restore-doc" checked={restoreDoc} onCheckedChange={setRestoreDoc} disabled={!docEditor} />
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <Label htmlFor="restore-canvas">Canvas</Label>
                                <Switch
                                    id="restore-canvas"
                                    checked={restoreCanvas}
                                    onCheckedChange={setRestoreCanvas}
                                    disabled={!canvasEditor}
                                />
                            </div>
                            {(!docEditor || !canvasEditor) && (
                                <p className="text-xs text-muted-foreground">
                                    {!canvasEditor
                                        ? "The canvas isn't open. Switch to the Both or Canvas view to restore it."
                                        : "The document isn't open. Switch to the Both or Document view to restore it."}
                                </p>
                            )}
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setTarget(null)} disabled={restoring}>
                                Back
                            </Button>
                            <Button onClick={handleRestore} disabled={restoring || (!restoreDoc && !restoreCanvas)}>
                                {restoring ? "Restoring…" : "Restore"}
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle>Version history</DialogTitle>
                            <DialogDescription>
                                Save a version before big changes. Versions are also saved automatically while you work.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex gap-2">
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && !saving && void handleSave()}
                                placeholder="Name this version (optional)"
                                aria-label="Version name"
                                maxLength={80}
                            />
                            <Button onClick={handleSave} disabled={saving}>
                                {saving ? "Saving…" : "Save version"}
                            </Button>
                        </div>

                        <div className="-mx-1 flex max-h-80 flex-col gap-1 overflow-y-auto px-1">
                            {versions === null ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
                            ) : versions.length === 0 ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">No versions yet.</p>
                            ) : (
                                versions.map((version) => (
                                    <div key={version.id} className="flex items-start gap-2 rounded-md bg-white/3 p-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate text-sm font-medium">{versionTitle(version)}</span>
                                                {version.kind !== "MANUAL" && (
                                                    <Badge variant="secondary">{version.kind === "AUTO" ? "Auto" : "Backup"}</Badge>
                                                )}
                                            </div>
                                            {version.preview && (
                                                <p className="truncate text-xs text-muted-foreground">{version.preview}</p>
                                            )}
                                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                                                {formatDistanceToNow(version.createdAt, { addSuffix: true })}
                                                {version.createdBy?.name ? ` · ${version.createdBy.name}` : ""}
                                                {` · ${version.shapeCount} ${version.shapeCount === 1 ? "shape" : "shapes"}`}
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-7"
                                            aria-label="Restore this version"
                                            onClick={() => startRestore(version)}
                                        >
                                            <RotateCcw className="size-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-7"
                                            aria-label="Delete this version"
                                            onClick={() => handleDelete(version)}
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}