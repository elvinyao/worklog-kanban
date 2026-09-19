import { execFileSync } from 'node:child_process';
for(const [command,args] of [
  ['npm',['run','typecheck']],
  ['npm',['run','generate:api:check']],
  ['python',['-m','compileall','-q','app','dummy','tools']],
  ['python',['-m','tools.verify_boundaries']],
])execFileSync(command,args,{stdio:'inherit'});
