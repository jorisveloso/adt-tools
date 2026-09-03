# adt-query

Ferramenta de **consultas SAP (read-only)** via `adt-client` — pergunta "me dá os dados X do
sistema" por cima do motor, sem reinventar a rede.

## Estado

**Fundação criada (item 1)** e **spike medido no s4h (item 2), 2026-09-03**. Interface mínima
funcional (`consultarTabela` via `readTable`, `consultarSql` via `dataPreview`) delegando ao
motor. A primeira consulta real no s4h 758 (moovi, mandante 250) **funcionou** — leitura, filtro
(WHERE), limite e erro legível; medição em [`docs/consulta.md`](docs/consulta.md).

## Próximo

**Item 3**: empacotar a primeira consulta no adt-query — wrap em `readTable` + exemplos práticos;
o que a medição do spike quebrar vira item na fila adt-client.
