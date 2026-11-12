import { describe, expect, it } from "vitest";
import {
    FREE_MONTHLY_PROMPTS,
    FREE_WORKSPACE_LIMIT,
    PROMPT_LIMIT_ERROR,
    UPGRADE_REASONS,
} from "@/lib/plan-limits";

describe("plan-limits", () => {
    it("memakai batas free plan yang diharapkan", () => {
        expect(FREE_WORKSPACE_LIMIT).toBe(3);
        expect(FREE_MONTHLY_PROMPTS).toBe(20);
    })

    it("punya pesan upgrade untuk setiap jenis batas", () => {
        expect(Object.keys(UPGRADE_REASONS).sort()).toEqual(["pdfExport", "prompts", "sharing", "workspaces"])
        for (const reason of Object.values(UPGRADE_REASONS)) {
            expect(reason.title.length).toBeGreaterThan(0)
            expect(reason.description.length).toBeGreaterThan(0)
        }
    })

    it("menyebut jumlah workspace free di pesan upgrade", () => {
        expect(UPGRADE_REASONS.workspaces.title).toContain(String(FREE_WORKSPACE_LIMIT))
        expect(UPGRADE_REASONS.workspaces.description).toContain(String(FREE_WORKSPACE_LIMIT))
    })

    it("kode error prompt stabil (dipakai server dan klien)", () => {
        expect(PROMPT_LIMIT_ERROR).toBe("prompt_limit_reached");
    });
})