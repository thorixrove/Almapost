type Hit = { timestamps: number[] }

export type RateLimitResult =
    | { ok: true; remaining: number }
    | { ok: false; retryAfterSeconds: number }

export function createRateLimiter(limit: number, windowMs: number, maxKeys = 5000) {
    const store = new Map<string, Hit>()

    return function check(key: string, now = Date.now()): RateLimitResult {
        const windowStart = now - windowMs
        const hit = store.get(key) ?? { timestamps: [] }
        hit.timestamps = hit.timestamps.filter((t) => t > windowStart)

        if (hit.timestamps.length >= limit) {
            const oldest = hit.timestamps[0]
            store.set(key, hit)
            return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) }
        }

        hit.timestamps.push(now)
        store.set(key, hit)

        if (store.size > maxKeys) {
            for (const [k, v] of store) {
                if (v.timestamps.every((t) => t <= windowStart)) store.delete(k)
            }
            if (store.size > maxKeys) store.clear()
        }
        return { ok: true, remaining: limit - hit.timestamps.length }
    }
}

export const RATE_LIMIT_ERROR = "rate_limited"