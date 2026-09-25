import { BYOK_SETTINGS, BYOK_SECRET, DEFAULT_BYOK, providerEndpoint, validateByok, reverseWithByok, fetchByokModels, type ByokSettings } from "./byok";
import { STAR_SVG, reconcileFavorites, type SavedPrompt } from "./favorites";
import { buildChatGPTHandoff } from "./chatgpt-handoff";
import { languages, readLanguage, saveLanguage, accountMessages, welcomeMessages, emptyMessages, chatgptMessages, startupMessages, byokMessages, providerStatusMessages, favoriteMessages } from "./language";
import { canApplyRecovery } from "./recovery-guard";
import { createAuthSync, type AuthUser } from "./auth";
import { config } from "./config";
import { getRetryImage, putRetryImage, pruneRetryImages } from "./retry-images";
import { prepareImage, MAX_FILE } from "./image";
import { recoveryDecision, type PendingRequest } from "./recovery";
import {
  localTaskExpiresAt,
  emptyHistory,
  normalizeHistory,
  mergeTask,
  deleteHistoryTask,
  type Task,
  type TaskHistory,
  type HistoryEntry,
} from "./task-history";
const RETRY_ICON_SVG = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-1.383-4.797m1.09-4.202l-.173 2.054c-.124 1.479-.186 2.218-.668 2.634s-1.193.343-2.615.197l-2.044-.21"/></svg>';
const DELETE_ICON_SVG = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m19.5 5.5l-.62 10.025c-.158 2.561-.237 3.842-.88 4.763a4 4 0 0 1-1.2 1.128c-.957.584-2.24.584-4.806.584c-2.57 0-3.855 0-4.814-.585a4 4 0 0 1-1.2-1.13c-.642-.922-.72-2.205-.874-4.77L4.5 5.5M3 5.5h18m-4.944 0l-.683-1.408c-.453-.936-.68-1.403-1.071-1.695a2 2 0 0 0-.275-.172C13.594 2 13.074 2 12.035 2c-1.066 0-1.599 0-2.04.234a2 2 0 0 0-.278.18c-.395.303-.616.788-1.058 1.757L8.053 5.5m1.447 11v-6m5 6v-6"/></svg>';
const EXPAND_ICON_SVG = '<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"><g fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7.5" cy="7.5" r="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.5 12c0-4.478 0-6.718 1.391-8.109S7.521 2.5 12 2.5c4.478 0 6.718 0 8.109 1.391S21.5 7.521 21.5 12c0 4.478 0 6.718-1.391 8.109S16.479 21.5 12 21.5c-4.478 0-6.718 0-8.109-1.391S2.5 16.479 2.5 12Z"/><path d="M5 21c4.372-5.225 9.274-12.116 16.498-7.458"/></g></svg>';
const BYOK_ICON_SVG = '<svg class="byok-connect-icon" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.513 19.487c2.512 2.392 5.503 1.435 6.7.466c.618-.501.897-.825 1.136-1.065c.837-.777.784-1.555.24-2.177c-.219-.249-1.616-1.591-2.956-2.967c-.694-.694-1.172-1.184-1.582-1.58c-.547-.546-1.026-1.172-1.744-1.154c-.658 0-1.136.58-1.735 1.179c-.688.688-1.196 1.555-1.375 2.333c-.539 2.273.299 3.888 1.316 4.965Zm0 0L2 21.999M19.487 4.515c-2.513-2.394-5.494-1.42-6.69-.45c-.62.502-.898.826-1.138 1.066c-.837.778-.784 1.556-.239 2.178c.078.09.31.32.635.644m7.432-3.438c1.017 1.077 1.866 2.71 1.327 4.985c-.18.778-.688 1.645-1.376 2.334c-.598.598-1.077 1.179-1.735 1.179c-.718.018-1.09-.502-1.639-1.048m3.423-7.45L22 2m-5.936 9.964c-.41-.395-.994-.993-1.688-1.687c-.858-.882-1.74-1.75-2.321-2.325m4.009 4.012l-1.562 1.525m-3.99-3.984l1.543-1.553" /></svg>';
const locale = readLanguage(chrome.i18n.getUILanguage());
const zh = locale === "zh-CN";
const accountText = accountMessages[zh ? "zh-CN" : "en"];
const welcomeText = welcomeMessages[zh ? "zh-CN" : "en"];
const chatgptText = chatgptMessages[locale as keyof typeof chatgptMessages];
const startupText = startupMessages[locale as keyof typeof startupMessages];
const byokText = byokMessages[locale as keyof typeof byokMessages];
const providerText = providerStatusMessages[locale as keyof typeof providerStatusMessages];
const favoriteText = favoriteMessages[locale as keyof typeof favoriteMessages];
const emptyText = emptyMessages[locale as keyof typeof emptyMessages];
const say = (en: string, cn: string) => (zh ? cn : en);
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const labels: Record<string, string> = {
  menuCreditsLabel: say("Credits", "积分"),
  menuReleasesLabel: say("What’s new", "最新动态"),
  menuSupportLabel: say("Contact us", "联系我们"),
  menuLanguageLabel: accountText.language,
  menuLogoutLabel: accountText.logout,
  login: welcomeText.login,
  welcomeTitle: welcomeText.title,
  emptyTitle: emptyText.title,
  emptyDescription: emptyText.description,
  emptyUpload: emptyText.upload,
  current: say("Enable on this site", "仅当前网站启用"),
  all: say("Enable on all websites", "所有普通网站启用"),
  disable: say("Disable website access", "停用网站访问"),
  uploadHint: say("Drop image or", "拖入图片或"),
  uploadButton: say("+ Upload", "＋ 上传"),
  permission: say("Allow image source & continue", "允许读取图片来源并继续"),
  copyLabel: say("Copy", "复制"),
  handoffLabel: say("Generate", "生成"),
  retry: say("Retry", "重试"),
};
el("startupLabel").textContent = startupText.loading;
for (const [id, value] of Object.entries(labels)) el(id).textContent = value;
const [hintBefore, hintAfter] = emptyText.hint.split("{marker}");
const hintMarker = document.createElement("span");
hintMarker.className = "empty-hint-marker";
hintMarker.setAttribute("aria-hidden", "true");
const hintLogo = el("handoff").querySelector("svg")!.cloneNode(true) as SVGElement;
hintLogo.querySelector("linearGradient")!.id = "empty-hint-gradient";
hintLogo.querySelector('[fill^="url("]')!.setAttribute("fill", "url(#empty-hint-gradient)");
hintMarker.append(hintLogo);
const hintPrefix = document.createElement("span");
hintPrefix.textContent = hintBefore.trim();
const hintSuffix = document.createElement("span");
hintSuffix.textContent = hintAfter.trim();
el("emptyHint").replaceChildren(hintPrefix, hintMarker, hintSuffix);
el("emptyHint").setAttribute("aria-label", emptyText.hint.replace("{marker}", "P"));
for (const line of welcomeText.description) {
  const span = document.createElement("span");
  span.textContent = line;
  el("welcomeDescription").append(span);
}
const demo = el<HTMLVideoElement>("welcomeDemo");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
demo.muted = true;
demo.setAttribute("aria-label", welcomeText.demo);
function syncWelcomeDemo() {
  if (el("welcome").hidden || document.hidden || reducedMotion.matches) demo.pause();
  else void demo.play().catch(() => {});
}
document.addEventListener("visibilitychange", syncWelcomeDemo);
reducedMotion.addEventListener("change", syncWelcomeDemo);
syncWelcomeDemo();

el("accountIdentity").setAttribute(
  "aria-label",
  say("Account menu", "账户菜单"),
);
el("tasks").setAttribute("aria-label", say("Recent tasks", "最近任务"));
el("prompt").setAttribute("aria-label", say("English prompt", "英文提示词"));
el("handoff").title = say(
  "Open this prompt in PixOnDeck; generation is charged separately.",
  "带回 PixOnDeck 生成，生图另行计费。",
);
el("handoff").setAttribute("aria-label", el("handoff").title);
const creditUploadTitle = say(
  "1 credit per successful reverse",
  "每次成功反推消耗 1 积分",
);
el("uploadButton").title = creditUploadTitle;
document.documentElement.lang = locale;
el<HTMLImageElement>("avatarImage").onload = () => {
  el("avatarImage").hidden = false;
};
el<HTMLImageElement>("avatarImage").onerror = () => {
  el("avatarImage").hidden = true;
};
type Selection = { url: string; id: string; selectedAt: number };
type Prepared = Awaited<ReturnType<typeof prepareImage>>;
let refreshRevision = 0,
  operationRevision = 0;
let loginUpload: { image: Prepared; hash: string; thumbnail: string } | null =
  null;
let accountEpoch = 0,
  userId = "",
  history: TaskHistory = emptyHistory(),
  task: Task | null = null,
  prepared: Prepared | null = null;
let pending: Selection | null = null,
  uncertain = false,
  pendingRequest: PendingRequest | null = null,
  busy = false,
  requestId = "",
  hash = "",
  pendingThumbnail = "",
  poll = 0;
