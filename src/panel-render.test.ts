import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { JSDOM } from "jsdom";
import { emptyHistory } from "./task-history.ts";

test("initial account render has no temporal-dead-zone failure before local history selection",()=>{
  const source=readFileSync(new URL("./panel.ts",import.meta.url),"utf8");
  const dom=new JSDOM(readFileSync(new URL("./panel.html",import.meta.url),"utf8"));
  const document=dom.window.document;const recent=emptyHistory();
  const context={
    favoritesView:false,history:recent,viewHistory:()=>recent,
    task:null,prepared:null,prompt:document.getElementById("prompt"),
    emptyText:{title:"Start",description:"Upload"},favoriteText:{empty:"None",emptyDescription:"Star"},
    favoriteConflictId:null,favoriteItems:new Map(),
    el:(id:string)=>document.getElementById(id),say:(en:string)=>en,status(){},renderTabs(){},controls(){},
    renderSelected:undefined as unknown as ()=>void,
  };
  const code=source.slice(source.indexOf("function renderSelected()"),source.indexOf("async function deleteLocalTask"));
  runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  assert.doesNotThrow(()=>context.renderSelected());
  assert.equal(document.getElementById("emptyState")!.hidden,false);
  assert.equal(document.getElementById("tasks")!.getAttribute("aria-label"),"Recent tasks");
  dom.window.close();
});
