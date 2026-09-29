import { REVERSE_V6_SYSTEM_PROMPT } from "./prompts/reverse-v6.ts";
import { REVERSE_V7_SYSTEM_PROMPT } from "./prompts/reverse-v7.ts";

/** Change this one value and rebuild both the API and extension to roll back. */
export const ACTIVE_REVERSE_PROMPT_VERSION: "reverse-v6" | "reverse-v7" = "reverse-v7";
const reversePrompts = {
  "reverse-v6": REVERSE_V6_SYSTEM_PROMPT,
  "reverse-v7": REVERSE_V7_SYSTEM_PROMPT,
} as const;
export const REVERSE_PROMPT_VERSION = ACTIVE_REVERSE_PROMPT_VERSION;
export const REVERSE_SYSTEM_PROMPT = reversePrompts[ACTIVE_REVERSE_PROMPT_VERSION];

/** Pure, browser-safe contract shared by credit and BYOK adapters. */
export const REVERSE_PROMPT_MAX_LENGTH = 4096;
export function parseReversePromptResponse(choice: unknown): string {
  if (!choice || typeof choice !== "object" || !("finish_reason" in choice) ||
      choice.finish_reason !== "stop" || !("message" in choice) ||
      !choice.message || typeof choice.message !== "object" ||
      ("refusal" in choice.message && !!choice.message.refusal) ||
      !("content" in choice.message) || typeof choice.message.content !== "string")
    throw new Error("Reverse provider returned incomplete or unexpected output");
  let result: unknown;
  try { result = JSON.parse(choice.message.content); }
  catch { throw new Error("Reverse provider returned invalid JSON"); }
  if (!result || typeof result !== "object" || Array.isArray(result) ||
      Object.keys(result).length !== 1 || !("prompt" in result) ||
      typeof result.prompt !== "string" || !result.prompt.trim() ||
      result.prompt.length > REVERSE_PROMPT_MAX_LENGTH ||
      (result.prompt.length === REVERSE_PROMPT_MAX_LENGTH && !/[.!?]$/.test(result.prompt.trim())))
    throw new Error("Reverse provider returned an invalid prompt");
  return result.prompt.trim();
}
