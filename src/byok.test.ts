import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchByokModels, providerEndpoint, validateByok, reverseWithByok, type ByokSettings } from "./byok.ts";
const settings: ByokSettings = { mode: "byok", baseUrl: "https://provider.example/api/v1/", model: "vision-model" };
const secret = "test-secret-only";
const image = { blob: new Blob(["image-bytes"], { type: "image/jpeg" }), width: 480, height: 240, originalWidth: 1200, originalHeight: 600, artificialBackground: true, animated: false };

test("normalizes compatible HTTPS endpoint and rejects credentials, queries and plaintext", () => {
  assert.equal(providerEndpoint(settings.baseUrl).href, "https://provider.example/api/v1/chat/completions");
  for (const url of ["http://provider.example/v1", "https://user:pass@provider.example/v1", "https://provider.example/v1?key=a", "https://provider.example/v1#x", "no-url"])
    assert.throws(() => providerEndpoint(url), /endpoint/);
  assert.throws(() => validateByok({ ...settings, model: "" }, secret), /model/);
  assert.throws(() => validateByok(settings, "key\nheader"), /key/);
});
test("sends one direct vision request, no cookies, no redirects, no credit fallback", async () => {
  const calls: Array<{url: string; init: RequestInit}> = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({url:String(url),init:init!});
    return Response.json({choices:[{finish_reason:"stop",message:{content:"A red fox in a field."}}]});
  };
  assert.equal(await reverseWithByok(settings, secret, image, fetcher), "A red fox in a field.");
  assert.equal(calls.length, 1);
  const {url,init} = calls[0];
  assert.equal(url, "https://provider.example/api/v1/chat/completions");
  assert.equal(init.credentials, "omit"); assert.equal(init.redirect, "error");
  assert.equal((init.headers as Record<string,string>).Authorization, `Bearer ${secret}`);
  assert.ok(init.signal);
  const body = JSON.parse(String(init.body));
  assert.equal(body.model, "vision-model"); assert.equal(body.stream, false);
  assert.match(body.messages[1].content[0].text, /artificial neutral background/);
  assert.match(body.messages[1].content[1].image_url.url, /^data:image\/jpeg;base64,/);
  assert.ok(!String(init.body).includes(secret));
});
test("provider failures never expose raw response/exception secrets or retry", async () => {
  for (const [response,expected] of [[401,"authorization"],[403,"authorization"],[429,"quota"],[500,"provider"]] as const) {
    let calls = 0;
    await assert.rejects(reverseWithByok(settings, secret, image, async () => { calls++; return new Response(secret, {status:response}); }), new RegExp(`^Error: ${expected}$`));
    assert.equal(calls,1);
  }
  await assert.rejects(reverseWithByok(settings, secret, image, async () => { throw new Error(secret); }), /^Error: connection$/);
});
test("rejects empty, oversized, truncated or echoed-secret success responses", async () => {
  for (const response of [
    {choices:[{message:{content:""}}]},
    {choices:[{message:{content:"x".repeat(1801)}}]},
    {choices:[{message:{content:secret}}]},
    {choices:[{finish_reason:"length",message:{content:"Truncated"}}]},
  ]) await assert.rejects(reverseWithByok(settings,secret,image,async()=>Response.json(response)), /^Error: response$/);
  await assert.rejects(reverseWithByok(settings,secret,image,async()=>new Response("x".repeat(128001))), /^Error: response$/);
});
test("account teardown cancellation is forwarded to provider request", async () => {
  const abort = new AbortController(); abort.abort();
  await assert.rejects(reverseWithByok(settings,secret,image,async(_url,init)=>{ assert.ok(init?.signal?.aborted); throw new Error("aborted"); },abort.signal), /^Error: connection$/);
});


