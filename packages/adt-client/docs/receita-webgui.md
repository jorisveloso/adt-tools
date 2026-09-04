# Receita — WebGUI (SAP GUI for HTML): por Chrome headless e CDP cru, ou por HTTP puro

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
  console.log(await botoes(s));                // [{ okcode: 'btn[11]', title: 'Gravar (Ctrl+S)', nome: 'Gravar', tecla: 'Ctrl+S' }]

  // 3. dirigir
  await preencher(s, { id: 'M0:46:::2:21' }, 'T000');
  const r = await acionar(s, 'Gravar');        // 'btn[11]', 11 ou o apelido — clica e ESPERA o ABAP
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
`*TCODE campo=valor;campo=valor;DYNP_OKCODE=FCODE`. É o que pula a tela de entrada e a de seleção
de uma vez — medido: `*YJBV4029823 P_DOCNUM=71;DYNP_OKCODE=ONLI` abriu a J1B1N **com os dois itens
já montados** (SXD 816/100, 2026-09-03). Sem parâmetros, é a transação crua (e o `*` não entra).

**Duas regras, as duas medidas no s4h 758/250 em 2026-09-04, e as duas falham CALADAS quando erradas.**

**1. O nome do campo é o SID da dynpro — não o que a documentação de shortcut sugere.**
`*SE38 RS38M-PROGRAMMA=RSPARAM` — o nome clássico, **com** `A` — **não preenche nada**: o ITS ignora o par
em silêncio, sem erro, sem aviso. O campo real desta tela é `RS38M-PROGRAMM`, **sem o `A`** — e com
ele o campo entra. Pior: com `DYNP_OKCODE` junto, o fcode **dispara mesmo assim**, com a dynpro
vazia, e o que volta é o erro do programa (`"O programa  não existe"`, com o nome em branco no meio)
— uma mensagem que parece do sistema e é, na verdade, o parâmetro errado.

Quem sabe o nome certo é a **própria tela**: o `lsdata` de cada campo carrega o SID do SAP GUI.

```js
await avaliar(s, `[...document.querySelectorAll('input')]
  .filter(e => e.offsetWidth || e.offsetHeight)
  .map(e => ({ title: e.title, sid: (JSON.parse(e.getAttribute('lsdata') || '{}')['21'] || {}).SID }))`);
// SE38 -> [{ title: 'Nome do programa ABAP', sid: 'wnd[0]/usr/ctxtRS38M-PROGRAMM' }]
// SE16 -> [{ title: 'Nome da tabela',        sid: 'wnd[0]/usr/ctxtDATABROWSE-TABLENAME' }]
```

(Este snippet foi **rodado como está** no s4h em 2026-09-04 — é dele que saíram as duas linhas acima.)
O nome do parâmetro é o SID sem `wnd[0]/usr/` e **sem o prefixo de tipo do controle** (`ctxt` aqui;
`txt`, `cmb`, `chk`… nos outros) — o mesmo prefixo que o GUI Scripting usa no id.
Segunda fonte, independente e de graça: a `TSTCP` do próprio sistema — a transação standard
`SA38PARAMETER` grava `/*SA38 RS38M-PROGRAMM=PFCG_TIME_DEPENDENCY;`, com o mesmo nome sem `A`.

**2. `DYNP_OKCODE` é o FCODE daquela dynpro, não um "executar" genérico.** Fcode errado não é
ignorado: ele **substitui** o Enter implícito e a tela **fica onde está**, preenchida e parada.

| expressão | onde chegou |
|---|---|
| `*SE16 DATABROWSE-TABLENAME=T000` | **tela de seleção da T000** (34 campos) — sem okcode, o default avança |
| `*SE16 DATABROWSE-TABLENAME=T000;DYNP_OKCODE=ONLI` | 1ª tela, campo preenchido — `ONLI` não é fcode desta dynpro |
| `*SE16 DATABROWSE-TABLENAME=T000;DYNP_OKCODE=XXXX` | idem: fcode inexistente **segura** a tela |
| `*SE38 RS38M-PROGRAMMA=RSPARAM;DYNP_OKCODE=SHOW` | 1ª tela **vazia** + "O programa não existe" — nome do campo errado |
| `*SE38 RS38M-PROGRAMM=RSPARAM` | 1ª tela, campo preenchido (na SE38 o Enter só valida) |
| `*SE38 RS38M-PROGRAMM=RSPARAM;DYNP_OKCODE=STRT` | **executou** — "Exibir parâmetro de perfil SAP" |
| `*SA38 RS38M-PROGRAMM=RSPARAM;DYNP_OKCODE=ONLI` | 1ª tela, campo preenchido — `ONLI` é da tela de SELEÇÃO, não da 1ª |
| `*SA38 RS38M-PROGRAMM=RSPARAM;DYNP_OKCODE=STRT` | **executou** — mesma tela de seleção do report |

