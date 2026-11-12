export const COMMENTS_READ_EVENT = "almapost:comments-read"

export function announceCommentsRead(workspaceId: string) {
    if (typeof window === "undefined") return
    window.dispatchEvent(new CustomEvent<{ workspaceId: string }>(COMMENTS_READ_EVENT, { detail: { workspaceId } }))
}