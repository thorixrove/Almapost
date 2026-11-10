import { getUnreadMentions } from "@/actions/comment";

// Dipakai MentionBell untuk membaca mention yang belum dibaca.
// Sengaja berupa route handler (bukan server action): server action masuk antrean router Next.js
// dan bisa menahan navigasi selama query DB / panggilan Clerk belum selesai (sama seperti /api/usage).
export async function GET() {
    const mentions = await getUnreadMentions();
    return Response.json(mentions, { headers: { "Cache-Control": "no-store" } });
}