Daí o `ONLI` da J1B1N ter funcionado no SXD e não funcionar aqui: lá a transação é **de report**, e
`ONLI` é o fcode da tela de **seleção**, que é a primeira que aparece. Regra prática: **transação de
report → `ONLI`; primeira tela da SE38/SA38 → `STRT`; SE16 → nenhum** (o default já avança).

### A transação de PARÂMETRO é a via equivalente — e obedece às mesmas regras

O `TSTCP` (`/*<chamada> CAMPO=valor;`) é a forma persistida da mesma coisa, e o WebGUI a executa
igual. Medido no s4h 758/250 em 2026-09-04, com transações **standard** (nada foi criado):

| transação | TSTCP | onde chegou pelo WebGUI |
|---|---|---|
| `SE16T000` | `/*SE16 DATABROWSE-TABLENAME=T000;` | tela de seleção da T000 — **igual à URL** |
| `SA38PARAMETER` | `/*SA38 RS38M-PROGRAMM=PFCG_TIME_DEPENDENCY;` | 1ª tela preenchida — o TSTCP **não traz** `DYNP_OKCODE` |

Ou seja: a URL e o TSTCP são a **mesma via**, com a mesma regra de nome de campo e a mesma
dependência do fcode. A URL ganha por não precisar de objeto no sistema; o TSTCP ganha quando a
tela tem de estar disponível para uma pessoa, não para o canal — e aí `deployTransaction`
(`type: 'parameter'`, [receita-tran.md](receita-tran.md)) grava `params` e `skip`.

### Apontar um elemento

Três formas, todas pelo mesmo argumento `alvo` (`jsDoAlvo` é puro e testado):

| forma | quando |
|---|---|
| `{ id: 'M0:46:::2:21' }` | o caso normal — os ids do WebGUI têm `:` e `[]`, que **quebram seletor CSS**, daí `getElementById` |
| `{ seletor: 'input#x' }` | CSS, quando o id não serve |
| `{ okcode: 'btn[11]' }` | o botão da barra pelo **OK-code do SAP GUI** — o endereço ESTÁVEL, com apelido e mapa medido na seção abaixo (`'Gravar'` e `11` também servem) |

## O `btn[n]` é o endereço ESTÁVEL da barra

O id de DOM do WebGUI é volátil — `M0:48::btn[8]`, `M0:50::btn[11]` — mas a volatilidade está toda
no **prefixo**. Medido no SXD 816/100 em 2026-09-03: na **mesma sessão** da SE38 os botões saíram
em quatro prefixos diferentes (`M0:48`, `M0:49`, `M0:55`, `M0:56`) e no Writer da J1B1N em `M0:50`;
o **sufixo `::btn[n]` não mudou em nenhum**. E o `n` é o **mesmo do SAP GUI** — o SID
`wnd[0]/tbar[0]/btn[n]` que o GUI Scripting usa e que aparece cru no POST do ITS
(`{"post":"action/3/wnd[0]/tbar[0]/btn[15]"}`).

Por isso `{ okcode }` casa pelo **fim** do id, nunca pelo id inteiro — e por isso o mesmo endereço
serve para os três canais que veem a dynpro (GUI Scripting, WebGUI e o protocolo do ITS).

O que foi **lido de tela de verdade** está em `OKCODES`, com a medição de cada linha:

