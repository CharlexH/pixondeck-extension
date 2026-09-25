// Keep the standalone client limited to its translated languages.
export const languages = [
  { code: "en", name: "English", localName: "English", dir: "ltr", enabled: true },
  { code: "zh-CN", name: "Chinese (Simplified)", localName: "简体中文", dir: "ltr", enabled: true },
];
const key = "pixondeck:extension-language";
export function readLanguage(browserLanguage: string) {
  const saved = localStorage.getItem(key);
  return languages.some(item => item.code === saved) ? saved! : browserLanguage.startsWith("zh") ? "zh-CN" : "en";
}
export function saveLanguage(locale: string) {
  if (!languages.some(item => item.code === locale)) throw new Error("UNSUPPORTED_LANGUAGE");
  localStorage.setItem(key, locale);
}
export const accountMessages = {
  en: { language: "Language", logout: "Sign out", signingOut: "Signing out…", logoutNote: "Sign out of the shared PixOnDeck session", languageBusy: "Wait for the current request to finish before switching language." },
  "zh-CN": { language: "切换语言", logout: "退出登录", signingOut: "正在退出…", logoutNote: "退出与 PixOnDeck 主站共享的登录会话", languageBusy: "请等待当前请求完成后再切换语言。" },
};

export const welcomeMessages = {
  en: {
    title: "Turn images into inspiration",
    description: ["Pick or upload an image", "Turn it into an editable prompt", "Start creating in seconds"],
    demo: "Demo: click the image marker to get a prompt",
    login: "Sign in with PixOnDeck",
  },
  "zh-CN": {
    title: "从图片，找到创作灵感",
    description: ["选取网页图片或上传图片", "反推出可编辑的提示词", "快速开启创作"],
    demo: "演示：点击图片标记，反推提示词",
    login: "登录 PixOnDeck",
  },
};

export const emptyMessages = {
  en: {
    title: "Start with an image",
    description: "Upload or drop an image to get an editable prompt.",
    upload: "Upload image",
    hint: "Browsing a website? Click the {marker} on an image.",
  },
  "zh-CN": {
    title: "从一张图片开始",
    description: "上传或拖入图片，获取可编辑的提示词",
    upload: "上传图片",
    hint: "也可以点击网页图片上的 {marker} 标记",
  },
};

export const chatgptMessages = {
  en: { label: "Generate", title: "Generate in ChatGPT", copied: "Prompt copied. Paste it into ChatGPT if needed.", copyFailed: "Could not copy the prompt. Use Copy and try again.", openFailed: "Could not open ChatGPT. Please try again." },
  "zh-CN": { label: "生成", title: "在 ChatGPT 中生成", copied: "提示词已复制。如未自动带入，请在 ChatGPT 中粘贴。", copyFailed: "未能复制提示词，请先点击复制后再试。", openFailed: "未能打开 ChatGPT，请重试。" },
};

export const startupMessages = {
  en: { loading: "Restoring your workspace…" },
  "zh-CN": { loading: "正在恢复工作区…" },
};

