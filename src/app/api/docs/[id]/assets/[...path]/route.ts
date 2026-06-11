import { getAsset } from "@/lib/doc-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; path: string[] }>;
};

const CONTENT_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function contentType(filePath: string) {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id, path } = await context.params;
    const asset = await getAsset(id, path);
    return new Response(asset.bytes, {
      headers: {
        "Content-Type": contentType(asset.path),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Asset not found" },
      { status: 404 },
    );
  }
}
