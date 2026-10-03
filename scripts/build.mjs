import { readFile, writeFile, mkdir, mkdtemp, rename, rm, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const args = process.argv.slice(2);
const options=new Map();
for(let index=0;index<args.length;index++){
  const option=args[index];
  if(!['--production','--probe','lifecycle-test','--mode','--config','--output'].includes(option))throw new Error('Unknown build argument: '+option);
  if(options.has(option))throw new Error('Duplicate build argument: '+option);
  if(option==='--mode'){
    const value=args[++index];
    if(!['dummy','lifecycle-test'].includes(value))throw new Error('--mode requires dummy or lifecycle-test');
    options.set(option,value);
  }else if(option==='--config'||option==='--output'){
    const value=args[++index];
    if(!value||value.startsWith('--')||value==='lifecycle-test')throw new Error(option+' requires a path');
    options.set(option,value);
  }else options.set(option,true);
}
const production=options.has('--production');
const lifecycle=options.has('lifecycle-test')||options.get('--mode')==='lifecycle-test';
const probe=options.has('--probe');
if(production&&(lifecycle||probe))throw new Error('Production cannot include probe or lifecycle builds');
if(!production&&(options.has('--config')||options.has('--output')))throw new Error('--config and --output require --production');
if(production&&!options.has('--config'))throw new Error('Production configuration requires --config <file>');
const configPath=production?options.get('--config'):'config/dummy.json';
const destination=production?path.resolve(options.get('--output')??'dist/production'):undefined;
if(production){
  const root=await realpath('.');
  const contains=(parent,child)=>{
    const relative=path.relative(parent,child);
    return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));
  };
  // Resolve the existing part of the path so symlinked parents cannot make an
  // apparently safe output replace source directories or the repository itself.
  let ancestor=destination;const missing=[];
  while(true){
    try{ancestor=await realpath(ancestor);break;}
    catch(error){if(error.code!=='ENOENT')throw error;missing.unshift(path.basename(ancestor));ancestor=path.dirname(ancestor);}
  }
  const resolved=path.join(ancestor,...missing);
  const relative=path.relative(root,resolved);
  if(contains(resolved,root))throw new Error('Production output cannot replace the repository or its parents');
  if(contains(root,resolved)&&(relative.split(path.sep).length<2||!['dist','.tmp'].includes(relative.split(path.sep)[0])))throw new Error('Production output inside the repository must be under dist/ or .tmp/');
  const existing=await lstat(destination).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(existing){
    if(!existing.isDirectory()||existing.isSymbolicLink())throw new Error('Production output must be a directory, not a file or symbolic link');
    try{for(const file of ['run.py','site-config.json','app/schema.sql','web/index.html','extension/manifest.json'])await readFile(path.join(destination,file));}
    catch{throw new Error('Existing production output is not a release directory');}
  }
}
let config;
try{config=JSON.parse(execFileSync('python',['-m','tools.config',configPath],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));}
catch{throw new Error('Invalid or missing site configuration');}
if(production&&config.mode!=='production')throw new Error('Production configuration must use production mode');
await mkdir(production?path.dirname(destination):'dist',{recursive:true});
const staging=production?await mkdtemp(path.join(path.dirname(destination),'.'+path.basename(destination)+'-')):undefined;
try {
if(production)await writeFile(path.join(staging,'site-config.json'),JSON.stringify(config,null,2)+'\n');
const define = {__SITE_CONFIG__:JSON.stringify(config),'process.env.NODE_ENV':JSON.stringify(lifecycle ? 'development' : 'production')};
const outDir = path.resolve(lifecycle ? 'dist/lifecycle/probe' : 'dist/probe');
if(!production)await build({configFile:false,build:{outDir:path.resolve('dist/dummy'),emptyOutDir:true,sourcemap:false,lib:{entry:path.resolve('src/dummy/controls.ts'),formats:['es'],fileName:()=> 'controls.js'}}});
if(!production)await build({configFile:false,root:path.resolve('src/probe'),base:'/probe/',plugins:[react()],define,build:{outDir,emptyOutDir:true,sourcemap:false,minify:!lifecycle}});
if(!probe)await build({configFile:false,root:path.resolve('src/web'),plugins:[react()],define,build:{outDir:production?path.join(staging,'web'):path.resolve(lifecycle?'dist/lifecycle/web':'dist/web'),emptyOutDir:true,sourcemap:false,minify:!lifecycle}});
const extensionDir = production?path.join(staging,'extension'):path.resolve('dist/extension-dummy');
for (const name of ['worker','bridge','options']) {
  await build({configFile:false,define,build:{outDir:extensionDir,emptyOutDir:name === 'worker',sourcemap:false,lib:{entry:path.resolve('src/extension/'+name+'.ts'),name:'WorklogBridge',formats:[name === 'worker' ? 'es' : 'iife'],fileName:()=>name+'.js'}}});
}
const manifest = JSON.parse(await readFile('src/extension/manifest.json','utf8'));
// Match patterns do not restrict ports; runtime checks enforce exact origins.
const pattern = value => { const url = new URL(value); return url.protocol+'//'+url.hostname+'/*'; };
manifest.host_permissions = [...new Set([pattern(config.boardOrigin),pattern(config.jiraBaseUrl),pattern(config.mattermostBaseUrl)])];
await mkdir(extensionDir,{recursive:true});
await writeFile(path.join(extensionDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
for(const name of ['options.html','options.css'])await writeFile(path.join(extensionDir,name),await readFile(path.join('src/extension',name)));
if(production){
  execFileSync('python',['-m','tools.package','--directory',staging,'--config',path.join(staging,'site-config.json')],{stdio:'inherit'});
  const backup=destination+'.previous-'+randomUUID();let previous=false;
  try{await rename(destination,backup);previous=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  try{await rename(staging,destination);}catch(error){if(previous)await rename(backup,destination);throw error;}
  if(previous)console.log('Previous release retained at '+backup);
  console.log('Production package: '+destination+' (Python runtime only)');
}
} finally {if(staging)await rm(staging,{recursive:true,force:true});}
