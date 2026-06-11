# doc

A local-first document editor built with [Next.js](https://nextjs.org). Write freely in a rich text editor — every document is saved as plain files on **your own machine**, so your notes never leave your computer and are never committed to git.

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
- **Tiptap** rich text editor
- **Tailwind CSS 4**
- File-based storage (no external database)
