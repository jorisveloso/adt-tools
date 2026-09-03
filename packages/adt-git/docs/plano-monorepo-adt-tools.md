# Plano do monorepo `adt-tools` (ecossistema adt)

> Visão decidida na sabatina 2026-09-02. Este documento descreve o *plano* — o monorepo ainda não foi
> criado; os repos externos atuais (`jbv-adt-client`, `abapgit`) são mantidos intactos até a migração.

## A ideia

O `adt-client` é um **conjunto de ferramentas para conectar e trabalhar objetos SAP** (ler, criar,
alterar, testar, apagar). Sobre ele orbitam ferramentas consumidoras — `adt-git` (metáfora de
repositório, o antigo `abapgit`), `adt-query` (consultas), `adt-note` — e o conjunto todo vive num
**monorepo único** (raiz git `adt-tools`), em vez de repos espalhados que "ficam atrasados" uns dos
outros.

**Benefício que motivou:** visibilidade da capacidade do `adt-client` centralizada e fácil de
consultar; evolução sincronizada (mudou o motor → as ferramentas veem na hora via `workspace:*`); fim
da cópia manual do adt-client dentro de cada projeto (hoje o `abapgit` tem uma cópia "2 tipos atrasada").

## Estrutura alvo

```
adt-tools/                      ← UMA raiz git
├── package.json                ← da raiz (orquestra o workspace)
├── pnpm-workspace.yaml         ← declara: packages/* são meus pacotes
└── packages/
    ├── adt-client/             ← o motor (jbv-adt-client) — move-se para cá depois
    ├── adt-git/                ← metáfora de repositório (lib + bin) — antigo abapgit
    ├── adt-query/              ← consultas SAP (futuro)
    ├── adt-note/               ← tratamento de notas SAP (futuro)
    └── adt-server/             ← o MCP que encapsula e executa (prototipado) [opcional]
```

- Cada pacote tem seu `package.json` próprio, `name`, `main`/`exports`, `bin` (quando CLI) e testes —
  é **publicável individualmente** no npm.
- As ferramentas dependem do motor via `"jbv-adt-client": "workspace:*"` — sem cópia, sem `file:` manual.
- `packages/adt-query` e `packages/adt-note` podem começar como esqueleto (só `package.json`).

## Decisões já tomadas (referência)

- **Inversão de dependência [ADR 0001]:** o `abapgit` (adt-git) é sem estado — recebe `conexao` e
  `caminhos` de quem chama; consumidor (ex.: `sap-accelerate`) decide config/sessão/pastas. O CLI é um
  consumidor mínimo.
- **Mapa de comandos git:** `clone` (pacote), `checkout` (objeto), `commit` (objeto), `diff` (objeto
  local↔SAP), `status`, `list`. Descartados: `add`, `init`, `branch`, `merge`, `fetch`, `remote`,
  `push`, `log`.
- **`list` sem tipo/pkg = pacote** (conteúdo via TADIR ou busca por nome).
- **`clone` = list (TADIR) + laço de checkout.** Objeto não-suportado → não é baixado; a dor fica
  registrada (skill `adt-capacidade` → `docs/demandas.md` da lib).
- **Fonte de verdade dos tipos cobertos** = registro da lib viva (`MODULOS`/`TYPES`), não lista fixa.
- **Capacidade/oráculo:** consulta "consigo fazer X?" — hoje skill; futuro, alimentada pelo
  registro/cobertura da lib. Destino natural: MCP.

## MCP (prototipado)

O MCP encapusla a execução: o agente passa `conexao` + pedido e o servidor executa internamente; a lib
fica dentro do servidor, não exposta ao agente. Pode rodar **local** (stdio, na máquina com a VPN),
alcançando SAP de cliente. Foi feito um protótipo com 3 tools (`adt_capacidade`, `adt_conectar`,
`adt_criar_tabela`) — ver `%TEMP%` / config do opencode. Cobrança e proteção de conhecimento são
objetivos futuros, ainda a desenhar (esbarram na VPN para acesso remoto a SAP de cliente).

## Passos de migração (pendentes)

1. Criar raiz git `adt-tools` + `pnpm-workspace.yaml` + `package.json` da raiz.
2. Copiar `jbv-adt-client` → `packages/adt-client` (mantendo o repo externo intacto).
3. Copiar/renomear `abapgit` → `packages/adt-git` (renomeia `package.json`, `name`, bin, comando).
4. Criar esqueletos `packages/adt-query`, `packages/adt-note`.
5. Trocar dependências por `workspace:*`.
6. (Marco futuro) mover o motor definitivamente para `packages/adt-client` e cortar os repos externos.
