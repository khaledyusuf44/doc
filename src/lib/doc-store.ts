import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type DocMeta = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  excerpt: string;
  markdownPath: string;
};

export type StoredDoc = DocMeta & {
  content: JsonValue | null;
  html: string;
  markdown: string;
};

export type AssetInfo = {
  name: string;
  url: string;
  size: number;
};

const STORE_DIR = path.join(process.cwd(), "local-docs");
const EMPTY_DOC: JsonValue = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

function cleanTitle(title?: string) {
  const value = title?.trim();
  return value ? value.slice(0, 120) : "Untitled";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function safeFileName(value: string) {
  const parsed = path.parse(value);
  const base = slugify(parsed.name) || "asset";
  const ext = parsed.ext.toLowerCase().replace(/[^a-z0-9.]/g, "");
  return `${base}${ext}`.slice(0, 96);
}

function createId(title: string) {
  const date = new Date().toISOString().slice(0, 10);
  const slug = slugify(title) || "untitled";
  return `${date}-${slug}-${randomUUID().slice(0, 8)}`;
}

function assertSafeId(id: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(id)) {
    throw new Error("Invalid document id");
  }
}

function docDir(id: string) {
  assertSafeId(id);
  return path.join(STORE_DIR, id);
}

function metaPath(id: string) {
  return path.join(docDir(id), "meta.json");
}

function contentPath(id: string) {
  return path.join(docDir(id), "content.json");
}

function htmlPath(id: string) {
  return path.join(docDir(id), "content.html");
}

function markdownPath(id: string) {
  return path.join(docDir(id), "content.md");
}

function assetsDir(id: string) {
  return path.join(docDir(id), "assets");
}

async function ensureStore() {
  await mkdir(STORE_DIR, { recursive: true });
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: JsonValue | DocMeta) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeExcerpt(markdown: string, html: string) {
  const source = markdown || html;
  return source
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*_#[\]()>{}|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

async function readMeta(id: string): Promise<DocMeta> {
  const meta = await readJson<DocMeta | null>(metaPath(id), null);
  if (!meta) {
    throw new Error("Document not found");
  }
  return meta;
}

export async function listDocs(): Promise<DocMeta[]> {
  await ensureStore();
  const entries = await readdir(STORE_DIR, { withFileTypes: true });
  const docs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          return await readMeta(entry.name);
        } catch {
          return null;
        }
      }),
  );

  return docs
    .filter((doc): doc is DocMeta => Boolean(doc))
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
}

export async function getDoc(id: string): Promise<StoredDoc> {
  const meta = await readMeta(id);
  const [content, html, markdown] = await Promise.all([
    readJson<JsonValue | null>(contentPath(id), EMPTY_DOC),
    readFile(htmlPath(id), "utf8").catch(() => ""),
    readFile(markdownPath(id), "utf8").catch(() => ""),
  ]);

  return {
    ...meta,
    content,
    html,
    markdown,
  };
}

export async function createDoc(title?: string): Promise<StoredDoc> {
  await ensureStore();
  const cleanedTitle = cleanTitle(title);
  const id = createId(cleanedTitle);
  const now = new Date().toISOString();
  const directory = docDir(id);
  const meta: DocMeta = {
    id,
    title: cleanedTitle,
    createdAt: now,
    updatedAt: now,
    tags: [],
    excerpt: "",
    markdownPath: path.relative(process.cwd(), markdownPath(id)),
  };

  await mkdir(path.join(directory, "assets"), { recursive: true });
  await Promise.all([
    writeJson(metaPath(id), meta),
    writeJson(contentPath(id), EMPTY_DOC),
    writeFile(htmlPath(id), "", "utf8"),
    writeFile(markdownPath(id), "", "utf8"),
  ]);

  return getDoc(id);
}

export async function updateDoc(
  id: string,
  input: {
    title?: string;
    content?: JsonValue | null;
    html?: string;
    markdown?: string;
    tags?: string[];
  },
): Promise<StoredDoc> {
  const existing = await getDoc(id);
  const title = cleanTitle(input.title ?? existing.title);
  const html = input.html ?? existing.html;
  const markdown = input.markdown ?? existing.markdown;
  const content = input.content ?? existing.content ?? EMPTY_DOC;
  const now = new Date().toISOString();
  const meta: DocMeta = {
    id,
    title,
    createdAt: existing.createdAt,
    updatedAt: now,
    tags: input.tags ?? existing.tags,
    excerpt: makeExcerpt(markdown, html),
    markdownPath: existing.markdownPath,
  };

  await Promise.all([
    writeJson(metaPath(id), meta),
    writeJson(contentPath(id), content),
    writeFile(htmlPath(id), html, "utf8"),
    writeFile(markdownPath(id), markdown, "utf8"),
  ]);

  return getDoc(id);
}

export async function deleteDoc(id: string) {
  await rm(docDir(id), { recursive: true, force: true });
}

export async function saveAsset(id: string, file: File): Promise<AssetInfo> {
  await readMeta(id);
  const dir = assetsDir(id);
  await mkdir(dir, { recursive: true });

  const fileName = `${Date.now()}-${safeFileName(file.name)}`;
  const filePath = path.join(dir, fileName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, bytes);

  return {
    name: fileName,
    url: `/api/docs/${id}/assets/${encodeURIComponent(fileName)}`,
    size: bytes.byteLength,
  };
}

export async function getAsset(id: string, segments: string[]) {
  await readMeta(id);
  const dir = assetsDir(id);
  const filePath = path.resolve(dir, ...segments);
  const normalizedDir = path.resolve(dir);

  if (!filePath.startsWith(`${normalizedDir}${path.sep}`)) {
    throw new Error("Invalid asset path");
  }

  const info = await stat(filePath);
  if (!info.isFile()) {
    throw new Error("Asset not found");
  }

  return {
    path: filePath,
    bytes: await readFile(filePath),
  };
}