| OK-code | nome na tela | tecla | onde foi lido |
|---|---|---|---|
| `btn[0]` | Enter | Enter | s4h 758/250, SE16 — acionado, a tela virou a de seleção da `T000` |
| `btn[3]` | Voltar | F3 | SXD, SE38 — `M0:56::btn[3]` |
| `btn[8]` | Executar | F8 | SXD, SE38 — `M0:48::btn[8]`, title `" (F8)"`, `lsdata {"0":"Executar"}` |
| `btn[11]` | Gravar | Ctrl+S | SXD, Writer da J1B1N — `M0:50::btn[11]` **criou a NF 0000000082** |
| `btn[12]` | Cancelar | Escape | SXD, Writer — `M0:50::btn[12]`; ⚠ posta e **reabre a mesma dynpro** |
| `btn[15]` | Encerrar | Shift+F3 | SXD, SE38 — `M0:55::btn[15]`; ⚠ **sem via de saída** neste canal |
| `btn[71]` | Procurar | — | SXD, SE38 — `M0:49::btn[71]` |
| `btn[86]` | Imprimir | — | SXD, SE38 — `M0:49::btn[86]` |

⚠ **É apelido, não whitelist.** O resto da convenção do SAP GUI ficou **de fora de propósito** —
mapa de palpite com cara de medição é pior que mapa curto. Qualquer `btn[n]` continua endereçável:

```js
await acionar(s, 'btn[11]');   // o OK-code cru — sempre vale, esteja ou não no mapa
await acionar(s, 11);          // só o número
await acionar(s, 'Gravar');    // o apelido medido (sem caixa e sem acento: 'gravar' também)
await acionar(s, 'btn[42]');   // fora do mapa: passa direto
await acionar(s, 'Salvar');    // ✗ estoura AQUI, com a lista — não vira "não está na tela" 20 s depois
```

`botoes(s)` responde **antes de tentar** o que esta tela oferece, já com o apelido anotado
(`nome: null` quando o botão está fora do mapa — é botão da tela, não erro):

```js
[{ okcode: 'btn[11]', title: 'Gravar (Ctrl+S)', texto: 'Gravar', nome: 'Gravar', tecla: 'Ctrl+S' },
 { okcode: 'btn[15]', title: 'Encerrar (Shift+F3)', texto: '', nome: 'Encerrar', tecla: 'Shift+F3' }]
```

A **outra** via de comando da barra — o input `ToolbarOkCode` (SID `wnd[0]/tbar[0]/okcd`, title
"Inserir código de transação") — existe em toda tela e é **invisível** (rect 0×0): não recebe
digitação, e é por isso que este canal não manda OK-code arbitrário. Fila `adt-client`, item 13.

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
3. **Não roda sem navegador nesta máquina** — *pela via do CDP*. É Chrome headless local. ⚠ Isto
   deixou de ser limite do CANAL: o ITS fala HTTP puro e o `fetch` dirige a dynpro sozinho
   (§ "O protocolo do ITS por HTTP puro", medido no s4h em 2026-09-04). O que a via HTTP não tem
   é print de tela e leitura por DOM.

Fora isso: o `httpCredentials` do Playwright **não autentica no ICF** — o SAP não devolve 401 com
`WWW-Authenticate`, devolve a **página de logon**. O Basic tem de ir em header, em toda requisição
(é o que `abrirNavegador` faz com `Network.setExtraHTTPHeaders`).

## O protocolo do ITS por HTTP puro — **sem navegador nenhum**

**Medido no s4h 758/250 em 2026-09-04** (fila `adt-client`, item 7). O canal WebGUI **não precisa
de Chrome**: o ITS fala um protocolo HTTP simples, e o `fetch` do Node dirige a dynpro sozinho —
lê, **escreve** e **aciona**. Isso põe o WebGUI na mesma prateleira do ADT e do SOAP RFC.

**A prova, ponta a ponta e sem navegador:** SE16 na `T000`, campo "Nº máximo de entradas"
(`wnd[0]/usr/txtMAX_SEL`) mudado de `200` para `2`, `btn[8]` acionado — o título da lista voltou
`Data Browser: Tabela T000          2 acertos` em vez dos `5 acertos` que a mesma sessão devolve
sem tocar no campo. O valor **chegou ao ABAP** e mudou o resultado.

### O handshake, em três passos

**1. GET** — cria a sessão e devolve o **shell** da página (~36 KB):

```
GET {base}/sap/bc/gui/sap/its/webgui?sap-client=250&sap-language=PT&~transaction=*SE16 DATABROWSE-TABLENAME=T000
Authorization: Basic …
```

Do HTML saem as duas peças: o `action` do `<form id="webguiform0">`, que carrega o **token de
sessão** (`/sap(cz1TSUQ…ANON…)/bc/gui/sap/its/webgui/`), e o `var moin = "…"`. Do `set-cookie` sai
o `SAP_SESSIONID_…` — **guarde o jar**, ele é obrigatório (§ contra-provas). O `~transaction`
obedece às mesmas duas regras da via de URL (§ "Entrar na tela já preenchida").

