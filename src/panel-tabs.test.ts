import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { JSDOM } from "jsdom";

test("task refresh preserves thumbnail nodes, focus and selection transitions", () => {
  const source = readFileSync(new URL("./panel.ts", import.meta.url), "utf8");
  const render = source.slice(source.indexOf("function renderTabs()"), source.indexOf("function renderSelected()"));
  const dom = new JSDOM('<nav id="tasks"></nav>');
  const document = dom.window.document;
  const entry = (id: string) => ({ thumbnail: `https://example.test/${id}.png`, draft: `Prompt ${id}`, task: { id, status: "succeeded", originalWidth: 480, originalHeight: 480 } });
  const history = { entries: [entry("a"), entry("b")], selectedId: "a" };
  const context = {
    document, history, viewHistory: () => history, favoriteItems: new Map(),
    el: (id: string) => document.getElementById(id),
    taskDetail: (task: {status: string}) => task.status,
    taskState: (task: {status: string}) => task.status,
    statusDot: () => document.createElement("span"),
    requestAnimationFrame: () => 0,
    updateTaskFades: () => {},
    selectTask: async () => {},
    renderTabs: undefined as unknown as () => void,
  };
  runInNewContext(ts.transpileModule(render, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  context.renderTabs();
  const selected = document.getElementById("task-a")!;
  const image = selected.querySelector("img");
  const state = selected.querySelector(".task-state");
  selected.focus();
  for (let i = 0; i < 5; i++) context.renderTabs();
  assert.equal(document.getElementById("task-a"), selected);
  assert.equal(selected.querySelector("img"), image);
  assert.equal(selected.querySelector(".task-state"), state);
  assert.equal(document.activeElement, selected);
  history.selectedId = "b";
  context.renderTabs();
  assert.equal(selected.getAttribute("aria-selected"), "false");
  assert.equal(document.getElementById("task-b")!.getAttribute("aria-selected"), "true");
  assert.equal(selected.querySelector(".task-state"), state);
  history.entries.shift();
  context.renderTabs();
  assert.equal(document.getElementById("task-a"), null);
  assert.equal(document.querySelector(".task-state")!.textContent, "Prompt b");
  dom.window.close();
});
