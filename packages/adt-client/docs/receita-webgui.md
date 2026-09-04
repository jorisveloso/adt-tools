# Receita — WebGUI (SAP GUI for HTML) por Chrome headless e CDP cru

**Medido em dois sistemas.** SXD 816, mandante 100, 2026-09-03 (POC 4029823 — protótipo): abriu a
J1B1N preenchida por URL, leu a tela, preencheu duas datas e **acionou o Gravar**, criando a
**NF 0000000082**, confirmada em outra LUW. S4H 758, mandante 250, 2026-09-04 (porte para a lib,
só leitura): abriu a SE16, leu campos e botões, preencheu `T000` e acionou o `btn[0]` — a tela
virou "Data Browser: tabela T000: tela de seleção".

Módulo: [`webgui.mjs`](../webgui.mjs) (export `adt-client/webgui`); teste puro em
`webgui.test.mjs`. **Zero dependência nova**: o Chrome que já está na máquina e o `WebSocket`
nativo do Node — sem playwright, sem puppeteer (o Playwright serviu de instrumento na
investigação, não de dependência).

## Para que serve — e o lugar dele na ordem

É o canal que **enxerga e dirige a dynpro sem SAP GUI instalado e sem ninguém na frente da tela**.
Era esse o buraco do GUI Scripting ([receita-gui-scripting.md](receita-gui-scripting.md)), que
exige SAP GUI instalado, uma sessão de diálogo **aberta e visível** e
`sapgui/user_scripting = TRUE` no servidor. O WebGUI roda no **mesmo ICM da porta 8000 que o ADT já
usa** — se o ADT responde, o caminho de rede para este canal já está aberto.

**A ordem passa a ser: ADT → SOAP RFC → classrun → BDC → WebGUI → GUI Scripting.**

| Precisa de… | Canal |
|---|---|
| criar/alterar objeto ABAP | ADT REST (a lib) |
| chamar FM/BAPI | SOAP RFC |
| rodar ABAP arbitrário | classrun |
| dirigir dynpro clássica sem tela, em lote | BDC por classrun |
| **ver e dirigir a dynpro DE VERDADE, sem SAP GUI e sem ninguém na tela** | **WebGUI** |
| popup modal, ALV Grid/table control **como objeto**, e a **saída** de uma transação | GUI Scripting |

Por que o WebGUI fica **acima do BDC**: o BDC é cego — preenche campo e devolve a BDCMSGCOLL, não
vê o que a tela mostra. Por que fica **antes do GUI Scripting**: custa menos (nada instalado, nada
visível, e a credencial é a mesma do ADT). Por que **não substitui** o GUI Scripting: as três
lacunas da seção "O que este canal não faz".

O preço, para não haver surpresa: um **Chrome nesta máquina**, ~5–10 s para abrir uma tela e um
`<delta-update>` de alguns MB por interação. É caro perto de um `callFunction`; é barato perto de
mandar alguém abrir o SAP GUI.

## A receita

```js
import {
  abrirNavegador, abrirTransacao, campos, botoes, lerTela, preencher, acionar, print,
} from 'adt-client/webgui';

const cfg = { base: 'http://host:8000', client: '250', idioma: 'PT', user: 'U', pass: 's3nh4' };

const s = await abrirNavegador(cfg);           // Chrome headless + CDP + Basic + polyfill
try {
  // 1. entrar JÁ na tela certa — sem clicar caminho de menu nenhum
  await abrirTransacao(s, 'YJBV4029823', { parametros: { P_DOCNUM: 71 }, okcode: 'ONLI' });

  // 2. ler o que a tela mostra
  console.log(await campos(s));                // [{ id, title, value }]
  console.log(await botoes(s));                // [{ okcode: 'btn[11]', title: 'Gravar (Ctrl+S)' }]

  // 3. dirigir
  await preencher(s, { id: 'M0:46:::2:21' }, 'T000');
  const r = await acionar(s, 'btn[11]');       // clica e ESPERA a resposta do ABAP
  if (!r.mudou) throw new Error('a tela não respondeu — a ação não pegou');

  console.log((await lerTela(s)).statusbar);
  await print(s, 'tela.png');
} finally {
  await s.fechar();                            // quem abre fecha (mata o Chrome e o perfil temporário)
}
```

**O assert NÃO está aí.** Statusbar e print não provam gravação — fecha-se com `dataPreview` /
`readTable` em **outra LUW** ([receita-ciclo-escrita-verificacao.md](receita-ciclo-escrita-verificacao.md)).

### Entrar na tela já preenchida

