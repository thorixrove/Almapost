"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { NotificationListItem } from "@/actions/notification";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const REFRESH_MS = 5 * 60 * 1000
const FIRST_LOAD_DELAY_MS = 1500

async function fetchNotifications(): Promise<NotificationListItem[]> {
    const res = await fetch("/api/notifications", { cache: "no-store" })
    if (!res.ok) throw new Error("Gagal memuat notifikasi")
    return res.json()
}

async function postMarkRead(items?: { source: "notification" | "mention"; id: string }[]) {
    const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items })
    })
    if (!res.ok) throw new Error("Gagal menandai notifikasi")
}

export function NotificationsBell() {
    const [items, setItems] = useState<NotificationListItem[]>([])

    useEffect(() => {
        const load = () => {
            if (document.visibilityState !== "visible") return
            fetchNotifications().then(setItems).catch(() => { })
        }
        const first = setTimeout(load, FIRST_LOAD_DELAY_MS)
        const interval = setInterval(load, REFRESH_MS)
        document.addEventListener("visibilitychange", load)
        return () => {
            clearTimeout(first)
            clearInterval(interval)
            document.removeEventListener("visibilitychange", load)
        }
    }, [])

    const unreadCount = items.filter((item) => item.unread).length

    const markRead = (targets?: NotificationListItem[]) => {
        const keys = targets && new Set(targets.map((t) => t.key))
        setItems((current) => current.map((item) => (!keys || keys.has(item.key) ? { ...item, unread: false } : item)))
        postMarkRead(targets?.map(({ source, id }) => ({ source, id }))).catch(() =>
            fetchNotifications().then(setItems).catch(() => { })
        )
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications (${unreadCount} unread)`}>
                    <Bell className="size-4" />
                    {unreadCount > 0 && (
                        <span className="absolute top-0.5 right-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-semibold text-primary-foreground">
                            {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-96">
                <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="text-sm font-medium">Notifications</span>
                    {unreadCount > 0 && (
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => markRead()}>
                            Mark all as read
                        </Button>
                    )}
                </div>


                {items.length === 0 ? (
                    <p className="px-2 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
                ) : (
                    items.map((item) => (
                        <DropdownMenuItem key={item.key} asChild className="flex-col items-start gap-0.5">
                            <Link href={item.href} onClick={() => item.unread && markRead([item])}>
                                <span className={`text-sm ${item.unread ? "font-medium" : "text-muted-foreground"}`}>
                                    {item.unread && <span className="mr-1.5 inline-block size-1.5 rounded-full bg-primary align-middle" />}
                                    {item.text} <span className="text-muted-foreground">in</span> {item.workspaceName}
                                </span>
                                {item.snippet && <span className="line-clamp-2 text-xs text-muted-foreground">{item.snippet}</span>}
                                <span className="text-[11px] text-muted-foreground">
                                    {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                                </span>
                            </Link>
                        </DropdownMenuItem>
                    ))
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}