test("model discovery makes one authenticated GET only, with no cookies or redirects", async () => {
  let count = 0;
  const result = await fetchByokModels(settings.baseUrl, secret, async (url, init) => {
    count++;
    assert.equal(String(url), "https://provider.example/api/v1/models");
    assert.equal(init?.method, "GET"); assert.equal(init?.body, undefined);
    assert.equal(init?.credentials, "omit"); assert.equal(init?.redirect, "error");
    assert.equal((init?.headers as Record<string,string>).Authorization, `Bearer ${secret}`);
    assert.ok(init?.signal);
    return Response.json({data:[{id:" z-vision ",architecture:{input_modalities:["image","text"],output_modalities:["text"]}},{id:"a-vision",architecture:{input_modalities:["image"],output_modalities:["text"]}},{id:"z-vision"}]});
  });
  assert.equal(count,1);
  assert.deepEqual(result,{models:["a-vision","z-vision"],hasUnknownCapabilities:false});
});

test("model discovery excludes known negatives while flagging unknown vision capabilities", async () => {
  const result = await fetchByokModels(settings.baseUrl,secret,async()=>Response.json({data:[
    {id:"text-only",architecture:{input_modalities:["text"],output_modalities:["text"]}},
    {id:"image-output",architecture:{input_modalities:["image"],output_modalities:["image"]}},
    {id:"empty-input",architecture:{input_modalities:[],output_modalities:["text"]}},
    {id:"unknown"},{id:"partial",architecture:{input_modalities:["image"]}},
    {id:"known",architecture:{input_modalities:["image"],output_modalities:["text"]}},
    {id:""},{id:"x".repeat(201)},{id:12},{id:`echo-${secret}`},null,
  ]}));
  assert.deepEqual(result,{models:["known","partial","unknown"],hasUnknownCapabilities:true});
});

test("model discovery rejects malformed, empty and oversized responses without returning provider text", async () => {
  for (const body of ["not json", JSON.stringify({}), JSON.stringify({data:[]}), JSON.stringify({data:[{id:secret}]}), "x".repeat(2*1024*1024+1)]) {
    await assert.rejects(fetchByokModels(settings.baseUrl,secret,async()=>new Response(body)),/^Error: models$/);
  }
});

test("model discovery sorts and bounds unique options",async()=>{
  const data=Array.from({length:2100},(_,index)=>({id:`model-${String(index).padStart(4,"0")}`}));
  const result=await fetchByokModels(settings.baseUrl,secret,async()=>Response.json({data:[...data.reverse(),{id:"model-0000"}]}));
  assert.equal(result.models.length,2000);assert.equal(result.models[0],"model-0000");assert.equal(result.models.at(-1),"model-1999");
});

test("model discovery sanitizes HTTP, redirect and connection failures without retry",async()=>{
  for (const [status,code] of [[401,"authorization"],[403,"authorization"],[429,"quota"],[500,"provider"],[302,"provider"]] as const) {
    let count=0;
    await assert.rejects(fetchByokModels(settings.baseUrl,secret,async()=>{count++;return new Response(secret,{status});}),new RegExp(`^Error: ${code}$`));
    assert.equal(count,1);
  }
  await assert.rejects(fetchByokModels(settings.baseUrl,secret,async()=>{throw new Error(`Redirect exposes ${secret}`);}),/^Error: connection$/);
});

test("model discovery validates endpoint and key before any request and supports abort",async()=>{
  let count=0;
  const fetcher:typeof fetch=async()=>{count++;return Response.json({data:[{id:"vision"}]});};
  await assert.rejects(fetchByokModels("http://provider.example/v1",secret,fetcher),/^Error: endpoint$/);
  await assert.rejects(fetchByokModels(settings.baseUrl,"",fetcher),/^Error: key$/);
  assert.equal(count,0);
  const abort=new AbortController();abort.abort();
  await assert.rejects(fetchByokModels(settings.baseUrl,secret,async(_url,init)=>{assert.ok(init?.signal?.aborted);throw new Error("aborted");},abort.signal),/^Error: connection$/);
});
