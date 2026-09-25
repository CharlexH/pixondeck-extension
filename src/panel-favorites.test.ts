import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const source = readFileSync(new URL("./panel.ts",import.meta.url),"utf8");
function setup(handler: (body: {prompt:string;revision:number}) => Promise<unknown>) {
  const entry = {task:{id:"one",prompt:"Before"},draft:"Edit one",edited:true};
  const errors:string[]=[];const writes:unknown[]=[];const requests:unknown[]=[];
  const context = {
    window:{clearTimeout(){}},favoriteEditTimer:0,favoriteEdit:null,userId:"account-a",accountEpoch:1,
    favoritesHistory:{entries:[entry],selectedId:"one"},favoritesView:true,favoriteConflictId:null,
    favoriteBusy:new Set(),favoriteItems:new Map([["one",{id:"one",prompt:"Before",revision:1}]]),favoriteBaseRevision:new Map([["one",1]]),
    favoriteText:{emptyPrompt:"empty",synced:"synced",conflict:"conflict",deleted:"deleted",failed:"failed"},
    api: async(_path:string,init:RequestInit)=>{const body=JSON.parse(String(init.body));requests.push(body);return handler(body);},
    persistFavoriteDrafts:async()=>{writes.push(JSON.parse(JSON.stringify(entry)));},
    favoriteFeedback:()=>{},
    status:(message:string)=>errors.push(message),el:()=>({hidden:true}),renderFavoritesToggle(){},
    flushFavoriteEdit:undefined as unknown as ()=>Promise<boolean>,
  };
  const code=source.slice(source.indexOf("async function flushFavoriteEdit()"),source.indexOf("async function consumePending()"));
  runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  return {context,entry,errors,writes,requests};
}
test("edits typed during an in-flight save drain with the returned revision",async()=>{
  let resolve!:(value:unknown)=>void;let count=0;
  const app=setup(async body=>{if(++count===1)return new Promise(done=>resolve=done);return {item:{id:"one",prompt:body.prompt,revision:3}};});
  const running=app.context.flushFavoriteEdit();
  app.entry.draft="Edit two";
  resolve({item:{id:"one",prompt:"Edit one",revision:2}});
  assert.equal(await running,true);
  assert.deepEqual(app.requests,[{prompt:"Edit one",revision:1},{prompt:"Edit two",revision:2}]);
  assert.equal(app.entry.edited,false);assert.equal(app.entry.task.prompt,"Edit two");
});
test("refresh cannot replace a dirty draft's base revision; conflict preserves local text",async()=>{
  const app=setup(async()=>{throw Object.assign(new Error("revision_conflict"),{data:{item:{id:"one",prompt:"Remote",revision:9}}});});
  app.context.favoriteItems.set("one",{id:"one",prompt:"Remote",revision:9});
  assert.equal(await app.context.flushFavoriteEdit(),false);
  assert.deepEqual(app.requests,[{prompt:"Edit one",revision:1}]);
  assert.equal(app.entry.draft,"Edit one");assert.equal(app.entry.edited,true);
  assert.equal(app.context.favoriteConflictId,"one");
});
test("account change discards a late cloud save without altering next account state",async()=>{
  let resolve!:(value:unknown)=>void;
  const app=setup(async()=>new Promise(done=>resolve=done));
  const running=app.context.flushFavoriteEdit();app.context.userId="account-b";app.context.accountEpoch++;
  resolve({item:{id:"one",prompt:"Edit one",revision:2}});
  assert.equal(await running,false);assert.equal(app.writes.length,0);assert.equal(app.entry.task.prompt,"Before");
});
test("network errors keep dirty text and do not retry a mutation automatically",async()=>{
  const app=setup(async()=>{throw new Error("offline");});
  assert.equal(await app.context.flushFavoriteEdit(),false);assert.equal(app.requests.length,1);assert.equal(app.entry.edited,true);
});
