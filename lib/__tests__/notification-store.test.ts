import { describe, expect, it, vi } from "vitest";
import { listNotifications, markCommentNotificationsRead } from "@/lib/notification-store";

describe("markCommentNotificationsRead", () => {
    it("menandai hanya balasan dan thread selesai di workspace itu untuk user itu", async () => {
        const updateMany = vi.fn().mockResolvedValue({ count: 2 })
        await markCommentNotificationsRead({ notification: { updateMany } } as never, { userId: "u1", workspaceId: "ws1" })

        expect(updateMany).toHaveBeenCalledTimes(1)
        const arg = updateMany.mock.calls[0][0]
        expect(arg.where).toEqual({
            userId: "u1",
            workspaceId: "ws1",
            readAt: null,
            type: { in: ["COMMENT_REPLY", "THREAD_RESOLVED"] },
        })
        expect(arg.data.readAt).toBeInstanceOf(Date)
    })
})

describe("listNotifications", () => {
    it("memberi tipe: tipe notifikasi aslinya, dan MENTION untuk mention", async () => {
        const now = new Date()
        const db = {
            notification: {
                findMany: vi.fn().mockResolvedValue([
                    {
                        id: "n1",
                        type: "COMMENT_REPLY",
                        data: null,
                        readAt: null,
                        createdAt: now,
                        workspaceId: "ws1",
                        workspace: { name: "W" },
                        actor: { name: "Ani", email: "ani@x.id" },
                    },
                ]),
            },
            commentMention: {
                findMany: vi.fn().mockResolvedValue([
                    {
                        readAt: null,
                        comment: {
                            id: "c1",
                            body: "halo @[Budi](u9)",
                            createdAt: new Date(now.getTime() - 1000),
                            workspaceId: "ws1",
                            workspace: { name: "W" },
                            author: { name: "Cici", email: "cici@x.id" },
                        },
                    },
                ]),
            },
        }

        const items = await listNotifications(db as never, { userId: "u1", limit: 10 })
        expect(items.map((i) => [i.source, i.type, i.unread])).toEqual([
            ["notification", "COMMENT_REPLY", true],
            ["mention", "MENTION", true],
        ])
    })
})