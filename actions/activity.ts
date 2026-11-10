"use server";

import { canAccessWorkspace } from "@/lib/workspace-access";
import { prisma } from "@/lib/prisma";
import { listActivity } from "@/lib/activity";

// Log aktivitas boleh dilihat siapa pun yang punya akses baca (viewer termasuk).
export async function getActivity(workspaceId: string) {
    if (!(await canAccessWorkspace(workspaceId))) throw new Error("Workspace not found")
    return listActivity(prisma, workspaceId)
}