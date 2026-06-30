import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
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

export type PageSettings = {
  margin: "narrow" | "normal" | "wide";
  orientation: "landscape" | "portrait";
  paperSize: "a4" | "letter";
};

export type DocMeta = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
  tags: string[];
  excerpt: string;
  markdownPath: string;
  pageSettings: PageSettings;
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
// Soft-deleted docs are moved here instead of being removed, so an accidental
// delete is always recoverable. The leading dot keeps it out of listDocs and
// makes it unaddressable as a doc id (assertSafeId rejects names starting ".").
const TRASH_DIR = path.join(STORE_DIR, ".trash");
// Per-doc snapshots of prior content live in <doc>/.history. Snapshots are
// time-throttled (autosave fires every ~700ms, so a snapshot-per-save would
// blow past the cap in seconds) and pruned to the most recent MAX_VERSIONS.
const HISTORY_DIRNAME = ".history";
const MAX_VERSIONS = 50;
const SNAPSHOT_INTERVAL_MS = 2 * 60 * 1000;
const EMPTY_DOC: JsonValue = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
const DEFAULT_PAGE_SETTINGS: PageSettings = {
  margin: "normal",
  orientation: "portrait",
  paperSize: "letter",
};

type StoredMeta = Omit<DocMeta, "isFavorite" | "pageSettings"> & {
  isFavorite?: boolean;
  pageSettings?: Partial<PageSettings>;
};

function cleanTitle(title?: string) {
  const value = title?.trim();
  return value ? value.slice(0, 120) : "Untitled";
}

