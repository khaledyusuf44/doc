import { setTaskAttrs, type TaskAttrPatch } from "@/lib/doc-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    if (typeof body.index !== "number") {
      return Response.json(
        { error: "index (number) is required" },
        { status: 400 },
      );
    }

    // Apply only the attributes that were actually provided.
    const patch: TaskAttrPatch = {};
    if (typeof body.checked === "boolean") patch.checked = body.checked;
    if ("dueDate" in body) patch.dueDate = body.dueDate;
    if ("priority" in body) patch.priority = body.priority;
    if ("assignee" in body) patch.assignee = body.assignee;

    if (Object.keys(patch).length === 0) {
      return Response.json(
        { error: "no task attributes to update" },
        { status: 400 },
      );
    }

    const doc = await setTaskAttrs(id, body.index, patch);
    return Response.json(doc);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not update task" },
      { status: 400 },
    );
  }
}
