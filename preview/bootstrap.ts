import { prepareImage } from '../src/image';
import { putRetryImage } from '../src/retry-images';
import { BYOK_SETTINGS, BYOK_SECRET, DEFAULT_BYOK } from '../src/byok';
const nativeFetch = window.fetch.bind(window);
const prefix = 'pod-ui-preview:';
const listeners: Array<(changes: unknown,area: string)=>void> = [];
function storage(area: string) {
  const store = area === 'session' ? sessionStorage : localStorage;
  const read = () => JSON.parse(store.getItem(prefix+area)||'{}');
  return {
    async setAccessLevel() {},
    async get(keys: string | string[] | null) { const all=read(); return keys===null?all:Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,all[k]])); },
    async set(values: Record<string,unknown>) { const old=read();store.setItem(prefix+area,JSON.stringify({...old,...values}));listeners.forEach(fn=>fn(Object.fromEntries(Object.entries(values).map(([k,v])=>[k,{oldValue:old[k],newValue:v}])),area)); },
    async remove(key: string) { const all=read();delete all[key];store.setItem(prefix+area,JSON.stringify(all)); }
  };
}
const local=storage('local'), session=storage('session');
const notice=(message:string)=>{const el=document.getElementById('status')!;el.textContent=message;el.hidden=false;};
(globalThis as any).chrome={
  i18n:{getUILanguage:()=> 'zh-CN'},
  storage:{local,session,onChanged:{addListener:(fn:any)=>listeners.push(fn)}},
  tabs:{query:async()=>[{url:'https://pixondeck.com'}],create:async({url}:{url:string})=>{
    const destination = new URL(url);
    if ((destination.origin === 'https://pixondeck.com' && destination.pathname.endsWith('/sign-in')) || destination.origin === 'https://chatgpt.com') {
      window.open(destination.href, '_blank', 'noopener,noreferrer');
    }
  }},
  permissions:{contains:async()=>true,request:async()=>true,remove:async()=>true},
  runtime:{sendMessage:async()=>({})}
};
const readApi=()=>JSON.parse(localStorage.getItem(prefix+'api')||'{"tasks":[],"balance":7}');
const writeApi=(data:any)=>localStorage.setItem(prefix+'api',JSON.stringify(data));
const portraitPrompt='Medium: A soft, realistic photographic portrait.\nLayout: An adult standing at the center of a vertical frame.\nSubject: Dark short hair, neutral expression, blue shirt and dark trousers.\nPose & relations: Standing upright with arms relaxed at the sides.\nScene: A pale neutral background.\nLight & finish: Soft diffuse light, muted blue and cream colors, natural texture.';
async function demoPortrait() {
  const c=new OffscreenCanvas(600,800),ctx=c.getContext('2d')!;
  ctx.fillStyle='#e7e9ef';ctx.fillRect(0,0,600,800);
  ctx.strokeStyle='#273549';ctx.lineWidth=48;ctx.lineCap='round';
  for(const [x1,y1,x2,y2] of [[264,440,252,728],[336,440,348,728]]){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
  ctx.strokeStyle='#7293b5';ctx.lineWidth=38;
  for(const points of [[[234,240],[198,360],[180,464]],[[366,240],[402,360],[420,464]]]){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}
  ctx.fillStyle='#7293b5';ctx.beginPath();ctx.roundRect(225,218,150,244,32);ctx.fill();
  ctx.fillStyle='#c5a58d';ctx.beginPath();ctx.ellipse(300,141,49,62,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#343c46';ctx.beginPath();ctx.ellipse(300,105,49,29,0,Math.PI,Math.PI*2);ctx.fill();
  return c.convertToBlob({type:'image/png'});
}
const samplePrompt='A clean editorial product photograph, centered composition, soft natural light from the left, subtle shadows and a light neutral background. Preserve the proportions and material details of the main subject. Crisp edges, restrained colors, realistic texture.';
async function seed() {
  if(localStorage.getItem(prefix+'seed-version')==='13-real-pose') return;
  const entries=[];
  for(let i=0;i<10;i++) {
    const blob=i===0?await demoPortrait():await (await nativeFetch(`/sample${i+1}.png`)).blob();
    const image=await prepareImage(blob);
    const bitmap=await createImageBitmap(image.blob);
    const canvas=new OffscreenCanvas(120,120);const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#000';ctx.fillRect(0,0,120,120);
    const scale=Math.min(120/bitmap.width,120/bitmap.height);
    ctx.drawImage(bitmap,(120-bitmap.width*scale)/2,(120-bitmap.height*scale)/2,bitmap.width*scale,bitmap.height*scale);bitmap.close();
    const tiny=await canvas.convertToBlob({type:'image/jpeg',quality:.75});
    const thumbnail='data:image/jpeg;base64,'+btoa(String.fromCharCode(...new Uint8Array(await tiny.arrayBuffer())));
    const created=new Date(Date.now()-i*60000-5000).toISOString();
    const task={id:crypto.randomUUID(),requestId:crypto.randomUUID(),status:'succeeded',prompt:i?samplePrompt:portraitPrompt,errorCode:null,refunded:false,createdAt:created,completedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),originalWidth:image.originalWidth,originalHeight:image.originalHeight};
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await image.blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('')+`:${image.originalWidth}x${image.originalHeight}`;
    entries.push({task,draft:task.prompt,edited:false,thumbnail,hash});
    await putRetryImage('preview-user',task.id,image,Date.now()+7*86400000);
  }
  await local.set({'reverse:preview-user':{version:2,selectedId:entries[0].task.id,entries}});
  writeApi({tasks:entries.map(e=>e.task),balance:7});
  localStorage.setItem(prefix+'seed-version','13-real-pose');
}
window.fetch=async (input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
  if (url.hostname === 'byok-preview.invalid') {
    await new Promise(resolve => setTimeout(resolve, 700));
    const scenario = new URLSearchParams(location.search).get('byok');
    if (url.pathname.endsWith('/models') && scenario !== 'unauthorized') return Response.json({data:[{id:'preview-vision',architecture:{input_modalities:['text','image'],output_modalities:['text']}},{id:'preview-text',architecture:{input_modalities:['text'],output_modalities:['text']}},{id:'custom-vision'}]});
    const body=JSON.parse(String(init?.body||'{}'));
    const cleaning=body.messages?.some((m:any)=>m.role==='system'&&typeof m.content==='string'&&m.content.startsWith('Edit an image-generation prompt'));
    const original=body.messages?.find((m:any)=>m.role==='user')?.content;
    const cleaned=typeof original==='string'?original.replace(/\b(?:nude|naked|bare)\s+(?=(?:adult\s+)?(?:woman|man|person)\b)/gi,''):samplePrompt;
    const changed=cleaned!==original;
    const content=JSON.stringify(cleaning?{changed,prompt:cleaned,changes:changed?['演示：删去一处露骨修饰，不新增内容']:[]}:{prompt:samplePrompt});
    return scenario === 'unauthorized'
      ? Response.json({error: {message: 'Preview rejected key'}}, {status: 401})
      : Response.json({choices: [{finish_reason: 'stop', message: {content}}]});
  }
  if(url.hostname!=='preview.invalid') return nativeFetch(input,init);
  // Preview-only slow network fixture for local-first startup verification.
  if (url.pathname === '/api/reverse/config' && new URLSearchParams(location.search).get('config') === 'offline') throw new Error('Preview: account sync unavailable');
  const api=readApi();
  for(const task of api.tasks) if(task.status==='running'&&Date.now()-Date.parse(task.createdAt)>1800){
    task.status='succeeded';task.prompt=samplePrompt;task.completedAt=new Date().toISOString();
    if(task.operation==='prompt_cleaning'){
      if(new URLSearchParams(location.search).get('cleaning')==='failed'){
        task.status='failed';task.errorCode='prompt_cleaning_failed';task.prompt=null;task.refunded=true;api.balance++;
      } else {
        // Deliberately small deterministic fixture; this is not the production editor.
        task.prompt=task.sourcePrompt.replace(/\b(?:nude|naked|bare)\s+(?=(?:adult\s+)?(?:woman|man|person)\b)/gi,'');
        task.changed=task.prompt!==task.sourcePrompt;task.changes=task.changed?['演示：删去一处露骨修饰，不新增内容']:[];
      }
    }
  }
  writeApi(api);
  const reply=(body:unknown,status=200)=>Promise.resolve(Response.json(body,{status}));
  if (url.pathname.startsWith('/api/saved-prompts')) {
    const storageKey = prefix + 'favorites';
    const items = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const path = url.pathname.split('/').filter(Boolean);
    const id = path[2];
    const item = items.find((item:any) => item.id === id);
    const method = init?.method || 'GET';
    const publicItem = (item:any) => { const {thumbnailDataUrl, ...rest} = item; return rest; };
    const persist = () => localStorage.setItem(storageKey, JSON.stringify(items));
    if (!id && method === 'GET') return reply({items: items.map(publicItem), count: items.length, limit: 100});
    if (path[3] === 'thumbnail' && item?.thumbnailDataUrl) return nativeFetch(item.thumbnailDataUrl);
    if (method === 'GET') return item ? reply({item: publicItem(item)}) : reply({error:'not_found'},404);
    if (method === 'PUT') {
      if (item) return reply({item:publicItem(item),count:items.length,limit:100});
      if (items.length >= 100) return reply({error:'saved_prompt_limit',limit:100},409);
      const body = JSON.parse(String(init?.body || '{}'));
      const now = new Date().toISOString();
      const created = {id,prompt:body.prompt,title:'',originalWidth:body.originalWidth ?? null,originalHeight:body.originalHeight ?? null,thumbnailDataUrl:body.thumbnailDataUrl,thumbnailUrl:body.thumbnailDataUrl ? `/api/saved-prompts/${id}/thumbnail` : null,revision:1,createdAt:now,updatedAt:now};
      items.unshift(created); persist();
      return reply({item:publicItem(created),count:items.length,limit:100});
    }
    if (method === 'PATCH' && item) {
      const body = JSON.parse(String(init?.body || '{}'));
      if (body.revision !== item.revision) return reply({error:'revision_conflict',item:publicItem(item)},409);
      item.prompt = body.prompt; item.revision++; item.updatedAt = new Date().toISOString(); persist();
      return reply({item:publicItem(item)});
    }
    if (method === 'DELETE') { localStorage.setItem(storageKey, JSON.stringify(items.filter((item:any) => item.id !== id))); return reply({deleted:true}); }
    return reply({error:'not_found'},404);
  }
  if(url.pathname==='/api/reverse/clean-prompt' && init?.method==='POST') {
    const body=JSON.parse(String(init.body||'{}'));
    const existing=api.tasks.find((t:any)=>t.operation==='prompt_cleaning'&&(t.requestId===body.requestId||(t.sourceTaskId===body.sourceTaskId&&t.status!=='failed')));
    if(existing)return reply({task:existing,balance:api.balance});
    if(api.balance<1)return reply({error:'insufficient_credits',balance:api.balance},402);
    const task={id:crypto.randomUUID(),requestId:body.requestId,operation:'prompt_cleaning',sourceTaskId:body.sourceTaskId,sourcePrompt:body.prompt,status:'running',prompt:null,changed:null,changes:[],errorCode:null,refunded:false,createdAt:new Date().toISOString(),completedAt:null,expiresAt:new Date(Date.now()+86400000).toISOString()};
    api.tasks.unshift(task);api.balance--;writeApi(api);return reply({task,balance:api.balance});
  }
  if(url.pathname==='/api/reverse/clean-prompt')return reply({task:api.tasks.find((t:any)=>t.operation==='prompt_cleaning'&&t.sourceTaskId===url.searchParams.get('sourceTaskId'))??null,balance:api.balance});
  if(url.pathname.startsWith('/api/reverse/clean-prompt/'))return reply({task:api.tasks.find((t:any)=>t.id===url.pathname.split('/').at(-1))??null,balance:api.balance});
  if(url.pathname==='/api/reverse/config') return reply({enabled:true,price:1,account:{userId:'preview-user',balance:api.balance},activeTask:api.tasks.find((t:any)=>t.status==='running'&&t.operation!=='prompt_cleaning')??null,recentTask:api.tasks.find((t:any)=>t.operation!=='prompt_cleaning')??null});
  if(url.pathname==='/api/reverse'&&init?.method==='POST') {
    const form=init.body as FormData;const existing=api.tasks.find((t:any)=>t.requestId===form.get('requestId'));
    if(existing)return reply({task:existing,balance:api.balance});
    const task={id:crypto.randomUUID(),requestId:form.get('requestId'),status:'running',prompt:null,errorCode:null,refunded:false,originalWidth:Number(form.get('originalWidth')),originalHeight:Number(form.get('originalHeight')),createdAt:new Date().toISOString(),completedAt:null,expiresAt:new Date(Date.now()+86400000).toISOString()};
    api.tasks.unshift(task);api.balance--;writeApi(api);return reply({task,balance:api.balance});
  }
  if(url.pathname.endsWith('/handoff')) return reply({token:'preview-handoff'});
  const task=api.tasks.find((t:any)=>url.pathname===`/api/reverse/${t.id}`);
  return task?reply({task,balance:api.balance}):reply({error:'not_found'},404);
};
async function start(){
  await local.set({browsingOrigins:["http://*/*","https://*/*"]});
  await seed();
  const modeKey=`${BYOK_SETTINGS}:preview-user`,secretKey=`${BYOK_SECRET}:preview-user`;
  const requestedMode=new URLSearchParams(location.search).get('mode');
  const explicitMode=requestedMode==='credits'||requestedMode==='byok'?requestedMode:null;
  const modeInitialized=localStorage.getItem(prefix+'mode-seed')==='v1';
  // Explicit query changes apply once per tab navigation mode; refreshing preserves UI choices.
  if(!modeInitialized || (explicitMode && sessionStorage.getItem(prefix+'requested-mode')!==explicitMode)){
    const mode=explicitMode??'credits';
    const settings=mode==='byok'?{mode,baseUrl:'https://byok-preview.invalid/v1',model:'preview-vision'}:{...DEFAULT_BYOK,mode};
    await local.set({[modeKey]:settings});
    if(mode==='byok')await session.set({[secretKey]:{key:'preview-fake-key-not-a-real-secret',baseUrl:settings.baseUrl,model:settings.model,verified:true}});
    localStorage.setItem(prefix+'mode-seed','v1');
    if(explicitMode)sessionStorage.setItem(prefix+'requested-mode',explicitMode);
  }
  await import('../src/panel');
  const badge=document.createElement('div');const updateBadge=async()=>{const saved=(await local.get(modeKey))[modeKey];badge.textContent=`交互预览 · ${saved?.mode==='byok'?'模拟 BYOK':'模拟积分'} / 任务 · 真实姿态模型`;};await updateBadge();listeners.push(()=>void updateBadge());badge.style.cssText='font-size:11px;color:#788397;text-align:center;padding:6px;';document.body.prepend(badge);
  let revision=await (await nativeFetch('/revision')).text();
  setInterval(async()=>{try{const next=await(await nativeFetch('/revision')).text();if(next!==revision)location.reload();}catch{}},1000);
}
void start().catch(error=>notice(`预览启动失败：${error.message}`));
