import type { ChatGPTHandoff } from './chatgpt-handoff';

export const chatGPTPoseMessages = {
  en: {
    title: 'Send pose to ChatGPT', short: 'Copy the pose image and open ChatGPT. Paste the image into the composer, check both the prompt and attachment, then send.',
    long: '1. Copy the prompt and open ChatGPT. Paste it into the composer without sending. 2. Return here to copy the pose image, then paste it into the same composer. Check both before sending.',
    imageOpen: 'Copy pose image and open ChatGPT', textOpen: '1. Copy prompt and open ChatGPT', image: '2. Copy pose image',
    copied: 'Pose image copied. Paste it into ChatGPT before sending.', textCopied: 'Prompt copied. Paste it in ChatGPT first, then return here for the pose image.',
    failed: 'Could not copy or open ChatGPT. You can retry, or download the pose image and attach it manually.',
    open: 'Open ChatGPT to attach the downloaded image', download: 'Download pose PNG', downloaded: 'Pose PNG downloaded. Attach it manually in ChatGPT.', close: 'Close',
  },
  'zh-CN': {
    title: '将姿态带到 ChatGPT', short: '复制姿态图并打开 ChatGPT 后，请在输入框粘贴图片，检查提示词和附件，再发送。',
    long: '1. 复制提示词并打开 ChatGPT，粘贴到输入框，先不要发送。2. 回到这里复制姿态图，再粘贴到同一个输入框，检查后再发送。',
    imageOpen: '复制姿态图并打开 ChatGPT', textOpen: '1. 复制提示词并打开 ChatGPT', image: '2. 复制姿态图',
    copied: '姿态图已复制，请在 ChatGPT 输入框粘贴后再发送。', textCopied: '提示词已复制。请先在 ChatGPT 粘贴，再回到这里复制姿态图。',
    failed: '未能复制或打开 ChatGPT。可以重试，或下载姿态图后手动添加为附件。',
    open: '打开 ChatGPT 并手动添加已下载的图片', download: '下载姿态 PNG', downloaded: '姿态 PNG 已下载，请在 ChatGPT 中手动添加为附件。', close: '关闭',
  },
};

type Options = {
  locale: string;
  handoff: ChatGPTHandoff;
  pose: Blob;
  /** Must match the account, selected task and prompt captured when opening. */
  isCurrent(): boolean;
  open(url: string): Promise<unknown> | unknown;
  // Injectable platform effects keep race and clipboard tests independent of browsers.
  copyText?(text: string): Promise<void>;
  copyImage?(image: Blob): Promise<void>;
  download?(image: Blob): void;
};

export function showChatGPTPoseHandoff(options: Options): { close(): void } {
  const text = chatGPTPoseMessages[options.locale === 'zh-CN' ? 'zh-CN' : 'en'];
  const dialog = document.createElement('dialog');
  dialog.className = 'pose-dialog action-confirm';
  dialog.setAttribute('aria-label', text.title);
  const title = document.createElement('h2'); title.textContent = text.title;
  const instructions = document.createElement('p'); instructions.textContent = options.handoff.requiresPaste ? text.long : text.short;
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const actions = document.createElement('div'); actions.className = 'pose-actions';
  let closed = false, busy = false, textCopied = false;
  const close = () => { if (closed) return; closed = true; if (dialog.open) dialog.close(); dialog.remove(); };
  dialog.addEventListener('close', close);
  const current = () => { if (closed) return false; if (!options.isCurrent()) { close(); return false; } return true; };
  const button = (label: string, action: () => void) => {
    const item = document.createElement('button'); item.type = 'button'; item.textContent = label; item.onclick = action; actions.append(item); return item;
  };
  const copyImage = options.copyImage ?? (async (blob: Blob) => {
    if (blob.type !== 'image/png' || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) throw new Error('PNG_CLIPBOARD_UNAVAILABLE');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  });
  const copyText = options.copyText ?? (async (value: string) => { await navigator.clipboard.writeText(value); });
  const run = async (copy: () => Promise<void>, navigate: boolean, message: string, copiedText = false) => {
    if (busy || !current()) return;
    busy = true; update();
    try {
      await copy();
      if (!current()) return;
      if (navigate) await options.open(options.handoff.url);
      if (!current()) return;
      if (copiedText) textCopied = true;
      status.textContent = message;
    } catch {
      if (current()) status.textContent = text.failed;
    } finally { busy = false; update(); }
  };
  const primary = button(options.handoff.requiresPaste ? text.textOpen : text.imageOpen, () => {
    if (options.handoff.requiresPaste) void run(() => copyText(options.handoff.text), true, text.textCopied, true);
    else void run(() => copyImage(options.pose), true, text.copied);
  });
  primary.className = 'primary';
  const image = options.handoff.requiresPaste ? button(text.image, () => { void run(() => copyImage(options.pose), false, text.copied); }) : null;
  const download = button(text.download, () => {
    if (busy || !current()) return;
    try {
      if (options.download) options.download(options.pose);
      else {
        const url = URL.createObjectURL(options.pose);
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'pixondeck-pose.png';
        document.body.append(anchor); anchor.click(); anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      if (current()) { status.textContent = text.downloaded; fallback.hidden = false; }
    } catch { if (current()) status.textContent = text.failed; }
  });
  const fallback = button(text.open, () => {
    void run(options.handoff.requiresPaste ? () => copyText(options.handoff.text) : async () => {}, true, options.handoff.requiresPaste ? text.textCopied : text.downloaded, options.handoff.requiresPaste);
  });
  fallback.hidden = true;
  button(text.close, close);
  function update() { primary.disabled = busy; download.disabled = busy; fallback.disabled = busy; if (image) image.disabled = busy || !textCopied; }
  update();
  dialog.append(title, instructions, status, actions); document.body.append(dialog);
  if (current()) dialog.showModal();
  return { close };
}
