import { auth } from "@clerk/nextjs/server";
import { getPromptUsage } from "@/lib/billing";

// Dipakai PlanButton untuk membaca pemakaian prompt.
// Sengaja berupa route handler (bukan server action): server action masuk antrean router Next.js
// dan bisa menahan navigasi selama panggilan ke Clerk/DB belum selesai.
export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json(null);

  const usage = await getPromptUsage(orgId ?? userId);
  return Response.json(usage, { headers: { "Cache-Control": "no-store" } });
}