import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { validateByok, providerEndpoint, BYOK_SECRET, BYOK_SETTINGS } from './byok.ts';
const source = readFileSync(new URL('./panel.ts', import.meta.url), 'utf8');
function setup(check = async () => ({models:['vision']})) {
  const elements: Record<string, any> = {
    byokEndpoint:{value:'https://provider.example/v1'}, byokModel:{value:'vision'}, byokKey:{value:'test-key'},
    byokConsent:{checked:true}, byokDialog:{open:true}, byokError:{hidden:true}, byokSave:{disabled:false}, byokForm:{},
  };
  const saved:any[]=[];let reloads=0;
  const context = {el:(id:string)=>elements[id], userId:'a',accountEpoch:1,busy:false,isRunning:()=>false,uncertain:false,
    validateByok,providerEndpoint,BYOK_SECRET,BYOK_SETTINGS,AbortController,byokModelsAbort:null,
    fetchByokModels:check,fetch:()=>{},flushFavoriteEdit:async()=>true,
    byokText:{save:'Save',checkingConnection:'Checking',connectionCheckFailed:'Failed',consentRequired:'Consent'},byokError:()=> 'Safe error',
    chrome:{permissions:{request:async()=>true},storage:{session:{setAccessLevel:async()=>{},set:async(x:any)=>saved.push(x)},local:{set:async(x:any)=>saved.push(x)}}},
    location:{reload:()=>reloads++},
  };
  const code=source.slice(source.indexOf('el<HTMLFormElement>("byokForm").onsubmit'),source.indexOf('el("favoritesToggle").onclick'));
  runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  return {elements,saved,context,reloads:()=>reloads,submit:()=>elements.byokForm.onsubmit({preventDefault(){}})};
}
test('saving BYOK verifies connection before persisting connected state',async()=>{
  const app=setup();await app.submit();assert.equal(app.saved[0][`${BYOK_SECRET}:a`].verified,true);assert.equal(app.reloads(),1);
});
test('failed connection check keeps dialog open without persisting credentials',async()=>{
  const app=setup(async()=>{throw new Error('authorization');});await app.submit();assert.equal(app.saved.length,0);assert.equal(app.reloads(),0);assert.equal(app.elements.byokError.hidden,false);assert.equal(app.elements.byokSave.disabled,false);
});
test('closing dialog during verification discards the late result',async()=>{
  let resolve!:(value:any)=>void;const app=setup(()=>new Promise(done=>resolve=done));const pending=app.submit();
  await new Promise(done=>setTimeout(done,0));app.elements.byokDialog.open=false;resolve({models:['vision']});await pending;assert.equal(app.saved.length,0);
});