function normalizePageSettings(
  settings?: Partial<PageSettings> | null,
): PageSettings {
  return {
    margin:
      settings?.margin === "narrow" || settings?.margin === "wide"
        ? settings.margin
        : "normal",
    orientation:
      settings?.orientation === "landscape" ? "landscape" : "portrait",
    paperSize: settings?.paperSize === "a4" ? "a4" : "letter",
  };
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

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write a file durably: stream the bytes into a sibling temp file, then rename
 * it onto the target. rename() is atomic on the same filesystem, so a crash or
 * full disk mid-write can never leave a reader with a truncated/corrupt file —
 * the old contents survive intact until the complete new file is swapped in.
 */
async function writeFileAtomic(filePath: string, data: string | Buffer) {
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp-${randomUUID().slice(0, 8)}`,
  );

  try {
    await writeFile(tempPath, data);
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

async function writeJson(filePath: string, value: JsonValue | DocMeta) {
  await writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
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
  const meta = await readJson<StoredMeta | null>(metaPath(id), null);
  if (!meta) {
    throw new Error("Document not found");
  }
  return {
    ...meta,
    isFavorite: meta.isFavorite === true,
    pageSettings: normalizePageSettings(meta.pageSettings),
  };
}

export async function listDocs(): Promise<DocMeta[]> {
  await ensureStore();
  const entries = await readdir(STORE_DIR, { withFileTypes: true });
  const docs = await Promise.all(
    entries
      // Skip dot-folders like .trash so deleted docs never resurface here.
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
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
    isFavorite: false,
    tags: [],
    excerpt: "",
    markdownPath: path.relative(process.cwd(), markdownPath(id)),
    pageSettings: DEFAULT_PAGE_SETTINGS,
  };

  await mkdir(path.join(directory, "assets"), { recursive: true });
  await Promise.all([
    writeJson(metaPath(id), meta),
    writeJson(contentPath(id), EMPTY_DOC),
    writeFileAtomic(htmlPath(id), ""),
    writeFileAtomic(markdownPath(id), ""),
  ]);

  return getDoc(id);
}

export async function updateDoc(
  id: string,
  input: {
    title?: string;
    content?: JsonValue | null;
    html?: string;
    isFavorite?: boolean;
    markdown?: string;
    pageSettings?: Partial<PageSettings>;
    tags?: string[];
    touch?: boolean;
    forceSnapshot?: boolean;
  },
): Promise<StoredDoc> {
  const existing = await getDoc(id);
  const title = cleanTitle(input.title ?? existing.title);
  const html = input.html ?? existing.html;
  const markdown = input.markdown ?? existing.markdown;
  const content = input.content ?? existing.content ?? EMPTY_DOC;
  const updatedAt =
    input.touch === false ? existing.updatedAt : new Date().toISOString();

  // Snapshot the state we're about to overwrite, so any edit is recoverable.
  if (JSON.stringify(content) !== JSON.stringify(existing.content)) {
    await maybeSnapshotVersion(id, existing, input.forceSnapshot === true);
  }
  const meta: DocMeta = {
    id,
    title,
    createdAt: existing.createdAt,
    updatedAt,
    isFavorite:
      typeof input.isFavorite === "boolean"
        ? input.isFavorite
        : existing.isFavorite,
    tags: input.tags ?? existing.tags,
    excerpt: makeExcerpt(markdown, html),
    markdownPath: existing.markdownPath,
    pageSettings: normalizePageSettings(
      input.pageSettings ?? existing.pageSettings,
    ),
  };

  await Promise.all([
    writeJson(metaPath(id), meta),
    writeJson(contentPath(id), content),
    writeFileAtomic(htmlPath(id), html),
    writeFileAtomic(markdownPath(id), markdown),
  ]);

  return getDoc(id);
}

export type TrashedDoc = DocMeta & {
  // Folder name under .trash — the key used to restore or purge. Usually the
  // doc id, but suffixed if an older trashed copy of the same id already exists.
  trashId: string;
  deletedAt: string;
};

function trashPath(trashId: string) {
  assertSafeId(trashId);
  return path.join(TRASH_DIR, trashId);
}

async function readTrashMeta(trashId: string): Promise<DocMeta | null> {
  const meta = await readJson<StoredMeta | null>(
    path.join(trashPath(trashId), "meta.json"),
    null,
  );
  if (!meta) {
    return null;
  }
  return {
    ...meta,
    isFavorite: meta.isFavorite === true,
    pageSettings: normalizePageSettings(meta.pageSettings),
  };
}

/**
 * Soft-delete: move the doc folder into .trash instead of removing it, so the
 * delete is fully reversible. Nothing is ever erased here.
 */
export async function deleteDoc(id: string) {
  const source = docDir(id);
  if (!(await pathExists(source))) {
    return;
  }

  await mkdir(TRASH_DIR, { recursive: true });
  let trashId = id;
  // Never clobber an existing trashed copy of the same id.
  if (await pathExists(path.join(TRASH_DIR, trashId))) {
    trashId = `${id}-${randomUUID().slice(0, 8)}`;
  }

  await rename(source, path.join(TRASH_DIR, trashId));
}

export async function listTrash(): Promise<TrashedDoc[]> {
  if (!(await pathExists(TRASH_DIR))) {
    return [];
  }

  const entries = await readdir(TRASH_DIR, { withFileTypes: true });
  const items = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          const meta = await readTrashMeta(entry.name);
          if (!meta) {
            return null;
          }
          const info = await stat(trashPath(entry.name));
          return {
            ...meta,
            trashId: entry.name,
            deletedAt: info.mtime.toISOString(),
          } satisfies TrashedDoc;
        } catch {
          return null;
        }
      }),
  );

  return items
    .filter((item): item is TrashedDoc => Boolean(item))
    .sort(
      (a, b) =>
        new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime(),
    );
}

/** Move a trashed doc back into the live library, under its original id. */
export async function restoreFromTrash(trashId: string): Promise<StoredDoc> {
  const source = trashPath(trashId);
  if (!(await pathExists(source))) {
    throw new Error("Trashed document not found");
  }

  const meta = await readTrashMeta(trashId);
  if (!meta) {
    throw new Error("Trashed document is unreadable");
  }

  const target = docDir(meta.id);
  if (await pathExists(target)) {
    throw new Error("A document with that id already exists");
  }

  await rename(source, target);
  return getDoc(meta.id);
}

/** Permanently delete a single trashed doc. */
export async function purgeDoc(trashId: string) {
  await rm(trashPath(trashId), { recursive: true, force: true });
}

/** Permanently delete everything in the trash. */
export async function emptyTrash() {
  await rm(TRASH_DIR, { recursive: true, force: true });
}

export type DocVersion = {
  versionId: string;
  savedAt: string;
  title: string;
};

type StoredVersion = {
  savedAt: string;
  title: string;
  content: JsonValue | null;
  html: string;
  markdown: string;
};

function historyDir(id: string) {
  return path.join(docDir(id), HISTORY_DIRNAME);
}

function assertSafeVersionId(versionId: string) {
  // Version ids are derived from a sanitized timestamp + uuid; reject anything
  // with path separators or dots so a crafted id can't escape the history dir.
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(versionId)) {
    throw new Error("Invalid version id");
  }
}

async function newestVersionMtime(dir: string): Promise<number | null> {
  const files = (await readdir(dir).catch(() => [])).filter((name) =>
    name.endsWith(".json"),
  );
  if (files.length === 0) {
    return null;
  }
  // Names start with a chronological timestamp, so the lexically last file is
  // the most recent — stat just that one rather than the whole directory.
  files.sort();
  const info = await stat(path.join(dir, files[files.length - 1]));
  return info.mtimeMs;
}

async function pruneVersions(dir: string) {
  const files = (await readdir(dir).catch(() => []))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const excess = files.length - MAX_VERSIONS;
  if (excess > 0) {
    await Promise.all(
      files
        .slice(0, excess)
        .map((name) => rm(path.join(dir, name), { force: true })),
    );
  }
}

async function maybeSnapshotVersion(
  id: string,
  prior: StoredDoc,
  force: boolean,
) {
  // Never snapshot a blank starting doc — it adds noise and nothing to recover.
  if (!prior.content || JSON.stringify(prior.content) === JSON.stringify(EMPTY_DOC)) {
    return;
  }

  const dir = historyDir(id);
  if (!force) {
    const newest = await newestVersionMtime(dir);
    if (newest !== null && Date.now() - newest < SNAPSHOT_INTERVAL_MS) {
      return;
    }
  }

  await mkdir(dir, { recursive: true });
  const versionId = `${prior.updatedAt.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 6)}`;
  const snapshot: StoredVersion = {
    savedAt: prior.updatedAt,
    title: prior.title,
    content: prior.content,
    html: prior.html,
    markdown: prior.markdown,
  };
  await writeFileAtomic(
    path.join(dir, `${versionId}.json`),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );
  await pruneVersions(dir);
}

export async function listVersions(id: string): Promise<DocVersion[]> {
  docDir(id); // validates id
  const dir = historyDir(id);
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const versions = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const version = await readJson<StoredVersion | null>(
          path.join(dir, entry.name),
          null,
        );
        if (!version) {
          return null;
        }
        return {
          versionId: entry.name.replace(/\.json$/, ""),
          savedAt: version.savedAt,
          title: version.title,
        } satisfies DocVersion;
      }),
  );

  return versions
    .filter((version): version is DocVersion => Boolean(version))
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
}

/** Roll a doc back to a snapshot. The current state is snapshotted first
 *  (forceSnapshot), so a restore is itself always reversible. */
export async function restoreVersion(
  id: string,
  versionId: string,
): Promise<StoredDoc> {
  assertSafeVersionId(versionId);
  const version = await readJson<StoredVersion | null>(
    path.join(historyDir(id), `${versionId}.json`),
    null,
  );
  if (!version) {
    throw new Error("Version not found");
  }

  return updateDoc(id, {
    title: version.title,
    content: version.content,
    html: version.html,
    markdown: version.markdown,
    forceSnapshot: true,
  });
}

export type BackupAsset = {
  name: string;
  base64: string;
};

export type BackupDoc = StoredDoc & {
  assets: BackupAsset[];
};

export type Backup = {
  version: 1;
  exportedAt: string;
  docs: BackupDoc[];
};

async function readDocAssets(id: string): Promise<BackupAsset[]> {
  const dir = assetsDir(id);
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => ({
        name: entry.name,
        base64: (await readFile(path.join(dir, entry.name))).toString("base64"),
      })),
  );
}

/**
 * Bundle the whole live library — every doc's content, html, markdown and
 * binary assets — into one self-contained JSON object the user can stash
 * anywhere. Self-contained so it never depends on the rest of the filesystem.
 */
export async function exportBackup(): Promise<Backup> {
  const metas = await listDocs();
  const docs = await Promise.all(
    metas.map(async (meta) => {
      const doc = await getDoc(meta.id);
      const assets = await readDocAssets(meta.id);
      return { ...doc, assets } satisfies BackupDoc;
    }),
  );

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    docs,
  };
}

export type Task = {
  text: string;
  checked: boolean;
  index: number;
};

export type DocTasks = {
  docId: string;
  docTitle: string;
  updatedAt: string;
  openCount: number;
  doneCount: number;
  tasks: Task[];
};

type JsonNode = {
  type?: string;
  text?: string;
  attrs?: { checked?: boolean };
  content?: JsonValue;
};

/** Gather a task item's own label, without descending into nested checklists
 *  (those become their own tasks). */
function taskOwnText(node: JsonValue): string {
  if (!node || typeof node !== "object") {
    return "";
  }
  if (Array.isArray(node)) {
    return node.map(taskOwnText).join("");
  }
  const n = node as JsonNode;
  if (n.type === "taskList") {
    return "";
  }
  if (typeof n.text === "string") {
    return n.text;
  }
  return n.content ? taskOwnText(n.content) : "";
}

/** Tasks are derived from the checklist items already in each doc — there is
 *  no separate task store to fall out of sync or lose. */
function collectTasks(content: JsonValue): Task[] {
  const tasks: Task[] = [];

  const walk = (node: JsonValue) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const n = node as JsonNode;
    if (n.type === "taskItem") {
      tasks.push({
        text: taskOwnText(n.content ?? null).replace(/\s+/g, " ").trim(),
        checked: n.attrs?.checked === true,
        index: tasks.length,
      });
    }
    if (n.content) {
      walk(n.content);
    }
  };

  walk(content);
  return tasks;
}

export async function listTasks(): Promise<DocTasks[]> {
  const metas = await listDocs();
  const grouped = await Promise.all(
    metas.map(async (meta) => {
      const content = await readJson<JsonValue | null>(
        contentPath(meta.id),
        null,
      );
      const tasks = content ? collectTasks(content) : [];
      return {
        docId: meta.id,
        docTitle: meta.title,
        updatedAt: meta.updatedAt,
        openCount: tasks.filter((task) => !task.checked).length,
        doneCount: tasks.filter((task) => task.checked).length,
        tasks,
      } satisfies DocTasks;
    }),
  );

  return grouped.filter((doc) => doc.tasks.length > 0);
}

/**
 * Flip a single checklist item's checked state, identified by its position in
 * the same depth-first order collectTasks uses. Goes through updateDoc, so the
 * change is atomic and snapshotted into history like any other edit.
 */
export async function setTaskChecked(
  id: string,
  index: number,
  checked: boolean,
): Promise<StoredDoc> {
  const doc = await getDoc(id);
  if (!doc.content) {
    throw new Error("Document has no content");
  }

  const content = JSON.parse(JSON.stringify(doc.content)) as JsonValue;
  let counter = 0;
  let found = false;

  const walk = (node: JsonValue) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const n = node as {
      type?: string;
      attrs?: Record<string, JsonValue>;
      content?: JsonValue;
    };
    if (n.type === "taskItem") {
      if (counter === index) {
        n.attrs = { ...(n.attrs ?? {}), checked };
        found = true;
      }
      counter += 1;
    }
    if (n.content) {
      walk(n.content);
    }
  };
  walk(content);

  if (!found) {
    throw new Error("Task not found");
  }

  return updateDoc(id, { content });
}

export async function saveAsset(id: string, file: File): Promise<AssetInfo> {
  await readMeta(id);
  const dir = assetsDir(id);
  await mkdir(dir, { recursive: true });

  const fileName = `${Date.now()}-${safeFileName(file.name)}`;
  const filePath = path.join(dir, fileName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFileAtomic(filePath, bytes);

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
