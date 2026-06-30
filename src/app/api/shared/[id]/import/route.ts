import { importSharedDoc } from "@/lib/doc-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return Response.json(await importSharedDoc(id));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not import" },
      { status: 400 },
    );
  }
}