let byokSettings: ByokSettings = { ...DEFAULT_BYOK };
let byokKey = "";
let creditBalance: number | null = null;
let byokConnection: keyof typeof providerText = "unconfigured";
let byokAbort: AbortController | null = null;
let byokModelsAbort: AbortController | null = null;
let byokModelsRevision = 0;
let byokModelOptions: string[] = [];
let byokModelActive = -1;
let favoritesView = false;
let favoritesHistory = emptyHistory();
let favoriteItems = new Map<string, SavedPrompt>();
let favoritesLoaded = false;
let favoriteFetch: Promise<void> | null = null;
let favoriteRevision = 0;
let favoriteEditTimer = 0;
let favoriteFeedbackTimer = 0;
let favoriteEdit: Promise<boolean> | null = null;
let favoriteConflictId: string | null = null;
const favoriteBaseRevision = new Map<string, number>();
const favoriteBusy = new Set<string>();
const favoriteObjectUrls = new Set<string>();
const railScroll = { recent: 0, favorites: 0 };
const viewHistory = () => favoritesView ? favoritesHistory : history;
const isByok = () => byokSettings.mode === "byok";
const byokError = (error: unknown) => {
  const code = error instanceof Error ? error.message : "";
  return byokText.errors[code as keyof typeof byokText.errors] ?? byokText.errors.connection;
};
function renderProvider() {
  const credits = document.querySelector<HTMLElement>(".account-credits")!;
  const icon = credits.querySelector("svg:not(.byok-connect-icon)");
  if (icon) (icon as SVGElement).style.display = isByok() ? "none" : "";
  let placeholder = credits.querySelector<HTMLElement>(".byok-placeholder");
  if (!placeholder) { placeholder = document.createElement("span"); placeholder.className = "byok-placeholder"; placeholder.innerHTML = BYOK_ICON_SVG; credits.prepend(placeholder); }
  placeholder.hidden = !isByok();
  credits.classList.toggle("byok-credit", isByok());
  el("modeCredits").setAttribute("aria-pressed", String(!isByok()));
  el("modeByok").setAttribute("aria-pressed", String(isByok()));
  el("byokConfigure").hidden = !isByok();
  const configured = Boolean(byokKey && byokSettings.model);
  el("byokMenuStatus").textContent = configured ? providerText.connected : byokText.configure;
  el("byokMenuStatus").classList.toggle("configured", configured);
  el("menuCredits").hidden = isByok();
  if (isByok()) {
    el("balance").textContent = providerText[byokConnection];
    el("balance").title = byokText.upload;
    el("balance").setAttribute("aria-label", providerText[byokConnection]);
  } else if (creditBalance !== null) {
    setBalance(creditBalance);
  } else {
    el("balance").textContent = "—";
    el("menuBalance").textContent = "—";
    el("balance").title = byokText.credits;
    el("balance").setAttribute("aria-label", byokText.credits);
  }
  el("uploadButton").title = isByok() ? byokText.upload : creditUploadTitle;
}
function renderFavoritesToggle() {
  el("favoritesCount").textContent = favoritesLoaded ? String(favoriteItems.size) : "—";
  el("favoritesToggle").setAttribute("aria-pressed", String(favoritesView));
  el("favoritesToggle").setAttribute("aria-label", `${favoriteText.favorites} ${favoriteItems.size}/100`);
  el("favoritesToggle").title = `${favoriteText.favorites} ${favoriteItems.size}/100`;
}
function favoriteStar(item: Task, interactive = false) {
  const saved = favoriteItems.has(item.id);
  const star = document.createElement(interactive ? "button" : "span");
  star.className = `favorite-star${saved ? " saved" : ""}`;
  star.innerHTML = STAR_SVG;
  star.title = saved ? favoriteText.remove : favoriteText.save;
  if (interactive) {
    (star as HTMLButtonElement).type = "button";
    (star as HTMLButtonElement).disabled = favoriteBusy.has(item.id) || !userId;
    star.setAttribute("aria-label", star.title);
    star.setAttribute("aria-pressed", String(saved));
    star.onclick = () => void toggleFavorite(item.id);
  } else star.setAttribute("aria-hidden", "true");
  return star;
}
function resetFavorites() {
  favoriteRevision++;
  window.clearTimeout(favoriteEditTimer);
  favoritesView = false;
  favoritesHistory = emptyHistory();
  favoriteItems = new Map();
  favoritesLoaded = false;
  favoriteFetch = null;
  favoriteEdit = null;
  favoriteConflictId = null;
  favoriteBusy.clear();
  favoriteBaseRevision.clear();
  for (const url of favoriteObjectUrls) URL.revokeObjectURL(url);
  favoriteObjectUrls.clear();
  railScroll.recent = railScroll.favorites = 0;
  renderFavoritesToggle();
}

let authRetryTimer = 0,
  authRetryCount = 0;
function scheduleAuthRecovery() {
  if (authRetryTimer || authRetryCount >= 3) return;
  const delay = [2000, 5000, 10000][authRetryCount++];
  authRetryTimer = window.setTimeout(() => {
    authRetryTimer = 0;
    void auth.refresh().catch(() => scheduleAuthRecovery());
  }, delay);
}
const preparedByTask = new Map<string, Prepared>();
const prompt = el<HTMLTextAreaElement>("prompt");
const status = (message: string) => {
  if (message && document.body.classList.contains("auth-pending")) {
    document.body.classList.remove("auth-pending");
    document.body.removeAttribute("aria-busy");
    document.body.classList.add("signed-out");
    el("welcome").hidden = false;
    syncWelcomeDemo();
  }
  const short = /Connection interrupted|连接中断/.test(message)
    ? say("Disconnected · retrying", "连接中断 · 重试中")
    : /Unconfirmed|尚未确认/.test(message)
      ? say("Request unconfirmed", "请求待确认")
      : /Cannot read this image|无法读取这张图片/.test(message)
        ? say("Cannot read image · upload locally", "图片无法读取 · 请本地上传")
        : message.length > 100
          ? say("Action needed · see details", "需要处理 · 查看详情")
          : message;
  el("status").textContent = short;
  el("status").title = message;
  el("status").setAttribute("aria-label", message);
  el("status").hidden = !message;
  el("guestStatus").textContent = short;
  el("guestStatus").hidden = !message;
};
const key = () => `reverse:${userId}`;
const runningTask = () =>
  history.entries.find(
    (entry) => !["succeeded", "failed"].includes(entry.task.status),
  )?.task;
