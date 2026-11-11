import { getNotifications, markNotificationsAsRead } from "@/actions/notification";

export async function GET() {
    const items = await getNotifications()
    return Response.json(items, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
    const body = (await request.json().catch(() => null)) as { items?: unknown } | null
    const items = Array.isArray(body?.items)
        ? (body.items as { source: "notification" | "mention"; id: string }[])
        : undefined

    await markNotificationsAsRead(items)
    return Response.json({ ok: true })
}