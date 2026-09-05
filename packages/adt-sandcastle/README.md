# adt-sandcastle — a fila do adt-todo rodando sozinha, um item por sessão limpa

O que o Joris fazia à mão — `/next`, `/clear`, `/next` — programado com o
[`@ai-hero/sandcastle`](https://github.com/mattpocock/sandcastle): cada item da fila vira **um
`claude --print` novo** (sem `--resume`, contexto zerado), e entre uma sessão e outra o runner olha
a **fila**, não a resposta do agente, para decidir o que fazer.

```
pnpm --filter adt-sandcastle start                      # todas as filas, até acabar ou Ctrl+C
pnpm --filter adt-sandcastle start -- --fila adt-client --max 3
pnpm --filter adt-sandcastle start -- --dry             # só lista o que rodaria, em todas as filas
```

| opção | padrão | o que é |
|---|---|---|
| `--fila <nome>` | todas, em ordem alfabética | qual fila de `packages/adt-todo/docs/filas` |
| `--max <n>` | sem teto | teto de sessões por fila; sem ele roda **até a fila acabar ou até o Ctrl+C** (termina a tarefa corrente e não começa outra; segundo Ctrl+C sai na hora) |
| `--modelo <id>` | `claude-opus-5` | modelo do `claudeCode()` |
| `--idle <s>` | 1800 | `idleTimeoutSeconds` — medição longa fica muda por minutos |
| `--dry` | — | não roda o agente |

## O veredito é do arquivo

Depois de cada sessão o runner relê o item na fila (`itemDaFila`) e aplica `veredito()`:

| o item ficou… | ação |
|---|---|
| `[x]` | entregue — próximo |
| `> bloqueado:` | o agente tirou da rotação de propósito (ex.: pergunta ao Joris) — próximo |
| qualquer outra coisa (aberto, `em andamento`, sessão estourada) | **`adiar`**: o item vai para o **fim da fila** com `> adiado: <data> — <motivo> (sessão <id>)`; uma nota `em andamento:` vira `adiado:` para o item perder a prioridade de retomada |

É isto que impede um item que não consegue ser executado de segurar os outros. Cada item é tentado
**uma vez por execução**; se o `next()` devolver o mesmo item de novo, a fila está esgotada.

## Commit e push ao final de cada item

Depois do veredito o runner fecha no git (`git.mjs`), no **repositório da fila** (`sap-accelerate`
→ `C:\repositorio\jorisveloso\sap-accelerate`; as demais → este monorepo) **e** no monorepo, onde a
fila vive:

- só entra o que **mudou durante a sessão** (mtime ≥ início, ou sujeira que não existia antes) —
  sujeira anterior à tarefa não é da tarefa e fica como estava;
- mensagem `chore(fila): <fila> #<n> <fechado|bloqueado|adiar> — <título>` com a sessão no corpo;
  o commit "de verdade", com a mensagem que explica a mudança, continua sendo do agente;
- `git push` só se há remote; push que falha (sem rede, sem upstream) vira aviso, não derruba o loop.

## O que sai no terminal (para acompanhar pelo celular)

```
▶ Executando tarefa 1 de 3 — [adt-client #35] janelasSapGui devolve titulo/textos com MOJIBAKE
■ Tarefa concluída com sucesso · git: adt-tools 9c1f2ab push ok (sessão 7e3…)
   Fechado: PowerShell com OutputEncoding UTF8; teste puro cobre acento (adt-tools 9c1f2ab)
   Aberto: nada
   Receita: packages/adt-client/docs/receita-gui-scripting.md § tasklist
```

`n` é o menor entre `--max` e os itens executáveis da fila. O status é `sucesso` / `bloqueio
(aguarda o Joris)` / `adiamento`. As 3 linhas vêm do bloco `<resumo>` que o prompt pede ao agente
no fim da resposta; sem ele, da última notinha do item na fila; sem ela, do motivo do veredito.

## Decisões (05/09/2026)

- **`noSandbox()`** — o agente roda no host. O SAP GUI (ROT), o `.env` do `sap-accelerate` e a
  rede do cliente não existem dentro de um contêiner; e o provider trata Windows (`cmd.exe`, `spawn`
  com `shell`).
- **`permissionMode: 'auto'`** — sem isso o sandcastle passa `--dangerously-skip-permissions`.
  Decisão do Joris.
- **`claudeCodeHost()` em vez de `claudeCode()`** (`lib/agente.mjs`) — medido em 05/09/2026: o
  sandcastle 0.12.0 escapa `--model` com aspas simples POSIX e, no host Windows, o `cmd.exe` entrega
  `'claude-opus-5'` literal ao `claude` (*"There's an issue with the selected model"*). O wrapper
  troca por aspas duplas só no Windows. O prompt não sofre — vai por stdin.
- **`branchStrategy: { type: 'head' }`** — sem worktree: a fila e as POCs ficam onde estão, e os
  commits do agente vão direto no HEAD do `adt-tools`.
- **`maxIterations: 1` por item, loop aqui** — o `maxIterations` do sandcastle não deixa olhar a
  fila entre iterações.
- **O prompt** (`prompts/item.md`) recebe a fila e o item por `promptArgs` e transcreve o
  `~/.claude/skills/next/SKILL.md` por `` !`node -e …` `` (o que a skill pergunta ao humano vira
  `bloqueado`/`em andamento` na fila). Não depende de `/next` funcionar em `--print` — isso não foi
  medido.

## O que fica de fora

- A sessão nasce com `cwd` na raiz do `adt-tools`: carrega o `CLAUDE.md` de
  `C:\repositorio\jorisveloso`, **não** a memória nem o `.claude/` do `sap-accelerate`. O que o
  agente precisa saber de lá está escrito no prompt.
- Log por fila em `logs/<fila>.log` (ignorado pelo git). A sessão de cada item fica em
  `~/.claude/projects/…/<sessionId>.jsonl` — o resumo no fim imprime o id; `claude --resume <id>`
  reabre.
- Ainda não rodou ponta a ponta: a primeira execução real é `--fila adt-client --max 1`.
