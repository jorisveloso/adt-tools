# adt-note

Leitor e verificador de notas SAP aplicadas — migrado de `sap-note` para o monorepo `adt-tools`.

Lê a nota (PDF/estrutura), consulta a capacidade da lib `adt-client` e valida **por medição** se a
nota já foi aplicada no sistema-alvo. Depende de `adt-client` (local, `workspace:*`) para os canais
de leitura (`readTable` / `adobeFormInfo`).

## Uso

```bash
node tools/notas.mjs validar <nota> --sistema <alias>
```

- `tools/notas.mjs` — o CLI.
- `index.mjs` — o pacote (expõe `PACOTE` e `descricao`).

## Estado

Package migrado e operacional como CLI. O `package.json` requer `node >= 24`, `pnpm >= 11`.