const isRunning = () => Boolean(runningTask());
const auth = createAuthSync({
  publishableKey: config.publishableKey,
  syncHost: config.syncHost,
  onChange: (user) => accountChanged(user),
  onError: (error) =>
    status(error instanceof Error ? error.message : String(error)),
});
function setBalance(value: number) {
  creditBalance = value;
  el("menuBalance").textContent = value.toLocaleString(zh ? "zh-CN" : "en");
  if (isByok()) { renderProvider(); return; }
  el("balance").textContent = value.toLocaleString(zh ? "zh-CN" : "en");
  const label = say(`${value} credits`, `${value} 积分`);
  el("balance").title = label;
  el("balance").setAttribute("aria-label", label);
}
function taskState(item: Task) {
  return item.status === "succeeded"
    ? say("Ready", "完成")
    : item.status === "failed"
      ? say("Failed", "失败")
      : say("Working", "处理中");
}
function controls() {
  const loading = Boolean(task && !["succeeded", "failed"].includes(task.status));
  el("promptLoading").hidden = !loading;
  el("promptLoadingText").textContent = say("Analyzing image…", "正在反推…");
  const deleteButton = document.querySelector<HTMLButtonElement>(".task-delete");
  if (deleteButton) deleteButton.disabled = busy || loading;
  prompt.readOnly = loading;
  prompt.setAttribute("aria-busy", String(loading));
  el("retry").innerHTML = RETRY_ICON_SVG;
  el("retry").classList.add("task-icon-button");
  el("retry").title = uncertain
    ? !prepared
      ? say(
          "Upload the same image to recover this request — no duplicate charge.",
          "请重新上传同一张图片以恢复请求，不重复扣费。",
        )
      : say(
          "Recover the same request — no duplicate charge.",
          "恢复同一请求，不重复扣费。",
        )
    : !prepared && task
      ? say(
          "Local image unavailable. Choose the original image to retry — 1 credit on success.",
          "本地图片不可用，点击选择同一张原图重试，成功消耗 1 积分。",
        )
      : say(
          "Reverse this image again — 1 credit on success.",
          "重新反推这张图片，成功消耗 1 积分。",
        );
  if (isByok()) el("retry").title = byokText.retry;
  el("retry").hidden = favoritesView;
  el("retry").setAttribute("aria-label", el("retry").title);
  for (const id of ["copy", "chatgpt", "handoff"])
    el<HTMLButtonElement>(id).disabled =
      !task || task.status !== "succeeded" || !prompt.value.trim();
  el("handoff").hidden = false;
  el<HTMLButtonElement>("retry").disabled =
    busy || isRunning() || !task || !userId;
  el<HTMLButtonElement>("uploadButton").disabled = busy || isRunning();
  el<HTMLButtonElement>("emptyUpload").disabled = busy || isRunning();
}
function taskDetail(item: Task) {
  if (favoritesView) return favoriteText.saved;
  if (item.source === "byok") return item.status === "succeeded" ? byokText.ready : item.status === "failed" ? byokText.failed : byokText.working;
  return item.status === "succeeded"
    ? say("Completed — 1 credit used.", "已完成，消耗 1 积分。")
    : item.status === "failed"
      ? `${item.refunded ? say("Failed — 1 credit refunded.", "失败，已退还 1 积分。") : say("Failed — refund not yet confirmed.", "失败，退款尚未确认。")} ${item.errorCode || ""}`
      : say(
          "Processing — 1 credit reserved; failures are refunded.",
          "处理中，已预扣 1 积分；失败自动退款。",
        );
}
function statusDot(item: Task) {
  if (item.status === "succeeded") return favoriteStar(item);
  const dot = document.createElement("span");
  dot.className = `status-dot ${item.status === "succeeded" ? "success" : item.status === "failed" ? "error" : "pending"}`;
  dot.title = taskDetail(item);
  dot.setAttribute("role", "img");
  dot.setAttribute("aria-label", dot.title);
  dot.tabIndex = 0;
  return dot;
}
function updateTaskFades() {
  const list = el("tasks");
  list.style.setProperty("--fade-top", list.scrollTop > 1 ? "32px" : "0px");
  list.style.setProperty(
    "--fade-bottom",
    list.scrollTop + list.clientHeight < list.scrollHeight - 1 ? "32px" : "0px",
  );
}
el("tasks").addEventListener("scroll", updateTaskFades, { passive: true });
const taskResizeObserver = new ResizeObserver(updateTaskFades);
taskResizeObserver.observe(el("tasks"));
function renderTabs() {
  const history = viewHistory();
  const tabs = el("tasks");
  const existing = new Map(
    Array.from(tabs.children, node => [node.id, node as HTMLButtonElement]),
  );
  for (const [index, entry] of history.entries.entries()) {
    const id = `task-${entry.task.id}`;
    const button = existing.get(id) ?? document.createElement("button");
    existing.delete(id);
    button.className = "task-tab";
    button.dataset.status = entry.task.status;
    button.id = `task-${entry.task.id}`;
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute(
      "aria-selected",
      String(entry.task.id === history.selectedId),
    );
    button.setAttribute("aria-controls", "taskContent");
    button.title = entry.draft.trim() || taskDetail(entry.task);
    button.setAttribute(
      "aria-label",
      `${entry.draft.trim() || taskState(entry.task)} · ${entry.task.originalWidth} × ${entry.task.originalHeight}`,
    );
    button.tabIndex = entry.task.id === history.selectedId ? 0 : -1;
    const contentKey = JSON.stringify([
      entry.thumbnail, entry.draft, entry.task.status, button.title, favoriteItems.has(entry.task.id),
    ]);
    if (button.dataset.contentKey !== contentKey) {
      button.dataset.contentKey = contentKey;
      button.replaceChildren();
    if (entry.thumbnail) {
      const image = document.createElement("img");
      image.src = entry.thumbnail;
      image.alt = "";
      button.append(image);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "tab-placeholder";
      placeholder.textContent = "▧";
      button.append(placeholder);
    }
    const state = document.createElement("span");
    state.className = "task-state";
    const excerpt = document.createElement("span");
    excerpt.className = "tab-prompt-excerpt";
    excerpt.textContent = entry.draft.trim().replace(/\s+/g, " ") || taskState(entry.task);
    const dot = statusDot(entry.task);
    dot.removeAttribute("tabindex");
    state.append(excerpt, dot);
    button.append(state);
    }
    button.onclick = () => void selectTask(entry.task.id);
    button.onkeydown = (event) => {
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = history.entries.findIndex(
        (item) => item.task.id === entry.task.id,
      );
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? history.entries.length - 1
            : (index +
                (event.key === "ArrowDown" ? 1 : -1) +
                history.entries.length) %
              history.entries.length;
      void selectTask(history.entries[next].task.id).then(() =>
        el("tasks")
          .querySelector<HTMLButtonElement>('[aria-selected="true"]')
          ?.focus({ preventScroll: true }),
      );
    };
    // Leave unchanged nodes attached so refreshes preserve focus and transitions.
    if (tabs.children[index] !== button) {
      tabs.insertBefore(button, tabs.children[index] ?? null);
    }
  }
  for (const stale of existing.values()) stale.remove();
  requestAnimationFrame(updateTaskFades);
}
function renderSelected() {
  const history = viewHistory();
  prompt.maxLength = favoritesView ? 2000 : 1800;
  el("tasks").setAttribute("aria-label", favoritesView ? favoriteText.favorites : say("Recent tasks", "最近任务"));
  const entry = history.entries.find(
    (item) => item.task.id === history.selectedId,
  );
  task = entry?.task ?? null;
  if (prompt.value !== (entry?.draft ?? "")) prompt.value = entry?.draft ?? "";
  prepared = entry ? (preparedByTask.get(entry.task.id) ?? null) : prepared;
  if (entry && !prepared) {
    const account = userId,
      id = entry.task.id,
      epoch = accountEpoch;
    void getRetryImage(account, id)
      .then((image) => {
        if (!image || epoch !== accountEpoch || account !== userId) return;
        preparedByTask.set(id, image);
        if (history.selectedId === id) {
          prepared = image;
          controls();
        }
      })
      .catch(() => {});
  }
  el("emptyTitle").textContent = favoritesView ? favoriteText.empty : emptyText.title;
  el("emptyDescription").textContent = favoritesView ? favoriteText.emptyDescription : emptyText.description;
  el("emptyHint").hidden = favoritesView;
  el("emptyUpload").hidden = favoritesView;
  el("favoriteConflict").hidden = !favoritesView || favoriteConflictId !== entry?.task.id;
  el("emptyState").hidden = Boolean(entry);
  el("taskContent").hidden = !entry;
  el("taskToolbar").hidden = !entry;
  if (entry)
    el("taskContent").setAttribute("aria-labelledby", `task-${entry.task.id}`);
  if (task) {
    const dimensions = document.createElement("span");
    dimensions.textContent = `${task.originalWidth}×${task.originalHeight}`;
    const started = document.createElement("time");
    started.className = "task-time";
    const date = new Date(task.createdAt ?? "");
    if (Number.isFinite(date.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      started.dateTime = date.toISOString();
      started.textContent = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    } else started.textContent = "—";
    started.title = favoritesView ? favoriteText.savedAt : say(
      "Reverse requested at (local time)",
      "发起反推时间（本地时间）",
    );
    started.setAttribute(
      "aria-label",
      `${started.title}: ${started.textContent}`,
    );
    const top = document.createElement("span");
    top.className = "task-info-row";
    const remove = document.createElement("button");
    remove.className = "task-delete text-button task-icon-button";
    remove.innerHTML = DELETE_ICON_SVG;
    remove.setAttribute("aria-label", say("Delete", "删除"));
    remove.disabled = busy || !["succeeded", "failed"].includes(task.status);
    remove.title = say("Delete local task and cached image", "删除本地任务和缓存图片");
    const taskId = task.id;
    remove.hidden = favoritesView;
    remove.onclick = () => void deleteLocalTask(taskId);
    const view = document.createElement("button");
    view.className = "task-view text-button task-icon-button";
    view.innerHTML = EXPAND_ICON_SVG;
    view.title = say("View image", "查看大图");
    view.setAttribute("aria-label", view.title);
    view.onclick = () => void viewTaskImage(taskId);
    top.append(task.status === "succeeded" ? favoriteStar(task, true) : statusDot(task), view, el("retry"), remove);
    const bottom = document.createElement("span");
    bottom.className = "task-info-row task-info-details";
    const feedback = document.createElement("span");
    feedback.id = "favoriteSaveState"; feedback.setAttribute("role", "status"); feedback.setAttribute("aria-live", "polite");
    bottom.append(dimensions, feedback, started);
    el("taskInfo").replaceChildren(top, bottom);
    const detail = taskDetail(task);
    el("taskInfo").title = detail;
    el("taskInfo").setAttribute(
      "aria-label",
      `${el("taskInfo").textContent}. ${detail}`,
    );
  }
  status(favoritesView && favoriteConflictId === task?.id ? (favoriteItems.has(task!.id) ? favoriteText.conflict : favoriteText.deleted) : "");
  renderTabs();
  controls();
}
async function deleteLocalTask(id: string) {
  const index = history.entries.findIndex((entry) => entry.task.id === id);
  const entry = history.entries[index];
  if (!entry || busy || !["succeeded", "failed"].includes(entry.task.status)) return;
  const account = userId, epoch = accountEpoch;
  operationRevision++;
  history = deleteHistoryTask(history, id);
  const remainingIds = history.entries.map((item) => item.task.id);
  preparedByTask.delete(id);
  prepared = null;
  renderSelected();
  try {
    await persist();
    await pruneRetryImages(account, remainingIds);
  } catch {
    if (account === userId && epoch === accountEpoch)
      status(say("Could not finish removing local data.", "本地数据清理未完成，请重试。"));
  }
}
async function persist() {
  if (userId) await chrome.storage.local.set({ [key()]: history });
}
function centerTask(id: string) {
  const tab = document.getElementById(`task-${id}`);
  if (!tab) return;
  if (!tab.isConnected || viewHistory().selectedId !== id) return;
  const list = el("tasks");
  const target = tab.getBoundingClientRect();
  const bounds = list.getBoundingClientRect();
  const stateHeight = tab.querySelector(".task-state")?.getBoundingClientRect().height ?? 18;
  const finalHeight = target.height + 18 - stateHeight;
  list.scrollTo({
    top: list.scrollTop + target.top - bounds.top + finalHeight / 2 - list.clientHeight / 2,
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
  });
}
async function viewTaskImage(id: string) {
  const account = userId;
  const entry = viewHistory().entries.find(item => item.task.id === id);
  if (!entry) return;
  const image = preparedByTask.get(id) ?? await getRetryImage(account, id).catch(() => null);
  if (account !== userId || viewHistory().selectedId !== id) return;
  const url = image ? URL.createObjectURL(image.originalBlob ?? image.blob) : entry.thumbnail;
  if (!url) { status(say("Local image unavailable.", "本地图片已不可用。")); return; }
  const dialog = document.createElement("dialog");
  dialog.className = "image-preview";
  dialog.setAttribute("aria-label", say("Image preview", "图片预览"));
  const close = document.createElement("button");
  close.className = "image-preview-close";
  close.setAttribute("aria-label", say("Close", "关闭"));
  close.title = say("Close", "关闭");
  close.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  close.onclick = () => dialog.close();
  const full = document.createElement("img");
  full.src = url;
  full.alt = say("Task image", "任务图片");
  dialog.append(close, full);
  dialog.onclick = event => { if (event.target === dialog) dialog.close(); };
  dialog.onclose = () => { if (image) URL.revokeObjectURL(url); dialog.remove(); };
  document.body.append(dialog);
  dialog.showModal();
}
async function selectTask(id: string) {
  if (favoritesView) {
    void flushFavoriteEdit();
    favoritesHistory.selectedId = id; renderSelected(); void centerTask(id); return;
  }
  history.selectedId = id;
  renderSelected();
  void centerTask(id);
  await persist();
  if (history.entries.find(entry => entry.task.id === id)?.task.source === "byok") return;
  // Older local entries predate server timing metadata; hydrate on selection.
  if (history.entries.find((entry) => entry.task.id === id)?.task.createdAt)
    return;
  const epoch = accountEpoch;
  try {
    const data = await api(`/api/reverse/${id}`);
    if (
      epoch === accountEpoch &&
      history.entries.some((entry) => entry.task.id === id)
    )
      await showTask(data.task);
  } catch {
    // Keep the saved prompt usable when the timing request is unavailable.
  }
}
async function save() {
  if (favoritesView) {
    const entry = favoritesHistory.entries.find(entry => entry.task.id === favoritesHistory.selectedId);
    if (entry) {
      if (!entry.edited) favoriteBaseRevision.set(entry.task.id, favoriteItems.get(entry.task.id)?.revision ?? 1);
      entry.draft = prompt.value; entry.edited = true;
      renderTabs();
      await persistFavoriteDrafts(); scheduleFavoriteEdit();
    }
    return;
  }
  const entry = history.entries.find(
    (item) => item.task.id === history.selectedId,
  );
  if (entry) {
    entry.draft = prompt.value;
    entry.edited = true;
    renderTabs();
    await persist();
  }
}
async function api(path: string, init: RequestInit = {}) {
  const account = userId, epoch = accountEpoch;
  const token = await auth.getToken();
  if (account !== userId || epoch !== accountEpoch) throw new Error("ACCOUNT_CHANGED");
  if (!token) throw new Error("UNAUTHENTICATED");
  const response = await fetch(`${config.apiOrigin}${path}`, {
    signal: AbortSignal.timeout(30_000),
    ...init,
    credentials: "omit",
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || `HTTP_${response.status}`);
    Object.assign(error, { httpStatus: response.status, data });
    throw error;
  }
  return data;
}
async function showTask(
  next: Task,
  balance?: number,
  select = false,
  metadata?: { hash: string; thumbnail: string; image: Prepared },
) {
  const account = userId, epoch = accountEpoch;
  operationRevision++;
  const selected = history.selectedId;
  let storageWarning = "";
  history = mergeTask(history, next, {
    select,
    ...(metadata ? { hash: metadata.hash, thumbnail: metadata.thumbnail } : {}),
  });
  if (metadata) {
    preparedByTask.set(next.id, metadata.image);
    try {
      await putRetryImage(
        userId,
        next.id,
        metadata.image,
        localTaskExpiresAt(next),
      );
    } catch {
      storageWarning = say(
        "Local image could not be saved; keep this panel open to view or retry.",
        "本地图片保存失败；保持面板打开仍可查看或重试。",
      );
    }
  }
  if (account !== userId || epoch !== accountEpoch) return;
  for (const id of preparedByTask.keys())
    if (!history.entries.some((entry) => entry.task.id === id))
      preparedByTask.delete(id);
  if (balance !== undefined) setBalance(balance);
  // Updating another tab must not repaint the selected editor or steal selection.
  if (
    select ||
    history.selectedId !== selected ||
    next.id === history.selectedId
  )
    renderSelected();
  else {
    renderTabs();
    controls();
  }
  if (storageWarning) status(storageWarning);
  await persist();
  window.clearTimeout(poll);
  if (runningTask()?.source !== "byok" && isRunning()) poll = window.setTimeout(() => void resume(), 2000);
}
async function resume() {
  const active = runningTask();
  if (!active || active.source === "byok") return;
  const account = userId,
    epoch = accountEpoch;
  try {
    const data = await api(`/api/reverse/${active.id}`);
    if (account === userId && epoch === accountEpoch)
      await showTask(data.task, data.balance);
  } catch (error) {
    if (account !== userId || epoch !== accountEpoch) return;
    if (
      error instanceof Error &&
      "httpStatus" in error &&
      [404, 410].includes(Number(error.httpStatus))
    ) {
      history = normalizeHistory({
        ...history,
        entries: history.entries.filter((entry) => entry.task.id !== active.id),
      });
      renderSelected();
      await persist();
      return;
    }
    if (history.selectedId === active.id) {
      const unauthorized =
        error instanceof Error &&
        (("httpStatus" in error && Number(error.httpStatus) === 401) ||
          error.message === "UNAUTHENTICATED");
      status(
        unauthorized
          ? say(
              "Syncing sign-in. This task will recover automatically.",
              "正在同步登录，当前任务会自动恢复。",
            )
          : say("Connection interrupted. Retrying…", "连接中断，正在重试…"),
      );
    }
    poll = window.setTimeout(() => void resume(), 5000);
  }
}
let startupCleanup: Promise<void> = Promise.resolve();
async function cleanup() {
  const all = await chrome.storage.local.get(null);
  for (const [k, value] of Object.entries(all)) {
    if (!k.startsWith("reverse:")) continue;
    const clean = normalizeHistory(value);
    if (!clean.entries.length && !clean.deleted.length) await chrome.storage.local.remove(k);
    else await chrome.storage.local.set({ [k]: clean });
  }
}
async function accountChanged(user: AuthUser | null) {
  const id = user?.id ?? "";
  const firstLogin = !userId && Boolean(id);
  const snapshot = {
    refreshRevision: ++refreshRevision,
    operationRevision,
    busy,
  };
  const canRestore = () =>
    canApplyRecovery(snapshot, { refreshRevision, operationRevision, busy });
  if (id !== userId) {
    byokAbort?.abort(); byokAbort = null;
    el<HTMLDialogElement>("byokDialog").close();
    el<HTMLInputElement>("byokKey").value = "";
    el<HTMLInputElement>("byokConsent").checked = false;
    document.querySelectorAll<HTMLDialogElement>("dialog.image-preview").forEach(dialog => dialog.close());
    creditBalance = null;
    byokKey = ""; byokSettings = { ...DEFAULT_BYOK }; byokConnection = "unconfigured";
    resetFavorites();
    const switched = Boolean(userId);
    accountEpoch++;
    busy = false;
    snapshot.busy = false;
    pendingRequest = null;
    window.clearTimeout(poll);
    userId = "";
    document.body.classList.add("auth-pending");
    document.body.setAttribute("aria-busy", "true");
    el("welcome").hidden = true;
    history = emptyHistory();
    task = null;
    hash = "";
    requestId = "";
    uncertain = false;
    prompt.value = "";
    preparedByTask.clear();
    if (switched) {
      loginUpload = null;
      prepared = null;
      pendingThumbnail = "";
    }
    el("balance").textContent = "";
    renderSelected();
  }
  // Finish maintenance and read both caches before exposing an actionable
  // account. A late auth callback must never reveal a previous user's data.
  await startupCleanup;
  const [localData, sessionData] = id ? await Promise.all([
    chrome.storage.local.get([`reverse:${id}`, `${BYOK_SETTINGS}:${id}`]),
    chrome.storage.session.get([`request:${id}`, `${BYOK_SECRET}:${id}`]),
  ]) : [{}, {}];
  if (snapshot.refreshRevision !== refreshRevision) return;
  userId = id;
  if (id) {
    const saved = localData[`${BYOK_SETTINGS}:${id}`] as ByokSettings | undefined;
    byokSettings = saved && ["credits", "byok"].includes(saved.mode) ? saved : { ...DEFAULT_BYOK };
    const secret = sessionData[`${BYOK_SECRET}:${id}`] as { key?: string; baseUrl?: string; model?: string; verified?: boolean } | undefined;
    byokKey = secret?.baseUrl === byokSettings.baseUrl && typeof secret.key === "string" ? secret.key : "";
    if (!busy) byokConnection = !byokKey ? "unconfigured" : secret?.verified && secret.model === byokSettings.model ? "connected" : "unverified";
  }
  renderProvider();
  const displayName = user?.name || user?.email?.split("@")[0] || id;
  el("accountIdentity").title = user?.email || displayName;
  el("accountName").textContent = displayName;
  el("menuName").textContent = displayName;
  el("menuEmail").textContent = user?.email ?? "";
  el("menuFallback").textContent = displayName.charAt(0).toUpperCase();
  if (!id) closeAccountMenu();
  el("avatarImage").setAttribute("alt", displayName);
  el("accountIdentity").hidden = !id;
  el("avatarFallback").textContent = displayName.charAt(0).toUpperCase();
  const avatar = el<HTMLImageElement>("avatarImage");
  const avatarUrl =
    user?.imageUrl && /^https:\/\//.test(user.imageUrl) ? user.imageUrl : "";
  const menuAvatar = el<HTMLImageElement>("menuAvatar");
  if (menuAvatar.getAttribute("src") !== avatarUrl) {
    menuAvatar.hidden = true;
    menuAvatar.onload = () => { menuAvatar.hidden = false; };
    menuAvatar.onerror = () => { menuAvatar.hidden = true; };
    if (avatarUrl) menuAvatar.src = avatarUrl;
    else menuAvatar.removeAttribute("src");
  }
  if (avatar.getAttribute("src") !== avatarUrl) {
    avatar.hidden = true;
    if (avatarUrl) avatar.src = avatarUrl;
    else avatar.removeAttribute("src");
  }
  document.body.classList.remove("auth-pending");
  document.body.removeAttribute("aria-busy");
  el("login").hidden = Boolean(id);
  el("welcome").hidden = Boolean(id);
  document.body.classList.toggle("signed-out", !id);
  syncWelcomeDemo();
  if (!id) return;
  const epoch = accountEpoch;
  const current = () =>
    id === userId &&
    epoch === accountEpoch &&
    snapshot.refreshRevision === refreshRevision;
  try {
    // Clerk has verified identity; render local work before the network sync.
    if (!current() || !canRestore()) return;
    if (!history.entries.length && !history.deleted.length)
      history = normalizeHistory(localData[`reverse:${id}`]);
    pendingRequest = (sessionData[`request:${id}`] as PendingRequest | null) ?? null;
    if (pendingRequest) {
      uncertain = true;
      requestId = pendingRequest.requestId;
      hash = pendingRequest.hash;
    }
    // A panel close interrupts direct requests. Never resubmit them automatically.
    for (const entry of history.entries) {
      if (entry.task.source === "byok" && !["succeeded", "failed"].includes(entry.task.status) && !busy)
        entry.task = { ...entry.task, status: "failed", errorCode: "connection" };
    }
    renderSelected();
    void refreshFavorites(false);
    if (isByok()) {
      await persist();
      if (!current()) return;
      if (runningTask()?.source !== "byok" && isRunning()) poll = window.setTimeout(() => void resume(), 1000);
      await consumePending();
      controls();
      return;
    }
    const hadSelection = history.selectedId;
    const data = await api("/api/reverse/config");
    if (!current() || snapshot.operationRevision !== operationRevision) return;
    if (!data.account || typeof data.account.balance !== "number") {
      el("balance").textContent = "—";
      throw new Error(say("Could not verify sign-in.", "登录状态验证失败。"));
    }
    window.clearTimeout(authRetryTimer);
    authRetryTimer = 0;
    authRetryCount = 0;
    setBalance(data.account.balance);
    if (!canRestore()) return;
    const decision = recoveryDecision<Task>({
      active: data.activeTask,
      recent: data.recentTask,
      stored: history.entries[0]?.task,
      pending: pendingRequest,
      deletedIds: history.deleted.map((item) => item.id),
    });
    uncertain = decision.unresolved;
    if (pendingRequest) {
      requestId = pendingRequest.requestId;
      hash = pendingRequest.hash;
    }
    if (data.recentTask)
      history = mergeTask(
        history,
        data.recentTask,
        pendingRequest && data.recentTask.requestId === pendingRequest.requestId
          ? { hash: pendingRequest.hash, thumbnail: pendingRequest.thumbnail }
          : {},
      );
    if (data.activeTask)
      history = mergeTask(
        history,
        data.activeTask,
        pendingRequest && data.activeTask.requestId === pendingRequest.requestId
          ? { hash: pendingRequest.hash, thumbnail: pendingRequest.thumbnail }
          : {},
      );
    if (decision.acknowledged && decision.task && !hadSelection)
      history.selectedId = decision.task.id;
    renderSelected();
    await persist();
    if (!current() || !canRestore()) return;
    if (decision.acknowledged) {
      await chrome.storage.session.remove(`request:${id}`);
      if (!current() || !canRestore()) return;
      pendingRequest = null;
    }
    window.clearTimeout(poll);
    if (isRunning()) poll = window.setTimeout(() => void resume(), 1000);
    if (uncertain) {
      status(
        say(
          "Unconfirmed request. Upload the same image to recover without a duplicate charge.",
          "请求尚未确认，请上传同一张图片恢复，不重复扣费。",
        ),
      );
      controls();
      return;
    }
    if (!data.enabled)
      status(say("Reverse is currently unavailable.", "反推服务暂不可用。"));
    else if (isRunning()) await consumePending();
    else if (firstLogin && loginUpload && !busy) {
      prepared = loginUpload.image;
      hash = loginUpload.hash;
      pendingThumbnail = loginUpload.thumbnail;
      loginUpload = null;
      requestId = crypto.randomUUID();
      busy = true;
      operationRevision++;
      try {
        await submit();
      } finally {
        if (current()) {
          busy = false;
          operationRevision++;
          controls();
        }
      }
    } else await consumePending();
    controls();
  } catch (error) {
    if (current()) {
      const httpStatus =
        error instanceof Error && "httpStatus" in error
          ? Number(error.httpStatus)
          : 0;
      if (!httpStatus || httpStatus === 401 || httpStatus >= 500) {
        const willRetry = authRetryCount < 3;
        scheduleAuthRecovery();
        status(
          willRetry
            ? say("Syncing account…", "正在同步账号…")
            : say(
                "Account unavailable · try again later",
                "账号暂不可用 · 稍后重试",
              ),
        );
      } else status(error instanceof Error ? error.message : String(error));
    }
  }
}
async function thumbnail(image: Prepared) {
  const bitmap = await createImageBitmap(image.blob);
  try {
    const scale = Math.min(1, 160 / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: 0.7,
    });
    if (blob.size > 32_000) return "";
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return `data:image/jpeg;base64,${btoa(String.fromCharCode(...bytes))}`;
  } finally {
    bitmap.close();
  }
}
async function loadBlob(blob: Blob, force = false, expectedHash?: string) {
  const account = userId,
    epoch = accountEpoch;
  const current = () => account === userId && epoch === accountEpoch;
  if (busy || isRunning()) {
    status(say("A task is already running.", "已有反推任务正在进行。"));
    return;
  }
  if (isByok() && !byokKey) { showByokSetupToast(); return; }
  if (favoritesView) await switchFavoritesView(false);
  operationRevision++;
  busy = true;
  controls();
  status(isByok() ? byokText.preparing : say("Preparing image — no charge yet", "正在处理图片 · 尚未扣费"));
  try {
    const image = await prepareImage(blob);
    if (!current()) return;
    prepared = image;
    pendingThumbnail = await thumbnail(image);
    if (!current()) return;
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await image.blob.arrayBuffer(),
    );
    if (!current()) return;
    const nextHash =
      Array.from(new Uint8Array(digest), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join("") + `:${image.originalWidth}x${image.originalHeight}`;
    if (expectedHash && nextHash !== expectedHash) {
      prepared = null;
      throw new Error(
        say(
          "Select the original image for this task.",
          "请选择当前任务对应的原图。",
        ),
      );
    }
    if (uncertain && pendingRequest && nextHash !== pendingRequest.hash) {
      prepared = null;
      throw new Error(
        say(
          "Choose the SAME image to recover the unconfirmed request without a duplicate charge.",
          "请重新选择同一张图片以恢复未确认请求，不重复扣费。",
        ),
      );
    }
    const existing = history.entries.find(
      (entry) => entry.hash === nextHash && entry.task.status === "succeeded",
    );
    if (!uncertain && !force && existing) {
      preparedByTask.set(existing.task.id, image);
      await putRetryImage(
        userId,
        existing.task.id,
        image,
        localTaskExpiresAt(existing.task),
      );
      await selectTask(existing.task.id);
      return;
    }
    prepared = image;
    hash = nextHash;
    if (!userId)
      loginUpload = { image, hash: nextHash, thumbnail: pendingThumbnail };
    if (!uncertain) requestId = crypto.randomUUID();
    await submit();
  } catch (error) {
    if (current())
      status(error instanceof Error ? error.message : String(error));
  } finally {
    if (current()) {
      busy = false;
      operationRevision++;
      controls();
    }
  }
}
async function submit() {
  if (isByok()) { await submitByok(); return; }
  const account = userId,
    epoch = accountEpoch;
  const current = () => account === userId && epoch === accountEpoch;
  if (!prepared || !userId) {
    status(say("Connect your account to continue.", "连接账号后继续。"));
    return;
  }
  const submissionImage = prepared,
    submissionHash = hash,
    submissionThumbnail = pendingThumbnail,
    submissionRequestId = requestId;
  const body = new FormData();
  body.set(
    "file",
    submissionImage.blob,
    submissionImage.blob.type === "image/png" ? "input.png" : "input.jpg",
  );
  body.set("requestId", submissionRequestId);
  body.set("originalWidth", String(submissionImage.originalWidth));
  body.set("originalHeight", String(submissionImage.originalHeight));
  body.set(
    "artificialBackground",
    String(submissionImage.artificialBackground),
  );
  // Persist UUID before transport: an uncertain response must retry the same request.
  await chrome.storage.session.set({
    [`request:${account}`]: {
      requestId: submissionRequestId,
      hash: submissionHash,
      thumbnail: submissionThumbnail,
    },
  });
  if (!current()) return;
  pendingRequest = {
    requestId: submissionRequestId,
    hash: submissionHash,
    thumbnail: submissionThumbnail,
  };
  uncertain = true;
  let data;
  try {
    data = await api("/api/reverse", { method: "POST", body });
  } catch (error) {
    if (!current()) return;
    if (
      error instanceof Error &&
      "httpStatus" in error &&
      Number(error.httpStatus) < 500
    ) {
      uncertain = false;
      pendingRequest = null;
      await chrome.storage.session.remove(`request:${account}`);
    }
    throw error;
  }
  if (!current()) return;
  uncertain = false;
  pendingRequest = null;
  await showTask(
    data.task,
    data.balance,
    true,
    data.task.requestId === submissionRequestId
      ? {
          hash: submissionHash,
          thumbnail: submissionThumbnail,
          image: submissionImage,
        }
      : undefined,
  );
  await chrome.storage.session.remove(`request:${account}`);
  if (!current()) return;
  if (data.busy)
    status(
      say(
        "Opened your existing active task — no extra charge.",
        "已打开正在进行的任务 · 未额外扣费",
      ),
    );
}
async function submitByok() {
  if (!prepared || !userId || !byokKey) { status(byokText.noKey); return; }
  const account = userId, epoch = accountEpoch;
  const current = () => account === userId && epoch === accountEpoch;
  const settings = { ...byokSettings }, secret = byokKey, image = prepared;
  validateByok(settings, secret);
  const token = await auth.getToken();
  if (!current()) return;
  if (!token) { status(say("Connect your account to continue.", "连接账号后继续。")); return; }
  if (!(await chrome.permissions.contains({ origins: [`${providerEndpoint(settings.baseUrl).origin}/*`] }))) {
    status(byokText.permission); return;
  }
  if (!current()) return;
  const controller = new AbortController();
  byokAbort = controller;
  byokConnection = byokConnection === "connected" ? "requesting" : "verifying";
  renderProvider();
  const now = new Date().toISOString();
  const next: Task = {
    id: crypto.randomUUID(), requestId: crypto.randomUUID(), source: "byok", providerModel: settings.model,
    status: "running", prompt: null, errorCode: null, refunded: false,
    createdAt: now, completedAt: null, expiresAt: Date.now() + 86400000,
    originalWidth: image.originalWidth, originalHeight: image.originalHeight,
  };
  try {
    await showTask(next, undefined, true, { hash, thumbnail: pendingThumbnail, image });
    if (!current()) return;
    const result = await reverseWithByok(settings, secret, image, fetch, controller.signal);
    if (!current()) return;
    byokConnection = "connected";
    await chrome.storage.session.set({ [`${BYOK_SECRET}:${account}`]: { key: secret, baseUrl: settings.baseUrl, model: settings.model, verified: true } });
    if (!current()) return;
    await showTask({ ...next, status: "succeeded", prompt: result, completedAt: new Date().toISOString() });
  } catch (error) {
    if (!current()) return;
    byokConnection = "unverified";
    await chrome.storage.session.set({ [`${BYOK_SECRET}:${account}`]: { key: secret, baseUrl: settings.baseUrl, model: settings.model, verified: false } }).catch(() => {});
    if (!current()) return;
    await showTask({ ...next, status: "failed", errorCode: error instanceof Error ? error.message : "connection" });
    if (current()) status(byokError(error));
  } finally {
    if (current()) { byokAbort = null; renderProvider(); }
  }
}

