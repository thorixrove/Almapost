import { Organization } from "@clerk/nextjs/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clerk = {
    billing: {
        getOrganizationBillingSubscription: vi.fn(),
        getUserBillingSubscription: vi.fn(),
    },
    Organization: { getOrganization: vi.fn() }
}
const prismaMock = {
    workspace: { findUniqueOrThrow: vi.fn() },
    agentPrompt: { count: vi.fn(), create: vi.fn() },
}

vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => clerk }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

async function loadBilling() {
    vi.resetModules()
    return await import("@/lib/billing");
}

const sub = (items: { status: string; features: string[] }[]) => ({
    subscriptionItems: items.map((i) => ({
        status: i.status,
        plan: { features: i.features.map((slug) => ({ slug })) }
    }))
})

beforeEach(() => {
    vi.clearAllMocks()
})

describe("workspaceOwnerId", () => {
    it("memakai org id jika ada, kalau tidak clerkId pembuat", async () => {
        const { workspaceOwnerId } = await loadBilling();
        expect(workspaceOwnerId({ clerkOrgId: "org_1", creator: { clerkId: "user_1" } })).toBe("org_1");
        expect(workspaceOwnerId({ clerkOrgId: null, creator: { clerkId: "user_1" } })).toBe("user_1");
    })

    it("getWorkspaceOwnerId membaca workspace dari database", async () => {
        const { getWorkspaceOwnerId } = await loadBilling();
        prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ clerkOrgId: null, creator: { clerkId: "user_9" } });
        await expect(getWorkspaceOwnerId("ws1")).resolves.toBe("user_9");
    })
})

describe("getEntitlements", () => {
    it("user free: batas 20 prompt dan tanpa fitur berbayar", async () => {
        const { getEntitlements } = await loadBilling()
        clerk.billing.getUserBillingSubscription.mockResolvedValue(sub([]))
        expect(await getEntitlements("user_free")).toEqual({
            isPaid: false,
            promptLimit: 20,
            unlimitedWorkspaces: false,
            publicSharing: false,
            pdfExport: false,
        })
    })


    it("user dengan paket 500: batas 500 dan fitur terbaca", async () => {
        const { getEntitlements } = await loadBilling()
        clerk.billing.getUserBillingSubscription.mockResolvedValue(
            sub([{ status: "active", features: ["agent_prompts_500", "public_sharing", "pdf_export"] }]),
        );
        const e = await getEntitlements("user_500")
        expect(e).toMatchObject({ isPaid: true, promptLimit: 500, publicSharing: true, pdfExport: true })
    })

    it("organisasi: batas dikali jumlah anggota, memakai API organisasi", async () => {
        const { getEntitlements } = await loadBilling()
        clerk.billing.getOrganizationBillingSubscription.mockResolvedValue(
            sub([{ status: "active", features: ["agent_prompts_2000", "unlimited_workspaces"] }]),
        );
        clerk.Organization.getOrganization.mockResolvedValue({ membersCount: 3 })
        const e = await getEntitlements("org_team")
        expect(e).toMatchObject({ isPaid: true, promptLimit: 6000, unlimitedWorkspaces: true });
        expect(clerk.billing.getUserBillingSubscription).not.toHaveBeenCalled();
    })

    it("paket 2000 menang atas 500 jika keduanya ada", async () => {
        const { getEntitlements } = await loadBilling()
        clerk.billing.getUserBillingSubscription.mockResolvedValue(
            sub([{ status: "active", features: ["agent_prompts_500", "agent_prompts_2000"] }]),
        )
        expect((await getEntitlements("user_both")).promptLimit).toBe(2000)
    })

    it("past_due masih dihitung, status lain (canceled) diabaikan", async () => {
        const { getEntitlements } = await loadBilling()
        clerk.billing.getUserBillingSubscription.mockResolvedValue(
            sub([
                { status: "past_due", features: ["agent_prompts_500"] },
                { status: "canceled", features: ["pdf_export"] }
            ])
        )
        const e = await getEntitlements("user_pastdue")
        expect(e).toMatchObject({ isPaid: true, promptLimit: 500, pdfExport: false });
    })

    it("jika Clerk gagal, jatuh ke free plan", async () => {
        const { getEntitlements } = await loadBilling()
        clerk.billing.getUserBillingSubscription.mockRejectedValue(new Error("clerk down"))
        expect(await getEntitlements("user_err")).toMatchObject({ isPaid: false, promptLimit: 20 })
    })

    it("hasil di-cache untuk owner yang sama", async () => {
        const { getEntitlements } = await loadBilling()
        clerk.billing.getUserBillingSubscription.mockResolvedValue(sub([]))
        await getEntitlements("user_cache");
        await getEntitlements("user_cache");
        expect(clerk.billing.getUserBillingSubscription).toHaveBeenCalledTimes(1);
    })
})

describe("getPromptUsage dan recordPrompt", () => {
    it("menggabungkan jumlah terpakai dan batas, hanya menghitung bulan ini (UTC)", async () => {
        const { getPromptUsage } = await loadBilling();
        clerk.billing.getUserBillingSubscription.mockResolvedValue(sub([]));
        prismaMock.agentPrompt.count.mockResolvedValue(7);
        expect(await getPromptUsage("user_usage")).toEqual({ used: 7, limit: 20, isPaid: false });

        const arg = prismaMock.agentPrompt.count.mock.calls[0][0];
        expect(arg.where.ownerId).toBe("user_usage");
        const start: Date = arg.where.createdAt.gte;
        expect(start.getUTCDate()).toBe(1);
        expect(start.getUTCHours()).toBe(0);
    });

    it("recordPrompt menyimpan ownerId, userId, workspaceId", async () => {
        const { recordPrompt } = await loadBilling();
        await recordPrompt("org_1", "u1", "ws1");
        expect(prismaMock.agentPrompt.create).toHaveBeenCalledWith({
            data: { ownerId: "org_1", userId: "u1", workspaceId: "ws1" },
        });
    });
});