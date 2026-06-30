# Changelog

## v2.0.0

A big step up from a notes editor toward a real local-first workspace. Everything
is **additive** — existing `local-docs/` libraries keep working untouched — and
held to one rule: **nothing is destroyed without intent, and every action is
reversible.**

### Data safety

- **Atomic writes** — saves write to a temp file then rename, so a crash or full
  disk can never leave a document truncated or corrupt.
- **Trash** — deleting moves a doc to a recoverable `local-docs/.trash/` instead
  of erasing it; restore or permanently delete from the sidebar.
- **Version history** — each content-changing save snapshots the prior version
  into `<doc>/.history/` (time-throttled, pruned); restore any prior version, and
  restoring is itself reversible.
- **Backup export** — one click downloads the entire library (content + assets)
  as a single self-contained JSON file.

### Tasks

- **Cross-document Tasks view** — aggregates every checklist item across all docs,
  grouped by document, with Open / All / Done filters and click-to-open.
- **Toggle in place** — check items off directly from the Tasks view.
- **Task metadata** — due date (with overdue highlighting), priority, and assignee,
  editable inline from the Tasks view.

### Local AI (Ollama)

- **Inline assist** — Continue, Rewrite, Summarize, and Fix grammar, streamed from
  a local Ollama model. No cloud, no API keys.
- **Accept or reject** — the document is never modified until you accept a
  suggestion; accepted edits autosave and land in version history.
- **Works out of the box** — auto-detects an installed model; degrades gracefully
  when Ollama isn't running.

### Shared docs

- **Publish / Import** — publish a doc to a git-tracked `shared-docs/` folder;
  teammates pull the repo and import it. Import always copies to a **new** doc, so
  it can never overwrite anyone's work. Re-publishing surfaces as a normal git
  merge conflict, never a silent clobber.

### Editing

- Paginated paper view (Letter/A4, orientation, margins, zoom) with live page
  count and document outline.
- LaTeX math (inline + block) with a symbol/template palette, charts, and freehand
  sketches.
- Favorites, text color, and a document utility bar (word count, reading time,
  scroll progress).

## v0.1.0

- Initial local-first document editor.
