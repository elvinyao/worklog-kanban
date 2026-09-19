// T01 toolchain smoke: this is not a build of the application.
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

await mkdir('.tmp', { recursive: true });
const dir = await mkdtemp(join(process.cwd(), '.tmp/toolchain-'));
try {
  const entry = join(dir, 'smoke.tsx');
  await writeFile(entry, "import React from 'react'; export const Screen = () => <div>toolchain-smoke</div>;\n");
  const result = await build({
    configFile: false,
    plugins: [react()],
    logLevel: 'warn',
    build: { write: false, lib: { entry, formats: ['es'] }, minify: false },
  });
  const bundles = Array.isArray(result) ? result : [result];
  if (!bundles.some(bundle => 'output' in bundle && bundle.output.some(file => file.type === 'chunk' && file.code.includes('toolchain-smoke')))) {
    throw new Error('React/TypeScript tooling did not produce the expected smoke bundle.');
  }
  console.log('Vite/React/TypeScript toolchain smoke passed; no application build claimed.');
} finally {
  await rm(dir, { recursive: true, force: true });
}
