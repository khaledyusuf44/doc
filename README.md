# doc

A local-first document editor built with [Next.js](https://nextjs.org). Write freely in a rich text editor — every document is saved as plain files on **your own machine**, so your notes never leave your computer and are never committed to git.

## What's new in v2

Everything below is **additive** — your existing `local-docs/` library keeps working untouched — and built around one rule: **nothing is ever destroyed without intent, and every action is reversible.**

- **🛟 Data safety** — writes are atomic (a crash can't corrupt a doc), deletes go to a recoverable **Trash**, every save is snapshotted to **version history**, and one click exports a full **backup** of your whole library.
- **✅ Tasks** — a cross-document **Tasks** view aggregates every checklist item, with open/done filters, check-off in place, and per-task **due date, priority, and assignee**.
- **🤖 Local AI** — on-device writing help via **[Ollama](https://ollama.com)** (Continue, Rewrite, Summarize, Fix grammar). No cloud, no API keys. Suggestions are **accept-or-reject** — the AI never changes your doc until you say so.
- **🤝 Shared docs** — publish a doc to a git-tracked `shared-docs/` folder; teammates who pull the repo can **import** it. Import always copies to a **new** doc, so it can never overwrite your work.
- **📄 Paper view & math** — paginated paper layout (Letter/A4, margins, zoom), LaTeX math (inline + block) with a symbol palette, plus charts and freehand sketches.

## How your docs are stored

Each document lives in its own folder under `local-docs/`:

```
local-docs/
  2026-06-11-untitled-7ec43594/
    meta.json        # title, tags, timestamps
    content.json     # editor state
    content.html     # rendered HTML
    content.md       # markdown export
    assets/          # uploaded images & files
```

> **`local-docs/` is git-ignored.** Your personal documents stay on your machine and are *never* pushed to GitHub. The folder is created automatically the first time you run the app, so a fresh clone starts empty — everyone gets their own private set of docs.

## Getting started

**Prerequisites:** [Node.js](https://nodejs.org) 18.18+ (Node 20+ recommended).

```bash
# 1. Clone
git clone https://github.com/khaledyusuf44/doc.git
cd doc

# 2. Install dependencies
npm install

# 3. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and start writing. That's it — no database, no accounts, no config.

### Optional: local AI

The AI features talk to a local [Ollama](https://ollama.com) instance — nothing is sent to the cloud. To enable them:

```bash
ollama serve              # start the local daemon
ollama pull llama3.1:8b   # or any chat model you like
```

The app auto-detects an installed model, so it works out of the box. To pin a specific one, set the env vars (all optional):

| Variable             | Default                  | Purpose                  |
| -------------------- | ------------------------ | ------------------------ |
| `OLLAMA_HOST`        | `http://localhost:11434` | Ollama endpoint          |
| `OLLAMA_MODEL`       | `llama3.2`               | Chat model for assist    |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text`       | Embedding model (future) |

If Ollama isn't running, the editor is completely unaffected — the AI actions just stay disabled.

### Optional: sharing docs with teammates

`local-docs/` is private, but `shared-docs/` is **git-tracked**. Use the **Publish** button in a document's header to copy it into `shared-docs/`, then commit and push. Teammates `git pull` and **Import** it from the Shared section in the sidebar — import always creates a new local doc, so nobody's work is ever overwritten.

## Scripts

| Command         | What it does                          |
| --------------- | ------------------------------------- |
| `npm run dev`   | Start the dev server on port 3000     |
| `npm run build` | Build for production                  |
| `npm run start` | Run the production build              |
| `npm run lint`  | Lint the codebase                     |

## Tech stack

- **Next.js 16** (App Router)
- **React 19**
- **Tiptap** rich text editor (+ KaTeX for math)
- **Tailwind CSS 4**
- **Ollama** for optional, fully local AI
- File-based storage (no external database)
