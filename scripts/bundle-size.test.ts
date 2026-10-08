// scripts/bundle-size.test.ts
import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { mkdtempSync, readFileSync } from 'node:fs';
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
  core: ['Blocked URL', 'unsafeHtml()', 'reactive handlers', 'invalid attribute name', 'only accepts a function', 'style ignores', 'blocked (injects HTML)', 'cannot be a prop', 'style: declaration rejected', 'meta refresh', 'was dropped (strings are data', 'called from'],
  router: ['must be an app path'],
  ssr: [
    'style declaration rejected',
    'srcdoc only accepts SafeHtml',
    'invalid attribute name dropped',
    'are reserved for hydration',
    'on* attribute dropped',
    'inside <script>/<style> was dropped',
    'string rendered as text',
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
    for (const text of [...DEV_WARNING_TEXTS.ssr, ...DEV_WARNING_TEXTS.router, 'Blocked URL']) {
      expect(code).toContain(text);
    }
  }, 30000);

  test('core import deve produzir bundle de produção <= 8.64KB gzipado', async () => {
    const size = await buildTestApp(`import { createState, html, render } from "${ROOT}/src/core.ts";`);

    const gzipKB = (size.gzip / 1024).toFixed(2);
    const brotliKB = (size.brotli / 1024).toFixed(2);

    console.log(`\n📦 Core bundle: ${gzipKB} KB gzip, ${brotliKB} KB brotli (${size.gzip} / ${size.brotli} bytes)\n`);

    expect(size.gzip).toBeLessThanOrEqual(8.64 * 1024);
  }, 30000);

  test('core import deve produzir bundle de produção <= 7.67KB brotli', async () => {
    const size = await buildTestApp(`import { createState, html, render } from "${ROOT}/src/core.ts";`);

    const brotliKB = (size.brotli / 1024).toFixed(2);

    expect(size.brotli).toBeLessThanOrEqual(7.67 * 1024);
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

// I2/D1: dois builds selecionados por condição de export. O de produção é o padrão;
// "development" (Vite/webpack em dev, node --conditions=development) carrega os avisos.
describe('package exports: builds de desenvolvimento e produção', () => {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));

  test('cada subpath tem condição development apontando para dist/dev, antes de import/require/default', () => {
    for (const [subpath, cond] of Object.entries<any>(pkg.exports)) {
      const keys = Object.keys(cond);
      expect(keys.indexOf('development')).toBeGreaterThan(-1);
      expect(keys.indexOf('development')).toBeLessThan(keys.indexOf('import'));
      expect(keys.indexOf('types')).toBe(0);
      expect(keys.indexOf('bun')).toBeLessThan(keys.indexOf('development'));
      expect(cond.development.import).toMatch(/^\.\/dist\/dev\/.+\.mjs$/);
      expect(cond.development.require).toMatch(/^\.\/dist\/dev\/.+\.cjs$/);
      expect(cond.import).not.toContain('/dev/');
      expect(cond.require).not.toContain('/dev/');
      expect(cond.default).not.toContain('/dev/');
      expect(subpath.startsWith('.')).toBe(true);
    }
  });

  test('files publica dist (inclui dist/dev)', () => {
    expect(pkg.files).toContain('dist');
  });

  test('build.ts nunca remove console.*, só debugger', () => {
    const script = readFileSync(resolve(ROOT, 'scripts/build.ts'), 'utf-8');
    expect(script).not.toMatch(/drop:[^\n]*console/);
    expect(script).toMatch(/drop:\s*\[\s*'debugger'\s*\]/);
  });
});
