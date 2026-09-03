# adt-query

Ferramenta de **consultas SAP (read-only)** via `adt-client` — pergunta "me dá os dados X do
sistema" por cima do motor, sem reinventar a rede.

## Estado

**Fundação criada (item 1 da fila adt-query, 2026-09-03)**. Interface mínima funcional
(`consultarTabela` via `readTable`, `consultarSql` via `dataPreview`) delegando ao motor. O escopo
do que "é consulta" está em [`docs/consulta.md`](docs/consulta.md).

## Próximo

**Spike (item 2 da fila adt-query)**: primeira consulta real no s4h (moovi) via `readTable` do
`adt-client` — medir o que funciona e o que quebra; cada erro vira item de ferramenta (fila
adt-query) ou de correção do motor (fila adt-client).
