import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
    it("mengizinkan sampai batas lalu menolak", () => {
        const check = createRateLimiter(3, 60_000)
        expect(check("u1", 0)).toEqual({ ok: true, remaining: 2 });
        expect(check("u1", 1)).toEqual({ ok: true, remaining: 1 });
        expect(check("u1", 2)).toEqual({ ok: true, remaining: 0 });
        expect(check("u1", 3).ok).toBe(false);
    })

    it("menghitung retryAfter dari permintaan tertua di jendela", () => {
        const check = createRateLimiter(1, 60_000)
        check("u1", 10_000)
        const res = check("u1", 20_000)
        expect(res).toEqual({ ok: false, retryAfterSeconds: 50 })
    })

    it("membuka lagi setelah jendela lewat", () => {
        const check = createRateLimiter(1, 1000)
        check("u1", 0)
        expect(check("u1", 500).ok).toBe(false);
        expect(check("u1", 1001).ok).toBe(true);
    })

    it("memisahkan hitungan per user", () => {
        const check = createRateLimiter(1, 60_000);
        expect(check("a", 0).ok).toBe(true);
        expect(check("b", 0).ok).toBe(true);
        expect(check("a", 1).ok).toBe(false);
    })
})