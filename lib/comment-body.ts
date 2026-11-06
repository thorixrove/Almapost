export const MAX_COMMENT_LENGTH = 2000

export type Mentionable = { id: string; name: string }

export type BodySegment =
    | { type: "text"; text: string }
    | { type: "mention"; name: string; userId: string }

const TOKEN = /@\[([^\]]*)\]\(([A-Za-z0-9]+)\)/g

function cleanName(name: string) {
    return name.replace(/[[\]()\r\n]/g, "").trim() || "user"
}

export function formatMention(user: Mentionable) {
    return `@[${cleanName(user.name)}](${user.id})`
}

export function splitBody(body: string): BodySegment[] {
    const segments: BodySegment[] = []
    let last = 0
    for (const match of body.matchAll(TOKEN)) {
        const index = match.index ?? 0
        if (index > last) segments.push({ type: "text", text: body.slice(last, index) })
        segments.push({ type: "mention", name: match[1], userId: match[2] })
        last = index + match[0].length
    }
    if (last < body.length) segments.push({ type: "text", text: body.slice(last) })
    return segments
}

export function toPlainText(body: string) {
    return splitBody(body)
        .map((segment) => (segment.type === "text" ? segment.text : `@${segment.name}`))
        .join("")
}

export function extractMentionIds(body: string): string[] {
    const ids: string[] = []
    for (const match of body.matchAll(TOKEN)) {
        if (!ids.includes(match[2])) ids.push(match[2])
    }
    return ids
}

export function sanitizeMentions(body: string, allowedIds: ReadonlySet<string>) {
    return body.replace(TOKEN, (token, name: string, id: string) => (allowedIds.has(id) ? token : `@${name}`))
}

export type PickedMention = Mentionable

function isWordChar(char: string | undefined) {
    return !!char && /[\p{L}\p{N}_]/u.test(char)
}

export function encodeMentions(text: string, picked: PickedMention[]) {
    const candidates = { ...picked }.sort((a, b) => cleanName(b.name).length - cleanName(a.name).length)
    let result = ""
    let i = 0
    while (i < text.length) {
        if (text[i] === "@" && !isWordChar(text[i - 1])) {
            const hit = candidates.find((user) => {
                const name = cleanName(user.name)
                return text.startsWith(name, i + 1) && !isWordChar(text[i + 1 + name.length])
            })
            if (hit) {
                result += formatMention(hit)
                i += 1 + cleanName(hit.name).length
                continue
            }
        }
        result += text[i]
        i += 1
    }
    return result
}

export function decodeMentions(body: string) {
    const picked: PickedMention[] = []
    const text = body.replace(TOKEN, (_token, name: string, id: string) => {
        if (!picked.some((user) => user.id === id)) picked.push({ id, name })
        return `@${name}`
    })
    return { text, picked }
}

export function activeMentionQuery(text: string, caret: number) {
    const match = /(?:^|\s)@([^\s@]*)$/.exec(text.slice(0, caret))
    if (!match) return null
    const query = match[1]
    return {query, start: caret - query.length - 1}
}

export function matchMembers(members: Mentionable[], query: string, limit = 6) {
    const q = query.toLowerCase()
    const starts = members.filter((m) => m.name.toLowerCase().startsWith(q))
    const contains = members.filter((m) => !m.name.toLowerCase().startsWith(q) && m.name.toLowerCase().includes(q))
    return [...starts, ...contains].slice(0, limit)
}