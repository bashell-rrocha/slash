# Slash Core Bugfixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os bugs confirmados no core (reativos dentro de componentes, Router no SSR, `batch`, escape do estado serializado) e alinhar os templates e a documentação.

**Architecture:** Cada bug tem a causa raiz já investigada e reproduzida (scripts em `/tmp/claude-1000/-home-dev-Projetos-bashell-landing-page/cd031b17-f518-4539-bb18-cbc648065dbe/scratchpad/bugs/`). As correções atacam a causa, com testes de regressão primeiro (TDD). O core é corrigido na branch `feature/core-bugfixes`; os templates e a documentação são ajustados depois, em branches próprias, cada uma no repositório correspondente.

**Tech Stack:** TypeScript, Bun 1.3.6, `bun test` com happy-dom 20.3.3 (preload `test-setup.ts`), Playwright nos templates.

**Spec:** não há spec separado. As causas raiz e as evidências estão na seção "Causas raiz" abaixo, que é a autoridade deste plano.

## Estado da execução — concluído (2026-10-08)

Plano executado e ampliado por uma revisão de segurança completa. **`@_bashell/slash` 0.0.3 publicada** (npm `latest`, com proveniência); templates `slash-spa`/`slash-ssr`/`slash-ssg` 0.0.2 e `slash-doc` 0.0.3 lançados.

- Decisões tomadas (com o custo de cada uma): `docs/superpowers/decisions/2026-10-08-security-0.0.3.md`.
- O que mudou para o usuário: `CHANGELOG.md` (0.0.3), `MIGRATION.md`, `docs/19-security/README.md`.
- Pendências: issues #1 (foco de input, R6), #2 (ErrorBoundary, R7), #3 (hidratação real), #4 (guards no SSR), #5 (Trusted Publishing/OIDC).

## Causas raiz (confirmadas por reprodução)

1. **Reativo devolvido por componente quebra na atualização.** `appendReactiveChild` (`src/rendering/children.ts:6-38`) guarda o `parent` recebido no momento da montagem (um `DocumentFragment` temporário criado em `src/rendering/element.ts:69-73`) e usa esse valor em `removeChild`/`insertBefore`. Depois, `element.ts:77-83` e `:98-111` movem os nós para o pai real. Na primeira atualização, `parent` já está obsoleto e o DOM lança `removeChild ... not a child`. Afeta `<${Router} router=${r}/>` (padrão usado em `slash-spa/src/client.ts`) e qualquer `{get, subscribe}` devolvido por componente. A exceção é lançada dentro de `state.set` do router e aborta `navigate()` antes do `history.pushState`, então a URL não muda.
2. **Router no SSR escapa o HTML.** `childToString` (`src/server-render.ts:181-190`) trata todo reativo como texto (`escapeHtml(String(value))`) e grava o valor no registro de estado. A rota renderizada em SSR (string de `htmlString`) sai como `&lt;h1&gt;` e é duplicada no JSON de estado.
3. **JSON de estado injetável.** `renderToStream` (`src/server-render.ts:449`) e `slash-ssr/src/server.ts:52-53` inserem `JSON.stringify(state)` dentro de `<script>` sem escape. Um valor `</script><img onerror=…>` executa código.
4. **`batch()`:**
   - `src/state.ts:196-198` registra, para cada estado criado, um callback de fim de lote num `Set` global (`src/batch.ts:33`), que nunca é removido (vazamento de memória e de CPU).
   - Ao fim do lote, `batch.ts` chama **todos** os callbacks sempre que `pendingUpdates > 0`, notificando estados que não mudaram.
   - O início do lote interno é ignorado (`batch-core.ts:383-386`), mas o fim interno encerra o lote (`:388-391`).
   - Um observador que lança erro interrompe os demais, tanto no flush quanto em `_notifyHandlers` (`state.ts:57-61`).
5. **Documentação do site diz que `${state}` é reativo.** Não é: `State` não tem `subscribe` (`utils/guards.ts:3-8`), e a reatividade é por re-render de componente. `slash/docs/04-state/README.md:264` já documenta corretamente; o site `slash-doc` contradiz.

## Global Constraints

- Repositórios (git próprio em cada um, autor já configurado: `Rodrigo Rocha <rrocha@bashell.com.br>`):
  - core: `/home/dev/Projetos/slash-meta/packages/slash`
  - `/home/dev/Projetos/slash-meta/packages/slash-spa`
  - `/home/dev/Projetos/slash-meta/packages/slash-ssr`
  - docs: `/home/dev/Projetos/slash-meta/packages/doc`
