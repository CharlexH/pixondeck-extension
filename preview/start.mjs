import http from 'node:http';
import { readFile, stat, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, 'src');
async function revision() {
  const files = (await readdir(source)).filter(x => /\.(ts|css|html)$/.test(x));
  return String(Math.max((await stat(resolve(root,'preview/bootstrap.ts'))).mtimeMs,...await Promise.all(files.map(async x => (await stat(resolve(source,x))).mtimeMs))));
}
http.createServer(async (req,res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    res.setHeader('Cache-Control','no-store');
    if (path === '/revision') { res.end(await revision()); return; }
    if (path === '/panel.js') {
      const result = await build({ entryPoints:[resolve(root,'preview/bootstrap.ts')], bundle:true, write:false, format:'iife', target:'chrome116', plugins:[{name:'preview-auth',setup(b){b.onResolve({filter:/^\.\/auth$/},()=>({path:resolve(root,'preview/auth.ts')}));}}], define:{__CONFIG__:JSON.stringify({apiOrigin:'http://preview.invalid',siteOrigin:'http://preview.invalid',publishableKey:'preview',syncHost:'http://preview.invalid'})} });
      res.setHeader('Content-Type','text/javascript');res.end(result.outputFiles[0].text);return;
    }
    const samples = ['icon-set/dev-01.png','logo-design/dev-01.png','logo-design/dev-02.png','ip-as-logo/b1.png','ip-as-logo/b2.png','logo-design/dev-05.png','logo-design/dev-06.png','logo-design/dev-07.png','icon-set/dev-02.png','icon-set/dev-03.png'];
    const files = {'/assets/welcome-demo.mp4':resolve(source,'assets/welcome-demo.mp4'),'/assets/welcome-demo-poster.jpg':resolve(source,'assets/welcome-demo-poster.jpg'),'/':resolve(source,'panel.html'),'/panel.css':resolve(source,'panel.css'),'/logo.svg':resolve(root,'assets/logo.svg'),'/icon.png':resolve(root,'assets/icon.png'),'/sample1.png':resolve(root,'src/assets/icon-128.png'),'/sample2.png':resolve(root,'src/assets/icon-128.png')};
    samples.forEach((file,i)=>files[`/sample${i+1}.png`]=resolve(root,'src/assets/icon-128.png'));
    if (!files[path]) {res.writeHead(404).end();return;}
    res.setHeader('Content-Type',path.endsWith('.mp4')?'video/mp4':path.endsWith('.jpg')?'image/jpeg':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'text/html; charset=utf-8');
    let body = await readFile(files[path]);
    if(path==='/') body=Buffer.from(body.toString().replace('<title>PixOnDeck</title>','<title>PixOnDeck · UI 预览</title>'));
    res.end(body);
  } catch(error) { console.error(error);res.writeHead(500).end('Preview build failed'); }
}).listen(8791,'127.0.0.1',()=>console.log('UI preview: http://127.0.0.1:8791'));
