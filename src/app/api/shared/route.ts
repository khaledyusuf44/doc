import { listSharedDocs } from "@/lib/doc-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await listSharedDocs());
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not list shared docs",
      },
      { status: 500 },
    );
  }
}
