// scripts/bundle-size.test.ts
import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const ROOT = resolve(import.meta.dir, '..');
const SCRATCHPAD = mkdtempSync(resolve(tmpdir(), 'slash-bundle-size-'));

interface BundleSize {
  original: number;
  gzip: number;
  brotli: number;
}

async function measureBundle(code: string): Promise<BundleSize> {
  const buffer = Buffer.from(code);
  const gzipped = gzipSync(buffer, { level: 9 });
  const brotlied = brotliCompressSync(buffer, {
    params: {
      [0]: 11, // BROTLI_PARAM_QUALITY
    },
  });

  return {
    original: buffer.length,
    gzip: gzipped.length,
    brotli: brotlied.length,
  };
}

async function buildTestApp(importStatement: string): Promise<BundleSize> {
  const testFile = resolve(SCRATCHPAD, 'test-bundle.ts');
  const outFile = resolve(SCRATCHPAD, 'test-bundle.js');

  // Criar app de teste
  await writeFile(testFile, `
${importStatement}

const count = createState(0);
const app = html\`
  <div>
    <h1>Count: \${count}</h1>
    <button onclick=\${() => count.set(count.get() + 1)}>Increment</button>
  </div>
\`;

render(app, document.body);
`);

  // Build com Bun
  const result = await Bun.build({
    entrypoints: [testFile],
    outdir: SCRATCHPAD,
    format: 'esm',
    minify: {
      whitespace: true,
      syntax: true,
      identifiers: true,
    },
    target: 'browser',
    external: [],
  });

  if (!result.success) {
    throw new Error('Build failed');
  }

  // Ler bundle gerado
  const bundleContent = await readFile(outFile, 'utf-8');

  // Limpar arquivos temporários
  await rm(testFile);
  await rm(outFile);

  return measureBundle(bundleContent);
}

describe('Bundle Size Optimization', () => {
  test('core import deve produzir bundle <= 7KB gzipado', async () => {
    const size = await buildTestApp(`import { createState, html, render } from "${ROOT}/src/core.ts";`);

    const gzipKB = (size.gzip / 1024).toFixed(2);
    const brotliKB = (size.brotli / 1024).toFixed(2);

    console.log(`\n📦 Core bundle: ${gzipKB} KB gzip, ${brotliKB} KB brotli\n`);

    expect(size.gzip).toBeLessThanOrEqual(7 * 1024);
  }, 30000);

  test('core import deve produzir bundle <= 6KB brotli', async () => {
    const size = await buildTestApp(`import { createState, html, render } from "${ROOT}/src/core.ts";`);

    const brotliKB = (size.brotli / 1024).toFixed(2);

    expect(size.brotli).toBeLessThanOrEqual(6 * 1024);
  }, 30000);

  test('full import deve ser <= 12KB gzipado', async () => {
    const size = await buildTestApp(`import { createState, html, render } from "${ROOT}/src/index.ts";`);

    const gzipKB = (size.gzip / 1024).toFixed(2);
    console.log(`\n📦 Full bundle: ${gzipKB} KB gzip\n`);

    expect(size.gzip).toBeLessThanOrEqual(12 * 1024);
  }, 30000);

  test('router import deve adicionar apenas ~3KB gzipado ao core', async () => {
    const coreSize = await buildTestApp(`import { createState, html, render } from "${ROOT}/src/core.ts";`);
    const routerSize = await buildTestApp(`
      import { createState, html, render } from "${ROOT}/src/core.ts";
      import { Router, Route } from "${ROOT}/src/router/index.ts";
    `);

    const delta = routerSize.gzip - coreSize.gzip;
    const deltaKB = (delta / 1024).toFixed(2);

    console.log(`\n📦 Router overhead: ${deltaKB} KB gzip\n`);

    expect(delta).toBeLessThanOrEqual(3.5 * 1024);
  }, 30000);
});
