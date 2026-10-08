// scripts/build.ts
import { resolve } from 'node:path';
import { rename, readFile, writeFile } from 'node:fs/promises';
import { writeFileSync, unlinkSync } from 'node:fs';

// Dois builds publicados (selecionados por condição de export no package.json):
//   produção  -> dist/      NODE_ENV="production": avisos de dev eliminados por define
//   dev       -> dist/dev/  DIST_VARIANT=dev: NODE_ENV="development", avisos presentes
// Ambos minificados, ESM+CJS. console.* nunca é removido (erros de runtime do
// ErrorBoundary/router/batch precisam chegar ao usuário); só `debugger` cai.
// Sem DIST_VARIANT, NODE_ENV!=production é o modo watch (sem minify, sourcemap inline, dist/).
const devVariant = process.env.DIST_VARIANT === 'dev';
const isDev = devVariant || process.env.NODE_ENV !== 'production';
const publishable = devVariant || !isDev; // build minificado e renomeado para .mjs/.cjs
const format = process.env.FORMAT || 'esm';
const watch = process.argv.includes('--watch');

type BuildConfig = Parameters<typeof Bun.build>[0];

const ROOT = resolve(import.meta.dir, '..');

// Criar entry points temporários para router e forms na raiz para evitar '../' nos imports
const tempRouterPath = resolve(ROOT, 'src/_router.ts');
const tempFormsPath = resolve(ROOT, 'src/_forms.ts');

if (!watch) {
  writeFileSync(tempRouterPath, 'export * from "./router/index";\n');
  writeFileSync(tempFormsPath, 'export * from "./forms/index";\n');
}

// Entrypoints para code splitting
const entrypoints = [
  resolve(ROOT, 'src/index.ts'),    // Full bundle
  resolve(ROOT, 'src/core.ts'),     // Core minimal
  resolve(ROOT, 'src/ssr.ts'),      // SSR only
  watch ? resolve(ROOT, 'src/router/index.ts') : tempRouterPath,  // Router only
  watch ? resolve(ROOT, 'src/forms/index.ts') : tempFormsPath,    // Forms only
];

const config: BuildConfig = {
  entrypoints,
  outdir: resolve(ROOT, devVariant ? 'dist/dev' : 'dist'),
  format: format as 'esm' | 'cjs',
  sourcemap: publishable ? 'external' : 'inline',
  minify: publishable ? {
    whitespace: true,
    syntax: true,
    identifiers: true,
  } : false,
  naming: '[dir]/[name].[ext]',
  target: 'browser',
  // Compartilha código comum entre chunks. Só no ESM: o Bun não suporta splitting
  // em CJS (os chunks saem sem require entre si e quebram em runtime).
  splitting: format === 'esm',
  drop: ['debugger'],
  define: {
    'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
  },
};

if (watch) {
  // @ts-ignore - watch existe em runtime mas não na tipagem
  config.watch = {
    onWatch(_event: any, path: string) {
      console.log(`📝 Changed: ${path}`);
    },
    onRebuildEnd(result: any) {
      if (!result.success) {
        console.error('❌ Build failed');
        for (const log of result.logs) {
          console.error(log);
        }
        return;
      }
      const size = result.outputs.reduce((acc: number, o: any) => acc + o.size, 0);
      const sizeKB = (size / 1024).toFixed(2);
      console.log(`✅ Rebuilt ${format} - ${sizeKB}KB`);
    },
  };
  console.log(`👀 Watching ${format} bundle...`);
}

const result = await Bun.build(config);

if (!result.success) {
  console.error('❌ Build failed');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Renomear arquivos para extensões corretas (.mjs ou .cjs)
if (publishable && result.outputs.length > 0) {
  const ext = format === 'esm' ? 'mjs' : 'cjs';
  for (const output of result.outputs) {
    const oldPath = output.path;
    if (oldPath.endsWith('.js')) {
      // Determinar o nome correto baseado no arquivo de entrada
      let newPath = oldPath.replace(/\.js$/, `.${ext}`);

      // Renomear arquivos temporários _router/_forms para router/forms
      if (oldPath.includes('/_router.')) {
        newPath = newPath.replace('/_router', '/router');
      } else if (oldPath.includes('/_forms.')) {
        newPath = newPath.replace('/_forms', '/forms');
      }

      await rename(oldPath, newPath);

      // Ler o conteúdo e atualizar imports de .js para .mjs/.cjs
      let content = await readFile(newPath, 'utf-8');

      // Atualizar imports relativos de .js para a extensão correta
      // Precisa capturar tanto import/export quanto import()
      content = content.replace(/from\s*["']\.\/([^"']+)\.js["']/g, `from "./$1.${ext}"`);
      content = content.replace(/from\s*["']\.\.\/([^"']+)\.js["']/g, `from "../$1.${ext}"`);
      content = content.replace(/import\s*["']\.\/([^"']+)\.js["']/g, `import "./$1.${ext}"`);
      content = content.replace(/import\s*["']\.\.\/([^"']+)\.js["']/g, `import "../$1.${ext}"`);
      content = content.replace(/import\s*\(\s*["']\.\/([^"']+)\.js["']\s*\)/g, `import("./$1.${ext}")`);
      content = content.replace(/import\s*\(\s*["']\.\.\/([^"']+)\.js["']\s*\)/g, `import("../$1.${ext}")`);

      // Adicionar referência ao source map se não existir
      const fileName = newPath.split('/').pop() || 'index';
      const mapFileName = `${fileName}.map`;
      const sourceMapComment = `\n//# sourceMappingURL=${mapFileName}\n`;

      if (!content.includes('sourceMappingURL=')) {
        content += sourceMapComment;
      }

      await writeFile(newPath, content, 'utf-8');

      console.log(`  ✓ ${newPath.replace(ROOT, '.')}`);
    } else if (oldPath.endsWith('.js.map')) {
      let newPath = oldPath.replace(/\.js\.map$/, `.${ext}.map`);

      // Renomear source maps temporários também
      if (oldPath.includes('/_router.')) {
        newPath = newPath.replace('/_router', '/router');
      } else if (oldPath.includes('/_forms.')) {
        newPath = newPath.replace('/_forms', '/forms');
      }

      await rename(oldPath, newPath);
    }
  }
} else if (result.outputs.length > 0) {
  for (const output of result.outputs) {
    console.log(`  ✓ ${output.path.replace(ROOT, '.')}`);
  }
} else {
  console.warn('⚠️  Warning: No outputs generated!');
}

// Limpar arquivos temporários
if (!watch) {
  try {
    unlinkSync(tempRouterPath);
    unlinkSync(tempFormsPath);
  } catch {
    // Ignore cleanup errors
  }
}

if (!watch) {
  const mode = isDev ? (devVariant ? 'dist/dev' : 'watch') : 'prod';
  const size = result.outputs.reduce((acc, o) => acc + o.size, 0);
  const sizeKB = (size / 1024).toFixed(2);
  console.log(`✅ Built ${format} (${mode}) - ${sizeKB}KB`);
} else {
  // Mostrar tamanho inicial em modo watch
  const size = result.outputs.reduce((acc, o) => acc + o.size, 0);
  const sizeKB = (size / 1024).toFixed(2);
  console.log(`✅ Initial build ${format} - ${sizeKB}KB\n`);

  // Manter o processo ativo em modo watch
  await new Promise(() => {});
}
