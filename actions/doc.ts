"use server";

import * as Y from "yjs";
import { requireEditAccess  } from "@/lib/workspace-access";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";



export async function saveDocContent(
    workspaceId: string,
    yjsState: string,
    content: Prisma.InputJsonArray,
) {
    await requireEditAccess(workspaceId)

    const incoming = Buffer.from(yjsState, "base64")


    await prisma.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<{ yjsState: Uint8Array | null }[]>
            `SELECT "yjsState" FROM "Doc" WHERE "workspaceId" = ${workspaceId} FOR UPDATE`
        const merged = row?.yjsState ? Y.mergeUpdates([row.yjsState, incoming]) : incoming

        await tx.doc.update({
            where: { workspaceId },
            data: { yjsState: Uint8Array.from(merged), content },
        })
    })
}