export type AuthUser = { id: string; email: string; name?: string; imageUrl?: string };
type Client = {
  user?: { id: string; fullName?: string | null; firstName?: string | null; imageUrl?: string; primaryEmailAddress?: { emailAddress: string } | null } | null;
  session?: { getToken(): Promise<string | null> } | null;
  signOut(): Promise<void>;
  addListener(callback: () => void): () => void;
};
type CookieChange = { cookie: { name: string; domain: string; value: string }; removed: boolean };
type CookieEvents = {
  addListener(callback: (change: CookieChange) => void): void;
  removeListener(callback: (change: CookieChange) => void): void;
};
type Options = {
  publishableKey: string;
  syncHost: string;
  onChange(user: AuthUser | null): void | Promise<void>;
  onError(error: unknown): void;
};
type Dependencies = {
  createClient(): Promise<Client>;
  cookies: CookieEvents;
  window: EventTarget;
  document: EventTarget & { visibilityState: string };
};

// Only identity cookies trigger synchronization: __session rotates every minute.
export function isAuthCookie(change: CookieChange, syncHost: string) {
  const host = new URL(syncHost).hostname;
  const domain = change.cookie.domain.replace(/^\./, "");
  return (host === domain || (change.cookie.domain.startsWith(".") && host.endsWith(`.${domain}`))) &&
    ["__client", "__client_uat", "__clerk_db_jwt"].includes(change.cookie.name);
}

// Clerk's request/response hooks must retain the JWT within this client lifetime.
// A fresh cache per client prevents cookie removal from reviving an older client.
export function createAuthCache() {
  const values = new Map<string, string>();
  return {
    createKey: (...keys: string[]) => keys.filter(Boolean).join("|"),
    get: async <T = string>(key: string) => values.get(key) as T | undefined,
    set: async (key: string, value: string) => { values.set(key, value); },
    remove: async (key: string) => { values.delete(key); },
  };
}

export function createAuthSync(options: Options, injected?: Dependencies) {
  const deps: Dependencies = injected ?? {
    async createClient() {
      const { createClerkClient } = await import("@clerk/chrome-extension/client");
      return createClerkClient({
        publishableKey: options.publishableKey,
        syncHost: options.syncHost,
        background: true,
        storageCache: createAuthCache(),
      });
    },
    cookies: chrome.cookies.onChanged,
    window,
    document,
  };
  let client: Client | undefined;
  let user: AuthUser | null = null;
  let unsubscribe: (() => void) | undefined;
  let revision = 0;
  let identityRevision = 0;
  let appliedRevision = -1;
  let running: Promise<void> | undefined;
  let signingOut = false;
  let logout: Promise<void> | undefined;
  let started = false;
  let disposed = false;
  const readUser = (source: Client): AuthUser | null => source.user
    ? {
        id: source.user.id,
        email: source.user.primaryEmailAddress?.emailAddress || "",
        name: source.user.fullName || source.user.firstName || undefined,
        imageUrl: source.user.imageUrl || undefined,
      }
    : null;
  async function publish(source: Client, force = false) {
    if (disposed || signingOut || source !== client) return;
    const next = readUser(source);
    if (force || next?.id !== user?.id || next?.email !== user?.email ||
      next?.name !== user?.name || next?.imageUrl !== user?.imageUrl) {
      if (next?.id !== user?.id) identityRevision++;
      user = next;
      await options.onChange(next);
    }
  }
  function report(error: unknown) { if (!disposed) options.onError(error); }
  async function synchronize() {
    while (!disposed && !signingOut && appliedRevision !== revision) {
      const requested = revision;
      const next = await deps.createClient();
      if (disposed || signingOut) return;
      if (requested !== revision) continue;
      unsubscribe?.();
      client = next;
      appliedRevision = requested;
      let subscribing = true;
      unsubscribe = next.addListener(() => { if (!subscribing) void publish(next).catch(report); });
      subscribing = false;
      void publish(next, true).catch(report);
    }
  }
  function refresh(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (signingOut) return Promise.resolve();
    revision++;
    if (!running) running = synchronize().finally(() => { running = undefined; });
    return running;
  }
  const onCookie = (change: CookieChange) => {
    if (isAuthCookie(change, options.syncHost)) void refresh().catch(report);
  };
  const onFocus = () => { void refresh().catch(report); };
  const onVisible = () => { if (deps.document.visibilityState === "visible") onFocus(); };
  const dispose = () => {
    disposed = true;
    revision++;
    unsubscribe?.();
    client = undefined;
    user = null;
    deps.cookies.removeListener(onCookie);
    deps.window.removeEventListener("focus", onFocus);
    deps.window.removeEventListener("pagehide", dispose);
    deps.document.removeEventListener("visibilitychange", onVisible);
  };
  return {
    async start() {
      if (started || disposed) return;
      started = true;
      deps.cookies.addListener(onCookie);
      deps.window.addEventListener("focus", onFocus);
      deps.window.addEventListener("pagehide", dispose);
      deps.document.addEventListener("visibilitychange", onVisible);
      await refresh();
    },
    refresh,
    signOut(): Promise<void> {
      if (logout) return logout;
      if (disposed) return Promise.resolve();
      signingOut = true;
      revision++;
      identityRevision++;
      logout = Promise.resolve().then(async () => {
        try {
          // Ignore refreshes captured before revocation and suppress cookie/focus
          // refreshes until Clerk has finished revoking the shared client sessions.
          if (running) await running;
          if (disposed) return;
          const source = client ?? await deps.createClient();
          await source.signOut();
          unsubscribe?.();
          unsubscribe = undefined;
          client = undefined;
          user = null;
          if (!disposed) await options.onChange(null);
        } finally {
          signingOut = false;
          logout = undefined;
          if (!disposed) await refresh();
        }
      });
      return logout;
    },
    getUser: () => user,
    async getToken() {
      if (signingOut) return null;
      const account = user?.id;
      const identity = identityRevision;
      // Focus can arrive while Clerk is fetching a token (e.g. file picker closes).
      // Retry against the refreshed client for the SAME identity, never another user.
      for (let attempt = 0; attempt < 3; attempt++) {
        if (appliedRevision !== revision && running) await running;
        if (disposed || !account || account !== user?.id || identity !== identityRevision) return null;
        const expected = revision;
        const source = client;
        if (appliedRevision !== expected || !source) continue;
        let token: string | null | undefined;
        try {
          token = await source.session?.getToken();
        } catch (error) {
          if (expected === revision) throw error;
          continue;
        }
        if (disposed || account !== user?.id || identity !== identityRevision) return null;
        if (expected !== revision || source !== client) continue;
        return account === readUser(source)?.id ? token ?? null : null;
      }
      throw new Error("AUTH_SYNC_IN_PROGRESS");
    },
    dispose,
  };
}
