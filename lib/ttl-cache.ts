type Entry<T> = { value: Promise<T>; expires: number };

export function ttlCache<T>(ttlMs: number, maxEntries = 500) {
    const store = new Map<string, Entry<T>>()

    return function get(key: string, loader: () => Promise<T>): Promise<T> {
        const now = Date.now()
        const hit = store.get(key)
        if (hit && hit.expires > now) return hit.value

        if (store.size >= maxEntries) {
            for (const [k, entry] of store) {
                if (entry.expires <= now) store.delete(k)
            }
            if (store.size >= maxEntries) store.clear()
        }

        const value = loader()
        store.set(key, { value, expires: now + ttlMs })
        value.catch(() => {
            if (store.get(key)?.value === value) store.delete(key)
        })
        return value
    }
}