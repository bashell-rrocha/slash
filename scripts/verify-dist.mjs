// scripts/verify-dist.mjs
// Carrega no Node cada entrypoint publicado (import e require) listado em
// package.json "exports". O build pode "passar" e ainda gerar chunks que
// quebram em runtime (ex.: export de identificador não declarado), então
// esta verificação roda depois do build e antes de publicar.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));

const failures = [];

for (const [subpath, targets] of Object.entries(pkg.exports)) {
  const loaded = {};

  try {
    loaded.import = await import(pathToFileURL(resolve(ROOT, targets.import)).href);
  } catch (error) {
    failures.push(`${subpath} (import ${targets.import}): ${error.message}`);
  }

  try {
    loaded.require = require(resolve(ROOT, targets.require));
  } catch (error) {
    failures.push(`${subpath} (require ${targets.require}): ${error.message}`);
  }

  const esmKeys = loaded.import ? Object.keys(loaded.import).sort() : [];
  const cjsKeys = loaded.require ? Object.keys(loaded.require).sort() : [];

  if (loaded.require && cjsKeys.length === 0) {
    failures.push(`${subpath}: require não expõe nenhum export`);
  }
  // O CJS é gerado sem splitting e serve de referência da API pública. No ESM,
  // um entrypoint que também é chunk de outro (ex.: core.mjs usado por index.mjs)
  // expõe nomes internos minificados a mais: isso só gera aviso.
  if (loaded.import && loaded.require) {
    const missing = cjsKeys.filter((key) => !esmKeys.includes(key));
    if (missing.length > 0) {
      failures.push(`${subpath}: import não expõe ${missing.join(', ')}`);
    }
    const extra = esmKeys.filter((key) => !cjsKeys.includes(key));
    if (extra.length > 0) {
      console.warn(`  ⚠ ${subpath}: import expõe nomes internos a mais (${extra.join(', ')})`);
    }
  }

  if (loaded.import && loaded.require) {
    console.log(`  ✓ ${subpath} (${esmKeys.length} exports)`);
  }
}

if (failures.length > 0) {
  console.error('❌ dist/ inválido:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('✅ Todos os entrypoints do dist/ carregam');
