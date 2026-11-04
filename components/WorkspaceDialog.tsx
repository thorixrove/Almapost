"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createWorkspace, updateWorkspace } from "@/actions/workspace";
import { createWorkspaceFromTemplate } from "@/actions/template";
import { TemplatePicker } from "@/components/TemplatePicker";
import { useUpgradeDialog } from "@/components/UpgradeDialog";
import { UPGRADE_REASONS } from "@/lib/plan-limits";
import { useFetch } from "@/hooks/use-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

type EditableWorkspace = { id: string; name: string; description: string | null };

export function WorkspaceDialog({
    workspace,
    trigger,
    open,
    onOpenChange,
}: {
    workspace?: EditableWorkspace
    trigger?: React.ReactNode
    open?: boolean
    onOpenChange?: (open: boolean) => void
}) {
    const [internalOpen, setInternalOpen] = useState(false)
    const isOpen = open ?? internalOpen
    const setOpen = onOpenChange ?? setInternalOpen

    return (
        <Dialog open={isOpen} onOpenChange={setOpen}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{workspace ? "Edit workspace" : "Create a workspace"}</DialogTitle>
                </DialogHeader>
                <WorkspaceForm workspace={workspace} onDone={() => setOpen(false)} />
            </DialogContent>
        </Dialog>
    )
}

function WorkspaceForm({ workspace, onDone }: { workspace?: EditableWorkspace; onDone: () => void }) {
    const [name, setName] = useState(workspace?.name ?? "")

    const [description, setDescription] = useState(workspace?.description ?? "")
    const [templateId, setTemplateId] = useState<string | null>(null)
    const router = useRouter()
    const { fn: createWorkspaceFn, loading: creating } = useFetch(createWorkspace)
    const { fn: updateWorkspaceFn, loading: updating } = useFetch(updateWorkspace)
    const { fn: createFromTemplateFn, loading: createFromTemplate } = useFetch(createWorkspaceFromTemplate)
    const loading = creating || updating || createFromTemplate

    const openUpgrade = useUpgradeDialog()

    const handleSubmit = async () => {
        if (workspace) {
            const updated = await updateWorkspaceFn(workspace.id, name, description)
            if (updated) onDone()
            return
        }
        const result = templateId
            ? await createFromTemplateFn(templateId, name, description)
            : await createWorkspaceFn(name, description)
        if (!result) return
        onDone()
        if ("limit" in result) return openUpgrade(UPGRADE_REASONS[result.limit])
        router.push(`/workspace/${result.workspace.id}`)
    }

    return (
        <>
            <div className="space-y-2">
                <Label htmlFor="workspace-name">Name</Label>
                <Input
                    id="workspace-name"
                    placeholder="Q1 Marketing Launch"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    autoFocus
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="workspace-description">
                    Description <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                    id="workspace-description"
                    placeholder="What's this workspace for?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                />
            </div>
            {!workspace && <TemplatePicker value={templateId} onChange={setTemplateId}/>}
            <DialogFooter>
                <Button onClick={handleSubmit} disabled={loading || !name.trim}>
                    {loading ? "Saving..." : workspace ? "Save" : "Create"}
                </Button>
            </DialogFooter>
        </>
    )
}