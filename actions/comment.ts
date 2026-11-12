"use server";

import { checkUser } from "@/actions/check-user";
import {
    commentSummary,
    createComment,
    deleteComment,
    listComments,
    setThreadResolved,
    unreadMentionsForUser,
    updateComment,
    markWorkspaceMentionsRead,
    userLabel,
    type Anchor
} from "@/lib/comment-store";
import { prisma } from "@/lib/prisma";
import { canAccessWorkspace } from "@/lib/workspace-access";
import { getMentionableMembers } from "@/lib/workspace-members";
import { auth } from "@clerk/nextjs/server";
import { recordActivity } from "@/lib/actor";
import { notify, markCommentNotificationsRead, markNotificationsRead } from "@/lib/notification-store";

async function context(workspaceId: string) {
    const user = await checkUser()
    if (!user) throw new Error("Not signed in")
    if (!(await canAccessWorkspace(workspaceId))) throw new Error("Workspace not found")

    const workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { clerkOrgId: true }
    })
    return { user, workspace }
}


async function mentionableIdSet(workspace: { clerkOrgId: string | null }, meId: string) {
    return new Set((await getMentionableMembers(workspace, meId)).map((member) => member.id))
}

export async function loadComments(workspaceId: string) {
    const { user, workspace } = await context(workspaceId)
    const { orgId, orgRole } = await auth()
    const isOrgAdmin = orgRole === "org:admin" && workspace.clerkOrgId === orgId

    const [rows, members] = await Promise.all([
        listComments(prisma, { workspaceId, viewerId: user.id }),
        getMentionableMembers(workspace, user.id)
    ])

    return {
        meId: user.id,
        meName: userLabel(user),
        members: members.map(({ id, name }) => ({ id, name })),
        comment: rows.map(({ authorId, ...row }: Awaited<ReturnType<typeof listComments>>[number]) => ({
            ...row,
            canEdit: authorId === user.id,
            canDelete: authorId === user.id || isOrgAdmin,
        })),
    }
}

export type CommentView = Awaited<ReturnType<typeof loadComments>>["comment"][number]

export async function postComment(
    workspaceId: string,
    body: string,
    options?: { parentId?: string; anchor?: Anchor }
) {
    const { user, workspace } = await context(workspaceId)
    const mentionableIds = body.includes("@[") ? await mentionableIdSet(workspace, user.id) : new Set<string>()
    const created = await createComment(prisma, {
        workspaceId,
        authorId: user.id,
        body,
        parentId: options?.parentId ?? null,
        anchor: options?.anchor ?? null,
        mentionableIds
    })

    await Promise.all([
        recordActivity(workspaceId, "COMMENT_ADDED", { reply: !!options?.parentId }, user.id),
        options?.parentId ? notifyThreadOwner(options.parentId, workspaceId, user.id) : null
    ])
    return created
}

async function notifyThreadOwner(parentId: string, workspaceId: string, actorId: string) {
    const root = await prisma.comment.findUnique({ where: { id: parentId }, select: { authorId: true } })
    if (root) await notify(prisma, { userId: root.authorId, workspaceId, actorId, type: "COMMENT_REPLY" })
}

export async function editComment(workspaceId: string, commentId: string, body: string) {
    const { user, workspace } = await context(workspaceId)
    
    await updateComment(prisma, {
        commentId,
        workspaceId,
        authorId: user.id,
        body,
        mentionableIds: body.includes("@[") ? await mentionableIdSet(workspace, user.id) : new Set<string>()
    })
}
export async function removeComment(workspaceId: string, commentId: string) {
    const { user, workspace } = await context(workspaceId)
    const { orgId, orgRole } = await auth()
    const comment = await prisma.comment.findFirst({
        where: { id: commentId, workspaceId },
        select: { authorId: true }
    })
    if (!comment) throw new Error("Comment not found")

    const isOrgAdmin = orgRole === "org:admin" && workspace.clerkOrgId === orgId
    if (comment.authorId !== user.id && !isOrgAdmin) {
        throw new Error("Only the author or an org admin can delete this comment")
    }
    await deleteComment(prisma, { commentId, workspaceId })
}

export async function resolveComment(workspaceId: string, commentId: string, resolved: boolean) {
    const { user } = await context(workspaceId)
    await setThreadResolved(prisma, { commentId, workspaceId, userId: user.id, resolved })

    await recordActivity(workspaceId, "THREAD_RESOLVED", { resolved }, user.id)
    if (resolved) {
        const root = await prisma.comment.findUnique({ where: { id: commentId }, select: { authorId: true } })
        if (root) await notify(prisma, { userId: root.authorId, workspaceId, actorId: user.id, type: "THREAD_RESOLVED" })
    }
}


export async function markCommentsRead(workspaceId: string) {
    const { user } = await context(workspaceId)
    await Promise.all([
        markWorkspaceMentionsRead(prisma, {userId: user.id, workspaceId}),
        markCommentNotificationsRead(prisma, { userId: user.id, workspaceId})
    ])
}

export async function getCommentSummary(workspaceId: string) {
    const user = await checkUser()
    if (!user) throw new Error("Not signed in")
    if (!(await canAccessWorkspace(workspaceId))) throw new Error("Workspace not found")

    return commentSummary(prisma, { workspaceId, userId: user.id })
}

const BELL_LIMIT = 30
const BELL_MAX_WORKSPACES = 10

export async function getUnreadMentions() {
    const user = await checkUser()
    if (!user) return []

    const rows = await unreadMentionsForUser(prisma, { userId: user.id, limit: BELL_LIMIT })
    const workspaceIds: string[] = [...new Set<string>(rows.map((row: { workspaceId: string }) => row.workspaceId))].slice(0, BELL_MAX_WORKSPACES)
    const accessible = new Set(
        (await Promise.all(workspaceIds.map(async (id) => ((await canAccessWorkspace(id)) ? id : null)))).filter(
            (id): id is string => id !== null
        )
    )

    return rows.filter((row: { workspaceId: string }) => accessible.has(row.workspaceId))
}