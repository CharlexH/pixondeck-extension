export const HISTORY_LIMIT = 140;
export const LOCAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const THUMBNAIL_MAX_LENGTH = 44_000;
export type Task = {
  source?: "credits" | "byok";
  providerModel?: string;
  id: string;
  requestId: string;
  status: string;
  prompt: string | null;
  errorCode: string | null;
  refunded: boolean;
  expiresAt: string | number;
  createdAt?: string;
  completedAt?: string | null;
  originalWidth: number;
  originalHeight: number;
};
export function localTaskExpiresAt(task: Task): number {
  const created = Date.parse(task.createdAt ?? "");
  const serverExpiry =
    typeof task.expiresAt === "number"
      ? task.expiresAt
      : Date.parse(task.expiresAt);
  return Number.isFinite(created)
    ? created + LOCAL_RETENTION_MS
    : serverExpiry + LOCAL_RETENTION_MS - 86400000;
}
function isExpired(task: Task, now = Date.now()) {
  const expiry = localTaskExpiresAt(task);
  return !Number.isFinite(expiry) || expiry <= now;
}
export type HistoryEntry = {
  task: Task;
  draft: string;
  edited: boolean;
  thumbnail?: string;
  hash?: string;
};
export type TaskHistory = {
  version: 2;
  selectedId: string | null;
  entries: HistoryEntry[];
  deleted: { id: string; expiresAt: number }[];
};
export const emptyHistory = (): TaskHistory => ({
  version: 2,
  selectedId: null,
  entries: [],
  deleted: [],
});
export function validThumbnail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= THUMBNAIL_MAX_LENGTH &&
    /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value)
  );
}
export function normalizeHistory(
  value: unknown,
  now = Date.now(),
): TaskHistory {
  if (!value || typeof value !== "object") return emptyHistory();
  const stored = value as Partial<TaskHistory> & {
    task?: Task;
    draft?: string;
    hash?: string;
  };
  const candidates = Array.isArray(stored.entries)
    ? stored.entries
    : stored.task
      ? [
          {
            task: stored.task,
            draft: stored.draft ?? stored.task.prompt ?? "",
            edited: true,
            hash: stored.hash,
          },
        ]
      : [];
  const seen = new Set<string>();
  const deleted = Array.isArray(stored.deleted)
    ? stored.deleted.filter((item) => item && typeof item.id === "string" &&
        item.id.length > 0 && item.id.length <= 128 && Number.isFinite(item.expiresAt) && item.expiresAt > now)
      .map((item) => ({ id: item.id, expiresAt: Math.min(item.expiresAt, now + LOCAL_RETENTION_MS) }))
    : [];
  const deletedIds = new Set(deleted.map((item) => item.id));
  const entries = candidates
    .filter(
      (entry) =>
        entry?.task?.id &&
        !deletedIds.has(entry.task.id) &&
        !isExpired(entry.task, now) &&
        !seen.has(entry.task.id) &&
        Boolean(seen.add(entry.task.id)),
    )
    .slice(0, HISTORY_LIMIT)
    .map((entry) => ({
      ...entry,
      draft:
        typeof entry.draft === "string"
          ? entry.draft.slice(0, 1800)
          : (entry.task.prompt ?? ""),
      edited: Boolean(entry.edited),
      thumbnail: validThumbnail(entry.thumbnail) ? entry.thumbnail : undefined,
    }));
  const selectedId = entries.some(
    (entry) => entry.task.id === stored.selectedId,
  )
    ? stored.selectedId!
    : (entries[0]?.task.id ?? null);
  return { version: 2, selectedId, entries, deleted };
}
export function deleteHistoryTask(history: TaskHistory, id: string, now = Date.now()): TaskHistory {
  const clean = normalizeHistory(history, now);
  const index = clean.entries.findIndex((entry) => entry.task.id === id);
  const entry = clean.entries[index];
  if (!entry) return clean;
  clean.deleted.push({ id, expiresAt: Math.min(localTaskExpiresAt(entry.task), now + LOCAL_RETENTION_MS) });
  clean.entries.splice(index, 1);
  if (clean.selectedId === id)
    clean.selectedId = clean.entries[index]?.task.id ?? clean.entries[index - 1]?.task.id ?? null;
  return clean;
}
export function mergeTask(
  history: TaskHistory,
  task: Task,
  options: {
    select?: boolean;
    hash?: string;
    thumbnail?: string;
    now?: number;
  } = {},
): TaskHistory {
  const clean = normalizeHistory(history, options.now);
  if (clean.deleted.some((item) => item.id === task.id)) return clean;
  if (isExpired(task, options.now))
    return normalizeHistory(
      {
        ...clean,
        entries: clean.entries.filter((entry) => entry.task.id !== task.id),
      },
      options.now,
    );
  const existing = clean.entries.find((entry) => entry.task.id === task.id);
  const entry: HistoryEntry = {
    task,
    draft: existing?.edited
      ? existing.draft
      : (task.prompt ?? existing?.draft ?? ""),
    edited: existing?.edited ?? false,
    hash: options.hash ?? existing?.hash,
    thumbnail: validThumbnail(options.thumbnail)
      ? options.thumbnail
      : existing?.thumbnail,
  };
  const entries = existing
    ? clean.entries.map((item) => (item.task.id === task.id ? entry : item))
    : [entry, ...clean.entries];
  return normalizeHistory(
    {
      ...clean,
      entries,
      selectedId: options.select ? task.id : (clean.selectedId ?? task.id),
    },
    options.now,
  );
}
