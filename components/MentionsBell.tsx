"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getUnreadMentions } from "@/actions/comment";
import { toPlainText } from "@/lib/comment-body";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const REFRESH_MS = 5 * 60 * 1000;

type Mention = Awaited<ReturnType<typeof getUnreadMentions>>[number];

export function MentionBell() {
    const [mentions, setMentions] = useState<Mention[]>([])

    useEffect(() => {
        const load = () => {
            if (document.visibilityState !== "visible") return
            getUnreadMentions().then(setMentions).catch(() => { })
        }
        load()
        const interval = setInterval(load, REFRESH_MS)
        document.addEventListener("visibilitychange", load)
        return () => {
            clearInterval(interval)
            document.removeEventListener("visibilitychange", load)
        }
    }, [])

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" aria-label={`Mentions (${mentions.length} unread)`}>
                    <Bell className="size-4"/>
                    {mentions.length > 0 && (
                        <span className="absolute top-0.5 right-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-semibold text-primary-foreground">
                            {mentions.length > 9 ? "9+" : mentions.length}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
                {mentions.length === 0 ? (
                    <p className="px-2 py-6 text-center text-sm text-muted-foreground">No new mentions.</p>
                ): (
                        mentions.map((mention) => (
                <DropdownMenuItem key={mention.commentId} asChild className="flex-col items-start gap-0.5">
                    <Link href={`/workspace/${mention.workspaceId}`}>
                        <span className="text-sm">
                            <span className="font-medium">{mention.authorName}</span> mentioned you in{" "}
                            <span className="font-medium">{mention.workspaceName}</span>
                        </span>
                        <span className="line-clamp-2 text-xs text-muted-foreground">{toPlainText(mention.body)}</span>
                        <span className="text-[11px] text-muted-foreground">
                            {formatDistanceToNow(mention.createdAt, { addSuffix: true })}
                        </span>
                    </Link>
                </DropdownMenuItem>
                ))
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}