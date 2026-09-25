import type { HistoryEntry, TaskHistory } from "./task-history";

export type SavedPrompt = {
  id: string;
  prompt: string;
  title: string;
  originalWidth: number | null;
  originalHeight: number | null;
  thumbnailUrl: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

// Cloud entries have their own drafts. Saving a recent result never links its editor.
export function favoriteEntry(item: SavedPrompt, thumbnail?: string): HistoryEntry {
  return {
    task: {
      id: item.id, requestId: item.id, status: "succeeded", prompt: item.prompt,
      errorCode: null, refunded: false, expiresAt: Number.MAX_SAFE_INTEGER,
      createdAt: item.createdAt, completedAt: item.createdAt,
      originalWidth: item.originalWidth ?? 0, originalHeight: item.originalHeight ?? 0,
    },
    draft: item.prompt, edited: false, thumbnail,
  };
}
export function reconcileFavorites(previous: TaskHistory, items: SavedPrompt[]): TaskHistory {
  const entries = items.map(item => {
    const old = previous.entries.find(entry => entry.task.id === item.id);
    const next = favoriteEntry(item, old?.thumbnail);
    if (old?.edited) return old;
    return next;
  });
  // Keep unsynced edits even when another device removed the cloud item.
  for (const old of previous.entries)
    if (old.edited && !entries.some(entry => entry.task.id === old.task.id)) entries.push(old);
  return {
    version: 2, entries, deleted: [],
    selectedId: entries.some(entry => entry.task.id === previous.selectedId)
      ? previous.selectedId : entries[0]?.task.id ?? null,
  };
}

// Same hugeicons:star outline as the site's saved recipe/prompt actions.
export const STAR_SVG = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m13.728 3.444l1.76 3.549c.24.494.88.968 1.42 1.058l3.189.535c2.04.343 2.52 1.835 1.05 3.307l-2.48 2.5c-.42.423-.65 1.24-.52 1.825l.71 3.095c.56 2.45-.73 3.397-2.88 2.117l-2.99-1.785c-.54-.322-1.43-.322-1.98 0L8.019 21.43c-2.14 1.28-3.44.322-2.88-2.117l.71-3.095c.13-.585-.1-1.402-.52-1.825l-2.48-2.5C1.39 10.42 1.86 8.929 3.899 8.586l3.19-.535c.53-.09 1.17-.564 1.41-1.058l1.76-3.549c.96-1.925 2.52-1.925 3.47 0" /></svg>';
