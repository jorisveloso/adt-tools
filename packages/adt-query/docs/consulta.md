# adt-query — o que é uma "consulta"

**Escopo definido em 2026-09-03, item 1 da fila adt-query — fundação do pacote.**

O `adt-query` é uma ferramenta **consumidora** sobre o motor `adt-client` (mesmo papel do
`adt-git` e do `adt-note` no monorepo `adt-tools`). Onde o `adt-client` é a **primitiva** (uma
leitura isolada, com sessão e conexão na mão de quem chama), o `adt-query` é a **pergunta**:
"me dá os dados X do sistema" — uma interface de consulta reutilizável, com convenções de
parâmetro, normalização de resposta e formato de saída estáveis.

## Princípio de escopo

**Consulta = leitura. Nunca escrita.** O `adt-query` não cria, não altera, não ativa, não apaga
nada. Tudo o que ele expõe é read-only. Isso diferencia o ferramenta do `adt-git` (quer
checkout/repositório) e do `adt-client` (quer o lifecycle completo).

Escopo do que **é** consulta (canais medidos do motor, ver adt-client):

| Canal | Motor (`adt-client`) | O que responde | Nota |
|---|---|---|---|
| Leitura de tabela | `rfc-soap.readTable` | Linhas de uma tabela (RFC_READ_TABLE) | A verificação universal; limite ≤512 chars/linha, sem campos longos/float |
| Data preview (SQL) | `adt-client.dataPreview` / `parseDataPreview` | Resultado de um SELECT read-only via ADT REST (`/datapreview/freestyle`) | SQL literal, read-only garantido (`assertReadOnly`) |
| Busca de objeto | `search.buscar` / `parseObjectReferences` | Pesquisa de objetos ABAP pelo discovery | |
| Chamada FM/BAPI | `rfc-soap.callFunction` / `callBapi` | Resultado de uma função RFC | Diponível, mas o nome "consulta" não cobre BAPI de escrita |

Fora do escopo do `adt-query` (são ferramentas próprias ou exigem escrita):
- `readView` (view clássica) — é leitura, candidata; entra quando a primeira consulta provar o fluxo.
- `cem.mjs`/`cobertura`, `atc`, `bal`, `dumps`, `job` — leituras específicas de SUBDOMÍNIO (não "consulta geral"); o `adt-query` pode chamá-las, mas não as reimplementa.
- Tudo de escrita do motor (deploy, activate, sobrescrever, apagar).

## Por que essa divisão

O item 2 da fila decide o concreto: a **primeira consulta real no s4h (moovi)** vai medir o canal
`readTable` (e candidatos) e revelar o que quebra. A medida que os erros aparecem, o `adt-query`
vai **criando ferramentas de consulta** — cada erro vira item da fila adt-query; quando o erro for
**do motor** (adt-client), vira item da fila adt-client.

## Forma de uma consulta (proposta de interface)

Todas as consultas seguem o mesmo contrato — retorno **normalizado** e constante:

```js
// consulta(conexao, args) -> { ok, dados, avisos? }  |  lança erro com dica
```

- `conexao` — a conexão já logada do `adt-client` (mesma do `readTable`/`dataPreview`).
- Alto nível: a primeira entrega expõe `consultarTabela` e `consultarSql`.
- O retorno sempre traz `ok` e `dados`; erros lançam com a dica do motor anexada (`dicaDeErro`).

## Estado

Esqueleto → **fundação criada (item 1)**. A próxima entrega é o **spike (item 2)**: primeira
consulta real no s4h (moovi) via `readTable` do `adt-client`.
