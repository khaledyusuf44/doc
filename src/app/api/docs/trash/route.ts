import { emptyTrash, listTrash } from "@/lib/doc-store";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(await listTrash());
}

export async function DELETE() {
  try {
    await emptyTrash();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not empty trash" },
      { status: 400 },
    );
  }
}
