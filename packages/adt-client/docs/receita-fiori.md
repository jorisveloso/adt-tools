# Receita — dirigir app UI5 (FLP Designer, Fiori) pelo canal navegador

Módulo: [`fiori.mjs`](../fiori.mjs) (`adt-client/fiori`). Roda na **mesma sessão** do
[`webgui.mjs`](receita-webgui.md) — `abrirNavegador` sobe o Chrome headless autenticado, e daí em
diante `fiori` endereça **controle UI5** em vez de SID de dynpro.

| canal | endereço | quem reage ao gesto |
|---|---|---|
| `webgui` | `wnd[0]/usr/txtMAX_SEL` (SID do SAP GUI) | o Unified Renderer do ITS, no servidor |
| `fiori` | `__xmlview9--targetTypeInput` (id do controle) | o framework UI5, no navegador |

## ⚠ Mexer no controle por API **não é** selecionar

**Medido no SXD 816/100 em 04/09/2026** (fila `adt-client`, item 39), no formulário "Criar
atribuição de destino" do FLP Designer: `targetTypeInput.setSelectedKey('TR')` deixou o campo
mostrando **"Transação"** — e o formulário continuou com os campos genéricos URL/ID. Ao disparar
`fireSelectionChange`, aí sim apareceram `target_transactionInput` e `target_system_aliasInput`.

**Medido no s4h 758/250 em 05/09/2026**, UI5 1.114.0, num laboratório que repete esse formulário
(`sap-accelerate/work/POC_ui5_combobox/`, `medicoes/item39-gestos.md`):

| gesto | eventos disparados | campos do tipo TR |
|---|---|---|
| `setSelectedKey` | *(nenhum)* | **não apareceram** |
| `setSelectedKey` + `fireChange` | `change` | **não apareceram** |
| `setSelectedKey` + `fireSelectionChange` | `selectionChange` | apareceram |
| `setSelectedKey` + `fireSelectionChange` + `fireChange` | `selectionChange`, `change` | apareceram |
| **clique na lista (gesto real)** | **`selectionChange`, `change`** | **apareceram** |
| digitar o texto + Enter | `selectionChange`, `change` | apareceram |

Três coisas que isso ensina, e que decidem o desenho do helper:

1. **`fireChange` sozinho não basta** num `sap.m.ComboBox` — o handler do Designer está no
   `selectionChange`. Já um `sap.m.Select` **não tem** `selectionChange`: lá quem vale é o `change`.
   Quem chuta um dos dois acerta metade das telas.
2. **Formulário que reage por *binding*** (`selectedKey` two-way + `visible` por expressão) repinta
   com o `setSelectedKey` sozinho. Ou seja: "funcionou uma vez" não prova nada — o gesto certo é o
   que serve aos dois desenhos.
3. **O gesto real dispara os dois eventos** e não exige saber qual deles a app escuta.

## A regra

> Selecionar item de lista é **abrir a lista e clicar no item**. Disparo por API é saída de
> emergência — e, quando usado, tem de disparar `selectionChange` **e** `change`.

## `selecionar` — o helper

```js
import { abrirNavegador } from 'adt-client/webgui';
import { selecionar } from 'adt-client/fiori';

const r = await selecionar(s, '__xmlview9--targetTypeInput', 'TR');
// { id: '__xmlview9--targetTypeInput', gesto: 'lista', chave: 'TR', texto: 'Transação',
//   mudou: true, apareceram: ['…target_transactionInput-inner', '…target_system_aliasInput-inner'],
//   sumiram: ['…urlInput-inner'] }
```

- **O alvo aceita o id do DOM.** `…targetTypeInput-inner`, `-arrow`, `-label` — `idDoControle` tira
  o sufixo que o UI5 renderiza e fica com o id do controle, que é quem responde `setSelectedKey`.
- **O item se endereça pela chave** (`'TR'` ou `{ chave: 'TR' }`) — o texto muda com o idioma do
  logon. `{ texto: 'Transação' }` existe para a tela em que só o texto se conhece. Item que não
  está na lista estoura **listando o que havia** (`tenho URL=URL | TR=Transação | SO=Semantic Object`).
