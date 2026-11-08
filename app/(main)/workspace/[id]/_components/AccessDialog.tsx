"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { toast } from "sonner";
import type { WorkspaceRole } from "@/lib/generated/prisma/enums";
import { changeDefaultRole, changeMemberAccess, getAccessSettings, type AccessSettings } from "@/actions/access";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

const ROLE_LABEL: Record<WorkspaceRole, string> = { EDITOR: "Can edit", VIEWER: "View only" };
const selectClass =
    "h-8 rounded-md border border-white/10 bg-background px-2 text-sm outline-none focus-visible:border-primary/50 disabled:opacity-60";

// Untuk pemilik workspace organisasi: peran bawaan anggota, dan peran khusus per orang. Viewer bisa membaca
// dan berkomentar, tapi tidak mengubah apa pun. Pembuat dan admin organisasi selalu pemilik.
export function AccessDialog({ workspaceId }: { workspaceId: string }) {
    const [open, setOpen] = useState(false);
    const [settings, setSettings] = useState<AccessSettings | null>(null);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try {
            setSettings(await getAccessSettings(workspaceId));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Couldn't load access settings");
        }
    };

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (next) void load();
    };

    const updateDefault = async (role: WorkspaceRole) => {
        setBusy(true);
        try {
            await changeDefaultRole(workspaceId, role);
            await load();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Couldn't change the role");
        } finally {
            setBusy(false);
        }
    };

    const updateMember = async (userId: string, value: string) => {
        setBusy(true);
        try {
            await changeMemberAccess(workspaceId, userId, value === "" ? null : (value as WorkspaceRole));
            await load();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Couldn't change the role");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                    <Users className="size-4" />
                    Access
                </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Who can do what</DialogTitle>
                    <DialogDescription>
                        Organization members can open this workspace. View only means they can read and comment, but not change
                        anything. The creator and org admins can always edit.
                    </DialogDescription>
                </DialogHeader>

                {settings === null ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-4">
                            <Label htmlFor="default-role">Organization members</Label>
                            <select
                                id="default-role"
                                className={selectClass}
                                value={settings.memberRole}
                                disabled={busy}
                                onChange={(e) => updateDefault(e.target.value as WorkspaceRole)}
                            >
                                <option value="EDITOR">{ROLE_LABEL.EDITOR}</option>
                                <option value="VIEWER">{ROLE_LABEL.VIEWER}</option>
                            </select>
                        </div>

                        <div className="max-h-72 space-y-1 overflow-y-auto">
                            {settings.members.map((member) => (
                                <div key={member.userId} className="flex items-center justify-between gap-4 rounded-md bg-white/3 px-3 py-2">
                                    <span className="truncate text-sm">{member.name}</span>
                                    {member.isOwner ? (
                                        <span className="text-xs text-muted-foreground">Owner</span>
                                    ) : (
                                        <select
                                            aria-label={`Role for ${member.name}`}
                                            className={selectClass}
                                            value={member.override ?? ""}
                                            disabled={busy}
                                            onChange={(e) => updateMember(member.userId, e.target.value)}
                                        >
                                            <option value="">Same as everyone ({ROLE_LABEL[settings.memberRole]})</option>
                                            <option value="EDITOR">{ROLE_LABEL.EDITOR}</option>
                                            <option value="VIEWER">{ROLE_LABEL.VIEWER}</option>
                                        </select>
                                    )}
                                </div>
                            ))}
                        </div>

                        {settings.truncated && (
                            <p className="text-xs text-muted-foreground">Only the first 100 organization members are shown.</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                            Members who haven&apos;t opened Almapost yet aren&apos;t listed. They follow the setting for everyone.
                        </p>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}