function closeByokModels() {
  el("byokModels").hidden = true;
  el("byokModel").setAttribute("aria-expanded", "false");
  el("byokModelsToggle").setAttribute("aria-expanded", "false");
  el("byokModel").removeAttribute("aria-activedescendant");
  byokModelActive = -1;
}

function renderByokModels(filter = "") {
  const input = el<HTMLInputElement>("byokModel");
  const matches = byokModelOptions.filter(id => id.toLowerCase().includes(filter.toLowerCase()));
  byokModelActive = -1;
  input.removeAttribute("aria-activedescendant");
  el("byokModels").replaceChildren(...matches.map((id, index) => {
    const option = document.createElement("div");
    option.id = `byok-model-option-${index}`;
    option.className = "byok-model-option";
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(id === input.value));
    option.textContent = id;
    option.onpointerdown = event => event.preventDefault();
    option.onclick = () => { input.value = id; closeByokModels(); input.focus(); closeByokModels(); };
    return option;
  }));
  const open = matches.length > 0;
  el("byokModels").hidden = !open;
  input.setAttribute("aria-expanded", String(open));
  el("byokModelsToggle").setAttribute("aria-expanded", String(open));
}

function resetByokModels() {
  byokModelOptions = [];
  closeByokModels();
  el("byokModelsToggle").hidden = true;
  byokModelsRevision++;
  byokModelsAbort?.abort(); byokModelsAbort = null;
  el("byokModels").replaceChildren();
  el("byokModelsStatus").textContent = "";
  el("byokModelsStatus").hidden = true;
  el<HTMLButtonElement>("byokFetchModels").disabled = false;
  el("byokFetchModels").textContent = byokText.fetchModels;
}
function openByokDialog() {
  if (!userId) return;
  if (busy || isRunning() || uncertain) { status(byokText.busy); return; }
  resetByokModels();
  el<HTMLInputElement>("byokEndpoint").value = byokSettings.baseUrl;
  el<HTMLInputElement>("byokModel").value = byokSettings.model;
  el<HTMLInputElement>("byokKey").value = byokKey;
  el<HTMLInputElement>("byokConsent").checked = false;
  el("byokError").hidden = true;
  closeAccountMenu();
  el<HTMLDialogElement>("byokDialog").showModal();
}
async function saveProviderMode(mode: "credits" | "byok") {
  if (!userId || busy || isRunning() || uncertain) { status(byokText.busy); return; }
  const account = userId, epoch = accountEpoch;
  if (!(await flushFavoriteEdit())) return;
  if (account !== userId || epoch !== accountEpoch) return;
  await chrome.storage.local.set({ [`${BYOK_SETTINGS}:${account}`]: { ...byokSettings, mode } });
  if (account !== userId || epoch !== accountEpoch) return;
  byokSettings = { ...byokSettings, mode };
  renderProvider();
  controls();
  if (mode === "credits" && creditBalance === null) {
    const data = await api("/api/reverse/config");
    if (account !== userId || epoch !== accountEpoch) return;
    if (typeof data.account?.balance === "number") setBalance(data.account.balance);
  }
}

