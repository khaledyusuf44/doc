import { restoreVersion } from "@/lib/doc-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; versionId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id, versionId } = await context.params;
    const doc = await restoreVersion(id, versionId);
    return Response.json(doc);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not restore version" },
      { status: 400 },
    );
  }
}
