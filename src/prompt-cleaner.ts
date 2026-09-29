export type CleaningSnapshot = { account: string; taskId: string; text: string; mode?: "credits" | "byok"; configKey?: string };
export type CleaningState = {
  version: 1;
  origin?: "credits" | "byok";
  original: string;
  cleaned?: string;
  active: "original" | "cleaned";
  phase: "pending" | "ready" | "failed" | "expired";
  requestId: string;
  serverTaskId?: string;
};
export type CleaningTask = {
  id: string;
  requestId: string;
  status: string;
  sourcePrompt?: string | null;
  prompt?: string | null;
  refunded?: boolean;
  errorCode?: string | null;
};
type CleaningResponse = { task: CleaningTask | null; balance?: number };
export type CleaningNotice = "done" | "unchanged" | "restored" | "selectedCleaned" | "failed" | "uncertain" | "expired" | "byokFailed";
const validText = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 4096;
export function normalizeCleaningState(value: unknown): CleaningState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as CleaningState;
  if (state.version !== 1 || !validText(state.original) || typeof state.requestId !== "string" ||
      !["pending", "ready", "failed", "expired"].includes(state.phase) ||
      !["original", "cleaned"].includes(state.active) ||
      (state.phase === "ready" && !validText(state.cleaned))) return null;
  return { version: 1, origin: state.origin === "byok" ? "byok" : "credits", original: state.original, cleaned: validText(state.cleaned) ? state.cleaned : undefined,
    active: state.active, phase: state.phase, requestId: state.requestId,
    serverTaskId: typeof state.serverTaskId === "string" ? state.serverTaskId : undefined };
}
export const cleaningStorageKey = (account: string, taskId: string) => `reverse-cleaning:${account}:${taskId}`;