`abrirTransacao(s, tcode, { parametros, okcode })` monta a expressão `~transaction` do ITS:
`*TCODE campo=valor;campo=valor;DYNP_OKCODE=ONLI`. É o que pula a tela de entrada e a de seleção
de uma vez — medido: `*YJBV4029823 P_DOCNUM=71;DYNP_OKCODE=ONLI` abriu a J1B1N **com os dois itens
já montados**. Sem parâmetros, é a transação crua (e o `*` não entra).

### Apontar um elemento

Três formas, todas pelo mesmo argumento `alvo` (`jsDoAlvo` é puro e testado):

| forma | quando |
|---|---|
| `{ id: 'M0:46:::2:21' }` | o caso normal — os ids do WebGUI têm `:` e `[]`, que **quebram seletor CSS**, daí `getElementById` |
| `{ seletor: 'input#x' }` | CSS, quando o id não serve |
| `{ okcode: 'btn[11]' }` | o botão da barra pelo **OK-code do SAP GUI** — `btn[0]` Enter, `btn[3]` Voltar, `btn[7]` F7, `btn[8]` F8, `btn[11]` Gravar, `btn[15]` Sair |

## ⚠ Cookie `secure` sobre HTTP puro — o gotcha que mata o canal calado

**Medido no s4h 758/250 em 2026-09-04.** O `fetch` do Node dizia 200 e devolvia o SAP Easy Access
inteiro; o **mesmo GET no Chrome** dava a tela `Service nicht erreichbar` com o texto
`400 Session not found`, numa URL `/sap(cz1TSUQ%3aANON%3a…)` — sessão **anônima**.

A causa não é o `~transaction` nem o Basic (medidos os quatro cruzamentos: com e sem transação,
Basic em toda requisição e só na primeira — os quatro falham igual). É o **cookie**:

```
set-cookie: SAP_SESSIONID_S4H_250=…; path=/; secure; HttpOnly
```

`secure` sobre `http://` → **o Chrome descarta o cookie** (o `fetch` do Node não impõe a política,
por isso o mesmo GET parece feliz fora do navegador). A requisição seguinte sai sem sessão de
segurança e o ITS não acha a sessão.

**O conserto** (é o default do módulo, `origemSegura: true`): subir o Chrome tratando a origem do
ICM como segura.

```
--unsafely-treat-insecure-origin-as-secure=http://host:8000 --test-type
```

Medido, com e sem, na mesma máquina e no mesmo minuto:

| | `origemSegura: true` | `origemSegura: false` |
|---|---|---|
| `window.isSecureContext` | `true` | `false` |
| `crypto.randomUUID` nativo | **sim** | não (entra o polyfill) |
| `SAP_SESSIONID_S4H_250` no jar do Chrome | **sim** (`secure=true`) | **não** |
| título da página | `SAP Easy Access` | `Service nicht erreichbar` |
| controles `[ct]` | 201 | 0 |

No SXD 816/100 o canal rodou **sem** essa bandeira, porque lá o cookie **não** vem `secure` — ou
seja, a necessidade é por sistema, e a bandeira é aditiva (`--test-type` é obrigatório: sem ele o
Chrome ignora a outra).

## ⚠ `crypto.randomUUID` — o cadáver bonito

**Medido no SXD 816/100 em 2026-09-03.** Servida por HTTP puro e **sem** a bandeira de origem
segura, a página do WebGUI abre, pinta a tela certa, dá para ler o texto e printar — e **nenhuma
ação chega ao servidor**: clique, `F8`, `Enter`, nada. A tela fica igual.

`crypto.randomUUID` **só existe em contexto seguro**, e o boot do ITS quebra em cascata:

```
TypeError: crypto.randomUUID is not a function
TypeError: Cannot read properties of undefined (reading 'testAPCCapability')
*** ITS ***: Exception in onUpdate of >> page   — TypeError: b.GetOption is not a function
*** ITS ***: Exception in onUpdate of >> cookie — TypeError: a.GetOption is not a function
```

O framework morre **antes de instanciar os controles**: nenhum ganha listener. A prova direta, por
`DOMDebugger.getEventListeners` — sem polyfill, 4 erros de boot e **0 POST** ao clicar; com
polyfill, **0 erros** e o clique posta (200 + `<delta-update>` aplicado).

Descartadas por medição antes de chegar aqui: **não era o gesto** (o clique do Playwright, com
hit-test e actionability, falhava igual ao `Input.dispatchMouseEvent` cru) e **não era o frame** (a
página tem um iframe `ls-blindlayer-0` em `about:blank`; todos os controles estão no principal).