export const byokMessages = {
  en: {
    settings: "API Key", configure: "Configure",
    fetchModels: "Get models", fetchingModels: "Loading…", modelsHint: "Search or enter a model ID",
    modelsReady: "Choose a model or enter its ID.", modelsUnknown: "Choose a model with image input; capability information is incomplete.",
    checkingConnection: "Checking…",
    connectionCheckFailed: "Connection check failed. Check the URL and key, then try again.",
    modelsFailed: "Could not get models. Check the URL and key, or enter a model ID manually.", title: "Choose how to reverse images", mode: "Mode",
    credits: "PixOnDeck credits", byok: "My API key (BYOK)", endpoint: "API base URL (HTTPS)",
    model: "Vision model ID", key: "API key", consent: "I trust this endpoint to receive my images and API key.",
    disclosure: "Images go directly to your provider, which bills you. Key saved for this session only. Requires an OpenAI-compatible vision API.",
    save: "Save mode", close: "Close", clear: "Forget API key", busy: "Wait for the current request to finish before changing mode.",
    noKey: "Set up your API Key in the account menu at the bottom right first.",
    consentRequired: "Confirm that you trust this endpoint before enabling BYOK.",
    permission: "Allow access to your API endpoint to continue.",
    ready: "Completed · billed by your provider", working: "Processing · billed by your provider",
    failed: "Request failed or interrupted. Your provider may still charge; retry sends a new request.",
    retry: "Send a new request to your provider; it may be billed again.",
    upload: "BYOK · billed directly by your provider", preparing: "Preparing image · no provider request sent yet",
    errors: {
      endpoint: "Enter a valid HTTPS base URL without credentials, query or fragment.",
      model: "Enter a vision model ID (up to 200 characters).", key: "Enter a valid API key.",
      authorization: "Provider rejected the API key or access. Check your credentials and model access.",
      quota: "Provider rate limit or quota reached. Check your provider account.",
      provider: "Provider request failed. Check endpoint and model compatibility.",
      response: "Provider returned an invalid or incomplete prompt. Check model compatibility.",
      connection: "Provider connection failed or timed out. It may still charge; retry sends a new request.",
      storage: "Could not save settings. Please try again.",
    },
  },
  "zh-CN": {
    settings: "API Key", configure: "配置",
    fetchModels: "获取模型", fetchingModels: "获取中…", modelsHint: "搜索或手动填写模型 ID",
    modelsReady: "请选择模型，也可手动填写。", modelsUnknown: "请选择支持图片的模型，部分接口未提供能力信息。",
    checkingConnection: "验证中…",
    connectionCheckFailed: "连接验证失败，请检查地址和 Key 后重试。",
    modelsFailed: "未能获取模型，请检查地址和 Key，或手动填写。", title: "选择反推方式", mode: "模式",
    credits: "PixOnDeck 积分", byok: "自带 API Key（BYOK）", endpoint: "API 基础地址（HTTPS）",
    model: "视觉模型 ID", key: "API Key", consent: "我信任此接口，同意发送图片与 Key。",
    disclosure: "图片直连服务商并由其计费，Key 仅本次会话保存。支持 OpenAI 兼容视觉接口。",
    save: "保存模式", close: "关闭", clear: "清除 API Key", busy: "请等待当前请求完成后再切换模式。",
    noKey: "请先在右下角账户菜单中配置 API Key。",
    consentRequired: "启用 BYOK 前，请确认你信任此接口。", permission: "请允许访问所填 API 接口后继续。",
    ready: "已完成 · 由服务商计费", working: "处理中 · 由服务商计费",
    failed: "请求失败或已中断。服务商仍可能收费；重试将发送新请求。",
    retry: "向服务商发送新请求，可能再次计费。", upload: "BYOK · 由服务商直接计费", preparing: "正在处理图片 · 尚未向服务商发送请求",
    errors: {
      endpoint: "请输入有效的 HTTPS 基础地址，不含用户名、密码、查询参数或片段。",
      model: "请输入视觉模型 ID（不超过 200 字符）。", key: "请输入有效的 API Key。",
      authorization: "服务商拒绝了密钥或访问权限，请检查密钥及模型权限。",
      quota: "已达到服务商的限流或额度限制，请检查服务商账户。",
      provider: "服务商请求失败，请检查接口地址和模型兼容性。",
      response: "服务商返回的提示词无效或不完整，请检查模型兼容性。",
      connection: "服务商连接失败或超时，仍可能收费；重试将发送新请求。",
      storage: "未能保存设置，请重试。",
    },
  },
};


export const providerStatusMessages = {
  en: { unconfigured: "No key", unverified: "Unverified", verifying: "Connecting", connected: "Connected", requesting: "Working" },
  "zh-CN": { unconfigured: "未配置", unverified: "未验证", verifying: "验证中", connected: "已连接", requesting: "请求中" },
};
export const favoriteMessages = {
  en: {
    favorites: "Saved", savedAt: "Saved at (local time)", save: "Save prompt to your account", remove: "Remove saved prompt",
    empty: "No saved prompts yet", emptyDescription: "Star a completed prompt to keep it in your account.",
    loading: "Loading saved prompts…", unavailable: "Could not load saved prompts. Click Saved to try again.",
    failed: "Could not sync saved prompts. Try again.", limit: "You have reached 100 saved prompts. Remove one before saving another.",
    saved: "Saved to your account", removed: "Removed from saved prompts", saving: "Saving…", synced: "Saved",
    conflict: "This prompt changed on another device. Your edit is preserved. Choose which version to keep.",
    deleted: "This prompt was removed on another device. Discard your draft or save it again.",
    loadCloud: "Use cloud version", keepMine: "Save my version", emptyPrompt: "A saved prompt cannot be empty.",
  },
  "zh-CN": {
    favorites: "收藏", savedAt: "收藏时间（本地时间）", save: "收藏到账号", remove: "取消收藏",
    empty: "还没有收藏提示词", emptyDescription: "点击已完成提示词旁的星标，即可保存到账号。",
    loading: "正在加载收藏…", unavailable: "未能加载收藏，请再次点击「收藏」重试。",
    failed: "收藏同步失败，请重试。", limit: "已达到 100 条收藏上限，请先取消一条收藏。",
    saved: "已收藏到账号", removed: "已取消收藏", saving: "保存中…", synced: "已保存",
    conflict: "其他设备修改了这条收藏，已保留你的编辑，请选择要保留的版本。",
    deleted: "其他设备删除了这条收藏。可以舍弃本地草稿，或重新保存。",
    loadCloud: "使用云端版本", keepMine: "保存我的版本", emptyPrompt: "收藏提示词不能为空。",
  },
};
