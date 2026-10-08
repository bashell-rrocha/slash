// scripts/compress.ts - Compressão Brotli e Gzip dos bundles
import { resolve } from 'node:path';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const ROOT = resolve(import.meta.dir, '..');
const DIST = resolve(ROOT, 'dist');

interface BundleStats {
  file: string;
  original: number;
  gzip: number;
  brotli: number;
}

async function compressBundle(filePath: string): Promise<BundleStats> {
  const content = await readFile(filePath);
  const fileName = filePath.split('/').pop() || '';

  // Gerar versões comprimidas
  const gzipped = gzipSync(content, { level: 9 });
  const brotlied = brotliCompressSync(content, {
    params: {
      [0]: 11, // BROTLI_PARAM_QUALITY - máxima compressão (0-11)
    },
  });

  // Salvar versões comprimidas
  await writeFile(`${filePath}.gz`, gzipped);
  await writeFile(`${filePath}.br`, brotlied);

  return {
    file: fileName,
    original: content.length,
    gzip: gzipped.length,
    brotli: brotlied.length,
  };
}

async function main() {
  console.log('🗜️  Comprimindo bundles...\n');

  const files = await readdir(DIST);
  const jsFiles = files.filter(f => f.endsWith('.mjs') || f.endsWith('.cjs'));

  const stats: BundleStats[] = [];

  for (const file of jsFiles) {
    const filePath = resolve(DIST, file);
    const stat = await compressBundle(filePath);
    stats.push(stat);
  }

  // Exibir tabela de estatísticas
  console.log('📊 Bundle Sizes:\n');
  console.log('┌─────────────────┬──────────┬──────────┬──────────┐');
  console.log('│ File            │ Original │ Gzip     │ Brotli   │');
  console.log('├─────────────────┼──────────┼──────────┼──────────┤');

  for (const stat of stats) {
    const orig = (stat.original / 1024).toFixed(2).padStart(6);
    const gzip = (stat.gzip / 1024).toFixed(2).padStart(6);
    const brotli = (stat.brotli / 1024).toFixed(2).padStart(6);
    const fileName = stat.file.padEnd(15);

    console.log(`│ ${fileName} │ ${orig} KB │ ${gzip} KB │ ${brotli} KB │`);
  }

  console.log('└─────────────────┴──────────┴──────────┴──────────┘\n');

  // Encontrar o core bundle
  const coreStat = stats.find(s => s.file === 'core.mjs');
  if (coreStat) {
    const brotliKB = (coreStat.brotli / 1024).toFixed(2);
    console.log(`✅ Core bundle: ${brotliKB} KB (brotli)\n`);
  }
}

main().catch(console.error);