async function refreshFavorites(report = true) {
  if (!userId) return;
  if (favoriteFetch) return favoriteFetch;
  const account = userId, epoch = accountEpoch, revision = favoriteRevision;
  const current = () => account === userId && epoch === accountEpoch && revision === favoriteRevision;
  const request = (async () => {
    try {
      const data = await api("/api/saved-prompts");
      if (!current()) return;
      if (!Array.isArray(data.items)) throw new Error("invalid_favorites");
      const items = (data.items as SavedPrompt[]).map(item => { const existing = favoriteItems.get(item.id); return existing && existing.revision > item.revision ? existing : item; });
      const drafts = (await chrome.storage.local.get(`favorite-drafts:${account}`))[`favorite-drafts:${account}`] as Record<string, { draft: string; revision: number; task?: Task }> | undefined;
      if (!current()) return;
      favoriteItems = new Map(items.map(item => [item.id, item]));
      favoritesHistory = reconcileFavorites(favoritesHistory, items);
      for (const entry of favoritesHistory.entries) {
        const draft = drafts?.[entry.task.id];
        if (!entry.edited && draft && typeof draft.draft === "string" && Number.isInteger(draft.revision)) {
          entry.draft = draft.draft.slice(0, 2000); entry.edited = true;
          favoriteBaseRevision.set(entry.task.id, draft.revision);
        }
      }
      for (const [id, draft] of Object.entries(drafts ?? {})) {
        if (!favoritesHistory.entries.some(entry => entry.task.id === id) && typeof draft.draft === "string" && Number.isInteger(draft.revision) && draft.task?.id === id) {
          favoritesHistory.entries.push({ task: draft.task, draft: draft.draft.slice(0, 2000), edited: true });
          favoriteBaseRevision.set(id, draft.revision);
        }
      }
      if (!favoritesHistory.selectedId) favoritesHistory.selectedId = favoritesHistory.entries[0]?.task.id ?? null;
      const deletedDraft = favoritesHistory.entries.find(entry => entry.edited && !favoriteItems.has(entry.task.id));
      if (deletedDraft) favoriteConflictId = deletedDraft.task.id;
      favoritesLoaded = true;
      renderFavoritesToggle();
      if (favoritesView) renderSelected(); else { renderTabs(); updateSelectedStar(); }
      // Thumbnails use the authenticated private route, never arbitrary response URLs.
      await Promise.all(items.filter(item => item.thumbnailUrl).map(async item => {
        const entry = favoritesHistory.entries.find(entry => entry.task.id === item.id);
        if (!entry || entry.thumbnail) return;
        try {
          const token = await auth.getToken();
          if (!token || !current()) return;
          const response = await fetch(`${config.apiOrigin}/api/saved-prompts/${encodeURIComponent(item.id)}/thumbnail`, {
            headers: { Authorization: `Bearer ${token}` }, credentials: "omit", redirect: "error", signal: AbortSignal.timeout(15_000),
          });
          if (!response.ok || !current()) return;
          const blob = await response.blob();
          if (!current() || blob.size > 32768 || !["image/jpeg", "image/png", "image/webp"].includes(blob.type)) return;
          const url = URL.createObjectURL(blob);
          favoriteObjectUrls.add(url);
          entry.thumbnail = url;
          if (favoritesView) renderTabs();
        } catch { /* Prompts remain usable without thumbnails. */ }
      }));
    } catch {
      if (current() && report) status(favoriteText.unavailable);
    }
  })();
  favoriteFetch = request;
  try { await request; } finally { if (favoriteFetch === request) favoriteFetch = null; }
}
function updateSelectedStar() {
  const existing = el("taskInfo").querySelector<HTMLButtonElement>("button.favorite-star");
  if (existing && task?.status === "succeeded") existing.replaceWith(favoriteStar(task, true));
}
async function switchFavoritesView(next: boolean) {
  if (next === favoritesView) {
    if (next && !favoritesLoaded) await refreshFavorites();
    return;
  }
  void flushFavoriteEdit();
  railScroll[favoritesView ? "favorites" : "recent"] = el("tasks").scrollTop;
  favoritesView = next;
  renderSelected();
  renderFavoritesToggle();
  el("tasks").scrollTop = railScroll[next ? "favorites" : "recent"];
  if (next) {
    if (!favoritesLoaded) status(favoriteText.loading);
    await refreshFavorites();
    if (favoritesView) el("tasks").scrollTop = railScroll.favorites;
  }
}
async function toggleFavorite(id: string) {
  if (!userId || favoriteBusy.has(id)) return;
  const account = userId, epoch = accountEpoch;
  const current = () => account === userId && epoch === accountEpoch;
  if (!favoritesLoaded) { await refreshFavorites(); if (!current() || !favoritesLoaded) return; }
  favoriteBusy.add(id);
  favoriteRevision++;
  updateSelectedStar();
  const entry = (favoritesView ? favoritesHistory : history).entries.find(entry => entry.task.id === id);
  try {
    if (favoriteItems.has(id)) {
      if (favoriteConflictId === id) favoriteConflictId = null;
      window.clearTimeout(favoriteEditTimer);
      if (favoriteEdit) await favoriteEdit;
      if (!current()) return;
      await api(`/api/saved-prompts/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!current()) return;
      favoriteItems.delete(id);
      favoriteBaseRevision.delete(id);
      const index = favoritesHistory.entries.findIndex(entry => entry.task.id === id);
      favoritesHistory.entries = favoritesHistory.entries.filter(entry => entry.task.id !== id);
      if (favoritesHistory.selectedId === id) favoritesHistory.selectedId = favoritesHistory.entries[index]?.task.id ?? favoritesHistory.entries[index - 1]?.task.id ?? null;
      await persistFavoriteDrafts();
      if (!current()) return;
      if (favoritesView) renderSelected();
      status(favoriteText.removed);
    } else {
      if (!entry || entry.task.status !== "succeeded" || !entry.draft.trim()) return;
      const data = await api(`/api/saved-prompts/${encodeURIComponent(id)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: entry.draft, originalWidth: entry.task.originalWidth, originalHeight: entry.task.originalHeight, ...(entry.thumbnail?.startsWith("data:") ? { thumbnailDataUrl: entry.thumbnail } : {}) }),
      });
      if (!current()) return;
      favoriteItems.set(id, data.item);
      const recovered = favoritesHistory.entries.find(entry => entry.task.id === id);
      if (recovered && recovered.draft === data.item.prompt) { recovered.edited = false; favoriteBaseRevision.delete(id); }
      await persistFavoriteDrafts();
      if (!current()) return;
      favoritesHistory = reconcileFavorites(favoritesHistory, Array.from(favoriteItems.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      const saved = favoritesHistory.entries.find(item => item.task.id === id);
      if (saved) saved.thumbnail = entry.thumbnail;
      favoriteFeedback(favoriteText.synced, true);
    }
  } catch (error) {
    if (current()) status(error instanceof Error && error.message === "saved_prompt_limit" ? favoriteText.limit : favoriteText.failed);
  } finally {
    if (current()) { favoriteBusy.delete(id); renderFavoritesToggle(); renderTabs(); updateSelectedStar(); }
  }
}
async function persistFavoriteDrafts() {
  if (!userId) return;
  const drafts = Object.fromEntries(favoritesHistory.entries.filter(entry => entry.edited).map(entry => [entry.task.id, { draft: entry.draft, task: entry.task, revision: favoriteBaseRevision.get(entry.task.id) ?? favoriteItems.get(entry.task.id)?.revision ?? 1 }]));
  await chrome.storage.local.set({ [`favorite-drafts:${userId}`]: drafts });
}
function favoriteFeedback(message: string, transient = false) {
  window.clearTimeout(favoriteFeedbackTimer);
  const feedback = document.getElementById("favoriteSaveState");
  if (!feedback) return;
  feedback.textContent = message; feedback.classList.remove("is-fading");
  if (transient) favoriteFeedbackTimer = window.setTimeout(() => { feedback.classList.add("is-fading"); }, 1600);
}
function scheduleFavoriteEdit() {
  window.clearTimeout(favoriteEditTimer);
  favoriteEditTimer = window.setTimeout(() => void flushFavoriteEdit(), 650);
}
async function flushFavoriteEdit(): Promise<boolean> {
  window.clearTimeout(favoriteEditTimer);
  if (favoriteEdit) return favoriteEdit;
  if (!userId) return false;
  const account = userId, epoch = accountEpoch;
  const current = () => account === userId && epoch === accountEpoch;
  const request = (async () => {
    while (true) {
      const entry = favoritesHistory.entries.find(entry => entry.edited && !favoriteBusy.has(entry.task.id));
      if (!entry) return true;
      if (!current()) return false;
      if (favoriteBusy.has(entry.task.id)) continue;
      if (favoriteConflictId === entry.task.id) return false;
      const remote = favoriteItems.get(entry.task.id);
      if (!remote) { favoriteConflictId = entry.task.id; if (favoritesView) { el("favoriteConflict").hidden = false; status(favoriteText.deleted); } return false; }
      const draft = entry.draft;
      if (!draft.trim()) { status(favoriteText.emptyPrompt); return false; }
      try {
        if (favoritesView && favoritesHistory.selectedId === entry.task.id) favoriteFeedback(favoriteText.saving);
        const data = await api(`/api/saved-prompts/${encodeURIComponent(entry.task.id)}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: draft, revision: favoriteBaseRevision.get(entry.task.id) ?? remote.revision }),
        });
        if (!current()) return false;
        favoriteItems.set(entry.task.id, data.item);
        entry.task.prompt = data.item.prompt;
        if (entry.draft === draft) { entry.edited = false; favoriteBaseRevision.delete(entry.task.id); }
        else favoriteBaseRevision.set(entry.task.id, data.item.revision);
        await persistFavoriteDrafts();
        if (!current()) return false;
        if (favoritesView && favoritesHistory.selectedId === entry.task.id) favoriteFeedback(favoriteText.synced, true);
      } catch (error) {
        if (!current()) return false;
        const details = error as Error & { data?: { item?: SavedPrompt } };
        if (details.message === "revision_conflict" && details.data?.item) {
          favoriteItems.set(entry.task.id, details.data.item);
          favoriteConflictId = entry.task.id;
          if (favoritesView && favoritesHistory.selectedId === entry.task.id) {
            el("favoriteConflict").hidden = false;
            status(favoriteText.conflict);
          }
        } else if ("httpStatus" in details && Number(details.httpStatus) === 404) {
          favoriteItems.delete(entry.task.id); favoriteConflictId = entry.task.id;
          if (favoritesView && favoritesHistory.selectedId === entry.task.id) { el("favoriteConflict").hidden = false; status(favoriteText.deleted); }
          renderFavoritesToggle();
        } else status(favoriteText.failed);
        return false;
      }
    }
  })();
  favoriteEdit = request;
  try { return await request; } finally {
    if (favoriteEdit === request) {
      favoriteEdit = null;
    }
  }
}

let byokToastTimer: ReturnType<typeof setTimeout> | undefined;
function showByokSetupToast() {
  clearTimeout(byokToastTimer);
  el("byokToast").textContent = byokText.noKey;
  el("byokToast").hidden = false;
  byokToastTimer = setTimeout(() => { el("byokToast").hidden = true; }, 5000);
}

async function consumePending() {
  const account = userId,
    epoch = accountEpoch;
  const current = () => account === userId && epoch === accountEpoch;
  const stored = (await chrome.storage.session.get("pendingImage"))
    .pendingImage as Selection | undefined;
  if (!current()) return;
  if (stored) pending = stored;
  if (pending && (busy || isRunning())) {
    await chrome.storage.session.remove("pendingImage");
    pending = null;
    status(
      say(
        "A task is already running — no image queued or extra charge.",
        "已有反推任务正在进行 · 未排队、未额外扣费。",
      ),
    );
    return;
  }
  if (!pending || !userId) return;
  if (isByok() && !byokKey) { showByokSetupToast(); return; }
  if (Date.now() - pending.selectedAt > 3600_000) {
    await chrome.storage.session.remove("pendingImage");
    pending = null;
    return;
  }
  const origin = `${new URL(pending.url).origin}/*`;
  if (!(await chrome.permissions.contains({ origins: [origin] }))) {
    el("permission").hidden = false;
    status(
      say(
        "Allow access to the image source to continue. No charge yet.",
        "需要允许读取图片来源才能继续，尚未扣费。",
      ),
    );
    return;
  }
  if (!current()) return;
  el("permission").hidden = true;
  try {
    const response = await fetch(pending.url, {
      credentials: "omit",
      redirect: "error",
    });
    if (!response.ok) throw new Error("IMAGE_READ_FAILED");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("IMAGE_READ_FAILED");
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (!current()) {
        await reader.cancel();
        return;
      }
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FILE) {
        await reader.cancel();
        throw new Error("IMAGE_FORMAT_SIZE");
      }
      chunks.push(value as Uint8Array<ArrayBuffer>);
    }
    await chrome.storage.session.remove("pendingImage");
    if (!current()) return;
    pending = null;
    await loadBlob(
      new Blob(chunks, {
        type: (response.headers.get("content-type") || "").split(";")[0],
      }),
    );
  } catch {
    status(
      say(
        "Cannot read this image. Download it and upload locally. No charge.",
        "无法读取这张图片，请下载后本地上传。尚未扣费。",
      ),
    );
  }
}
async function siteStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:/.test(tab.url)) {
    el("site").textContent = say(
      "Restricted page. Local upload remains available.",
      "当前页面不支持注入，可使用本地上传。",
    );
    return;
  }
  const origin = `${new URL(tab.url).origin}/*`;
  const { browsingOrigins = [] } = (await chrome.storage.local.get(
    "browsingOrigins",
  )) as { browsingOrigins?: string[] };
  const enabled =
    browsingOrigins.includes(origin) ||
    browsingOrigins.includes(`${new URL(tab.url).protocol}//*/*`);
  el("site").textContent =
    `${new URL(tab.url).hostname} · ${enabled ? say("Enabled", "已启用") : say("Not enabled", "未启用")}`;
}
async function enable(all: boolean) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const origins = all
    ? ["http://*/*", "https://*/*"]
    : tab?.url && /^https?:/.test(tab.url)
      ? [`${new URL(tab.url).origin}/*`]
      : [];
  if (!origins.length) return;
  if (await chrome.permissions.request({ origins })) {
    const { browsingOrigins = [] } = (await chrome.storage.local.get(
      "browsingOrigins",
    )) as { browsingOrigins?: string[] };
    await chrome.storage.local.set({
      browsingOrigins: [...new Set([...browsingOrigins, ...origins])],
    });
    await chrome.runtime.sendMessage({ type: "POD_PERMISSIONS" });
    await siteStatus();
  }
}
el("current").onclick = () => void enable(false);
el("all").onclick = () => void enable(true);
el("disable").onclick = async () => {
  await chrome.storage.local.set({ browsingOrigins: [] });

  await chrome.runtime.sendMessage({ type: "POD_PERMISSIONS" });
  await siteStatus();
};
el("permission").onclick = async () => {
  if (
    pending &&
    (await chrome.permissions.request({
      origins: [`${new URL(pending.url).origin}/*`],
    }))
  )
    await consumePending();
};
el("login").onclick = async () => {
  try {
    await chrome.tabs.create({
      url: `${menuOrigin}/${zh ? "zh-CN" : "en"}/sign-in`,
    });
  } catch (error) {
    status(error instanceof Error ? error.message : String(error));
  }
};
el<HTMLInputElement>("upload").onchange = (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) void loadBlob(file);
  (event.target as HTMLInputElement).value = "";
};
prompt.oninput = () => {
  controls();
  void save();
};
let copyFeedbackTimer = 0;
const copyContents = Array.from(el("copy").childNodes).map(node => node.cloneNode(true));
el("copy").setAttribute("aria-live", "polite");
el("copy").onclick = async () => {
  window.clearTimeout(copyFeedbackTimer);
  try {
    await navigator.clipboard.writeText(prompt.value);
    const feedback = document.createElement("span");
    feedback.className = "copy-success";
    feedback.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m5 14l3.5 3.5L19 6.5"/></svg>';
    const label = document.createElement("span");
    label.textContent = say("Copied", "已复制");
    feedback.append(label);
    el("copy").replaceChildren(feedback);
  } catch {
    el("copy").textContent = say("Try again", "请重试");
  }
  copyFeedbackTimer = window.setTimeout(() => {
    el("copy").replaceChildren(...copyContents.map(node => node.cloneNode(true)));
  }, 1600);
};
el("chatgpt").title = chatgptText.title;
el("chatgpt").setAttribute("aria-label", chatgptText.title);
el("chatgptLabel").textContent = chatgptText.label;
el("chatgpt").onclick = async () => {
  if (!task || task.status !== "succeeded" || !prompt.value.trim()) return;
  const handoff = buildChatGPTHandoff(prompt.value, task.originalWidth, task.originalHeight);
  let copied = false;
  try { await navigator.clipboard.writeText(handoff.text); copied = true; } catch {}
  if (handoff.requiresPaste && !copied) { status(chatgptText.copyFailed); return; }
  try {
    await chrome.tabs.create({ url: handoff.url });
  } catch { status(chatgptText.openFailed); }
};
el("handoff").onclick = async () => {
  const account = userId,
    epoch = accountEpoch;
  const current = () => account === userId && epoch === accountEpoch;
  if (!account || !task) return;
  if (favoritesView) {
    const savedId = task.id;
    if (!(await flushFavoriteEdit()) || !current()) return;
    await chrome.tabs.create({ url: `${config.siteOrigin}/${zh ? "zh-CN" : "en"}/generate?savedPrompt=${encodeURIComponent(savedId)}` });
    return;
  }
  try {
    if (task.source === "byok") {
      const payload = encodeURIComponent(JSON.stringify({ prompt: prompt.value, width: task.originalWidth, height: task.originalHeight }));
      await chrome.tabs.create({ url: `${config.siteOrigin}/${zh ? "zh-CN" : "en"}/generate#byok=${payload}` });
      return;
    }
    const data = await api(`/api/reverse/${task!.id}/handoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt.value }),
    });
    if (!current()) return;
    await chrome.tabs.create({
      url: `${config.siteOrigin}/${zh ? "zh-CN" : "en"}/generate?import=${encodeURIComponent(data.token)}`,
    });
  } catch (error) {
    if (current()) status(String(error));
  }
};
el("retry").onclick = async () => {
  if (busy || isRunning() || !task || !userId) return;
  if (!prepared) {
    const selectedId = task.id;
    const epoch = accountEpoch;
    const expectedHash = history.entries.find(
      (entry) => entry.task.id === selectedId,
    )?.hash;
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = el<HTMLInputElement>("upload").accept;
    picker.onchange = () => {
      const file = picker.files?.[0];
      if (file && epoch === accountEpoch && history.selectedId === selectedId)
        void loadBlob(file, true, expectedHash);
    };
    picker.click();
    return;
  }
  const epoch = accountEpoch;
  operationRevision++;
  busy = true;
  controls();
  try {
    if (!uncertain) {
      requestId = crypto.randomUUID();
      const entry = history.entries.find(
        (item) => item.task.id === history.selectedId,
      );
      hash = entry?.hash || "";
      pendingThumbnail = entry?.thumbnail || "";
    }
    await submit();
  } catch (error) {
    if (epoch === accountEpoch) status(String(error));
  } finally {
    if (epoch === accountEpoch) {
      busy = false;
      operationRevision++;
      controls();
    }
  }
};
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.pendingImage?.newValue) {
    pending = changes.pendingImage.newValue as Selection;
    void consumePending();
  }
});
async function init() {
  window.setInterval(() => {
    const next = normalizeHistory(history);
    if (next.entries.length !== history.entries.length) {
      history = next;
      renderSelected();
      void persist();
    }
    void pruneRetryImages().catch(() => {});
  }, 60_000);
  // Start authentication alongside maintenance, not behind it. History reads
  // wait for cleanup so its writes cannot resurrect a locally deleted task.
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  startupCleanup = cleanup().catch(() => {});
  void pruneRetryImages().catch(() => {});
  void siteStatus().catch(() => {});
  if (!config.publishableKey)
    status(
      say(
        "Configure the Clerk publishable key and rebuild.",
        "请配置 Clerk 公钥并重新构建。",
      ),
    );
  else await auth.start();
}
let dragDepth = 0;
const dragOverlay = el("dropOverlay");
const resetDrag = () => {
  dragDepth = 0;
  dragOverlay.hidden = true;
};
const hasFiles = (event: DragEvent) =>
  Array.from(event.dataTransfer?.types ?? []).includes("Files");
const updateDropHint = () => {
  dragOverlay.textContent =
    busy || isRunning()
      ? say("Wait for the current task to finish", "请等待当前任务完成")
      : say("Drop to add an image", "松开即可添加图片");
};
document.addEventListener("dragenter", (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragDepth++;
  updateDropHint();
  dragOverlay.hidden = false;
});
document.addEventListener("dragover", (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  updateDropHint();
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = busy || isRunning() ? "none" : "copy";
});
document.addEventListener("dragleave", (event) => {
  if (!hasFiles(event) && !dragDepth) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) resetDrag();
});
document.addEventListener("drop", (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  resetDrag();
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length !== 1) {
    status(say("Drop one image at a time.", "请一次拖入一张图片。"));
    return;
  }
  void loadBlob(files[0]);
});
window.addEventListener("blur", resetDrag);
document.addEventListener("dragend", resetDrag);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") resetDrag();
});
el("uploadButton").onclick = () => el<HTMLInputElement>("upload").click();
el("emptyUpload").onclick = () => el<HTMLInputElement>("upload").click();
function closeAccountMenu() {
  el("accountMenu").hidden = true;
  el("languageOptions").hidden = true;
  el("menuLanguage").setAttribute("aria-expanded", "false");
  el("accountIdentity").setAttribute("aria-expanded", "false");
}
const menuOrigin = config.siteOrigin.includes("preview.invalid") ? "https://pixondeck.com" : config.siteOrigin;
for (const [id, path] of Object.entries({ menuCredits: "/settings/credits", menuReleases: "/releases", menuSupport: "/about#support" })) {
  const link = el<HTMLAnchorElement>(id);
  link.href = new URL(`${zh ? "/zh-CN" : ""}${path}`, menuOrigin).href;
  link.onclick = closeAccountMenu;
}
el("currentLanguage").textContent = languages.find(item => item.code === locale)?.localName ?? locale;
const languageTrigger = el<HTMLButtonElement>("menuLanguage");
const languageOptions = el("languageOptions");
document.body.append(languageOptions);
languageOptions.setAttribute("role", "group");
languageOptions.setAttribute("aria-labelledby", "menuLanguageLabel");
function positionLanguageOptions() {
  if (languageOptions.hidden) return;
  const trigger = languageTrigger.getBoundingClientRect();
  const width = languageOptions.offsetWidth;
  const height = languageOptions.offsetHeight;
  const right = trigger.right + 8;
  const left = trigger.left - width - 8;
  const x = right + width <= innerWidth - 8 ? right : left >= 8 ? left : trigger.right - width;
  const y = right + width <= innerWidth - 8 || left >= 8 ? trigger.top : trigger.bottom + 8;
  languageOptions.style.left = `${Math.max(8, Math.min(x, innerWidth - width - 8))}px`;
  languageOptions.style.top = `${Math.max(8, Math.min(y, innerHeight - height - 8))}px`;
}
languageTrigger.onclick = () => {
  const open = languageOptions.hidden;
  languageOptions.hidden = !open;
  languageTrigger.setAttribute("aria-expanded", String(open));
  if (open) positionLanguageOptions();
};
window.addEventListener("resize", positionLanguageOptions);
el("accountMenu").addEventListener("scroll", positionLanguageOptions);

for (const language of languages) {
  const option = document.createElement("button");
  option.type = "button";
  option.className = "language-option";
  option.setAttribute("aria-pressed", String(language.code === locale));
  const label = document.createElement("span");
  label.textContent = language.localName;
  option.append(label);
  if (language.code === locale) {
    const check = document.createElement("span");
    check.textContent = "✓";
    check.setAttribute("aria-hidden", "true");
    option.append(check);
  }
  option.onclick = async () => {
    if (language.code === locale) {
      el("languageOptions").hidden = true;
      languageTrigger.setAttribute("aria-expanded", "false");
      languageTrigger.focus();
      return;
    }
    if (busy || isRunning() || uncertain) { status(accountText.languageBusy); return; }
    await save();
    if (!(await flushFavoriteEdit())) return;
    saveLanguage(language.code);
    location.reload();
  };
  el("languageOptions").append(option);
}
el("menuLogout").title = accountText.logoutNote;
el("menuLogout").onclick = async () => {
  const button = el<HTMLButtonElement>("menuLogout");
  button.disabled = true;
  el("menuLogoutLabel").textContent = accountText.signingOut;
  try {
    await auth.signOut();
    closeAccountMenu();
  } catch (error) {
    status(error instanceof Error ? error.message : String(error));
  } finally {
    button.disabled = false;
    el("menuLogoutLabel").textContent = accountText.logout;
  }
};
const creditsIcon = document.querySelector(".account-credits svg");
if (creditsIcon) el("menuCreditsIcon").append(creditsIcon.cloneNode(true));
el("accountIdentity").onclick = () => {
  const open = el("accountMenu").hidden;
  if (!open) { closeAccountMenu(); return; }
  el("accountMenu").hidden = !open;
  el("accountIdentity").setAttribute("aria-expanded", String(open));
  if (open) {
    el(isByok() ? "byokConfigure" : "menuCredits").focus();
  }
};
document.addEventListener("click", (event) => {
  if (event.target instanceof Node && !el("accountMenu").contains(event.target) && !languageOptions.contains(event.target) && !el("accountIdentity").contains(event.target)) closeAccountMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !languageOptions.hidden) {
    languageOptions.hidden = true;
    languageTrigger.setAttribute("aria-expanded", "false");
    languageTrigger.focus();
    return;
  }
  if (event.key === "Escape" && !el("accountMenu").hidden) {
    closeAccountMenu();
    el("accountIdentity").focus();
  }
});
for (const [id, value] of Object.entries({
  byokConfigure: byokText.settings, byokTitle: byokText.title,
  byokEndpointLabel: byokText.endpoint, byokModelLabel: byokText.model, byokKeyLabel: byokText.key,
  byokDisclosure: byokText.disclosure, byokConsentLabel: byokText.consent,
  byokFetchModels: byokText.fetchModels, byokSave: byokText.save, byokClose: byokText.close, byokClear: byokText.clear,
  favoritesLabel: favoriteText.favorites, favoriteLoadCloud: favoriteText.loadCloud, favoriteKeepMine: favoriteText.keepMine,
})) el(id).textContent = value;
el("modeLabelText").textContent = byokText.mode;
el("modeLabel").title = byokText.mode;
el("byokConfigure").innerHTML = BYOK_ICON_SVG;
const byokMenuLabel = document.createElement("span");
byokMenuLabel.textContent = byokText.settings;
const byokMenuStatus = document.createElement("span");
byokMenuStatus.id = "byokMenuStatus";
el("byokConfigure").append(byokMenuLabel, byokMenuStatus);
el("favoritesIcon").innerHTML = STAR_SVG;
el("favoritesLabel").hidden = true;
el("modeCredits").title = byokText.credits;
el("modeByok").title = byokText.byok;
el("modeCredits").onclick = () => void saveProviderMode("credits").catch(() => status(byokText.errors.storage));
el("modeByok").onclick = () => void saveProviderMode("byok").catch(() => status(byokText.errors.storage));
el("byokConfigure").onclick = openByokDialog;
el<HTMLInputElement>("byokModel").placeholder = byokText.modelsHint;
el("byokModelsToggle").setAttribute("aria-label", byokText.model);
el("byokModels").setAttribute("aria-label", byokText.model);
el("byokModel").oninput = () => renderByokModels(el<HTMLInputElement>("byokModel").value);
el("byokModel").onfocus = () => renderByokModels();
el("byokModelsToggle").onpointerdown = event => event.preventDefault();
el("byokModelsToggle").onclick = () => {
  const wasOpen = !el("byokModels").hidden;
  el("byokModel").focus();
  if (wasOpen) closeByokModels(); else renderByokModels();
};
el("byokModelCombobox").addEventListener("focusout", event => {
  if (!(event.relatedTarget instanceof Node) || !el("byokModelCombobox").contains(event.relatedTarget)) closeByokModels();
});
el("byokModel").onkeydown = event => {
  const list = el("byokModels");
  if (event.key === "Escape" && !list.hidden) { event.preventDefault(); event.stopPropagation(); closeByokModels(); return; }
  if (event.key === "Enter" && !list.hidden && byokModelActive >= 0) {
    event.preventDefault();
    (list.children[byokModelActive] as HTMLElement)?.click();
    return;
  }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  if (list.hidden) renderByokModels();
  if (!list.children.length) return;
  event.preventDefault();
  const count = list.children.length;
  byokModelActive = (byokModelActive + (event.key === "ArrowDown" ? 1 : byokModelActive < 0 ? 0 : -1) + count) % count;
  Array.from(list.children).forEach((option, index) => option.classList.toggle("is-active", index === byokModelActive));
  const active = list.children[byokModelActive] as HTMLElement;
  el("byokModel").setAttribute("aria-activedescendant", active.id);
  active.scrollIntoView({block: "nearest"});
};
el("byokClose").onclick = () => el<HTMLDialogElement>("byokDialog").close();
el<HTMLDialogElement>("byokDialog").onclose = () => { resetByokModels(); el<HTMLInputElement>("byokKey").value = ""; };
el("byokEndpoint").oninput = () => { resetByokModels(); el<HTMLInputElement>("byokModel").value = ""; el<HTMLInputElement>("byokConsent").checked = false; };
el("byokKey").oninput = resetByokModels;
el("byokFetchModels").onclick = async () => {
  resetByokModels();
  const account = userId, epoch = accountEpoch, revision = byokModelsRevision;
  if (!account) return;
  const baseUrl = el<HTMLInputElement>("byokEndpoint").value.trim();
  const secret = el<HTMLInputElement>("byokKey").value.trim();
  const current = () => account === userId && epoch === accountEpoch && revision === byokModelsRevision && el<HTMLDialogElement>("byokDialog").open;
  const button = el<HTMLButtonElement>("byokFetchModels"), info = el("byokModelsStatus");
  try {
    validateByok({mode: "byok", baseUrl, model: "model-list"}, secret);
    button.disabled = true; button.textContent = byokText.fetchingModels;
    const allowed = await chrome.permissions.request({origins: [`${providerEndpoint(baseUrl).origin}/*`]});
    if (!current()) return;
    if (!allowed) { info.textContent = byokText.permission; info.hidden = false; return; }
    const controller = new AbortController(); byokModelsAbort = controller;
    const result = await fetchByokModels(baseUrl, secret, fetch, controller.signal);
    if (!current()) return;
    byokModelOptions = result.models;
    if (!result.models.includes(el<HTMLInputElement>("byokModel").value.trim())) el<HTMLInputElement>("byokModel").value = "";
    el("byokModelsToggle").hidden = !result.models.length;
    info.textContent = "";
    info.hidden = true;
    el("byokModel").focus();
    renderByokModels();
  } catch (error) {
    if (!current()) return;
    const code = error instanceof Error ? error.message : "";
    info.textContent = code === "endpoint" || code === "key" || code === "authorization" ? byokError(error) : byokText.modelsFailed;
    info.hidden = false;
  } finally {
    if (current()) { byokModelsAbort = null; button.disabled = false; button.textContent = byokText.fetchModels; }
  }
};
el("byokClear").onclick = async () => {
  const account = userId, epoch = accountEpoch;
  if (!account) return;
  try {
    await chrome.storage.session.remove(`${BYOK_SECRET}:${account}`);
    if (account !== userId || epoch !== accountEpoch) return;
    resetByokModels();
    byokKey = ""; byokConnection = "unconfigured";
    el<HTMLInputElement>("byokKey").value = "";
    renderProvider();
  } catch { el("byokError").textContent = byokText.errors.storage; el("byokError").hidden = false; }
};
el<HTMLFormElement>("byokForm").onsubmit = async event => {
  event.preventDefault();
  const account = userId, epoch = accountEpoch;
  if (!account || busy || isRunning() || uncertain) return;
  const settings: ByokSettings = {
    mode: "byok", baseUrl: el<HTMLInputElement>("byokEndpoint").value.trim().replace(/\/+$/, ""), model: el<HTMLInputElement>("byokModel").value.trim(),
  };
  const secret = el<HTMLInputElement>("byokKey").value.trim();
  el("byokError").hidden = true;
  const button = el<HTMLButtonElement>("byokSave");
  const dialog = el<HTMLDialogElement>("byokDialog");
  const current = () => account === userId && epoch === accountEpoch && dialog.open && el<HTMLInputElement>("byokEndpoint").value.trim().replace(/\/+$/, "") === settings.baseUrl && el<HTMLInputElement>("byokModel").value.trim() === settings.model && el<HTMLInputElement>("byokKey").value.trim() === secret;
  try {
    validateByok(settings, secret);
    if (!el<HTMLInputElement>("byokConsent").checked) { el("byokError").textContent = byokText.consentRequired; el("byokError").hidden = false; return; }
    button.disabled = true;
    // Permission request stays in this click/submit gesture. Existing capture grants may already cover it.
    const allowed = await chrome.permissions.request({ origins: [`${providerEndpoint(settings.baseUrl).origin}/*`] });
    if (account !== userId || epoch !== accountEpoch) return;
    if (!allowed) { el("byokError").textContent = byokText.permission; el("byokError").hidden = false; return; }
    if (!(await flushFavoriteEdit()) || account !== userId || epoch !== accountEpoch) return;
    button.textContent = byokText.checkingConnection;
    const controller = new AbortController();
    byokModelsAbort?.abort(); byokModelsAbort = controller;
    await fetchByokModels(settings.baseUrl, secret, fetch, controller.signal);
    if (!current()) return;
    const verified = true;
    await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    await chrome.storage.session.set({ [`${BYOK_SECRET}:${account}`]: { key: secret, baseUrl: settings.baseUrl, model: settings.model, verified } });
    if (account !== userId || epoch !== accountEpoch) return;
    await chrome.storage.local.set({ [`${BYOK_SETTINGS}:${account}`]: settings });
    if (account === userId && epoch === accountEpoch) location.reload();
  } catch (error) {
    if (current()) {
      const code = error instanceof Error ? error.message : "";
      el("byokError").textContent = code === "connection" || code === "models" || code === "provider" ? byokText.connectionCheckFailed : byokError(error);
      el("byokError").hidden = false;
    }
  } finally { button.disabled = false; button.textContent = byokText.save; }
};
el("favoritesToggle").onclick = () => void switchFavoritesView(!favoritesView);
el("favoriteLoadCloud").onclick = () => {
  const id = favoriteConflictId, remote = id ? favoriteItems.get(id) : null;
  const entry = favoritesHistory.entries.find(entry => entry.task.id === id);
  if (!entry) return;
  if (!remote) {
    favoritesHistory.entries = favoritesHistory.entries.filter(item => item.task.id !== id);
    favoritesHistory.selectedId = favoritesHistory.entries[0]?.task.id ?? null;
    favoriteBaseRevision.delete(entry.task.id); favoriteConflictId = null;
    void persistFavoriteDrafts(); renderSelected(); return;
  }
  entry.draft = remote.prompt; entry.task.prompt = remote.prompt; entry.edited = false;
  favoriteBaseRevision.delete(entry.task.id);
  void persistFavoriteDrafts();
  favoriteConflictId = null; renderSelected();
};
el("favoriteKeepMine").onclick = () => {
  if (favoriteConflictId && !favoriteItems.has(favoriteConflictId)) { const id = favoriteConflictId; favoriteConflictId = null; el("favoriteConflict").hidden = true; void toggleFavorite(id); return; }
  if (favoriteConflictId) favoriteBaseRevision.set(favoriteConflictId, favoriteItems.get(favoriteConflictId)?.revision ?? 1);
  favoriteConflictId = null;
  el("favoriteConflict").hidden = true;
  void flushFavoriteEdit();
};

window.addEventListener("pagehide", () => {
  byokModelsAbort?.abort();
  byokAbort?.abort();
  window.clearTimeout(favoriteEditTimer);
  window.clearTimeout(favoriteFeedbackTimer);
  window.clearTimeout(authRetryTimer);
  window.clearTimeout(copyFeedbackTimer);
  taskResizeObserver.disconnect();
  auth.dispose();
});
void init().catch((error) => status(String(error)));
