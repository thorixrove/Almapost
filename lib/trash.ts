
export const TRASH_RETENTION_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

export function trashCutoff(now = new Date()) {
    return new Date(now.getTime() - TRASH_RETENTION_DAYS * DAY_MS)
}

export function daysLeftInTrash(deletedAt: Date, now = new Date()) {
    const remainingMs = deletedAt.getTime() + TRASH_RETENTION_DAYS * DAY_MS - now.getTime()
    return Math.max(0, Math.ceil(remainingMs / DAY_MS))
}