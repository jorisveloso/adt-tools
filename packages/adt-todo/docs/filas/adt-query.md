# Fila adt-query

- [x] 1. Definir escopo de consultas do adt-query e criar a fundação do pacote (index/consulta.md)
> Escopo definido em docs/consulta.md (consulta = leitura, read-only; canais: readTable, dataPreview, buscar). Fundação criada: index.mjs com CONSULTAS + consultarTabela/consultarSql delegando ao motor; package.json com adt-client workspace:*; README atualizado; pnpm install linkou o workspace (import OK). Próximo: item 2 (spike s4h/moovi).

- [x] 2. Spike: primeira consulta no s4h (moovi) via readTable do adt-client — medir o que funciona e o que quebra
> Spike medido no s4h 758/moovi (mandante 250): readTable funciona — T000/TSTC lidas, WHERE e limite respeitados, erro de campo inexistente vem com dica (TABLE_WITHOUT_DATA + nome do campo), tabela inexistente TABLE_NOT_AVAILABLE. Nada quebrou; limitadores confirmados (linha<=512, WHERE<=72 chars, sem agregacao). Medicao em packages/adt-query/docs/consulta.md. Proximo: item 3 (empacotar wrap).

- [x] 3. Empacotar a primeira consulta no adt-query: wrap em readTable/exemplos práticos — corrigir no adt-client o que a medição quebrar (itens de motor vão na fila adt-client)
> Consultar() transparente implementado: informa nome (tabela OU CDS view) + campos/where/linhas; tipo descoberto na DD02L+TADIR (decidirTipo puro) e canal escolhido (readTable p/ tabela, dataPreview p/ view). Medido no s4h: T000->tabela/readTable, I_CUSTOMER->view/analitica (DD02L vazio, DDLS na TADIR)/SELECT*, IEBILLINGCLASS view classica. 12 testes vitest. Docs consulta.md + README. Exemplos praticos ficam no proximo item.

- [ ] 4. Colecao de exemplos praticos do consultar() (tabela, view analitica, view classica, where/limite) + receita de uso
> adiado: 2026-09-05 22:45 — a sessão falhou (claude-code exited with code 1:
You've hit your session limit · resets 7:50pm (America/Sao_Paulo))
