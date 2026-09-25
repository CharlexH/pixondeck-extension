export const CHATGPT_HOME = "https://chatgpt.com/";
// A conservative navigation limit, not a documented ChatGPT product limit.
export const CHATGPT_HANDOFF_URL_LIMIT = 6000;

export type ChatGPTHandoff = {
  text: string;
  url: string;
  requiresPaste: boolean;
};

function aspectRatio(width?: number, height?: number): string | null {
  if (
    !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
    width! <= 0 || height! <= 0
  ) return null;
  let a = width!, b = height!;
  while (b) [a, b] = [b, a % b];
  return `${width! / a}:${height! / a}`;
}

/** Prepare text only; callers own copying and user-triggered navigation. */
export function buildChatGPTHandoff(
  prompt: string,
  width?: number,
  height?: number,
): ChatGPTHandoff {
  const description = prompt.trim();
  if (!description) throw new Error("A prompt is required.");
  const ratio = aspectRatio(width, height);
  const text = [
    "Please generate an image based on the following description.",
    ...(ratio ? [`Use an aspect ratio of ${ratio}.`] : []),
    "",
    description,
  ].join("\n");
  const destination = new URL(CHATGPT_HOME);
  destination.searchParams.set("q", text);
  const requiresPaste = destination.href.length > CHATGPT_HANDOFF_URL_LIMIT;
  return { text, url: requiresPaste ? CHATGPT_HOME : destination.href, requiresPaste };
}
