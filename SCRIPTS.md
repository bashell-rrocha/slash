# Scripts de Build e Desenvolvimento

Este documento explica o sistema de scripts do projeto.

## Instalação

Primeiro, instale as dependências:

```bash
bun install
```

## Desenvolvimento

### Modo Watch Completo (Recomendado)

Roda TypeScript + Bundle ESM em modo watch:

```bash
bun run dev
```

Isso inicia dois processos em paralelo:
- **types**: Gera arquivos `.d.ts` automaticamente quando você edita `.ts`
- **bundle**: Gera os bundles ESM (um por entry point: `index`, `core`, `ssr`, `router` e `forms`) em `dist/` automaticamente

### Modo Watch Individual

Se preferir rodar separadamente:

```bash
# Terminal 1: Tipos
bun run dev:types

# Terminal 2: Bundle ESM
bun run dev:bundle
```

## Produção

### Build Completo

Gera todos os arquivos de distribuição:

```bash
bun run build
```

Isso executa:
1. `clean` - Remove `dist/`
2. `build:esm` - Gera os bundles `dist/*.mjs` (minificados)
3. `build:cjs` - Gera os bundles `dist/*.cjs` (minificados)
4. `build:esm:dev` - Gera o build de desenvolvimento ESM em `dist/dev/*.mjs` (com os avisos de dev)
5. `build:cjs:dev` - Gera o build de desenvolvimento CJS em `dist/dev/*.cjs`
6. `build:types` - Gera arquivos `.d.ts` em `dist/types/`

O build de desenvolvimento é escolhido pela condição de exportação `development` (Vite em dev e webpack em modo development a ativam sozinhos; no Node, use `--conditions=development`). Sem ela vale `dist/`, o build de produção. Depois do build, `bun run verify:dist` carrega os dois e confere as exportações.

`build:compress` (versões `.gz` e `.br`) continua disponível para uso manual, mas não faz parte de `bun run build` e os arquivos comprimidos não vão para o pacote npm.

### Build Individual

```bash
# Apenas tipos
bun run build:types

# Apenas ESM
bun run build:esm

# Apenas CJS
bun run build:cjs

# Limpar dist/
bun run clean
```

## Testes

```bash
# Rodar testes uma vez
bun test

# ou
bun run test

# Modo watch (roda testes automaticamente)
bun run test:watch
```

## Estrutura de Outputs

```
dist/
├── index.mjs / index.cjs      # Bundle completo (core + router + forms + ssr)
├── core.mjs / core.cjs        # @_bashell/slash/core
├── router.mjs / router.cjs    # @_bashell/slash/router
├── forms.mjs / forms.cjs      # @_bashell/slash/forms
├── ssr.mjs / ssr.cjs          # @_bashell/slash/ssr
├── chunk-*.mjs / chunk-*.cjs  # Código compartilhado entre os entry points
├── *.map                      # Source maps (sem sourcesContent)
├── dev/                       # Build de desenvolvimento (condição "development"), com avisos
└── types/                     # Arquivos de definição TypeScript
    ├── index.d.ts
    ├── core.d.ts
    ├── state.d.ts
    ├── hyper.d.ts
    └── ...
```

## Variáveis de Ambiente

- `NODE_ENV=production` - Build minificado para produção
- `FORMAT=esm|cjs` - Formato do bundle (ESM ou CommonJS)

## Fluxo de Trabalho Recomendado

### Durante Desenvolvimento

```bash
# 1. Inicie o modo watch
bun run dev

# 2. Edite arquivos em src/
# 3. Os bundles são reconstruídos automaticamente
# 4. Rode testes quando necessário
bun run test:watch
```

### Antes de Publicar

```bash
# 1. Rode os testes
bun test

# 2. Gere o build de produção
bun run build

# 3. Verifique os arquivos gerados
ls -lh dist/

# 4. Publique (quando estiver pronto)
npm publish
```

## Troubleshooting

### "command not found: concurrently"

Execute `bun install` para instalar as dependências.

### Build não atualiza

Limpe e reconstrua:

```bash
bun run clean
bun run build
```

### Tipos não são gerados

Verifique se o `tsconfig.json` está correto e rode:

```bash
bun run build:types
```
