import { CLEAN_PROMPT_SYSTEM_PROMPT } from "./shared/lib/reverse/prompt-cleaning.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPromptWithByok, fetchByokModels, providerEndpoint, validateByok, reverseWithByok, type ByokSettings } from "./byok.ts";
import { REVERSE_SYSTEM_PROMPT } from "./shared/lib/reverse/prompt.ts";
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
    return Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify({prompt:"A red fox in a field."})}}]});
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
  assert.equal(body.max_tokens, 4000);
  assert.equal(body.messages[0].content, REVERSE_SYSTEM_PROMPT);
  assert.equal(body.response_format, undefined);
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
    {choices:[{finish_reason:"stop",message:{content:JSON.stringify({prompt:""})}}]},
    {choices:[{finish_reason:"stop",message:{content:JSON.stringify({prompt:"x".repeat(4097)})}}]},
    {choices:[{finish_reason:"stop",message:{content:JSON.stringify({prompt:secret})}}]},
    {choices:[{finish_reason:"stop",message:{content:JSON.stringify({prompt:"x".repeat(4096)})}}]},
    {choices:[{finish_reason:"stop",message:{content:"Plain text instead of JSON"}}]},
    {choices:[{finish_reason:"stop",message:{content:JSON.stringify({prompt:"A fox.",extra:true})}}]},
    {choices:[{finish_reason:"length",message:{content:JSON.stringify({prompt:"Truncated"})}}]},
    {choices:[{finish_reason:"stop",message:{refusal:"Refused",content:JSON.stringify({prompt:"A fox."})}}]},
    {choices:[{finish_reason:"content_filter",message:{content:JSON.stringify({prompt:"A fox."})}}]},
    {choices:[{message:{content:JSON.stringify({prompt:"A fox."})}}]},
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


test("BYOK preserves complete prompts up to the same 4096-character contract as credits", async () => {
  for (const length of [1801, 2500, 4096]) {
    const prompt = "x".repeat(length - 1) + ".";
    let calls = 0;
    const result = await reverseWithByok(settings, secret, image, async () => {
      calls++;
      return Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify({prompt})}}]});
    });
    assert.equal(result, prompt); assert.equal(calls, 1);
  }
  await assert.rejects(reverseWithByok(settings,secret,image,async()=>new Response("invalid envelope")), /^Error: response$/);
});


test("BYOK cleaning makes one text-only provider request without a platform billing call", async () => {
  let calls = 0;
  const original = "A softly lit nude adult in a room.";
  const expected = { changed: true, prompt: "A softly lit adult in a room.", changes: ["删除裸露描述"] };
  const result = await cleanPromptWithByok(settings, secret, original, async (url, init) => {
    calls++;
    assert.equal(String(url), "https://provider.example/api/v1/chat/completions");
    assert.equal(init?.credentials, "omit"); assert.equal(init?.redirect, "error");
    assert.equal((init?.headers as Record<string,string>).Authorization, `Bearer ${secret}`);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, settings.model); assert.equal(body.max_tokens, 4000);
    assert.equal(body.response_format, undefined);
    assert.deepEqual(body.messages, [{role:"system",content:CLEAN_PROMPT_SYSTEM_PROMPT},{role:"user",content:original}]);
    assert.ok(!String(init?.body).includes("image_url"));
    return Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify(expected)}}]});
  });
  assert.deepEqual(result, expected); assert.equal(calls, 1);
});

test("BYOK cleaning preserves unchanged 4096-character text exactly", async () => {
  const original = "x".repeat(4096);
  const expected = { changed: false, prompt: original, changes: [] };
  assert.deepEqual(await cleanPromptWithByok(settings,secret,original,async()=>Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify(expected)}}]})),expected);
});

test("BYOK cleaning rejects additions, refusals, truncation, echoed secrets and malformed summaries", async () => {
  const original = "The nude adult portrait.";
  const valid = {changed:true,prompt:"The adult portrait.",changes:["删除裸露描述"]};
  for (const message of [
    {content:JSON.stringify({...valid,prompt:"The clothed adult portrait."})},
    {content:JSON.stringify({...valid,changes:[secret]})},
    {content:JSON.stringify({...valid,changes:"not array"})},
    {content:JSON.stringify({...valid,prompt:""})},
    {content:"plain text"},
    {content:JSON.stringify(valid),refusal:"Refused"},
    {content:JSON.stringify({...valid,changed:false})},
  ]) await assert.rejects(cleanPromptWithByok(settings,secret,original,async()=>Response.json({choices:[{finish_reason:"stop",message}]})),/^Error: response$/);
  for (const finish_reason of ["length","content_filter",undefined])
    await assert.rejects(cleanPromptWithByok(settings,secret,original,async()=>Response.json({choices:[{finish_reason,message:{content:JSON.stringify(valid)}}]})),/^Error: response$/);
  await assert.rejects(cleanPromptWithByok(settings,secret,original,async()=>new Response("x".repeat(128001))),/^Error: response$/);
});

test("BYOK cleaning sanitizes provider failures without retry or credit fallback", async () => {
  for (const [status,code] of [[401,"authorization"],[403,"authorization"],[429,"quota"],[500,"provider"],[302,"provider"]] as const) {
    let calls = 0;
    await assert.rejects(cleanPromptWithByok(settings,secret,"A portrait.",async()=>{calls++;return new Response(secret,{status});}),new RegExp(`^Error: ${code}$`));
    assert.equal(calls,1);
  }
  await assert.rejects(cleanPromptWithByok(settings,secret,"A portrait.",async()=>{throw new Error(secret);}),/^Error: connection$/);
  const abort=new AbortController();abort.abort();
  await assert.rejects(cleanPromptWithByok(settings,secret,"A portrait.",async(_url,init)=>{assert.ok(init?.signal?.aborted);throw new Error("aborted");},abort.signal),/^Error: connection$/);
});

test("BYOK cleaning validates its input before requesting a provider", async () => {
  let calls=0;
  const fetcher:typeof fetch=async()=>{calls++;throw new Error("must not call");};
  for (const prompt of ["", " ", "x".repeat(4097)])
    await assert.rejects(cleanPromptWithByok(settings,secret,prompt,fetcher),/^Error: invalid_prompt$/);
  assert.equal(calls,0);
});
