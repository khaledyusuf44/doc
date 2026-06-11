import { createDoc, listDocs } from "@/lib/doc-store";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(await listDocs());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const doc = await createDoc(
    typeof body.title === "string" ? body.title : undefined,
  );

  return Response.json(doc, { status: 201 });
}