**2. POST de boot** — o GET **ainda não tem a dynpro** (`ScreenId=screenarea0`, `cuatitle` vazio).
Quem a monta é o primeiro POST, e é isso que o `crypto.randomUUID` quebrava no navegador:

```
POST {base}{action}batch/json?~RG_WEBGUI=X&
Content-Type: application/json;charset=UTF-8
Accept: multipart/mixed
Cookie: SAP_SESSIONID_S4H_250=…; sap-usercontext=…; saplbS4H=…
moin: 854BDC2593B8763E

[{"get":"state/ur"}]
```

⚠ **Ação no POST de boot é PERDIDA.** Medido: `action/3/…/btn[8]` no primeiro POST devolveu a
**tela de seleção**; o mesmo comando no POST seguinte devolveu a **lista**. Boot primeiro, ação
depois — sempre.

**3. POST de ação** — o batch de comandos, na ordem em que o renderer os manda:

```json
[{"post":"focus/wnd[0]/usr/txtMAX_SEL","logic":"ignore"},
 {"content":"2","post":"value/wnd[0]/usr/txtMAX_SEL"},
 {"post":"action/3/wnd[0]/tbar[1]/btn[8]"},
 {"get":"state/ur"}]
```

### O vocabulário

| Comando | O que faz | Medido |
|---|---|---|
| `{"get":"state/ur"}` | pede o estado da tela — **fecha todo batch** | sim |
| `{"post":"focus/<SID>","logic":"ignore"}` | põe o cursor no campo antes de escrever | sim |
| `{"post":"value/<SID>","content":"<valor>"}` | **escreve** no campo | sim (`txtMAX_SEL` 200 → 2) |
| `{"post":"action/3/<SID>"}` | **aciona** (o `Press` do renderer) | sim (`tbar[1]/btn[8]`) |
| `{"post":"action/304/<SID>","content":"position=3","logic":"ignore"}` | posição do cursor no texto | mandado pelo renderer; **dispensável** |
| `{"post":"vkey/<n>/ses[0]"}` | **dispara a tecla** — `vkey/0` é o Enter, e é o que SUBMETE o OK-code | sim (§ caixa de comando) |
| `{"post":"okcode/ses[0]","content":"<okcode>"}` | escreve o OK-code (o `Change` do campo) — **não dispara sozinho** | sim |
| `{"post":"action/0/wnd[0]"}` | — | **não existe**: `X-Code: -101 failed to fire action: not supported` |

Os `<SID>` são os **mesmos do GUI Scripting** (`wnd[0]/usr/txtMAX_SEL`, `wnd[0]/tbar[1]/btn[8]`) —
endereço estável, não id volátil de DOM. A tela os entrega: cada `<input>` traz
`lsdata='{…"21":{"SID":"wnd[0]/usr/…"}}'` (é a mesma peça do item 18).

### A caixa de comando (OK-code) — a navegação genérica do canal

**Medido no s4h 758/250 em 2026-09-04** (item 8). Dois comandos levam a sessão a **qualquer**
transação, de **qualquer** tela — sem depender de botão, de menu ou de id de DOM:

```json
[{"post":"value/wnd[0]/tbar[0]/okcd","content":"/nSE16"},
 {"post":"vkey/0/ses[0]"},
 {"get":"state/ur"}]
```

⚠ **Quem dispara é o `vkey/0/ses[0]`, não um `action`.** Escrever no `okcd` sozinho volta
`X-Code: 0` e **não navega** (medido: a tela continua no SAP Easy Access) — foi o que travou o
item 13. `action/3/wnd[0]/tbar[0]/okcd` devolve `-101 not supported`. Quem entrega o comando certo
é a própria tela: o `lsevents` do campo diz `"Enter":[{},{"1":"vkey/0/ses[0]","2":true}]`.

O mesmo `vkey/0` é o **Enter da dynpro**: preencher um campo e mandá-lo avança a tela sem clicar
em botão (medido: `DATABROWSE-TABLENAME=T000` + `vkey/0` → tela de seleção da T000).

