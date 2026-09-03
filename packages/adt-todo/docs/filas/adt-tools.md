# Fila adt-tools

- [x] 1. Verificar se o adt-note está importado e funcional — confirmar que o pacote resolve no workspace e que a lógica importa sem erro; validar por medição que o leitor de notas funciona.
> adt-note importa OK no workspace; subpaths config/session/rfc-soap/forms resolvem; adobeFormInfo+readTable carregam; NOTA_3751960 presente. Gap: sem testes automatizados.

- [x] 2. Limpar o sap-notes — revisar o estado do pacote adt-note / referências a sap-note e remover o que sobrou do repo antigo ou placeholder.

- [x] 3. Importar o adt-client pra dentro de packages/ do adt-tools
> adt-client importado em packages/ (itens 4-7 executados). Commit: importar adt-client em packages/adt-client

- [x] 4. 3.1 Copiar o código do jbv-adt-client para dentro de packages/adt-client (colapsar na raiz, substituindo o ponte file:)
> código do jbv-adt-client copiado para packages/adt-client (colapsado na raiz), sem estado local (sistemas/destinos/canais/.sessao)

- [x] 5. 3.2 Renomear jbv-adt-client -> adt-client no pacote adt-client (package.json name/exports, index.mjs, sub-exports)
> renomeado jbv-adt-client -> adt-client (package.json name, sub-exports preservados); index.mjs placeholder removido; referências internas atualizadas

- [x] 6. 3.3 Migrar consumidores (adt-note: tools/notas.mjs, index.mjs) para o adt-client local via workspace:*
> adt-note migrado para adt-client local via workspace:* (package.json, tools/notas.mjs, index.mjs)

- [x] 7. 3.4 Limpar node_modules/jbv-adt-client residual e rodar pnpm install + testes (adt-client, adt-note)
> node_modules/jbv-adt-client residual limpo; pnpm install OK; docs/tipos.md regenerado; testes passando (adt-client 687, adt-git 136, adt-todo 28)

- [x] 8. Revisar/ajustar a skill /next para executar UM item por sessão limpa e não agrupar sub-temas (itens 3-7 executados juntos em 2026-09-02)
> Skill /next reforçada com regra dura: UM item por sessão, sub-temas viram itens separados, parar após fechar o item atual. Editado SKILL.md. Próximo: [none]

- [x] 9. Corrigir references jbv-adt-client → adt-client nos documentos de consumo (docs/receita-*.md, README.md, setup-guide/full-setup, examples) — o codigo .mjs e package.json ja foram renomeados, mas os import examples na documentacao ainda apontam para o nome antigo
> refs jbv-adt-client->adt-client atualizadas em 17 docs: README, examples/wdi5-app, full-setup, setup-guide, ideias e todas as receita-*.md
