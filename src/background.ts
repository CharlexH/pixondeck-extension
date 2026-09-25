const MENU = "pixondeck-reverse";
const SCRIPT = "pixondeck-images";
async function syncScripts() {
  const { origins = [] } = await chrome.permissions.getAll();
  // Website capture is enabled by default after Chrome grants host access.
  const saved = await chrome.storage.local.get([
    "browsingOrigins",
    "siteAccessDefaults",
  ]);
  const browsingOrigins =
    saved.siteAccessDefaults === 1
      ? (saved.browsingOrigins ?? [])
      : ["http://*/*", "https://*/*"];
  if (saved.siteAccessDefaults !== 1)
    await chrome.storage.local.set({ browsingOrigins, siteAccessDefaults: 1 });
  const matches = (browsingOrigins as string[]).filter((origin) =>
    origins.includes(origin),
  );
  await chrome.scripting
    .unregisterContentScripts({ ids: [SCRIPT] })
    .catch(() => {});
  if (matches.length)
    await chrome.scripting.registerContentScripts([
      {
        id: SCRIPT,
        matches,
        js: ["content.js"],
        runAt: "document_idle",
        allFrames: false,
      },
    ]);
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !tab.url || !/^https?:/.test(tab.url)) continue;
    const allowed = matches.some(
      (pattern) =>
        (pattern === "http://*/*" && tab.url!.startsWith("http:")) ||
        (pattern === "https://*/*" && tab.url!.startsWith("https:")) ||
        pattern === `${new URL(tab.url!).origin}/*`,
    );
    if (allowed)
      await chrome.scripting
        .executeScript({ target: { tabId: tab.id }, files: ["content.js"] })
        .catch(() => {});
    else
      await chrome.tabs
        .sendMessage(tab.id, { type: "POD_DISABLE" })
        .catch(() => {});
  }
}
async function selectImage(url: string, tabId: number) {
  if (url.length > 8192 || !/^https?:\/\//.test(url)) return;
  // open must be called before awaiting storage to retain Chrome user activation.
  const opened = chrome.sidePanel.open({ tabId });
  await chrome.storage.session.set({
    pendingImage: { url, selectedAt: Date.now(), id: crypto.randomUUID() },
  });
  await opened;
}
chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  void chrome.storage.session.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  chrome.contextMenus.removeAll(() =>
    chrome.contextMenus.create({
      id: MENU,
      title: chrome.i18n.getUILanguage().startsWith("zh")
        ? "使用 PixOnDeck 反推"
        : "Reverse with PixOnDeck",
      contexts: ["image"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    }),
  );
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void syncScripts();
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU && info.srcUrl && tab?.id)
    void selectImage(info.srcUrl, tab.id);
});
chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  if (
    message?.type === "POD_SELECT" &&
    sender.tab?.id &&
    sender.frameId === 0 &&
    /^https?:/.test(sender.url || "") &&
    typeof message.url === "string"
  )
    void selectImage(message.url, sender.tab.id);
  if (
    message?.type === "POD_PERMISSIONS" &&
    sender.url === chrome.runtime.getURL("panel.html")
  )
    void syncScripts();
});
chrome.permissions.onRemoved.addListener(() => void syncScripts());
chrome.permissions.onAdded.addListener(() => void syncScripts());
chrome.runtime.onStartup.addListener(() => void syncScripts());