- **O retorno é a rerenderização medida**, não uma promessa: `apareceram`/`sumiram` são os ids dos
  campos de entrada visíveis que entraram e saíram da tela. É a mesma pergunta que denunciou o bug
  no SXD ("o combo diz Transação, mas cadê os campos da transação?").
- **`mudou: false` é informação, não erro** — a chave foi conferida (a função estoura se a seleção
  não pegou) e o formulário ficou igual. É o sintoma do item 39; hoje ele aparece no retorno.
- **`gesto`** diz por onde foi: `'lista'` (o clique) ou `'programa'` (a API). O helper avisa alto em
  stderr quando cai para a API — a lista que não abre costuma ser o próximo bug.
- **`{ viaPrograma: true }`** pula o gesto real, para a tela em que o popover não abre.

`inventario(s, alvo)` responde o mesmo modelo sem tocar em nada — tipo do controle, chave e texto
atuais, a lista de itens (chave, texto, id) e os campos visíveis. É por onde se começa quando o id
do controle ainda é chute.

## `verificarUi5` — por que a página está sem UI5

> **"A página não carregou" é um diagnóstico, e ele tem que ser medido.** Não existe timing que
> cure um `sap-ui-core.js` que responde 200 com corpo vazio.

O `inventario` (e portanto o `selecionar`) já faz isso sozinho: quando a página vem sem
`window.sap`, ele chama o `verificarUi5` antes de estourar, e o erro sai com a **causa medida** em
vez de um palpite. Passando `{ conexao }` ele também **cura**.

```js
import { verificarUi5 } from 'adt-client/fiori';

const v = await verificarUi5(s, { conexao });          // `conexao` = a do criarConexao
// { ui5, versao, causa, medidos, envenenados, curados, recarregou }

await inventario(s, 'tipoInput', { conexao });          // o mesmo, embutido
await selecionar(s, 'tipoInput', 'TR', { conexao });
```

| `causa` | o que houve | o que ele faz |
|---|---|---|
| `null` | o UI5 está de pé | nada — **zero requisição** |
| `'recurso-vazio'` | algum recurso volta 200 com corpo VAZIO do cache do ICM | invalida (`curarRecursoVazio`) e recarrega com `ignoreCache` |
| `'nao-e-o-cache'` | os recursos medidos vieram INTEIROS do servidor | **não invalida nada** — olhe bootstrap, console e contexto seguro |
| `'sem-o-que-medir'` | a página não declarou recurso UI5 nenhum | nada — provavelmente o canal certo é o `webgui` |

**Medido no s4h 758/250 em 06/09/2026** (item 108,
`sap-accelerate/work/POC_ui5_recurso_vazio/medicoes/item108-verificar-ui5.md`):

