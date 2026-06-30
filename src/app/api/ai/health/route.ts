import { getProvider } from "@/lib/ai/config";

export const runtime = "nodejs";
// Health is a live probe of a local daemon — never serve a cached answer.
export const dynamic = "force-dynamic";

export async function GET() {
  const provider = getProvider();
  const result = await provider.health();
  return Response.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
