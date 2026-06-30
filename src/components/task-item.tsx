import TaskItem from "@tiptap/extension-task-item";

export type TaskPriority = "low" | "med" | "high";

export function normalizePriority(value: unknown): TaskPriority | null {
  return value === "low" || value === "med" || value === "high" ? value : null;
}

/**
 * The official TaskItem extended with three optional, additive metadata
 * attributes: dueDate (YYYY-MM-DD), priority, and assignee.
 *
 * Every attribute defaults to null and renders NO data-* attribute when empty
 * (the `? {...} : {}` guard), so existing checklists — taskItem nodes carrying
 * only `checked` — round-trip byte-for-byte and old content.html never gains
 * noise. keepOnSplit:false so a freshly split task doesn't inherit metadata.
 *
 * Attributes only: the library's built-in checkbox node view is preserved.
 */
export const TaskItemWithMeta = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      dueDate: {
        default: null,
        keepOnSplit: false,
        parseHTML: (element) => element.getAttribute("data-due") || null,
        renderHTML: (attributes) =>
          attributes.dueDate ? { "data-due": attributes.dueDate } : {},
      },
      priority: {
        default: null,
        keepOnSplit: false,
        parseHTML: (element) =>
          normalizePriority(element.getAttribute("data-priority")),
        renderHTML: (attributes) =>
          attributes.priority ? { "data-priority": attributes.priority } : {},
      },
      assignee: {
        default: null,
        keepOnSplit: false,
        parseHTML: (element) => element.getAttribute("data-assignee") || null,
        renderHTML: (attributes) =>
          attributes.assignee ? { "data-assignee": attributes.assignee } : {},
      },
    };
  },
});
