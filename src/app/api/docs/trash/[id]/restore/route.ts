import { restoreFromTrash } from "@/lib/doc-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const doc = await restoreFromTrash(id);
    return Response.json(doc);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not restore" },
      { status: 400 },
    );
  }
}
