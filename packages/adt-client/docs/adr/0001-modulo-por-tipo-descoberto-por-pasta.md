# ADR 0001 — Um módulo por tipo de objeto, descoberto por pasta

**Data:** 2026-08-28 · **Estado:** aceito (revisado no mesmo dia: índice explícito → descoberta por pasta)

## Contexto
Os 16 tipos de objeto da lib moravam num único registro `TYPES` em `adt-client.mjs`, com o shell de
create num `if`-chain à parte (`defaultCreateBody`), fluxos especiais em funções `deploy*` soltas
e o vocabulário TADIR/sinônimos em `tipos.mjs`. Adicionar um tipo tocava de 2 a 4 lugares e nada
garantia coerência — `tipos.mjs` conhecia só 8 dos 16 tipos. A lib vai ser compartilhada num
repositório com vários colaboradores: quem descobre um tipo novo precisa contribuir **um arquivo**,
sem tocar arquivo comum, e o `pull` tem de sincronizar todo mundo sem conflito de merge.

## Decisão
1. **Um arquivo por tipo de objeto** (`tipos/<libKey>.mjs`), com **um esquema único**
   (`tipos/_esquema.mjs`): identificadores, coleção e media types, shell/body, o que faz, como
   trata, spike, releases medidos, guard-rails do tipo e — quando a forma exige — o fluxo próprio
   (`deploy(ctx, conexao, opts)`), executado só com as primitivas do `ctx`.
2. **Registro por descoberta de pasta** (`tipos/index.mjs`): `readdir` + `import()` uma vez por
   processo, validação de cada módulo contra o esquema no carregamento, duplicata de
   `libKey`/`adtType`/sinônimo é erro. **Nada é gravado em runtime.**
3. **Catálogo** legível (`docs/tipos.md`) gerado por `npm run catalogo` a partir dos módulos, com
   teste que falha quando está desatualizado. É para o agente e para pessoas; não é o registro.
4. A API pública anterior (`TYPES[libKey]`, `TIPOS`, `resolverTipo` & cia, todos os `deploy*`)
   sobrevive, derivada do registro.

## Por quê descoberta por pasta, e não índice explícito
A primeira versão desta ADR escolheu um índice explícito (uma linha por tipo). O cenário de
colaboração derrubou a escolha: três pessoas adicionando tipos tocam o mesmo `index.mjs`, e se
todas acrescentam no fim da lista o git marca conflito — trivial, mas é exatamente o "arquivo
comum" que a mudança queria eliminar. O custo da descoberta (um `readdir` de ~20 arquivos e ~20
`import()` por processo) é desprezível; os riscos reais — módulo com export errado carregando em
silêncio, dois arquivos para o mesmo tipo — são cobertos pela validação no load, que falha alto.

## Por quê o catálogo não é gravado pela lib
Foi cogitado "escanear na primeira execução e gravar um índice". Rejeitado: (a) para saber se a
pasta mudou é preciso ler a pasta — o mesmo custo que se queria poupar; (b) lib que escreve no
próprio código-fonte falha em `node_modules`, em CI e em pasta somente-leitura; (c) o arquivo
gerado reintroduz o conflito de merge que a pasta eliminou; (d) a lib não sabe o que é "primeira
execução". O que se queria — ver a lista do que a lib trata — é saída, não registro: vira o
catálogo, gerado por quem adiciona o tipo.

## Enriquecimento do esquema (mesmo dia)
Depois da migração, o esquema ganhou os campos de **conhecimento medido** — `exemplo`, `testes`
(como testar no ABAP, com canal/ABAP/assert/medido), `erros` (sintoma → causa → correção, anexados
ao erro pela lib), `prova` (readTable em outra LUW), `dependencias`, `nomeacao`, `canais`, `origem`
— `desmentidos` (crenças que pareciam certas, desmentidas por medição — a terceira espécie de
"erro a evitar", com a regra "cada fato mora num campo só") — e o gancho `antesDeApagar`. Regra que
os acompanha: **teste irmão obrigatório** por módulo
(`tipos/<libKey>.test.mjs`), com o snapshot do XML provado; e `@typedef ModuloDeTipo` como a
interface para o editor. Campos sem consumidor em código (autor, versão, status, links) foram
deliberadamente deixados de fora — seriam documentação que ninguém lê.

## Consequências
- `TYPES`, `defaultCreateBody`, `TIPOS` e os `deploy*` específicos deixaram de ser fonte: são
  derivados/atalhos. `tipos.mjs` foi removido; `package.json` exporta `./tipos` → `tipos/index.mjs`.
- Módulo de tipo **nunca** importa `adt-client.mjs` (ciclo com o top-level await do índice) — teste
  puro garante.
- Um módulo inválido derruba o import da lib inteira, de propósito. Rascunho não fica em `tipos/`.
- Mudanças de comportamento visíveis: `tabl` e `fugr` resolvem para os dois alvos do código;
  `todasAsLibKeys()` em ordem alfabética e sem `functionModule`; `objPath('functionModule', n)`
  sem `{ group }` lança (antes devolvia path errado); `deploySource` recusa o FM.
- A migração foi cópia byte a byte, provada por snapshots (`tipos.test.mjs`); os fluxos `custom`
  (msag, class, serviceBinding, functionGroup, functionModule) não têm snapshot possível sem SAP e
  exigem re-validação no s4h antes de versionar (item 7 da fila).
