# Fila adt-query

- [x] 1. Definir escopo de consultas do adt-query e criar a fundação do pacote (index/consulta.md)
> Escopo definido em docs/consulta.md (consulta = leitura, read-only; canais: readTable, dataPreview, buscar). Fundação criada: index.mjs com CONSULTAS + consultarTabela/consultarSql delegando ao motor; package.json com adt-client workspace:*; README atualizado; pnpm install linkou o workspace (import OK). Próximo: item 2 (spike s4h/moovi).

- [x] 2. Spike: primeira consulta no s4h (moovi) via readTable do adt-client — medir o que funciona e o que quebra
> Spike medido no s4h 758/moovi (mandante 250): readTable funciona — T000/TSTC lidas, WHERE e limite respeitados, erro de campo inexistente vem com dica (TABLE_WITHOUT_DATA + nome do campo), tabela inexistente TABLE_NOT_AVAILABLE. Nada quebrou; limitadores confirmados (linha<=512, WHERE<=72 chars, sem agregacao). Medicao em packages/adt-query/docs/consulta.md. Proximo: item 3 (empacotar wrap).

- [ ] 3. Empacotar a primeira consulta no adt-query: wrap em readTable/exemplos práticos — corrigir no adt-client o que a medição quebrar (itens de motor vão na fila adt-client)
