import { listTasks } from "@/lib/doc-store";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(await listTasks());
}