- **página saudável não custa nada**: `ui5: true`, UI5 1.114.0, **0 requisições**, nada tocado;
- **o sintoma reproduzido** (o `sap-ui-core.js` servido 200 com corpo vazio pela interceptação do
  CDP): a página fica **sem `window.sap`**, o Resource Timing marca `decodedBodySize = 0` e o
  helper mede **1 URL** — não a lista inteira (baixar o `library-preload.js` de 3 MB "para
  conferir" seria custo puro);
- **ele não invalida às cegas**: nesse mesmo caso o servidor estava íntegro
  (`gzip=identity=br=200/774788`), o veredito foi `nao-e-o-cache` e **nenhum classrun rodou**;
- **o carimbo não voltou**: 25 entradas de `sap-ui-core.js` no cache do ICM antes e depois da
  rodada inteira, **nenhuma nova**.

### ⚠ Por que aqui, e não no `abrirNavegador`

No `abrirNavegador` **não há o que medir** — a aba é `about:blank`, nenhum recurso foi pedido e não
se sabe quais o app vai pedir; e é a mesma sessão do canal WebGUI/dynpro, que **não usa UI5**. O
`inventario` é o único ponto que tem o sintoma (`window.sap` faltando) e a evidência (o que a
página pediu, e com quantos bytes) ao mesmo tempo.

### ⚠ Carimbar a URL está proibido

`?jbv=<timestamp>` também "resolve" — e **cria uma entrada nova no cache do ICM por carga de
página**, com 7 dias de validade, sem curar a entrada ruim. O laboratório do item 39 fazia isso; a
POC do 108 rodou com a URL do bootstrap **nua**. Curar > disfarçar. Ver
[a receita do cache do ICM](receita-icm-cache-estatico.md).

O recarregamento vai com **`ignoreCache: true`**, e isso não é detalhe: medido que, na segunda
carga, o Chrome serve o `sap-ui-core.js` do **próprio cache** (`transferSize: 0`) — o corpo vazio
gruda no navegador também, e curar só o ICM deixaria a página como estava. `ignoreCache` é header
de requisição, não chave de cache: não suja o ICM.

## ⚠ Armadilhas medidas

- **O `li` da lista é o próprio `sap.ui.core.Item`.** Medido: o item de chave `TR` (id `__item16`)
  vira um `<li id="__item16">` no popover — daí o helper clicar pelo id que o UI5 já deu, sem casar
  texto no DOM (que quebra com acento, truncamento e ícone). O casamento por texto continua como
  segunda via, para lista que não reusa o id.
- **O item de lista pode ser uma CAIXA INERTE.** Medido no SXD 816/100 em 04/09/2026 (item 40):
  clicar no `<li>` do template estático do FLP Designer não adicionou o tile — quem tem o handler é
  o ícone de dentro. O `clicar` do canal navegador hoje DESCE sozinho para o menor descendente
  acionável e conta no retorno quem recebeu o gesto (`desceu`, `recebeu`, `porQue`, `candidatos`);
  ver [a receita do WebGUI](receita-webgui.md#-o-contêiner-que-você-aponta-pode-não-ser-o-nó-que-aciona).
  O item de ComboBox NÃO é afetado: ele tem `role=option`, é acionável por si.
- **`sap.ui.getCore()` morreu no UI5 2.x**; `Element.getElementById` não existe antes do 1.119. O
  `jsControle` tenta as duas vias, nessa ordem — é o que faz o mesmo código servir 1.114 e 2.x.
- **O `sap-ui-core.js` vem VAZIO na segunda vez.** Medido no s4h 758/250 em 05/09/2026: o primeiro
  GET de `/sap/public/bc/ui5_ui5/resources/sap-ui-core.js` trouxe 774.764 bytes; os seguintes vieram
  **200 com `Content-Length: 0`**, e a página UI5 ficou muda (sem `window.sap`). Não é cache do
  navegador: o `fetch` do Node, sem cache nenhum, recebe o mesmo vazio. É o **cache do ICM**, e a
  cura é invalidar a entrada — ver [`verificarUi5`](#verificarui5--por-que-a-página-está-sem-ui5)
  logo abaixo. Fila `adt-client` itens 67 e 108.
- **Criar é mutação imediata** no FLP Designer — vale tudo o que a
  [receita do WebGUI](receita-webgui.md#-criar-é-mutação-imediata--fechar-o-navegador-não-é-rollback)
  diz sobre `transacional` e `sessao.desfazer`. Selecionar dentro de um formulário aberto por
  "Novo" já está mutando.

## O que **ainda não** está medido

- O helper **não foi re-medido no FLP Designer** (o SXD só responde na rede do cliente). O que foi
  provado no s4h é a mecânica do UI5 nos três desenhos de formulário; o que continua registrado do
  SXD é o sintoma que originou o item.
- **`sap.m.MultiComboBox`, `sap.m.Input` com value help e `sap.ui.comp.smartfield`** — outros
  controles de seleção, com outro gesto (token, popover de F4). Fora do escopo deste helper.
- **Lista com paginação/`growing`** — o item pode não estar renderizado quando o popover abre.
- **A cura de ponta a ponta do `verificarUi5`** (`envenenado → invalidar → recarregar → `window.sap`
  volta`). Não há como produzir uma entrada envenenada sob demanda: o GATILHO segue sem reprodução
  (fila `adt-client` #107). O que está medido é cada metade — a invalidação tem contra-prova do
  item 67, e a orquestração está coberta por teste unitário.