/** Paid requests are persisted before submission. Switching selection never cancels or forgets a debit. */
export function createPromptCleaner(options: {
  read(): CleaningSnapshot | null;
  load(account: string, taskId: string): Promise<unknown>;
  save(account: string, taskId: string, state: CleaningState): Promise<void>;
  api(path: string, init: RequestInit | undefined, account: string): Promise<CleaningResponse>;
  confirm(snapshot: CleaningSnapshot): Promise<boolean>;
  cleanByok?(text: string, snapshot: CleaningSnapshot): Promise<string>;
  apply(snapshot: CleaningSnapshot, text: string): Promise<void>;
  changed(): void;
  notice(notice: CleaningNotice): void;
  error(error: unknown): void;
  balance(value: number): void;
  uuid?(): string;
  pollMs?: number;
}) {
  const cache = new Map<string, CleaningState | null>();
  const operations = new Map<string, Promise<void>>();
  const checked = new Set<string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let disposed = false;
  const keyOf = (s: CleaningSnapshot) => cleaningStorageKey(s.account, s.taskId);
  const current = (s: CleaningSnapshot) => {
    const now = options.read();
    return !!now && now.account === s.account && now.taskId === s.taskId &&
      (now.mode ?? "credits") === (s.mode ?? "credits") && now.configKey === s.configKey;
  };
  const emit = (s: CleaningSnapshot, message: CleaningNotice) => { if (current(s)) options.notice(message); };
  async function load(s: CleaningSnapshot) {
    const key = keyOf(s);
    if (!cache.has(key)) cache.set(key, normalizeCleaningState(await options.load(s.account, s.taskId)));
    return cache.get(key) ?? null;
  }
  async function save(s: CleaningSnapshot, state: CleaningState) {
    await options.save(s.account, s.taskId, state);
    cache.set(keyOf(s), state);
    options.changed();
  }
  async function api(s: CleaningSnapshot, path: string, init?: RequestInit) {
    const response = await options.api(path, init, s.account);
    if (current(s) && typeof response.balance === "number") options.balance(response.balance);
    return response;
  }
  function schedule(s: CleaningSnapshot) {
    const key = keyOf(s);
    if (disposed || timers.has(key)) return;
    timers.set(key, setTimeout(() => {
      timers.delete(key);
      // Authentication may have changed. Resume when this source is selected again.
      if (options.read()?.account === s.account) void run(s, () => recover(s));
    }, options.pollMs ?? 2000));
  }
  async function accept(s: CleaningSnapshot, task: CleaningTask, previous: CleaningState | null) {
    const state: CleaningState = {
      version: 1, origin: previous?.origin ?? "credits", original: previous?.original ?? task.sourcePrompt ?? s.text,
      active: previous?.active ?? "original", phase: "pending",
      requestId: task.requestId, serverTaskId: task.id,
    };
    if (task.status === "succeeded") {
      const cleaned = task.prompt ?? previous?.cleaned;
      if (!validText(cleaned)) {
        state.phase = "expired";
        await save(s, state);
        emit(s, "expired");
        return;
      }
      state.cleaned = cleaned;
      state.phase = "ready";
      // Background completion preserves the version actually shown by the source task.
      const canApply = current(s) && options.read()?.text === s.text;
      state.active = canApply ? "cleaned" : (previous?.active ?? "original");
      await save(s, state);
      // Do not overwrite an edit or another selection while storage was in flight.
      if (canApply && current(s) && options.read()?.text === s.text) await options.apply(s, cleaned);
      else if (canApply) await save(s, { ...state, active: previous?.active ?? "original" });
      emit(s, state.original === cleaned ? "unchanged" : "done");
    } else if (task.status === "failed" || task.status === "cancelled") {
      state.phase = "failed";
      await save(s, state);
      emit(s, "failed");
    } else {
      await save(s, state);
      schedule(s);
    }
  }
  async function submit(s: CleaningSnapshot, state: CleaningState) {
    try {
      const response = await api(s, "/api/reverse/clean-prompt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: state.requestId, sourceTaskId: s.taskId, prompt: state.original }),
      });
      if (!response.task) throw new Error("CLEANING_RESPONSE_MISSING");
      await accept(s, response.task, state);
    } catch (error) {
      const code = (error as { data?: { error?: string } })?.data?.error;
      const rejected = new Set(["invalid_request", "invalid_prompt", "unauthorized", "insufficient_credits",
        "not_found", "request_too_large", "rate_limited", "prompt_cleaning_unavailable", "active_task", "request_cancelled"]);
      if (code && rejected.has(code)) {
        // The API guarantees these codes precede reservation. A retry requires fresh confirmation.
        await save(s, { ...state, phase: "failed" });
      } else {
        // A failed transport is not proof the server rejected the debit. Preserve this UUID.
        emit(s, "uncertain");
      }
      throw error;
    }
  }
  async function submitByok(s: CleaningSnapshot, state: CleaningState) {
    try {
      if (!options.cleanByok) throw new Error("BYOK_UNAVAILABLE");
      const prompt = await options.cleanByok(state.original, s);
      if (!validText(prompt)) throw new Error("CLEANING_RESPONSE_INVALID");
      await accept(s, { id: state.requestId, requestId: state.requestId, status: "succeeded", prompt }, state);
    } catch {
      // Provider billing cannot be reconciled by PixOnDeck. Never retry it automatically.
      await save(s, { ...state, phase: "failed" });
      emit(s, "byokFailed");
    }
  }
  async function recover(s: CleaningSnapshot) {
    const state = await load(s);
    if (state?.phase === "ready" || state?.phase === "expired") return;
    if (state?.origin === "byok") {
      if (state.phase === "pending") {
        await save(s, { ...state, phase: "failed" });
        emit(s, "byokFailed");
      }
      return;
    }
    // A platform request already in flight keeps its original billing path after mode changes.
    if (s.mode === "byok" && state?.phase !== "pending") return;
    const response = await api(s, state?.serverTaskId && state.phase === "pending"
      ? `/api/reverse/${encodeURIComponent(state.serverTaskId)}`
      : `/api/reverse/clean-prompt?sourceTaskId=${encodeURIComponent(s.taskId)}`);
    checked.add(keyOf(s));
    if (response.task) await accept(s, response.task, state);
    else if (state?.phase === "pending") await submit(s, state);
  }
  function run(s: CleaningSnapshot, action: () => Promise<void>) {
    const key = keyOf(s);
    if (disposed) return Promise.resolve();
    const active = operations.get(key);
    if (active) return active;
    const promise = Promise.resolve().then(action).catch(error => {
      if (current(s)) options.error(error);
    }).finally(() => { operations.delete(key); options.changed(); });
    operations.set(key, promise);
    options.changed();
    return promise;
  }
  return {
    get state() { const s = options.read(); return s ? cache.get(keyOf(s)) ?? null : null; },
    get busy() { const s = options.read(); return !!s && operations.has(keyOf(s)); },
    resume() {
      const selected = options.read();
      if (!selected?.text.trim()) return Promise.resolve();
      const s = { ...selected };
      return run(s, async () => {
        const state = await load(s);
        if (state?.phase === "pending" || !checked.has(keyOf(s))) await recover(s);
      });
    },
    click() {
      const selected = options.read();
      if (!selected?.text.trim()) return Promise.resolve();
      const s = { ...selected };
      return run(s, async () => {
        let state = await load(s);
        if (state?.phase === "pending") { await recover(s); return; }
        if (!state && !checked.has(keyOf(s))) { await recover(s); state = await load(s); }
        if (!current(s) || options.read()?.text !== s.text) return;
        if (state?.phase === "ready") {
          const next: CleaningState = { ...state, [state.active]: s.text,
            active: state.active === "cleaned" ? "original" : "cleaned" };
          await save(s, next);
          if (current(s) && options.read()?.text === s.text) await options.apply(s, next[next.active]!);
          emit(s, next.active === "original" ? "restored" : "selectedCleaned");
          return;
        }
        if (state?.phase === "expired") { emit(s, "expired"); return; }
        if (!(await options.confirm(s)) || !current(s) || options.read()?.text !== s.text) return;
        state = { version: 1, origin: s.mode ?? "credits", original: s.text, active: "original", phase: "pending",
          requestId: options.uuid?.() ?? crypto.randomUUID() };
        await save(s, state);
        if (state.origin === "byok") await submitByok(s, state);
        else await submit(s, state);
      });
    },
    dispose() { disposed = true; for (const timer of timers.values()) clearTimeout(timer); timers.clear(); },
  };
}
