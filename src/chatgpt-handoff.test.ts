import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildChatGPTHandoff,
  CHATGPT_HOME,
  CHATGPT_HANDOFF_URL_LIMIT,
} from "./chatgpt-handoff.ts";

test("hands off the edited prompt with original aspect ratio, preserving its interior", () => {
  const handoff = buildChatGPTHandoff("  Edited cat\nwith a red hat  ", 1920, 1080);
  assert.equal(handoff.text, "Please generate an image based on the following description.\nUse an aspect ratio of 16:9.\n\nEdited cat\nwith a red hat");
  assert.equal(new URL(handoff.url).searchParams.get("q"), handoff.text);
  assert.equal(handoff.requiresPaste, false);
});

test("retains portrait and square proportions", () => {
  assert.match(buildChatGPTHandoff("portrait", 473, 670).text, /473:670/);
  assert.match(buildChatGPTHandoff("square", 512, 512).text, /1:1/);
});

test("invalid or missing dimensions do not produce a fabricated ratio", () => {
  for (const [width, height] of [[undefined, undefined], [0, 100], [100, -1], [NaN, 100], [Infinity, 100], [1.5, 100], [Number.MAX_SAFE_INTEGER + 1, 100]]) {
    assert.doesNotMatch(buildChatGPTHandoff("cat", width, height).text, /aspect ratio/);
  }
});

test("encodes prompt as data without changing destination or introducing URL parameters", () => {
  const result = buildChatGPTHandoff("猫 & model=other # fragment ?q=evil\nhttps://example.com/ 🐈");
  const url = new URL(result.url);
  assert.equal(url.origin, "https://chatgpt.com");
  assert.equal(url.pathname, "/");
  assert.deepEqual([...url.searchParams.keys()], ["q"]);
  assert.equal(url.searchParams.get("q"), result.text);
  assert.equal(url.hash, "");
});

test("long encoded prompts use the home page while retaining the complete clipboard text", () => {
  const prompt = "猫".repeat(1000);
  const result = buildChatGPTHandoff(prompt, 4, 3);
  assert.equal(result.url, CHATGPT_HOME);
  assert.equal(result.requiresPaste, true);
  assert.ok(result.text.endsWith(prompt));
  assert.ok(buildChatGPTHandoff("a".repeat(1000)).url.length <= CHATGPT_HANDOFF_URL_LIMIT);
});

test("refuses an empty description", () => {
  for (const prompt of ["", " \n\t "]) assert.throws(() => buildChatGPTHandoff(prompt), /prompt is required/);
});
