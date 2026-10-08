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

async function buildTestApp(importStatement: string): Promise<BundleSize & { code: string }> {
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
    // Mede o bundle de produção: os avisos de dev (NODE_ENV !== "production") são eliminados
    define: { 'process.env.NODE_ENV': '"production"' },
  });

  if (!result.success) {
    throw new Error('Build failed');
  }

  // Ler bundle gerado
  const bundleContent = await readFile(outFile, 'utf-8');

  // Limpar arquivos temporários
  await rm(testFile);
  await rm(outFile);

  return { ...(await measureBundle(bundleContent)), code: bundleContent };
}

// Bundle de produção de um entry qualquer (sem app de exemplo): para checar o que sobra no código
async function buildEntry(entry: string): Promise<string> {
  const outdir = mkdtempSync(resolve(SCRATCHPAD, 'entry-'));
  const result = await Bun.build({
    entrypoints: [entry],
    outdir,
    format: 'esm',
    minify: { whitespace: true, syntax: true, identifiers: true },
    target: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  if (!result.success) throw new Error(`Build failed: ${entry}`);
  const code = await result.outputs[0]!.text();
  await rm(outdir, { recursive: true, force: true });
  return code;
}

// Textos de avisos de dev de TODAS as frentes (core/props, router/Link, SSR)
const DEV_WARNING_TEXTS = {
  core: ['URL bloqueada', 'unsafeHtml()', 'handlers reativos', 'atributo inválido', 'só aceita função', 'style ignora', 'bloqueada (injeta HTML)', 'não pode ser prop', 'style: declaração rejeitada', 'meta refresh'],
  router: ['deve ser um caminho do app'],
  ssr: [
    'declaração de style rejeitada',
    'srcdoc só aceita SafeHtml',
    'nome de atributo inválido descartado',
    'são reservados à hidratação',
    'atributo on* descartado',
    'string dentro de <script>',
    'string renderizada como texto',
    'Unexpected object in child position',
  ],
};

describe('Bundle Size Optimization', () => {
  test('bundle de produção não contém os textos dos avisos de dev (core)', async () => {
    const { code } = await buildTestApp(`import { createState, html, render } from "${ROOT}/src/core.ts";`);
    for (const text of DEV_WARNING_TEXTS.core) {
      expect(code).not.toContain(text);
    }
  }, 30000);

  test('entry router em produção não contém os avisos do router nem do core', async () => {
    const code = await buildEntry(`${ROOT}/src/router/index.ts`);
    for (const text of [...DEV_WARNING_TEXTS.router, ...DEV_WARNING_TEXTS.core]) {
      expect(code).not.toContain(text);
    }
  }, 30000);

  test('entry ssr em produção não contém os avisos do SSR nem do core', async () => {
    const code = await buildEntry(`${ROOT}/src/ssr.ts`);
    for (const text of [...DEV_WARNING_TEXTS.ssr, ...DEV_WARNING_TEXTS.core]) {
      expect(code).not.toContain(text);
    }
  }, 30000);

  test('os textos listados existem no build de desenvolvimento (a checagem não é vazia)', async () => {
    const outdir = mkdtempSync(resolve(SCRATCHPAD, 'dev-'));
    const result = await Bun.build({
      entrypoints: [`${ROOT}/src/ssr.ts`, `${ROOT}/src/router/index.ts`],
      outdir,
      format: 'esm',
      target: 'browser',
      define: { 'process.env.NODE_ENV': '"development"' },
    });
    expect(result.success).toBe(true);
    const code = (await Promise.all(result.outputs.map((o) => o.text()))).join('\n');
    await rm(outdir, { recursive: true, force: true });
    for (const text of [...DEV_WARNING_TEXTS.ssr, ...DEV_WARNING_TEXTS.router, 'URL bloqueada']) {
      expect(code).toContain(text);
    }
  }, 30000);

  test('core import deve produzir bundle de produção <= 7.5KB gzipado', async () => {
    const size = await buildTestApp(`import { createState, html, render } from "${ROOT}/src/core.ts";`);

    const gzipKB = (size.gzip / 1024).toFixed(2);
    const brotliKB = (size.brotli / 1024).toFixed(2);

    console.log(`\n📦 Core bundle: ${gzipKB} KB gzip, ${brotliKB} KB brotli\n`);

    expect(size.gzip).toBeLessThanOrEqual(7.5 * 1024);
  }, 30000);

  test('core import deve produzir bundle de produção <= 6.6KB brotli', async () => {
    const size = await buildTestApp(`import { createState, html, render } from "${ROOT}/src/core.ts";`);

    const brotliKB = (size.brotli / 1024).toFixed(2);

    expect(size.brotli).toBeLessThanOrEqual(6.6 * 1024);
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