| OK-code | O que faz | Medido |
|---|---|---|
| `/nXXXX` | vai para a transação `XXXX`, **de qualquer tela** | sim — `/nSE16` do menu; `/nSE38` de dentro de uma lista ALV |
| `/n` | volta ao menu (SMEN) | sim |
| `ONLI`, `STRT`, … | o **fcode da dynpro** (o mesmo do `DYNP_OKCODE` da URL) | sim — `ONLI` executou a SE16 |
| `/8` | a **tecla** F8 — vale o `/n` de qualquer tecla de função | sim — mesma lista que o `ONLI` |
| `/o`, `/oXXXX` | abre **popup `wnd[1]`** com a lista de modos (não uma janela nova) | sim |
| `/nend` | abre **popup `wnd[1]` "Pergunta"** (Sim/Não) — a sessão continua viva | sim |
| `/nex` | **encerra a sessão**: HTTP 200 `text/html` "Adeus — o logoff foi efetuado"; o POST seguinte volta **400 Session Timed Out** | sim |

Custo por salto: **85–150 ms**. Evidência:
`sap-accelerate/work/POC_webgui_okcode/medicoes/okcode-http.md`.

### As duas formas de resposta

* **HTTP 200 + `text/xml`** — `<updates><delta-update><start-script><![CDATA[…]]>`: houve update.
  O estado da tela sai dos `sap.its.aParams` embutidos — `cuatitle` (o título da dynpro),
  `ScreenId`, `dynpro`, `d-num`, e o `moin` novo.
* **HTTP 200 + `multipart/mixed`** — `--SAP_RESTGUI_BATCH_STEP…` com `X-Order`, `X-Code` e
  `X-Status`: **nada mudou, e ele diz por quê**. É o canal de erro do protocolo, e é o que faz
  este canal falhar FALANDO, ao contrário do clique por CDP.

⚠ O status HTTP é **200 nos dois casos**. Quem diz se pegou é o `X-Code` (ou a ausência de
`delta-update`), nunca o código HTTP.

### Contra-provas (o que é obrigatório, medido dos dois lados)

| Peça | Sem ela | Veredito |
|---|---|---|
| `Cookie` de sessão | **HTTP 400** em 48 ms, HTML alemão `Service nicht erreichbar` | **obrigatório** |
| header `moin` | HTTP 200, resposta **idêntica** (288 KB, mesma tela) | **dispensável** no que foi medido |
| `SAP-PASSPORT`, `sap-statistics`, `X-Requested-With` | nunca enviados, tudo funcionou | dispensáveis |
| `Authorization` Basic | vai em toda requisição — o ICF não desafia (§ acima) | **obrigatório** |

### Por que isto importa

* **Custo.** GET + boot + ação por `fetch`: ~0,95 s (341 + 423 + 190 ms). Abrir o Chrome e chegar
  na mesma tela da SE16: **9 s** (§ porte). Uma ordem de grandeza, e sem Chrome instalado.
* **Some a dependência de máquina.** O item 3 de "O que este canal NÃO faz" deixa de valer por
  esta via: roda em CI, em container, em servidor sem navegador.
* **Some o `crypto.randomUUID`, o clique sintético e o CDP inteiro** — não há página, não há
  renderer, não há evento para sintetizar.

### O que o navegador ainda dá, e esta via não

A leitura. O `delta-update` é HTML+script para o renderer aplicar; ler campo e botão dele é
**parsear XML**, não `querySelectorAll`. O que já está medido que dá para tirar do XML sem
navegador: `cuatitle`, `ScreenId`, `dynpro`, e cada `<input>` com seu `SID`, `title` e `value`
(foi assim que a prova achou o `txtMAX_SEL`). Print de tela, esta via **não tem**.

### O que **ainda não** está medido por esta via

* **Porte para a lib** — hoje isto é receita, não módulo (fila `adt-client`, item novo).
* ~~A saída (item 13)~~ **resolvida** por esta via: `/nex` encerra a sessão e `/n` volta ao menu
  (§ "A caixa de comando"). O obstáculo era do navegador — campo invisível —, não do canal.
* **O mapa do `vkey/<n>`**: só o `vkey/0` (Enter) está medido; F3, F8 e Shift+F3 como tecla direta
  ainda não (fila `adt-client`).
* Popup (`wnd[1]`) — `/o` e `/nend` abrem um, e ele **vem no mesmo `delta-update`**; falta medir
  como responder. ALV/table control e upload/download por esta via também não.
