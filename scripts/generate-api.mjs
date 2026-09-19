import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import openapiTS, { astToString } from 'openapi-typescript';

const args=process.argv.slice(2);
const index=args.indexOf('--output-root');
const root=path.resolve(index>=0 ? args[index+1] : '.');
const temporary=await mkdtemp(path.join(os.tmpdir(),'worklog-openapi-'));
try{
  const file=path.join(temporary,'schema.json');
  execFileSync('python',['-m','tools.export_openapi','--output',file],{stdio:'pipe'});
  const json=await readFile(file,'utf8');
  const declarations=astToString(await openapiTS(JSON.parse(json)));
  const outputs=[['contracts/shared-api.openapi.json',json],['src/generated/shared-api.d.ts',declarations]];
  const drift=[];
  for(const [relative,content] of outputs){
    const target=path.join(root,relative);
    if(args.includes('--check')){
      let existing;
      try{existing=await readFile(target,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
      if(existing!==content)drift.push(relative);
    }else{
      await mkdir(path.dirname(target),{recursive:true});await writeFile(target,content);
    }
  }
  if(drift.length){console.error('Generated API files have drift: '+drift.join(', '));process.exitCode=1;}
  else console.log(args.includes('--check')?'API generation is current.':'Generated shared API schema and TypeScript declarations.');
}finally{await rm(temporary,{recursive:true,force:true});}
