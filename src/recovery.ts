export type RecoverableTask = {
  id: string;
  requestId: string;
  expiresAt: string | number;
};
export type PendingRequest = {
  requestId: string;
  hash: string;
  thumbnail?: string;
};
export function isExpired(task: RecoverableTask, now = Date.now()) {
  const expires =
    typeof task.expiresAt === "string"
      ? Date.parse(task.expiresAt)
      : task.expiresAt;
  return !Number.isFinite(expires) || expires <= now;
}
export function recoveryDecision<T extends RecoverableTask>(input: {
  active?: T | null;
  recent?: T | null;
  stored?: T | null;
  pending?: PendingRequest | null;
  now?: number;
  deletedIds?: readonly string[];
}) {
  const valid = (task?: T | null) =>
    task && !isExpired(task, input.now) ? task : null;
  const active = valid(input.active),
    recent = valid(input.recent),
    stored = valid(input.stored);
  const matched = input.pending
    ? [active, recent, stored].find(
        (task) => task?.requestId === input.pending!.requestId,
      )
    : null;
  return {
    task: [active, matched, recent, stored].find((task) => task && !input.deletedIds?.includes(task.id)) || null,
    unresolved: Boolean(input.pending && !matched),
    acknowledged: Boolean(input.pending && matched),
  };
}