- **Git flow:** cada repositório trabalha numa branch `feature/...` criada a partir de `develop`. Use conventional commits (`fix:`, `test:`, `docs:`, `refactor:`), terminando cada mensagem com uma linha em branco seguida de `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Os agentes não fazem push, merge nem release**: isso fica com o coordenador.
- Nunca criar `.git` em `/home/dev/Projetos/slash-meta`. Sem dependências novas.
- Branch de todas as tarefas do core: `feature/core-bugfixes`.
- Núcleo funcional e casca imperativa: lógica pura em `*-core.ts` quando houver; siga o estilo e o idioma (português) dos comentários existentes.
- O core deve continuar verde: `bun test` (hoje 769 pass) e `bunx tsc --noEmit -p tsconfig.json`. A API pública só pode ganhar exports, nunca perder (exceção: os internos com prefixo `__` citados na Task 4).
- Mudanças de comportamento documentadas no código devem ser refletidas na documentação do core (`README.md`, `ROUTER.md`, `docs/05-batch/README.md`) na mesma tarefa.

## Review Focus

1. **Reativo desmontado ou movido:** o componente com `<${Router}>` foi removido do DOM e depois o router navega. Esperado: nenhuma exceção e nenhuma atualização (Task 1).
2. **String de estado com HTML continua escapada no SSR:** um `State` com valor `"<b>x</b>"` deve continuar saindo como `&lt;b&gt;` depois da Task 2 (sem regressão de XSS).
3. **Observador que altera outro estado durante o flush do lote:** essa segunda alteração não pode se perder (Task 4).
4. **Exceção dentro de `batch(fn)`:** os estados alterados antes da exceção ainda são notificados, e a exceção chega a quem chamou (Task 4).
5. **JSON de estado com `</script>`, `<!--` e U+2028/U+2029:** é inerte dentro do `<script>` e, ao ser lido com `JSON.parse`, volta idêntico ao original (Task 3).

---

### Task 1: Reativo dentro de componente usa o pai vivo dos marcadores

**Files:**
- Modify: `src/rendering/children.ts` (`appendReactiveChild` / `renderBetween`)
- Modify (só se o teste do componente que lê estado e devolve reativo exigir): `src/rendering/element.ts`
- Test: `src/rendering/reactive-in-component.test.ts` (novo), `src/router/components.test.ts`
- Docs: `ROUTER.md` e `README.md`. Remova a ressalva "use `${Router({ router })}` dentro de um elemento"; `<${Router} router=${router} />` passa a ser forma válida.

**Interfaces:**
- Produces: `appendReactiveChild(parent: Node, sig: Reactive<unknown>): void`, mesma assinatura. Internamente, cada atualização obtém o pai com `start.parentNode`. Se `start.parentNode` for nulo ou diferente de `end.parentNode`, a atualização é ignorada.

- [ ] **Step 1: Escrever os testes que falham** em `reactive-in-component.test.ts`:

```ts
test("reativo devolvido por componente atualiza sem erro", ...)          // Comp = () => ({get, subscribe}); render(html`<${Comp}/>`, el); emitir novo valor → el.textContent atualizado
test("reativo devolvido por componente aninhado em elemento", ...)       // html`<main><${Comp}/></main>`
test("reativo dentro de dois níveis de componente (App → Router)", ...)
test("reativo em template com várias raízes / array", ...)
test("reativo montado, movido para outro pai e atualizado", ...)
test("reativo desmontado não lança ao receber atualização", ...)         // Review Focus 1: remover el do DOM / destroyNode, emitir → sem throw
test("componente que lê estado e devolve reativo re-renderiza sem órfãos", ...) // state.set(...) + emissão do reativo → nenhum nó duplicado ou órfão
```

Em `router/components.test.ts`:

```ts
test("<Router/> como componente troca de rota e atualiza a URL", () => {
  // createRouter (modo history), render(html`<${Router} router=${router}/>`, el)
  // router.push("/about") → el.innerHTML contém a rota about; window.location.pathname === "/about"
});
```

- [ ] **Step 2: Rodar e ver falhar:** `bun test src/rendering/reactive-in-component.test.ts src/router/components.test.ts`. Esperado: FAIL com `removeChild ... not a child`.
- [ ] **Step 3: Implementar** a regra de pai vivo em `renderBetween`. Se o teste do componente que lê estado continuar falhando, corrija em `element.ts` fazendo o componente acompanhar seu intervalo pelos marcadores reais em vez de um retrato fixo dos nós (`renderedNodes`).
- [ ] **Step 4: Rodar e ver passar.** Depois rode a suíte inteira (`bun test`) e o typecheck.
- [ ] **Step 5: Atualizar `ROUTER.md`/`README.md`** e fazer o commit: `fix(rendering): update reactive children through the live marker parent`, seguido de `docs: ...`.

---

### Task 2: Router renderiza HTML de verdade no SSR

**Files:**
- Modify: `src/server-render.ts` (`childToString`, ramo reativo)
- Test: `src/server-render.test.ts`, `src/router/components.test.ts`
- Docs: `ROUTER.md`, seção SSR. `${Router({ router })}` dentro de `htmlString`/`renderToString` passa a funcionar; remova o contorno documentado.

**Interfaces:**
- Produces: no SSR, um reativo que **não** é `State` (tem `subscribe` e não tem `watch`) é renderizado com `childToString(value)`, aplicando a mesma regra de confiança dos filhos comuns (string que começa com `<` é HTML pronto) e envolvido pelos marcadores `<!--reactive-start:id-->…<!--reactive-end:id-->`. O valor desse reativo **não** é gravado no estado serializado. Reativos que são `State` (têm `watch`) mantêm exatamente o comportamento atual.

- [ ] **Step 1: Testes que falham:**

```ts
test("Router no SSR emite o HTML da rota", ...)              // htmlString`<main>${Router({router})}</main>` contém "<h1>home</h1>" e não "&lt;h1"
test("Router no SSR não duplica a rota no estado", ...)      // renderToString(...).state não contém "<h1>"
test("State string com HTML continua escapado", ...)         // Review Focus 2: createState("<b>x</b>") → "&lt;b&gt;x&lt;/b&gt;"
test("rota nula renderiza vazio no SSR", ...)
test("SSR com Router hidrata no cliente sem erro", ...)      // render() sobre o HTML do renderToString → conteúdo da rota visível, sem throw; navegação posterior funciona
```

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** no ramo reativo de `childToString`. Ajuste o registro de sinal para não serializar o valor desses reativos. Se a hidratação exigir uma entrada no registro, grave `null` e garanta que o walker de hidratação (`src/hydration/*`) aceite isso; o último teste trava esse comportamento.
- [ ] **Step 4: Rodar e ver passar**, mais a suíte inteira e o typecheck.
- [ ] **Step 5: Commit:** `fix(ssr): render non-state reactive children as markup`, e o `docs:` correspondente.

---

### Task 2b: SSR usa a mesma regra de reativo do cliente

**Causa raiz:**
- `server-render.ts:51-58` considera reativo qualquer objeto com `get` e (`watch` **ou** `subscribe`). Com isso, um `State` vira marcador e entra no JSON de estado.
- O cliente usa `utils/guards.ts:3-8` (`get` **e** `subscribe`), então `State` não é reativo lá.
- A diferença não tem efeito útil: `hydrateInternal` (`src/rendering/render.ts:44-60`) limpa o container e renderiza de novo, sem ler o estado serializado.

**Files:**
- Modify: `src/server-render.ts` (trocar o `isReactive` local pelo de `src/utils/guards.ts` e remover o local)
- Test: `src/server-render.test.ts`. Ajustar os testes que esperavam marcadores ou entradas de estado para `State`.
- Docs: `README.md` e `docs/10-ssr` (se existir texto sobre o estado retornado por `renderToString`). O `state` contém só os reativos que não são `State`.

**Interfaces:**
- Consumes: Task 2, mesmo ramo de `childToString`.
- Produces: no SSR, `State` interpolado diretamente (`${state}`) recebe o mesmo tratamento que no cliente: não é reativo, não gera marcador e não entra no estado serializado. O objeto cai no ramo de objeto, que já emite o aviso "Unexpected object in child position". `state.get()` interpolado continua funcionando normalmente.

- [ ] **Step 1: Testes que falham:**

```ts
test("SSR não trata State como reativo (igual ao cliente)", ...)    // htmlString`<p>${createState(7)}</p>` não contém "reactive-start"; renderToString(...).state é {}
test("SSR com state.get() renderiza o valor sem marcadores", ...)    // "<p>7</p>"
test("reativo com subscribe continua marcado no SSR", ...)           // o comportamento da Task 2 permanece
```

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar,** reutilizando `isReactive` de `utils/guards.ts`.
- [ ] **Step 4: Rodar e ver passar.** Depois rode a suíte inteira e o typecheck, e rode `bun test src/` no `slash-ssr` para confirmar que o template não quebrou.
- [ ] **Step 5: Commit:** `fix(ssr): use the client reactive guard so State is not treated as reactive`, e o `docs:` correspondente.

---

### Task 3: Estado serializado seguro dentro de `<script>`

**Files:**
- Modify: `src/server-render.ts` (nova função e uso em `renderToStream`)
- Modify: `src/ssr.ts` (exportar a função)
- Test: `src/server-render.test.ts`
- Docs: `README.md`, seção SSR. Os exemplos de injeção manual do estado passam a usar a função.

**Interfaces:**
- Produces: `export function serializeStateForScript(state: unknown): string`, exportada por `@_bashell/slash/ssr`. Ela devolve `JSON.stringify(state)` com `<` trocado por `<`, `>` por `>`, `&` por `&`, `U+2028` por ` ` e `U+2029` por ` `.

- [ ] **Step 1: Testes que falham:**

```ts
test("serializeStateForScript neutraliza </script> e <!--", ...)   // saída não contém "</script" nem "<!--"
test("serializeStateForScript faz ida e volta exata", ...)          // JSON.parse(saida) igual ao original, com "</script>", "&", " ", " ", acentos (Review Focus 5)
test("renderToStream usa a serialização segura", ...)              // estado com "</script><img onerror=x>" → o chunk do script não fecha a tag
```

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar e exportar** a função; usá-la em `renderToStream`.
- [ ] **Step 4: Rodar e ver passar**, mais a suíte inteira.
- [ ] **Step 5: Commit:** `fix(ssr): escape serialized state for inline script tags`.

---

### Task 4: `batch()` notifica só o que mudou, com aninhamento real e sem vazamento

**Files:**
- Modify: `src/batch-core.ts`, `src/batch.ts`, `src/state.ts`
- Test (reescrever o que testava os internos removidos): `src/batch-core.test.ts`, `src/batch.test.ts`, `src/batch-state-integration.test.ts`
- Docs: `docs/05-batch/README.md`. Remova a seção "Comportamento atual" sobre notificação geral e aninhamento e documente a semântica nova.

**Interfaces:**
- Mantidos (API pública): `batch(fn: () => void): void` e `isInBatch(): boolean`.
- Produces, em `batch.ts` (internos):
  - `__enqueueBatchNotify(notify: () => void): void`: registra o notificador de um estado alterado durante o lote. Deduplica por identidade.
  - `__pendingBatchNotifyCount(): number`: só para testes.
  - `__resetBatchContext(): void`: mantido.
- **Removidos:** `__addBatchEndCallback`, `__removeBatchEndCallback`, `__recordBatchUpdate`. Antes de remover, confirme com `grep -rn` em `src/`, nos templates e no `slash-doc` que ninguém mais os usa.
- `batch-core.ts`: um contador de profundidade puro. `computeBatchCommand` / `BatchContext` podem ser substituídos por `enterBatch(depth: number): number` e `exitBatch(depth: number): { depth: number; flush: boolean }`, com `flush === true` só quando a profundidade volta a 0.
- Semântica:
  - Dentro do lote, `state.set` que muda o valor (mesma regra atual de igualdade) chama `__enqueueBatchNotify(notificador)` em vez de notificar.
  - No fim do lote **mais externo**, cada notificador pendente roda **uma vez**, com o valor final, na ordem do primeiro enfileiramento.
  - `batch` usa `try/finally`: o flush acontece mesmo se `fn` lançar, e a exceção é relançada depois.
  - Um `set` feito por um observador durante o flush (já fora do lote) notifica normalmente, sem se perder.
  - Erros de observadores ficam isolados, tanto no flush quanto em `_notifyHandlers`: todos rodam, e o primeiro erro é relançado no fim.
  - `createState` não registra mais nada global.

- [ ] **Step 1: Testes que falham:**

```ts
test("estado não alterado no lote não é notificado", ...)
test("lotes aninhados notificam uma única vez no fim do externo", ...)   // log esperado: ["after inner", "end outer body", 3]
test("fim do lote interno não encerra o lote externo", ...)              // isInBatch() true após o batch interno
test("valor final é entregue uma vez por estado", ...)
test("exceção em fn: estados alterados ainda são notificados e a exceção sobe", ...)  // Review Focus 4
test("observador que altera outro estado durante o flush não perde a notificação", ...) // Review Focus 3
test("observador que lança não impede os demais e o erro é relançado", ...)           // flush e set fora de lote
test("createState não mantém registro global", ...)                      // criar 10_000 estados; __pendingBatchNotifyCount() === 0 após um batch vazio; batch vazio não chama nenhum observador
```

- [ ] **Step 2: Rodar e ver falhar:** `bun test src/batch*.test.ts`.
- [ ] **Step 3: Implementar** a fila de pendentes e o contador de profundidade. Remova o registro global de `state.ts`.
- [ ] **Step 4: Rodar e ver passar.** Depois rode a suíte inteira e o typecheck. `batch-state-integration.test.ts:105` ("voltar ao valor inicial ainda notifica") deve continuar válido: qualquer `set` que muda o valor marca o estado como pendente.
- [ ] **Step 5: Atualizar `docs/05-batch/README.md`** e fazer o commit: `fix(batch): notify only dirty states once at the outermost batch end`, seguido do `docs:`.

---

### Task 5: Templates `slash-spa` e `slash-ssr` com o core corrigido

**Files:**
- `slash-spa`: `tests/e2e/` (adicionar ou estender)
- `slash-ssr`: `src/server.ts`, `src/app.test.ts` (ou um teste novo do servidor)

**Interfaces:**
- Consumes: Tasks 1 a 3, com o core via `workspace:*` no monorepo. Rode `bun install` na raiz `/home/dev/Projetos/slash-meta` se for preciso.

- [ ] **Step 1 (`slash-spa`, branch `feature/router-navigation-e2e`):** escrever o teste E2E "navegar pelos links troca a página e a URL sem erro no console": abrir `/`, clicar num link interno, conferir o conteúdo da rota nova, `location.pathname` e zero `pageerror`. Rodar com o core corrigido: deve passar. Para confirmar que o teste pega o bug, rode-o uma vez contra o core sem a Task 1 (por exemplo, `git stash` no core ou checkout de `develop`) e registre a falha no relatório.
- [ ] **Step 2 (`slash-spa`):** se algum ajuste no app for necessário, faça. Caso contrário, só o teste. Commit: `test: cover client-side navigation end to end`.
- [ ] **Step 3 (`slash-ssr`, branch `feature/safe-state-serialization`):** escrever o teste que falha: estado com `"</script><img src=x onerror=alert(1)>"` não pode fechar o `<script id="__SLASH_STATE__">` na página servida. Trocar o `JSON.stringify(state)` de `src/server.ts` por `serializeStateForScript(state)` importado de `@_bashell/slash/ssr`. Rodar `bun test src/` e os E2E (`PORT` livre). Commit: `fix: escape serialized state in the SSR page`.

---

### Task 6: Site de documentação alinhado com o comportamento real

**Files (`/home/dev/Projetos/slash-meta/packages/doc`, branch `feature/api-accuracy-fixes`):**
- `src/content/docs/fundamentos/estado.md` (linhas ~30, 292-329, 393, 698)
- `src/content/docs/fundamentos/renderizacao.md` (~209, 221)
- `src/content/docs/intro/conceitos-core.md` (~68)
- `src/content/docs/intro/instalacao.md` (~134)
- `src/content/docs/componentes/*.mdx`
- `src/content/docs/referencia/*.mdx`, nos trechos que afirmam que `${state}` é reativo por um "adaptador interno"
- Páginas de roteamento, SSR e batch, para refletir as Tasks 1, 2 e 4: `<${Router}/>` funciona, Router no SSR funciona e a semântica nova do `batch`.

- [ ] **Step 1:** corrigir as afirmações, usando `slash/docs/04-state/README.md` e o código como fonte. A reatividade é por re-render de componente que lê `state.get()`; um componente chamado direto (`Comp()`) não é reativo; `${state}` não é reativo.
- [ ] **Step 2:** onde houver exemplo com `${count}`, trocar por `${count.get()}` dentro de um componente montado com `<${Comp}/>`.
- [ ] **Step 3:** rodar `bun run build` (as 36 páginas, sem erro). Commit: `docs: align state, router and batch pages with the real behavior`.

---

### Task 7 (coordenador): integração e releases

- [ ] Core: integrar `feature/core-bugfixes` na `develop` com `--no-ff`, simular o CI num clone isolado (`bun install --frozen-lockfile`, `bun test`, `bun run build`, `npm pack --dry-run`), criar `release/0.0.3` (CHANGELOG com as correções), integrar na `main` com a tag `v0.0.3` e de volta na `develop`, e fazer o push. O workflow publica e o usuário aprova em Staged Packages.
- [ ] `slash-spa` e `slash-ssr`: integrar as features na `develop` e fazer o push.
- [ ] `slash-doc`: integrar na `develop`, criar `release/0.0.3`, integrar na `main` com a tag `v0.0.3` e fazer o push.
- [ ] Registrar como pendência, sem corrigir agora, que a "hidratação" não reaproveita o DOM do servidor. `hydrateInternal` limpa o container e renderiza de novo, e `hHydrate`/`hydrateReactiveNodes` não estão ligados ao `render`. Religar é uma decisão de design separada, e a documentação de hidratação promete reaproveitamento de DOM.
