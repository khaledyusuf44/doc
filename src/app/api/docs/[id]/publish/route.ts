import { publishDoc } from "@/lib/doc-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return Response.json(await publishDoc(id));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not publish" },
      { status: 400 },
    );
  }
}
