import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { BYOK_SECRET, validateByok, providerEndpoint } from "./byok.ts";
const source = readFileSync(new URL("./panel.ts",import.meta.url),"utf8");
function setup(provider:()=>Promise<string> = async()=>"A fox") {
  const outputs:any[]=[];const stored:any[]=[];let called=0;
  const context={
    prepared:{originalWidth:400,originalHeight:200},userId:"account-a",accountEpoch:1,byokKey:"test-key",
    byokSettings:{mode:"byok",baseUrl:"https://provider.example/v1",model:"vision"},byokConnection:"unverified",byokAbort:null,
    BYOK_SECRET,validateByok,providerEndpoint,auth:{getToken:async()=>"pixondeck-token-only"},
    chrome:{permissions:{contains:async()=>true},storage:{session:{set:async(data:unknown)=>{stored.push(data);}}}},
    crypto:globalThis.crypto,AbortController,fetch:()=>{throw new Error("unexpected fetch")},
    hash:"image-hash",pendingThumbnail:"",showTask:async(task:unknown)=>{outputs.push(task);},
    reverseWithByok:async()=>{called++;return provider();},renderProvider(){},
    byokText:{noKey:"no key",permission:"permission"},byokError:()=>"safe error",say:(en:string)=>en,status(){},
    submitByok:undefined as unknown as ()=>Promise<void>,
  };
  const code=source.slice(source.indexOf("async function submitByok()"),source.indexOf("function openByokDialog()"));
  runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  return {context,outputs,stored,calls:()=>called};
}
test("BYOK requires a signed-in account and current auth session before direct call",async()=>{
  const app=setup();app.context.userId="";await app.context.submitByok();assert.equal(app.calls(),0);
  app.context.userId="account-a";app.context.auth.getToken=async()=>"";await app.context.submitByok();assert.equal(app.calls(),0);
});
test("direct result joins recent history as BYOK without PixOnDeck reverse submission",async()=>{
  const app=setup();await app.context.submitByok();
  assert.equal(app.calls(),1);assert.deepEqual(app.outputs.map(task=>task.status),["running","succeeded"]);
  assert.equal(app.outputs[1].source,"byok");assert.equal(app.outputs[1].prompt,"A fox");
  assert.equal(app.context.byokConnection,"connected");
  assert.equal(Object.keys(app.stored[0])[0],"pixondeck:byok-secret:account-a");
  assert.equal(app.stored[0]["pixondeck:byok-secret:account-a"].baseUrl,"https://provider.example/v1");
});
test("late provider result after account change cannot persist prompt or credentials",async()=>{
  let resolve!:(value:string)=>void;const app=setup(()=>new Promise(done=>resolve=done));
  const request=app.context.submitByok();
  await new Promise(done=>setTimeout(done,0));
  app.context.userId="account-b";app.context.accountEpoch++;
  resolve("Private A prompt");await request;
  assert.equal(app.outputs.length,1);assert.equal(app.stored.length,0);
});
test("provider failure clears verified session state and never falls back or retries",async()=>{
  const app=setup(async()=>{throw new Error("authorization");});app.context.byokConnection="connected";
  await app.context.submitByok();assert.equal(app.calls(),1);
  assert.equal(app.outputs.at(-1).status,"failed");assert.equal(app.context.byokConnection,"unverified");
  assert.equal(app.stored[0]["pixondeck:byok-secret:account-a"].verified,false);
});
