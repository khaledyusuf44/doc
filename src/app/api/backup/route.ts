import { exportBackup } from "@/lib/doc-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const backup = await exportBackup();
    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="local-docs-backup-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not export backup" },
      { status: 500 },
    );
  }
}
