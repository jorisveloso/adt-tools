# adt-server

**Protótipo** de servidor **MCP local** (transporte stdio) que encapsula a execução do ecossistema
adt. Objetivo: ver como um MCP funciona, **sem tocar em SAP nenhum** — as tools simulam as operações
de `adt-client`, com o mesmo contrato que, no futuro, chamaria a lib de verdade por dentro.

## Tools (simuladas)

- **`adt_capacidade`** — "consigo fazer X?" (o oráculo), sobre uma tabela fixa de capacidades.
- **`adt_conectar`** — conexão simulada (`{ sistema, mandante }` → sessão de brinquedo, sem rede).
- **`adt_criar_tabela`** — simulada; no real seria `deploySource` do `adt-client`.

## Rodar

```bash
node src/adt-server.mjs
```

ou `npm start`. O cliente (opencode/claude) inicia o processo e conversa por stdin/stdout em JSON-RPC.

## Stack

- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) — servidor MCP + transporte stdio.
- `zod` — schema dos argumentos das tools (exigência do SDK).

## Estado

Protótipo descartável. Requer `node >= 20`. Não fala com SAP — as tools devolvem respostas simuladas.
