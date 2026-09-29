export const recoveryMessages = {
  en: {
    check: "Check connection",
    resolve: "Check previous request",
    checking: "Checking…",
    pending: "Checking your previous request. No need to upload it again.",
    released: "Previous request was not accepted. You can start a new task.",
    restored: "Previous request confirmed. You can continue.",
    connection:
      "Cannot connect to the service. Check your connection, then retry.",
    localConnection:
      "Local service is offline. Start the local backend, then retry.",
    login:
      "Could not verify your session. Retry, or sign in again on PixOnDeck.",
    unavailable: "Service temporarily unavailable. Please retry shortly.",
    disabled:
      "Cloud reverse is unavailable. You can switch to BYOK in the account menu.",
    credits: "Not enough credits. Top up or switch to BYOK.",
    cancelled:
      "This request was closed without being accepted. Start a new task.",
    rate: "Too many requests. Please wait a moment before trying again.",
  },
  "zh-CN": {
    check: "重试连接",
    resolve: "核对上次请求",
    checking: "正在核对…",
    pending: "正在核对上次请求，无需重新上传图片。",
    released: "上次请求未受理，可以开始新任务。",
    restored: "上次请求已确认，可以继续操作。",
    connection: "无法连接服务，请检查网络后重试。",
    localConnection: "本地服务未连接，请启动本地后端后重试。",
    login: "登录状态验证失败，请重试或前往 PixOnDeck 重新登录。",
    unavailable: "服务暂时不可用，请稍后重试。",
    disabled: "云端反推暂未开放，可在账户菜单切换 BYOK。",
    credits: "积分不足，请充值或切换 BYOK。",
    cancelled: "这次请求未受理，已安全关闭。可以开始新任务。",
    rate: "请求过于频繁，请稍后再试。",
  },
};

export function recoveryErrorKey(error: unknown, local: boolean) {
  const value = error as { httpStatus?: number; message?: string } | null;
  if (value?.httpStatus === 401 || value?.message === "UNAUTHENTICATED")
    return "login";
  if (value?.httpStatus && value.httpStatus >= 500) return "unavailable";
  return local ? "localConnection" : "connection";
}

// This specific 503 is returned before any admission; other server errors may
// have happened after a request was accepted and must be reconciled.
export function definitelyRejected(error: unknown) {
  const value = error as { httpStatus?: number; message?: string } | null;
  return Boolean(
    value?.httpStatus &&
    (value.httpStatus < 500 ||
      (value.httpStatus === 503 && value.message === "reverse_unavailable")),
  );
}
