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

## ⚠ Armadilhas medidas

- **O `li` da lista é o próprio `sap.ui.core.Item`.** Medido: o item de chave `TR` (id `__item16`)
  vira um `<li id="__item16">` no popover — daí o helper clicar pelo id que o UI5 já deu, sem casar
  texto no DOM (que quebra com acento, truncamento e ícone). O casamento por texto continua como
  segunda via, para lista que não reusa o id.
- **`sap.ui.getCore()` morreu no UI5 2.x**; `Element.getElementById` não existe antes do 1.119. O
  `jsControle` tenta as duas vias, nessa ordem — é o que faz o mesmo código servir 1.114 e 2.x.
- **O `sap-ui-core.js` vem VAZIO na segunda vez.** Medido no s4h 758/250 em 05/09/2026: o primeiro
  GET de `/sap/public/bc/ui5_ui5/resources/sap-ui-core.js` trouxe 774.764 bytes; os seguintes vieram
  **200 com `Content-Length: 0`**, e a página UI5 ficou muda (sem `window.sap`). Não é cache do
  navegador: o `fetch` do Node, sem cache nenhum, recebe o mesmo vazio — e uma query qualquer na URL
  (`?jbv=<timestamp>`) traz o conteúdo de volta. O `sap-ui-core-nojQuery.js` e os `library-preload.js`
  do mesmo diretório nunca vieram vazios. Fila `adt-client` item 67.
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
