import { prepareImage } from '../src/image';
import { putRetryImage } from '../src/retry-images';
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
const samplePrompt='A clean editorial product photograph, centered composition, soft natural light from the left, subtle shadows and a light neutral background. Preserve the proportions and material details of the main subject. Crisp edges, restrained colors, realistic texture.';
async function seed() {
  if(localStorage.getItem(prefix+'seed-version')==='10-images') return;
  const entries=[];
  for(let i=0;i<10;i++) {
    const blob=await (await nativeFetch(`/sample${i+1}.png`)).blob();
    const image=await prepareImage(blob);
    const bitmap=await createImageBitmap(image.blob);
    const canvas=new OffscreenCanvas(120,120);const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#000';ctx.fillRect(0,0,120,120);
    const scale=Math.min(120/bitmap.width,120/bitmap.height);
    ctx.drawImage(bitmap,(120-bitmap.width*scale)/2,(120-bitmap.height*scale)/2,bitmap.width*scale,bitmap.height*scale);bitmap.close();
    const tiny=await canvas.convertToBlob({type:'image/jpeg',quality:.75});
    const thumbnail='data:image/jpeg;base64,'+btoa(String.fromCharCode(...new Uint8Array(await tiny.arrayBuffer())));
    const created=new Date(Date.now()-i*60000-5000).toISOString();
    const task={id:crypto.randomUUID(),requestId:crypto.randomUUID(),status:'succeeded',prompt:i?samplePrompt:'An expressive collection of small illustrated icons arranged in a balanced grid. Soft rounded forms, playful color accents, clear silhouettes and a clean background.',errorCode:null,refunded:false,createdAt:created,completedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),originalWidth:image.originalWidth,originalHeight:image.originalHeight};
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await image.blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('')+`:${image.originalWidth}x${image.originalHeight}`;
    entries.push({task,draft:task.prompt,edited:false,thumbnail,hash});
    await putRetryImage('preview-user',task.id,image,Date.now()+7*86400000);
  }
  await local.set({'reverse:preview-user':{version:2,selectedId:entries[0].task.id,entries}});
  writeApi({tasks:entries.map(e=>e.task),balance:7});
  localStorage.setItem(prefix+'seed-version','10-images');
}
window.fetch=async (input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
  if (url.hostname === 'byok-preview.invalid') {
    await new Promise(resolve => setTimeout(resolve, 700));
    const scenario = new URLSearchParams(location.search).get('byok');
    if (url.pathname.endsWith('/models') && scenario !== 'unauthorized') return Response.json({data:[{id:'preview-vision',architecture:{input_modalities:['text','image'],output_modalities:['text']}},{id:'preview-text',architecture:{input_modalities:['text'],output_modalities:['text']}},{id:'custom-vision'}]});
    return scenario === 'unauthorized'
      ? Response.json({error: {message: 'Preview rejected key'}}, {status: 401})
      : Response.json({choices: [{finish_reason: 'stop', message: {content: samplePrompt}}]});
  }
  if(url.hostname!=='preview.invalid') return nativeFetch(input,init);
  // Preview-only slow network fixture for local-first startup verification.
  if (url.pathname === '/api/reverse/config' && new URLSearchParams(location.search).get('config') === 'offline') throw new Error('Preview: account sync unavailable');
  const api=readApi();
  for(const task of api.tasks) if(task.status==='running'&&Date.now()-Date.parse(task.createdAt)>1800){task.status='succeeded';task.prompt=samplePrompt;task.completedAt=new Date().toISOString();}
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
  if(url.pathname==='/api/reverse/config') return reply({enabled:true,price:1,account:{userId:'preview-user',balance:api.balance},activeTask:api.tasks.find((t:any)=>t.status==='running')??null,recentTask:api.tasks[0]??null});
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
  await import('../src/panel');
  let revision=await (await nativeFetch('/revision')).text();
  setInterval(async()=>{try{const next=await(await nativeFetch('/revision')).text();if(next!==revision)location.reload();}catch{}},1000);
}
void start().catch(error=>notice(`预览启动失败：${error.message}`));
