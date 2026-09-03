# adt-tools

Monorepo do **ecossistema adt** — um motor e ferramentas para conectar e trabalhar objetos SAP
(via ADT REST), sem instalar nada no servidor do cliente.

## Pacotes

| Pacote | O que é |
|--------|---------|
| `packages/adt-client` | **Motor** — conjunto de ferramentas para conectar e trabalhar objetos SAP (ler, criar, alterar, testar, apagar). *(o `jbv-adt-client` migra para cá)* |
| `packages/adt-git` | **Metáfora de repositório (git-like)** — `clone`, `checkout`, `commit`, `diff`, `list`, `status`. *(o antigo `abapgit` migra para cá)* |
| `packages/adt-query` | Consultas na base SAP via adt-client. *(esqueleto)* |
| `packages/adt-note` | Aplicação/gerenciamento de notas SAP — lê a nota e valida por medição (readTable / Adobe Form) se já foi aplicada. *(migrado de `sap-note`)* |
| `packages/adt-server` | **MCP server** que encapsula a execução do ecossistema. *(protótipo local)* |
| `packages/adt-todo` | **Fila de trabalho local multi-projeto** — um item por sessão, com ideias e triagem. O `/next`. |

## Por quê monorepo

O `adt-client` é o motor sobre o qual orbitam as ferramentas. Juntar tudo numa raiz git única
(`workspace:*`) deixa a **capacidade** do motor visível e fácil de consultar, faz a evolução
sincronizada (mudou o motor → as ferramentas veem na hora) e elimina a cópia manual do motor dentro
de cada projeto. Cada pacote segue publicável individualmente no npm.

## Trabalhando

```bash
pnpm install        # instala todos os pacotes (workspace)
pnpm test           # roda os testes de todos os pacotes
pnpm start:server   # sobe o MCP server do adt-server (stdio)
```

## Ver também

- Plano detalhado do monorepo: no repo `abapgit`, `docs/plano-monorepo-adt-tools.md`.
- Decisões de domínio/arquitetura: `CONTEXT.md` e `docs/adr/` no repo `abapgit`.
