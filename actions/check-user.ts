import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export const checkUser = cache(async () => {
    const { userId } = await auth()
    if (!userId) return null

    const existing = await prisma.user.findUnique({
        where: { clerkId: userId }
    })

    if (existing) return existing

    const clerkUser = await currentUser()
    if (!clerkUser) return null

    const email = clerkUser.emailAddresses[0]?.emailAddress
    if (!email) return null

    return prisma.user.create({
        data: {
            clerkId: clerkUser.id,
            email,
            name: `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim() || null,
            imageUrl: clerkUser.imageUrl,
        }
    })
}) 