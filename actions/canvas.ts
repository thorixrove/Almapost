"use server";

import { requireEditAccess } from "@/lib/workspace-access";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";


export async function saveCanvasContent(workspaceId: string, content: Prisma.InputJsonValue) {
    await requireEditAccess(workspaceId)

    await prisma.canvas.update({

        where: { workspaceId },
        data: { content },
    })
}