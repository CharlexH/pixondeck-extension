import { imageAtPointer, isActionImage } from "./hover-image";

(() => {
  if (window.top !== window) return;
  const instanceVersion = "2026-09-21-hover-v3";
  const previous = document.getElementById("pixondeck-image-action");
  // A reloaded extension can leave its old content-script DOM in open tabs.
  document.dispatchEvent(new Event("pixondeck-dispose-image-action"));
  previous?.remove();
  const host = document.createElement("div");
  host.id = "pixondeck-image-action";
  host.dataset.podVersion = instanceVersion;
  host.style.cssText = "position:fixed;z-index:2147483647;display:none";
  const shadow = host.attachShadow({ mode: "closed" });
  const button = document.createElement("button");
  button.innerHTML = `<svg class="brand-mark" width="13" height="16" aria-hidden="true" viewBox="0 0 135 166" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M0 42.3826C0.000203737 33.7618 7.79365 27.2372 16.2803 28.7527L21.6924 29.7185V130.2C21.6925 138.603 27.9658 145.683 36.3076 146.694L70.418 150.829C66.9159 152.886 63.06 154.444 58.9346 155.391L16.9443 165.032C8.27218 167.023 5.93579e-05 160.435 0 151.537V42.3826Z" fill="url(#pod_hover_brand)"/>
<path d="M29.0767 126.087V17.0608C29.0767 8.06202 37.0556 1.15484 45.9615 2.44386L93.8544 9.37573C117.077 12.7369 134.307 32.641 134.307 56.1053C134.307 80.3349 115.967 100.632 91.8618 103.08L80.3122 104.253C77.5928 104.529 75.2305 102.395 75.2305 99.6614V81.6232C75.2305 79.2911 76.9701 77.3254 79.2849 77.042L84.0608 76.4572C91.9311 75.4935 97.8459 68.8102 97.8459 60.8812V57.8833C97.8459 51.1148 92.9525 45.3383 86.276 44.2255L72.1389 41.8694C68.2004 41.2129 64.6151 44.2501 64.6151 48.243V105.231C64.6151 109.819 68.3346 113.538 72.9228 113.538H84.4613C87.5201 113.538 89.9997 116.018 89.9997 119.077V132.422C89.9997 139.069 84.1878 144.219 77.5899 143.419L40.4447 138.916C33.9564 138.13 29.0767 132.623 29.0767 126.087Z" fill="white"/>
<defs>
<linearGradient id="pod_hover_brand" x1="35.209" y1="28.5332" x2="35.209" y2="165.389" gradientUnits="userSpaceOnUse">
<stop stop-color="white"/>
<stop offset="1" stop-color="white" stop-opacity="0.4"/>
</linearGradient>
</defs>
</svg>`;
  button.title = chrome.i18n.getUILanguage().startsWith("zh")
    ? "反推提示词"
    : "Reverse prompt";
  button.setAttribute("aria-label", button.title);
  button.style.cssText =
    "width:28px;height:28px;box-sizing:border-box;border:1px solid #ffffff59;border-radius:8px;background:#63577e;color:#fff;display:grid;place-items:center;padding:0;cursor:pointer;box-shadow:0 2px 6px #29233326;transition:background-color 180ms ease,box-shadow 180ms ease";
  const style = document.createElement("style");
  style.textContent = "button:hover{background:#514667!important;box-shadow:0 3px 8px #29233333!important}button:focus-visible{outline:2px solid white;outline-offset:2px}@media(prefers-reduced-motion:reduce){button{transition:none!important}}";
  shadow.append(style, button);
  document.documentElement.append(host);
  let target: HTMLImageElement | null = null;
  let timer = 0;
  let hovered: HTMLImageElement | null = null;
  function position() {
    if (!target?.isConnected) {
      host.style.display = "none";
      return;
    }
    const rect = target.getBoundingClientRect();
    host.style.left = `${Math.max(0, rect.left + 8)}px`;
    host.style.top = `${Math.max(0, rect.bottom - 36)}px`;
    host.style.display =
      rect.bottom > 0 && rect.top < innerHeight ? "block" : "none";
  }
  function hover(event: Event) {
    const original = event.target;
    if (!(original instanceof Element) || original === host) return;
    const element = event instanceof PointerEvent
      ? imageAtPointer(original, event.clientX, event.clientY, document.elementsFromPoint(event.clientX, event.clientY))
      : original instanceof HTMLAnchorElement
        ? original.querySelector("img")
        : original;
    const next = element && isActionImage(element) ? element : null;
    // Pointer moves within the same card must not keep restarting the delay.
    if (next === hovered) return;
    hovered = next;
    clearTimeout(timer);
    if (next) {
      target = next;
      host.style.display = "none";
      timer = window.setTimeout(position, 180);
    } else {
      timer = window.setTimeout(() => { host.style.display = "none"; target = null; }, 220);
    }
  }
  document.addEventListener("pointerover", hover, true);
  document.addEventListener("pointermove", hover, true);
  document.addEventListener("focusin", hover, true);
  host.addEventListener("pointerenter", () => {
    clearTimeout(timer);
    hovered = target;
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const url = target?.currentSrc;
    if (url) void chrome.runtime.sendMessage({ type: "POD_SELECT", url });
  });
  window.addEventListener("scroll", position, true);
  window.addEventListener("resize", position);
  function dispose() {
    clearTimeout(timer);
    host.remove();
    document.removeEventListener("pointerover", hover, true);
    document.removeEventListener("pointermove", hover, true);
    document.removeEventListener("focusin", hover, true);
    document.removeEventListener("pixondeck-dispose-image-action", dispose);
    window.removeEventListener("scroll", position, true);
    window.removeEventListener("resize", position);
    chrome.runtime.onMessage.removeListener(onMessage);
  }
  function onMessage(message: { type?: string }) {
    if (message?.type === "POD_DISABLE") dispose();
  }
  document.addEventListener("pixondeck-dispose-image-action", dispose);
  chrome.runtime.onMessage.addListener(onMessage);
})();
