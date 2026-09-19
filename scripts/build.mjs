import { readFile, writeFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const args = process.argv.slice(2);
const production=args.includes('--production');
const lifecycle = args.includes('lifecycle-test');
if(production&&(lifecycle||args.includes('--probe')))throw new Error('Production cannot include probe or lifecycle builds');
const configIndex=args.indexOf('--config');
if(production&&(configIndex<0||!args[configIndex+1]))throw new Error('Production configuration requires --config <file>');
const configPath=production?args[configIndex+1]:'config/dummy.json';
let config;
try{config=JSON.parse(execFileSync('python',['-m','tools.config',configPath],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));}
catch{throw new Error('Invalid or missing site configuration');}
if(production&&config.mode!=='production')throw new Error('Production configuration must use production mode');
await mkdir('dist',{recursive:true});
const staging=production?await mkdtemp(path.resolve('dist/.production-')):undefined;
try {
if(production)await writeFile(path.join(staging,'site-config.json'),JSON.stringify(config,null,2)+'\n');
const define = {__SITE_CONFIG__:JSON.stringify(config),'process.env.NODE_ENV':JSON.stringify(lifecycle ? 'development' : 'production')};
const outDir = path.resolve(lifecycle ? 'dist/lifecycle/probe' : 'dist/probe');
if(!production)await build({configFile:false,root:path.resolve('src/probe'),base:'/probe/',plugins:[react()],define,build:{outDir,emptyOutDir:true,sourcemap:false,minify:!lifecycle}});
if(!args.includes('--probe'))await build({configFile:false,root:path.resolve('src/web'),plugins:[react()],define,build:{outDir:production?path.join(staging,'web'):path.resolve(lifecycle?'dist/lifecycle/web':'dist/web'),emptyOutDir:true,sourcemap:false,minify:!lifecycle}});
const extensionDir = production?path.join(staging,'extension'):path.resolve('dist/extension-dummy');
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
if(production){
  execFileSync('python',['-m','tools.package','--directory',staging,'--config',path.join(staging,'site-config.json')],{stdio:'inherit'});
  const destination=path.resolve('dist/production'),backup=path.resolve('dist/production.previous-'+randomUUID());let previous=false;
  try{await rename(destination,backup);previous=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  try{await rename(staging,destination);}catch(error){if(previous)await rename(backup,destination);throw error;}
  if(previous)console.log('Previous release retained at '+backup);
  console.log('Production package: dist/production (Python runtime only)');
}
} finally {if(staging)await rm(staging,{recursive:true,force:true});}
