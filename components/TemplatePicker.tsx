"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteTemplate, listTemplates, type TemplateOption } from "@/actions/template";
import { Label } from "@/components/ui/label";

export function TemplatePicker({
    value,
    onChange,
}: {
    value: string | null
    onChange: (templateId: string | null) => void
}) {
    const [builtin, setBuiltin] = useState<TemplateOption[]>([])
    const [mine, setMine] = useState<TemplateOption[]>([])
    const [confirmingId, setConfirmingId] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        listTemplates()
            .then((result) => {
                if (cancelled) return
                setBuiltin(result.builtin)
                setMine(result.mine)
            })
            .catch(() => { })
        return () => {
            cancelled = true
        }
    }, [])

    const handleDelete = async (template: TemplateOption) => {
        if (confirmingId !== template.id) {
            setConfirmingId(template.id)
            return
        }
        setConfirmingId(null)
        try {
            await deleteTemplate(template.id)
            setMine((current) => current.filter((t) => t.id !== template.id))
            if (value === template.id) onChange(null)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Couldn't delete template")
        }
    }

    const option = (template: TemplateOption | null) => {
        const id = template?.id ?? null
        const selected = value === id
        return (
            <div key={id ?? "blank"} className="relative">
                <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onChange(id)}
                    className={`w-full rounded-md px-3 py-2 text-left ring-1 transition-colors ${selected ? "bg-primary/15 ring-primary/40" : "bg-white/5 ring-white/6 hover:bg-white/10"
                        }`}
                >
                    <span className="block truncate pr-6 text-xs font-medium">{template?.name ?? "Blank"}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                        {template ? (template.description ?? "Saved template") : "Start from scratch"}
                    </span>
                </button>
                {template?.canDelete && (
                    <button
                        type="button"
                        onClick={() => handleDelete(template)}
                        aria-label={confirmingId === template.id ? "Confirm delete template" : "Delete template"}
                        className={`absolute top-1.5 right-1.5 flex items-center gap-1 rounded-sm px-1 text-[11px] ${confirmingId === template.id ? "text-destructive" : "text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        {confirmingId === template.id ? "Delete?" : <Trash2 className="size-3.5" />}
                    </button>
                )}
            </div>
        )
    }

    return (
        <div className="space-y-2">
            <Label>Start from</Label>
            <div className="grid max-h-44 grid-cols-2 gap-2 overflow-y-auto pr-1">
                {option(null)}
                {builtin.map(option)}
                {mine.map(option)}
            </div>
        </div>
    )
}