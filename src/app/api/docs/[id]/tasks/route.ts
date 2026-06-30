import { setTaskChecked } from "@/lib/doc-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    if (typeof body.index !== "number" || typeof body.checked !== "boolean") {
      return Response.json(
        { error: "index (number) and checked (boolean) are required" },
        { status: 400 },
      );
    }

    const doc = await setTaskChecked(id, body.index, body.checked);
    return Response.json(doc);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not update task" },
      { status: 400 },
    );
  }
}
