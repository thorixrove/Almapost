"use client";

import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import type { WorkspaceStatus } from "@/lib/generated/prisma/enums";
import { WORKSPACE_STATUSES } from "@/lib/workspace-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
    query: string
    onQueryChange: (query: string) => void
    statuses: WorkspaceStatus[]
    onStatusesChange: (statuses: WorkspaceStatus[]) => void
    counts: Record<WorkspaceStatus, number>
    resultCount: number
    totalCount: number
    onClear: () => void
}

export function WorkspaceFilterBar({
    query,
    onQueryChange,
    statuses,
    onStatusesChange,
    counts,
    resultCount,
    totalCount,
    onClear,
}: Props) {
    const inputRef = useRef<HTMLInputElement>(null)
    const isFiltering = query.trim() !== "" || statuses.length > 0

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return
            const target = e.target as HTMLElement | null
            if (target?.closest("input, textarea, select, [contenteditable='true']")) return
            e.preventDefault()
        }
        document.addEventListener("keydown", onKeyDown)
        return () => document.removeEventListener("keydown", onKeyDown)
    }, [])

    const toggleStatus = (status: WorkspaceStatus) =>
        onStatusesChange(status.includes(status) ? statuses.filter((s) => s !== status) : [...statuses, status])

    return (
        <div className="mb-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full max-w-sm">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        ref={inputRef}
                        type="text"
                        inputMode="search"
                        autoComplete="off"
                        value={query}
                        onChange={(e) => onQueryChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key !== "Escape") return
                            if (query) onQueryChange("")
                            else e.currentTarget.blur()
                        }}
                        placeholder="Search workspaces…  ( / )"
                        aria-label="Search workspaces"
                        className="pr-8 pl-8"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => {
                                onQueryChange("");
                                inputRef.current?.focus();
                            }}
                            aria-label="Clear search"
                            className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                        >
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>

                {isFiltering && (
                    <Button variant="ghost" size="sm" onClick={onClear}>
                        Clear filters
                    </Button>
                )}

                <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
                    {isFiltering ? `${resultCount} of ${totalCount} workspaces` : `${totalCount} workspaces`}
                </p>
            </div>

            <div  className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
                {WORKSPACE_STATUSES.map(({ status, title }) => {
                    const active = statuses.includes(status)
                    return (
                        <button
                            key={status}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleStatus(status)}
                            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${active
                                ? "bg-primary/15 text-primary ring-primary/40"
                                : "bg-white/5 text-muted-foreground ring-white/6 hover:bg-white/10 hover:text-foreground"
                                }`}
                        >
                            {title}
                            <span className="font-normal opacity-70">{counts[status]}</span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}