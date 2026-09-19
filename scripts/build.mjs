import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const args = process.argv.slice(2);
if (args.includes('--production')) throw new Error('Production build is planned in T13');
const lifecycle = args.includes('lifecycle-test');
const config = JSON.parse(execFileSync('python',['-m','tools.config','config/dummy.json'],{encoding:'utf8'}));
const define = {__SITE_CONFIG__:JSON.stringify(config),'process.env.NODE_ENV':JSON.stringify(lifecycle ? 'development' : 'production')};
const outDir = path.resolve(lifecycle ? 'dist/lifecycle/probe' : 'dist/probe');
await build({configFile:false,root:path.resolve('src/probe'),base:'/probe/',plugins:[react()],define,build:{outDir,emptyOutDir:true,sourcemap:false,minify:!lifecycle}});
if(!args.includes('--probe'))await build({configFile:false,root:path.resolve('src/web'),plugins:[react()],define,build:{outDir:path.resolve(lifecycle?'dist/lifecycle/web':'dist/web'),emptyOutDir:true,sourcemap:false,minify:!lifecycle}});
const extensionDir = path.resolve('dist/extension-dummy');
for (const name of ['worker','bridge']) {
  await build({configFile:false,define,build:{outDir:extensionDir,emptyOutDir:name === 'worker',sourcemap:false,lib:{entry:path.resolve('src/extension/'+name+'.ts'),name:'WorklogBridge',formats:[name === 'worker' ? 'es' : 'iife'],fileName:()=>name+'.js'}}});
}
const manifest = JSON.parse(await readFile('src/extension/manifest.json','utf8'));
// Match patterns do not restrict ports; runtime checks enforce exact origins.
const pattern = value => { const url = new URL(value); return url.protocol+'//'+url.hostname+'/*'; };
manifest.content_scripts[0].matches = [pattern(config.boardOrigin)];
manifest.host_permissions = [...new Set([pattern(config.jiraBaseUrl),pattern(config.mattermostBaseUrl)])];
await mkdir(extensionDir,{recursive:true});
await writeFile(path.join(extensionDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
