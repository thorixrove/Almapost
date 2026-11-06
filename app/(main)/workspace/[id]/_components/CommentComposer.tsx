"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
    MAX_COMMENT_LENGTH,
    activeMentionQuery,
    decodeMentions,
    encodeMentions,
    matchMembers,
    type Mentionable,
    type PickedMention,
} from "@/lib/comment-body";
import { Button } from "@/components/ui/button";

export function CommentComposer({
    members,
    initialBody = "",
    placeholder,
    submitLabel,
    autoFocus,
    extra,
    onSubmit,
    onCancel,
}: {
    members: Mentionable[],
    initialBody?: string,
    placeholder: string,
    submitLabel: string,
    autoFocus?: boolean,
    extra?: ReactNode,
    onSubmit: (encodedBody: string) => Promise<void>,
    onCancel?: () => void,
}) {
    const initial = useMemo(() => decodeMentions(initialBody), [initialBody])
    const [text, setText] = useState(initial.text);
    const [picked, setPicked] = useState<PickedMention[]>(initial.picked);
    const [caret, setCaret] = useState(initial.text.length);
    const [highlight, setHighlight] = useState(0);

    const [dismissedAt, setDismissedAt] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const query = activeMentionQuery(text, caret);
    const suggestions = query && query.start !== dismissedAt ? matchMembers(members, query.query) : [];
    const activeIndex = Math.min(highlight, Math.max(suggestions.length - 1, 0));

    const tooLong = text.length > MAX_COMMENT_LENGTH;
    const canSubmit = !busy && text.trim().length > 0 && !tooLong;

    const choose = (member: Mentionable) => {
        if (!query) return
        const insert = `@${member.name} `
        const next = text.slice(0, query.start) + insert + text + text.slice(caret)
        const nextCaret = query.start + insert.length
        setText(next)
        setCaret(nextCaret)
        setPicked((current) => (current.some((m) => m.id === member.id) ? current : [...current, member]))
        setHighlight(0)
        requestAnimationFrame(() => {
            textareaRef.current?.focus()
            textareaRef.current?.setSelectionRange(nextCaret, nextCaret)
        })
    }

    const submit = async () => {
        if (!canSubmit) return
        setBusy(true)
        try {
            await onSubmit(encodeMentions(text.trim(), picked))
            setText("")
            setPicked([])
            setCaret(0)
        } catch {
        } finally {
            setBusy(false)
        }
    }

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (suggestions.length > 0) {
            if (e.key === "Arrowdown" || e.key === "ArrowUp") {
                e.preventDefault()
                const step = e.key === "Arrowdown" ? 1 : -1
                setHighlight((activeIndex + step + suggestions.length) % suggestions.length)
                return
            }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault()
                choose(suggestions[activeIndex])
                return
            }
            if (e.key === "Escape") {
                e.preventDefault()
                setDismissedAt(query?.start ?? null)
                return
            }
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void submit()
        }
        if (e.key === "Escape" && onCancel) onCancel()
    }

    return (
        <div className="space-y-2">
            <div className="relative">
                <textarea
                    ref={textareaRef}
                    value={text}
                    autoFocus={autoFocus}
                    rows={3}
                    placeholder={placeholder}
                    aria-label={placeholder}
                    onChange={(e) => {
                        setText(e.target.value);
                        setCaret(e.target.selectionStart);
                        setHighlight(0);
                    }}
                    onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
                    onKeyDown={onKeyDown}
                    className="w-full resize-none rounded-md border border-white/10 bg-white/3 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary/50"
                />

                {suggestions.length > 0 && (
                    <ul
                        role="listbox"
                        aria-label="Mention a member"
                        className="absolute right-0 left-0 z-10 mt-1 max-h-44 overflow-y-auto rounded-md border border-white/10 bg-popover p-1 shadow-lg"
                    >
                        {suggestions.map((member, index) => (
                            <li key={member.id} role="option" aria-selected={index === activeIndex}>
                                <button
                                    type="button"
                                    // onMouseDown, supaya klik tidak lebih dulu memindahkan fokus dari kolom ketik.
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        choose(member);
                                    }}
                                    className={`w-full truncate rounded-sm px-2 py-1.5 text-left text-sm ${index === activeIndex ? "bg-accent" : "hover:bg-accent/60"
                                        }`}
                                >
                                    {member.name}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {extra}

            <div className="flex items-center justify-between gap-2">
                <span className={`text-[11px] ${tooLong ? "text-destructive" : "text-muted-foreground"}`}>
                    {text.length > MAX_COMMENT_LENGTH * 0.8 ? `${text.length}/${MAX_COMMENT_LENGTH}` : "Ctrl/Cmd+Enter to send"}
                </span>
                <div className="flex gap-1.5">
                    {onCancel && (
                        <Button size="sm" variant="ghost" className="h-7" onClick={onCancel} disabled={busy}>
                            Cancel
                        </Button>
                    )}
                    <Button size="sm" className="h-7" onClick={submit} disabled={!canSubmit}>
                        {busy ? "Sending…" : submitLabel}
                    </Button>
                </div>
            </div>
        </div>
    )
}