`POLYFILL_RANDOMUUID` segue armado por `Page.addScriptToEvaluateOnNewDocument` mesmo com
`origemSegura: true` — é o que salva quem desligar a bandeira.

## ⚠ Quando a tela está "pronta"

Dois sinais que **não** servem:

- **rede quieta** — se o servidor demora a *começar* a responder, a página ainda está em
  `about:blank` e o silêncio é lido como tela pronta;
- **`document.title`** — medido no SXD: a tela chamada por `~transaction=*TCODE …;DYNP_OKCODE=ONLI`
  monta **inteira** (3.063 elementos com `ct`, 10 inputs visíveis em 3 s) com o **título vazio**;
  exigir título fazia a espera estourar o teto de 60 s e o script ler uma tela pronta como se
  tivesse **zero campo**.

O sinal certo (`jsTelaPronta`, puro) é **texto + contagem de controles `[ct]` + campos de entrada
visíveis**. ⚠ E o piso de campos é `0` de propósito: a 1ª tela da SE16 tem **um** input visível —
com o piso em 3 (herdado da J1B1N) a abertura levou **64 s**; com o piso certo, **9 s**.

## ⚠ Clicar de verdade

Mouse e teclado **nativos** (`Input.dispatch*`), nunca `.value =` ou `.click()`: o Unified Renderer
escuta o evento nativo, e um value setado na marra **não chega ao programa ABAP**. Três medições
que fazem o clique cair no vazio, todas resolvidas dentro de `apontar`/`clique`:

1. **`scrollIntoView` é assíncrono** — ler o `getBoundingClientRect` no mesmo tick devolve o rect
   ANTIGO (medido: rect em y=873, clique enviado para y=452). Rola, espera, relê.
2. **O container `::btn[n]` não é o botão** — ele engloba texto oculto e o centro dele cai fora
   (medido: o clique foi parar no grid de itens). O rect certo é o do filho **`-cnt`**.
3. **Falta o gesto inteiro** — `mousePressed`+`mouseReleased` sem `buttons` e sem um `mouseMoved`
   antes não aciona o renderer.

`apontar` ainda devolve `coberto` (por `elementFromPoint`): alvo coberto é clique perdido.

E **`mudou: false` é informação**: `acionar` compara o carimbo da tela antes e depois; tela idêntica
significa que a ação não pegou, e é assim que `btn[15]`/`btn[12]` se denunciam neste canal.

## O que este canal NÃO faz

1. **Não tem via de saída.** Medido no SXD: `btn[15]` (Sair, Shift+F3), `btn[12]` (Cancelar,
   Escape) e a tecla `Shift+F3` postam, o servidor responde 200 e o programa **reabre a mesma
   dynpro**; nenhuma NF é criada, nenhum `fcode` de saída chega. A caixa de OK-code
   (`ToolbarOkCode`, SID `wnd[0]/tbar[0]/okcd`) é **invisível** (rect 0×0) e não recebe digitação.
   Fluxo que precisa **sair sem gravar** ainda é GUI Scripting. (Fila `adt-client`, item 13.)
2. **Statusbar e print não são assert.** A tela pode aceitar tudo e não gravar nada, calada — o
   mesmo desmentido do GUI Scripting. O assert é em **outra LUW**.
3. **Não roda sem navegador nesta máquina.** É Chrome headless local, não um cliente HTTP.

Fora isso: o `httpCredentials` do Playwright **não autentica no ICF** — o SAP não devolve 401 com
`WWW-Authenticate`, devolve a **página de logon**. O Basic tem de ir em header, em toda requisição
(é o que `abrirNavegador` faz com `Network.setExtraHTTPHeaders`).

## De quebra: o protocolo do ITS

O corpo do POST que o renderer manda é **JSON com os SIDs do SAP GUI** — os mesmos do GUI Scripting:

```json
[{"post":"action/304/wnd[0]/usr/tabsTABSTRIP1/tabpTAB1/ssubHEADER_TAB:SAPLJ1BB2:2100/tblSAPLJ1BB2ITEM_CONTROL/ctxtJ_1BDYLIN-ITMTYP[1,1]","content":"position=0","logic":"ignore"},
 {"post":"action/3/wnd[0]/tbar[0]/btn[15]"},
 {"get":"state/ur"}]
```

Verbos `post`/`get`; ações `action/<n>/<SID>`, `focus/<SID>`, `value/<SID>` com `content`; e
`state/ur` fechando. É o insumo de falar o ITS **por HTTP puro**, sem navegador — o que tornaria
este canal barato. Não está medido; é a próxima pergunta, não uma promessa.
