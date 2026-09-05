# Receita — WebGUI (SAP GUI for HTML): por Chrome headless e CDP cru, ou por HTTP puro

**Medido em dois sistemas.** SXD 816, mandante 100, 2026-09-03 (POC 4029823 — protótipo): abriu a
J1B1N preenchida por URL, leu a tela, preencheu duas datas e **acionou o Gravar**, criando a
**NF 0000000082**, confirmada em outra LUW. S4H 758, mandante 250, 2026-09-04 (porte para a lib,
só leitura): abriu a SE16, leu campos e botões, preencheu `T000` e acionou o `btn[0]` — a tela
virou "Data Browser: tabela T000: tela de seleção".

Módulo: [`webgui.mjs`](../webgui.mjs) (export `adt-client/webgui`); teste puro em
`webgui.test.mjs`. **Zero dependência nova**: o Chrome que já está na máquina e o `WebSocket`
nativo do Node — sem playwright, sem puppeteer (o Playwright serviu de instrumento na
investigação, não de dependência). **A segunda via, sem navegador nenhum**, é
[`its.mjs`](../its.mjs) (export `adt-client/its`) — § "O protocolo do ITS por HTTP puro".

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
| popup modal, ALV Grid **como objeto** (ordenar, filtrar, selecionar), e a **saída** de uma transação | GUI Scripting |

Por que o WebGUI fica **acima do BDC**: o BDC é cego — preenche campo e devolve a BDCMSGCOLL, não
vê o que a tela mostra. Por que fica **antes do GUI Scripting**: custa menos (nada instalado, nada
visível, e a credencial é a mesma do ADT). Por que **não substitui** o GUI Scripting: as três
lacunas da seção "O que este canal não faz".

O preço, para não haver surpresa: um **Chrome nesta máquina**, ~5–10 s para abrir uma tela e um
`<delta-update>` de alguns MB por interação. É caro perto de um `callFunction`; é barato perto de
mandar alguém abrir o SAP GUI.

## Antes de subir Chrome nenhum: `sondarWebgui` — dá para usar este canal NESTE sistema?

O nó `/sap/bc/gui/sap/its/webgui` roda no **mesmo ICM da porta 8000** que o ADT já usa e com a
**mesma credencial Basic** — não há setup adicional. Mas ele é um nó da SICF como outro qualquer, e
**num sistema de cliente ele costuma estar desativado**: lá o canal simplesmente não existe. A
pergunta se responde com um GET, antes de qualquer navegador:

```js
import { sondarWebgui } from 'adt-client/webgui';

const s = await sondarWebgui(cfg);
// { ok: true, causa: 'ok', status: 200, sid: 'S4H', mandante: '250', cookieSeguro: true, ms: 731 }
if (!s.ok) throw new Error(`WebGUI indisponível: ${s.motivo}`);
```

### ⚠ O status sozinho MENTE — e mente para o lado perigoso

Medido no s4h 758/250 em 04/09/2026, com usuário INEXISTENTE e sem credencial nenhuma: o nó
responde **200 OK** com 23 KB da **página de logon** (`<title>Logon</title>`, cookie
`sap-login-XSRF_S4H`). Não é 401, não vem `WWW-Authenticate` — é o mesmo formulário que o
`autorizacao()` já documenta (por isso a credencial vai por header em toda requisição). Uma sonda
que olhasse `res.status` diria "canal ok" e o Chrome subiria para encalhar numa tela de logon.

**Quem prova o canal é o COOKIE:** só o logon aceito devolve `SAP_SESSIONID_<SID>_<MANDANTE>`.

| caso                          | o que volta (s4h 758/250, 04/09/2026)                            |
|-------------------------------|------------------------------------------------------------------|
| nó ativo, credencial aceita   | 200 + `SAP_SESSIONID_S4H_250` — 35 216 bytes em 423 ms           |
| credencial errada ou ausente  | **200** + `sap-login-XSRF_S4H`, `<title>Logon</title>` — 23 246 bytes |
| nó ausente **ou** desativado  | 404 `Service cannot be reached` — 9 314 bytes, ~60 ms            |
| ICM fora do ar                | nenhuma resposta HTTP: `ENOTFOUND`, ou timeout                   |

Ainda medidos no mesmo varrimento (209 paths ICF do s4h), cada um com causa própria na sonda:
403 `Forbidden - SSL required` (nó que só atende HTTPS, ex. `/sap/bc/ui2/start_up`), 401
`Logon failed` (nó que DESAFIA em vez de mostrar formulário, ex. `/sap/bc/srt/lsc`), 500
`Application Server Error` (ex. os `/sap/bc/webdynpro/sap/*`).

### ⚠ O 404 não é veredito de estado — e uma das causas é nó ATIVO

O ICF não separa as causas do 404, de propósito. Medido: o path inventado
`/sap/bc/gui/sap/its/webgui_jbv_naoexiste` e o nó `/sap/bc/gui/sap/its/test` — que **existe na
`ICFSERVICE`**, irmão do `webgui` sob o mesmo pai (`BO11PUMK7J2UU0LPKQWG0KGS7`) — devolvem a mesma
página de 9 314 bytes.

**O que estava escrito aqui como "ausente OU desativado" estava incompleto.** Medido no s4h 758/250
em 04/09/2026 (fila `adt-client` item 27): o `test` está **ATIVO**, e o 404 dele não tem nada a ver
com ativação — ele **não tem handler**. São três causas para o mesmo 404:

| causa do 404 | como se reconhece (só pelo ABAP) | exemplo medido |
|---|---|---|
| nó **ausente** | `is_service_active` levanta `INVALID_URL` (subrc 1) | `/sap/bc/gui/sap/its/webgui_jbv_naoexiste` |
| nó **ativo, sem handler** (nó de pasta) | `active = 'X'` e **zero linhas** na `ICFHANDLER` | `/sap/bc/gui/sap/its/test` (5 filhos, nenhum handler); também `/sap`, `/sap/bc`, `/sap/public` |
| nó **desativado** | `active = ''` (espaço) | *ainda não provado contra o HTTP* — ver o aberto abaixo |

O `webgui`, ao lado, tem `ICFHANDLER` com `CL_HTTP_EXT_ITS_2` — é essa linha, e não a ativação, que
separa o 200 do 404 entre os dois irmãos.

### Ler o estado do nó DO SISTEMA: `cl_icf_tree=>is_service_active`

O estado não está em tabela nenhuma que dê para `dataPreview`: a `ICFSERVICE.ICF_NOACT` está vazia
nas 17 474 linhas do s4h, a `ICF_SERV_STAT` tem 0 linhas, a `ICFINSTACT` só guarda as 241 ativações
*de instalação* (por serviço SAP, com `PATH` legível), e `ICFACTIVE` não existe como tabela neste
release. O estado se pergunta ao ABAP, por classrun:

```abap
DATA lv_ativo TYPE icfactive.
CALL METHOD cl_icf_tree=>is_service_active   " ESTÁTICO, exceções clássicas
  EXPORTING url                    = `/sap/bc/gui/sap/its/webgui`  " ou nodeguid = <ICFNODGUID>
  RECEIVING active                 = lv_ativo
  EXCEPTIONS invalid_url            = 1
             empty_url_and_nodeguid = 2
             internal_error         = 3
             OTHERS                 = 4.
```

Segundo caminho, independente e concordante em todos os casos medidos (útil como contra-prova):
`NEW /iwfnd/cl_icf_access( )->is_service_active_by_url( iv_url = … )` — método de **instância**,
exceção de classe `/IWFND/CX_COS_ICF`.

**Contrafactual medido** (sem ele o `X` não valeria nada): o método não devolve `X` para tudo —
URL inexistente levanta `INVALID_URL`, e o nó `public` do virtual host `ZLHSGW_VOOS` volta com
`active` vazio. Cuidado com o `nodeguid`: ele lê o nó EXATO, inclusive de **outro virtual host**;
a forma por `url` resolve no host padrão. Foi essa diferença que fez o `/sap/public` parecer
inativo numa varredura por guid e ativo por URL — são dois nós homônimos, em hosts diferentes
(`ICFVIRHOST` no s4h: `DEFAULT_HOST`, `SAPCONNECT`, `ZLHSGW_VOOS`).

*Aberto:* que um nó **desativado** responda 404 continua sem prova direta — no s4h nenhum nó inativo
é endereçável pelo host padrão, e a prova exige desativar de propósito um nó que hoje responde 200
(alvo escolhido: `/sap/bc/gui/sap/its/ewm_mobgui`), medir e reativar. Fila `adt-client`, item 51.

### ⚠ Quem sonda FECHA

O GET bem-sucedido **não é leitura inócua**: ele abre uma sessão de diálogo no servidor — é
justamente o `SAP_SESSIONID` que prova o sucesso. A aritmética é exata (s4h 758/250, 04/09/2026):
**1 GET = 1 sessão, 1 logoff = −1 sessão** (10 GETs levaram 4 → 14; 10 logoffs, 14 → 4). O
`sondarWebgui` faz o logoff sempre que houve cookie, pelo `encerrarSessao` do transporte — a mesma
regra do `probe`.

**O que acontece quando não se fecha (item 28, causa isolada por rampa):** com ~150 sessões do mesmo
usuário — 144 ainda passavam, 154 já não — **todo o canal stateful cai de uma vez**, com o
`400 Service nicht erreichbar` que a varredura de ~120 GETs de 04/09/2026 tinha produzido. E o que
cai **não é o nó do ADT**: é a sessão. Passado o teto, o logon ainda responde 200 com token CSRF,
mas o cookie vem **sem `SAP_SESSIONID`**, e daí **qualquer** requisição que leve aquele cookie
responde 400 — medido inclusive em `/sap/public/ping`, que na mesma janela respondia 200 chamado só
com Basic. Ver `sessaoNasceuMorta` em `sap-connection.mjs`.

| requisição, na MESMA janela | resultado |
|---|---|
| `/sap/public/ping` só com `Authorization: Basic` | **200** |
| `/sap/public/ping` com o cookie da sessão | **400** Service nicht erreichbar |
| `/sap/bc/adt/core/discovery` só com Basic | **200** |
| `/sap/bc/adt/core/discovery` com o cookie | **400** Service nicht erreichbar |
| Basic **+** cookie | **400** — o cookie vence |

**O logoff é preventivo, não curativo.** No estado doente o próprio logoff responde 400 e a sessão
**fica** na `TH_USER_LIST` (24/50 antes, 24/50 depois) — então cada retry soma mais uma sessão que
não sai, e insistir aprofunda o buraco. Fechar as 150 depois de estourar **não** devolveu o canal:
os logoffs saíram 11 s após a quebra e o stateful só voltou **26 min depois** (19:52:30 quebrou,
19:52:41 as 150 fecharam, 20:18:07 o cookie voltou com `SAP_SESSIONID`). Quem devolve é o tempo
(`http/security_session_timeout`, 1800 s no s4h). Por isso o `deployAndRun` e qualquer laço de
retry precisam parar quando o logon vier sem `SAP_SESSIONID`.

⚠ **A contagem de sessões não é o medidor de "já passou".** O canal voltou com **30** sessões minhas
na `TH_USER_LIST` — mais do que durante os 15 min em que esteve quebrado. A lista explica *como* se
chega lá (1 GET = 1 sessão); o que diz se já passou é o cookie (`sessaoNasceuMorta`). Que recurso
esgota de fato, e se o teto é por usuário ou global, é a fila `adt-client`, item 53.

**Como contar sessões quando o ADT é o suspeito:** por SOAP RFC, que não usa cookie —
`callFunction(cfg, 'TH_USER_LIST', { USRLIST: [] })` e `xmlItems(xml, 'USRLIST')` devolvem a SM04
(TID, BNAME, TCODE, TERM, ZEIT, TYPE, STAT, HOSTADDR). A tabela **tem que ir vazia no envelope**,
senão volta com zero linhas e sem erro (ver `canal-soap-rfc.md`). Medição completa em
`sap-accelerate/work/POC_sessoes_icf/medicoes/item28-sessoes-e-o-400-do-adt.md`.

De quebra a sonda devolve `cookieSeguro`, que é o que decide a bandeira `--unsafely-treat-insecure-origin-as-secure`
do Chrome (ver *Cookie `secure` sobre HTTP puro*): no s4h vem `true`, no SXD 816/100 vem `false`.

**Desde a fila adt-client 14 (2026-09-04) o `probe(cfg)` já faz esta sonda**, em paralelo com o
discovery e o eco: o resumo traz `webgui: { ok, causa, cookieSeguro }`, e o registro do landscape
(`canais.json`, `node scripts/canais.mjs`) mostra a coluna WebGUI como `✅ 🔒` (cookie `secure`),
`✅`, `❌` com o motivo da sonda, ou `—` para medição anterior à sonda. Não precisa chamar
`sondarWebgui` à parte para decidir o canal — só quando quiser o veredito completo (status, bytes,
cookies, ms).

## A receita

```js
import {
  abrirNavegador, abrirTransacao, campos, botoes, lerTela, sids, preencher, acionar, print,
} from 'adt-client/webgui';

const cfg = { base: 'http://host:8000', client: '250', idioma: 'PT', user: 'U', pass: 's3nh4' };

const s = await abrirNavegador(cfg);           // Chrome headless + CDP + Basic + polyfill
try {
  // 1. entrar JÁ na tela certa — sem clicar caminho de menu nenhum
  await abrirTransacao(s, 'YJBV4029823', { parametros: { P_DOCNUM: 71 }, okcode: 'ONLI' });

  // 2. ler o que a tela É — o modelo que ela declara, não o innerText (§ vocabulário lsdata)
  const tela = await lerTela(s);
  // { titulo, janela:{sid,principal}, mensagem:{tipo,texto}, statusbar, campos, radios,
  //   checkboxes, botoes, grids, okcode } — cada peça com o SID e o nome do campo da URL
  console.log(tela.campos);                    // [{ campo: 'RS38M-PROGRAMM', rotulo: 'Programa', valor, maxlen, editavel }]
  console.log(tela.botoes);                    // [{ okcode: 'btn[8]', rotulo: 'Executar', tecla: 'F8' }]

  // 3. dirigir
  await preencher(s, { id: 'M0:46:::2:21' }, 'T000');
  const r = await acionar(s, 'Gravar');        // 'btn[11]', 11 ou o apelido — clica e ESPERA o ABAP
  if (!r.mudou) throw new Error('a tela não respondeu — a ação não pegou');

  const depois = await lerTela(s);
  if (depois.mensagem?.tipo === 'ERROR') throw new Error(depois.mensagem.texto);
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
await sids(s);                     // a pergunta "qual o parâmetro desta tela", respondida pela tela
// SE38 -> [{ id: 'M0:46:::2:14', title: 'Nome do programa ABAP', sid: 'wnd[0]/usr/ctxtRS38M-PROGRAMM',
//            campo: 'RS38M-PROGRAMM', rotulo: 'Programa' }]
(await lerTela(s)).campos;         // o mesmo campo com o resto: valor, maxlen, editavel
// SE38 -> [{ campo: 'RS38M-PROGRAMM', sid: 'wnd[0]/usr/ctxtRS38M-PROGRAMM', rotulo: 'Programa',
//            dica: 'Nome do programa ABAP', valor: '', maxlen: 40, editavel: true }]
```

`sids` é um recorte PURO do `lerTela` (`sidsDaTela(tela)`), só os campos de entrada visíveis e sem a
caixa de OK-code: o `campo` de cada um é o nome que `abrirTransacao(s, tcode, { parametros })` quer.
Use-o **antes** de montar a URL — é o que troca o silêncio do parâmetro errado por uma lista.

⚠ **Não leia o SID por índice fixo.** O snippet original desta seção usava `lsdata['21']` e só
funcionava para campo de entrada: medido em 04/09/2026 que o índice do SID **muda por tipo de
controle** (§ vocabulário). `lerTela` procura o SID pelo VALOR que o carrega.

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

### E se o objeto NÃO tem transação? Crie uma descartável

O WebGUI só entra numa tela por transação. Um report ou uma dynpro sem `TSTC` ficam fora do canal —
até `deployTransaction` criar uma `Y*` em `$TMP`, a tela ser dirigida por aqui e
`deleteTransaction` apagá-la no `finally`. Provado ponta a ponta no SXD 816/100 em 2026-09-03
(a J1B1N criou a NF `0000000082`): o ciclo inteiro, com as cinco regras e o que ele não resolve,
está em [receita-tran.md](receita-tran.md) § *O par `tran` + WebGUI*.

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
"Inserir código de transação") — existe em toda tela e é **invisível** (rect 0×0): não recebe gesto
nativo nenhum. Isso não impede mandar OK-code — impede mandá-lo por clique/digitação. O gesto que
funciona (`value` por JS + `Enter` despachado no próprio elemento) é o `comandar`, § "A caixa de
comando (OK-code) **pelo navegador**".

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

- **campo de entrada visível** — medido no s4h 758/250 em 04/09/2026 (fila 19,
  `sap-accelerate/work/POC_webgui_lsdata/medicoes/tela-pronta.md`): a tela de seleção do RSPARAM
  (um checkbox), a **lista ALV** dele (960 controles) e o SAP Easy Access têm **zero** `<input>`
  visível. Com `inputs > 0` na condição, texto, `[ct]` e `readyState` fechavam em 0,5 s e a espera
  rodava até o **teto de 60 s** mesmo assim — o resultado saía certo, a **64 s por chamada**.

E um sinal que engana: o **casco** da página (menu + barra, 47 `[ct]`, 3.574 chars) chega ANTES da
dynpro e já satisfaz texto e `[ct]` — só tirar a condição de input declararia pronto cedo demais.

O sinal certo (`jsTelaPronta`, puro) é **texto + contagem de `[ct]` + DYNPRO PRESENTE**: algum
controle cujo SID mora em `wnd[n]/usr/…` ou `wnd[n]/tbar[1]/…` (`RE_SID_DA_DYNPRO`). O casco tem
só `tbar[0]` e `wnd[0]`, zero dos dois. Medido com a lib depois da troca, mesma sessão:

| tela | antes | depois | o que `lerTela` leu |
|---|---|---|---|
| SA38 → seleção do RSPARAM (`DYNP_OKCODE=STRT`) | 64,2 s | **2,5 s** | 1 checkbox, 0 campos, 4 botões |
| SAP Easy Access (sem `~transaction`) | — | 3,6 s | 13 botões |
| SE16 tela de seleção da T000 | 8,2 s | 3,5 s | 34 campos |
| SE38 inicial | 2,5 s | 10,3 s (1ª navegação da sessão; input e SID fecham juntos) | 1 campo |

`minimoCampos` continua como **piso opcional** (`>=`; default 0 = não exige) para quem quer
esperar uma tela específica com N campos.

## ⚠ Clicar de verdade

Mouse e teclado **nativos** (`Input.dispatch*`), nunca `.value =` ou `.click()`: o Unified Renderer
escuta o evento nativo, e um value setado na marra **não chega ao programa ABAP**. (A exceção
medida é o campo de OK-code, que é 0×0 e por isso não recebe gesto nativo nenhum — § "A caixa de
comando (OK-code) **pelo navegador**".)
Três medições que fazem o clique cair no vazio, todas resolvidas dentro de `apontar`/`clique`:

1. **`scrollIntoView` é assíncrono** — ler o `getBoundingClientRect` no mesmo tick devolve o rect
   ANTIGO (medido: rect em y=873, clique enviado para y=452). Rola, espera, relê.
2. **O container `::btn[n]` não é o botão** — ele engloba texto oculto e o centro dele cai fora
   (medido: o clique foi parar no grid de itens). O rect certo é o do filho **`-cnt`**.
3. **Falta o gesto inteiro** — `mousePressed`+`mouseReleased` sem `buttons` e sem um `mouseMoved`
   antes não aciona o renderer.

`apontar` ainda devolve `coberto` (por `elementFromPoint`): alvo coberto é clique perdido.

E **`mudou: false` é informação**: `acionar` compara o carimbo da tela antes e depois; tela idêntica
significa que a ação não pegou, e é assim que `btn[15]`/`btn[12]` se denunciam neste canal.

## A caixa de comando (OK-code) **pelo navegador**

**Medido no s4h 758/250 em 2026-09-04** (fila `adt-client`, item 13). O canal do navegador também
navega por OK-code — a mesma navegação genérica que a via HTTP pura tem (§ abaixo), sem depender de
achar botão na tela.

```js
import { abrirNavegador, ir, urlWebgui, comandar, lerTela } from './webgui.mjs';

const s = await abrirNavegador(cfg);
await ir(s, urlWebgui(cfg));                 // SAP Easy Access
await comandar(s, '/nSE16');                 // → Data Browser: 1ª tela   (1,8 s)
await comandar(s, '/3');                     // → SAP Easy Access         (1,6 s)  F3
await comandar(s, '/nSE38');                 // → Editor ABAP: 1ª tela    (1,6 s)
await comandar(s, '/n');                     // → SAP Easy Access         (1,6 s)
```

⚠ O `/n` da última linha só devolve o menu porque **esta** sessão nasceu no menu (`ir(s, urlWebgui(cfg))`)
— numa sessão aberta com `~transaction` ele cai no `S000`/`SAPMSYST`. A regra medida está em
§ "⚠ `/n` NÃO é 'ir ao menu'".

**O gesto é a exceção da regra do clique.** O campo (`ToolbarOkCode`, SID `wnd[0]/tbar[0]/okcd`)
existe em toda tela e é **invisível** — `rect` 0×0, `display: flex`. Por isso:

* `click`/`fill` do Playwright o **recusam** por *actionability*;
* a digitação **nativa** (`Input.insertText`) não cai nele — medido no SXD em 2026-09-03: o texto
  foi parar no campo da tela que tinha o cursor.

O que funciona é o contrário do § "Clicar de verdade": escrever o `value` **por JS** e despachar o
`Enter` **no próprio elemento** (`dispatchEvent` não passa por actionability). Não é gambiarra de
DOM — é o gesto que o próprio renderer declara no `lsevents` do campo:

```
"Enter":[{},{"1":"vkey/0/ses[0]","2":true}]
```

e o handler dele, no `webgui_min.js`, chama `submitOkCode`, que monta **o mesmo batch da via HTTP**:

```json
[{"post":"okcode/ses[0]","content":"/nSE16"},{"post":"vkey/0/ses[0]"},{"get":"state/ur"}]
```

*(gravado no navegador com um hook em `XMLHttpRequest.prototype.send`.)*

**Contra-prova:** escrever o `value` e **não** despachar o `Enter` não navega — tela idêntica,
zero POST. É o `Enter` que dispara, não o texto.

Duas outras vias medidas na mesma bancada, ambas dispensáveis: `sap.its.enqueueEvent({sEvName:'Enter',
oItsParams:{…code:'vkey/0/ses[0]',submit:true,type:'GuiOKCodeField'}, oUrParams:{Id:'ToolbarOkCode'}})`
**funciona** (mesmo batch, `/nSE38` chegou no Editor ABAP) mas depende da forma interna do evento; e
`sap.g4h.$`, onde mora o `submitOkCode`, **não está exposto** (`sap.g4h` publica só `openMenu`,
`doWguMenuSelect`, `openWindow`…). O gesto do `Enter` é o mais estável dos três.

### O OK-code **leva** o que foi digitado — o que faltava era o `blur` (item 31)

**Medido no s4h 758/250 em 2026-09-04**, cada cenário em sessão nova, com o batch lido do CDP
(`Network.requestWillBeSent`, não hook no XHR — ver a armadilha abaixo). Alvo: tela de seleção da
SE16 sobre a **T000**, filtro `MTEXT = 'Neduca'` — 1 das 5 linhas, então a contagem do título separa
os três desfechos sem ambiguidade.

| gesto | tela | veredito |
|---|---|---|
| `comandar('ONLI')` **sem valor** | `T000 5 acertos` | executou, sem filtro (contrafactual do valor) |
| `preencher` + `comandar('ONLI')` | `T000 5 acertos` | executou e **o valor se perdeu** ← o limite antigo |
| `preencher` + **`blur`** + `comandar('ONLI')` | `T000 **1 acertos**` | **executou COM o valor** |
| `preencher` + `blur` + Enter, **sem OK-code** | `tela de seleção` | não executou (contrafactual do fcode) |
| `preencher` + `acionar('btn[8]')` | `T000 1 acertos` | controle positivo — o caminho já conhecido |

No caso que funciona, `value/…txtI1-LOW` e `okcode/ses[0]` saem **no mesmo POST**.

**A causa, no fonte do renderer.** Quem publica o valor é o `Change` do controle —
`addBatch({post: "value/" + SID, content: …})` — e o `submitOkCode` enfileira na **mesma fila**:

```js
this.submitOkCode = function (m) {
  v.add({ post: "okcode/ses[0]", content: m });   // v.add === addBatch
  v.add({ post: "vkey/0/ses[0]" });
  v.add({ get: "state/ur" });
  this.sendWithPromise();
};
```

Nunca houve caminho curto que descartasse a tela: faltava o valor **entrar na fila**.
`Input.insertText` (o gesto do `preencher`) mexe no DOM e **não** dispara o `Change`; o `blur`
dispara. Bisseção: um `change` sintético **sem** `blur` não basta — o `blur` sozinho basta.

> Regra prática: **`comandar` navega E aciona com os valores da tela.** `preencher` + `comandar`
> já funciona sozinho: `comandar` publica o campo em foco antes de mandar o OK-code. Com vários
> campos isso já acontece por conta — o clique no campo seguinte tira o foco do anterior, e só o
> último fica para o `comandar`. `comandar(s, ok, { publicarValores: false })` volta ao gesto cru.

⚠️ **Duas armadilhas de MEDIÇÃO, pagas nesta rodada** (valem para qualquer medida neste canal):

1. **Hook no `XMLHttpRequest` não vê todo o tráfego.** Um cenário chegou a mandar `T000` ao
   servidor com **zero** `value/` capturado pelo hook — a conclusão que sairia dali seria falsa.
   O que vê tudo é o CDP: `sessao.eventos` filtrado por `Network.requestWillBeSent` com `postData`.
2. **"Ficou na mesma tela" não é "não executou".** Com um filtro que não casa (`MTEXT='250'`), o
   caminho que sabidamente leva valores (o **botão**) devolve a MESMA tela e a mesma statusbar
   ("Não foi encontrada nenhuma entrada em tabela para chave indicada") do caminho em teste — e
   `preencher` + `comandar` pareceu falhar quando na verdade tinha funcionado. Sem o controle
   positivo e sem um valor de filtro que EXISTE, o assert não distingue as hipóteses.

### ⚠ OK-code que abre popup trava a `wnd[0]`

`/15` (Shift+F3) no menu abre a pergunta de logoff: `sap.its.getPopupCount()` vira `1` e a partir
daí o `okcd` de `wnd[0]` **não responde mais** — o `/nSE16` seguinte não postou nada e a tela ficou
parada 20 s. Bisseção: a mesma sequência **sem** o `/15` (`/nSE16` → `/3` → `/nSE38` → `/n`) anda
inteira. Dirigir popup é `wnd[1]` (fila `adt-client`, item 23).

**Vocabulário** (o mesmo da via HTTP, § "A caixa de comando (OK-code)"): `/nXXXX` de qualquer tela,
`/n` volta ao menu, `/3` e `/8` valem como F3 e F8, o `fcode` da dynpro entra cru (`ONLI`), `/o`
abre a lista de modos em popup e `/nex` encerra a sessão.

## Playwright — instrumento de bancada, nunca dependência

**Medido no SXD 816/100 em 2026-09-03.** A hipótese era que o Playwright acionasse onde o CDP cru
não aciona — ele não dispara `Input.dispatchMouseEvent` na marra: tem snapshot de acessibilidade,
espera de *actionability* e clique por referência. **Não acionou.** Mesmo alvo, mesma tela, mesma
inércia do CDP cru; o que destrava é o polyfill de `crypto.randomUUID` (§ acima). Daí a decisão da
lib: **CDP cru, zero dependência nova** — o Chrome que já está na máquina e o `WebSocket` do Node.

Onde ele ganha é na bancada, quando o canal está mudo e a pergunta é *por quê*. Liga por uma
sessão, mede, desliga:

* **o que sai na rede** — `pagina.on('request', r => r.postData())` mostra o corpo do POST do ITS
  sem escrever parser nenhum, e `pagina.on('pageerror')` entrega os erros de boot em uma linha
  (foi assim que os quatro erros em cascata apareceram);
* **quem tem listener** — `DOMDebugger.getEventListeners` sobre o `objectId` de um
  `Runtime.evaluate`; isto é CDP e o cru já faz, foi o que provou "0 listener, 0 POST";
* **actionability** — se o Playwright recusa o clique, o alvo está coberto ou fora da tela: o
  problema é de apontamento, não de protocolo.

Dois equivalentes, para traduzir receita de um lado para o outro:

| CDP cru (a lib) | Playwright (bancada) |
|---|---|
| `Page.addScriptToEvaluateOnNewDocument` | `contexto.addInitScript` |
| `Network.setExtraHTTPHeaders` | `newContext({ extraHTTPHeaders })` — **nunca** `httpCredentials`, que não autentica no ICF (§ "O que este canal NÃO faz") |

## O MENU da barra — chegar numa tela por CAMINHO, sem saber o tcode

**Medido no s4h 758/250 em 2026-09-04** (fila `adt-client`, item 26). Bruto, agregado e prova em
`sap-accelerate/work/POC_webgui_menu/`; a leitura em `medicoes/item26-menu.md`.

```js
import { abrirMenu, navegarMenu, itensDeMenu } from './webgui.mjs';

const menus = await abrirMenu(s);                         // Programa | Processar | … | Sistema | Ajuda
const sob  = await navegarMenu(s, 'Sistema > Serviços', { acionar: false });   // só DESCOBRE
sob.filhos.map((i) => i.rotulo);                          // Reporting | QuickViewer | Batch input | …

const r = await navegarMenu(s, 'Sistema > Serviços > Reporting');
r.mudou;   // true — partiu da SE38 e chegou na SA38, sem o script saber o tcode
```

### O menu NÃO existe no DOM antes de ser aberto

Nenhum despejo de tela traz a barra de menu: quem a materializa é o botão `cua2sapmenu_btn` (SID
`wnd[0]/tbar[0]/[0]`). ⚠ O `lsdata[14]` dele nomeia o popup (`mnu0_63`, `mnu0_494`) e **muda a cada
render** — não serve de âncora. Estáveis são o id do botão e o SID `wnd[0]/mbar`.

Aberto, o menu é o modelo mais legível deste canal: **o `id` de cada item É o caminho**, igual ao
SID do SAP GUI.

```
wnd[0]/mbar/menu[5]                    Sistema
wnd[0]/mbar/menu[5]/menu[3]            Sistema > Serviços
wnd[0]/mbar/menu[5]/menu[3]/menu[0]    Sistema > Serviços > Reporting
```

### O vocabulário `lsdata` do `POMNI` — 121 itens, sete índices, nenhum sobrando

| índice | o que é | cobertura |
|---|---|---|
| `1` | o rótulo | 121/121 |
| `4` | `true` = há uma **linha separadora logo acima** (início de grupo) — provado por posição `y` | 14 |
| `6` | `true` = tem submenu | 26 |
| `7` | o id do popup filho — **volátil** | 26 |
| `15` | o atalho (`F5`, `CTRL_F3`, `ESCAPE`) | 29 |
| `18` | `{ SID, Type: 'GuiMenu' }`; o SID é **igual** ao `id` do DOM | 121/121 |
| `19` | o rótulo de novo — igual ao `1` | 121/121 |

`lsdata[6] === true` ⟺ existe `lsdata[7]` ⟺ `aria-haspopup="true"`, 1:1 nos 121.

### ⚠ Cinco armadilhas, todas silenciosas

Nenhuma dá erro — cada uma devolve "não tem esse item" ou "zero filhos", que é indistinguível de
"esse caminho não existe".

1. **Há DOIS menus `POMNI` na tela, com um rótulo em comum.** O da barra (`wnd[0]/mbar/…`) e o de
   informação do sistema (`sysInfoAreaMenuItem*`), que tem um item chamado **"Sistema"** — igual ao
   `wnd[0]/mbar/menu[5]`. Casar por rótulo solto pega o errado, clica, e reporta `mudou: false`.
   O escopo é o **id** (`daBarraDeMenu` + `filhoDiretoDeMenu`), nunca o rótulo.
2. **O botão Menu é TOGGLE** (`lsdata[25]`): com o menu já aberto, o clique **fecha**. Abrir é
   fechar antes, sabendo o estado — é o que `abrirMenu` faz.
3. **`Escape` NÃO fecha o menu: cancela a TRANSAÇÃO.** O próprio menu denuncia — o item "Cancelar"
   carrega `lsdata[15] = "ESCAPE"`. Usar Escape para "limpar o menu" tira a sessão da transação e
   o passo seguinte falha com "não está na tela".
4. **A abertura do submenu não é síncrona.** Com espera fixa de 900 ms, "Serviços" devolvia 0
   filhos ora sim ora não. Esperar o **filho aparecer**, nunca um tempo.
5. **O percurso é CASCATA.** Abrir um irmão fecha o submenu anterior — não dá para varrer um nível
   inteiro e só depois descer.

### ⚠ O índice `menu[n]` muda por tela — só o rótulo é estável

Medido: "Sistema" é `wnd[0]/mbar/menu[5]` na SE38 e `wnd[0]/mbar/menu[4]` na SA38. Guardar o id de
um item para reusar em outra tela é errado; endereçar por rótulo (o que `navegarMenu` faz) é o
certo. Caminho que não existe **lança** com a lista do que existe naquele nó — não falha calado.

### Quando usar isto, e quando não

`navegarMenu` **não substitui** `comandar(s, '/nSE16')` — o OK-code é mais barato e mais direto
quando o tcode é conhecido (§ "A caixa de comando"). O menu dá três coisas que nada mais dá neste
canal:

1. **descobrir** o que uma tela oferece, sem saber nada dela (`{ acionar: false }`);
2. chegar a uma função que **não tem transação própria** — só existe como item de menu;
3. reproduzir o caminho **como o usuário funcional o descreve** ("Sistema > Serviços > Reporting").

### O que **ainda não** está medido

- **Item de menu desabilitado nunca apareceu.** `aria-disabled` veio `"false"` em 20 dos 121 e
  **ausente** nos outros 101 — nenhum `"true"`. Por isso `interpretarItemDeMenu` devolve
  `habilitado: null` para "a tela não disse": `null` **não** é "habilitado" (fila item 48).
- **O menu não tem comando derivado para a via HTTP pura** (§ "O protocolo do ITS"). O `POMNI` não
  publica `lsevents` (null em 121/121); quem publica o `Select` é o `POMN` pai —
  `{"1":"action/4","2":true}`, e `action/4` está na lista dos ainda não postados (fila item 49).
- **A árvore do SAP Easy Access (`TV` + `MG`)** — o menu de *usuário*, com `DoubleClick: action/74`
  — não foi tocada (fila item 50).

## O vocabulário `lsdata` — a tela é um MODELO, não pixel

**Medido no s4h 758/250 em 2026-09-04** (fila `adt-client`, item 9). Bruto, agregado e prova em
`sap-accelerate/work/POC_webgui_lsdata/` — 7 telas (menu, SE38, SE16, SE11, SM30, tela de seleção do
RSPARAM e a lista ALV do RSPARAM), **49 `ct` distintos, 37 com `lsdata`**.

Todo controle do Unified Renderer carrega três atributos que **descrevem a dynpro**:

| atributo | o que é | exemplo medido |
|---|---|---|
| `ct` | o tipo do controle | `CBS` campo · `B` botão · `R_standards` radio · `C_standards` checkbox · `STCS` grid ALV · `MB` barra de mensagem · `L` rótulo · `PL`/`PAGE` janela |
| `lsdata` | JSON de índices numéricos: rótulo, tooltip, tecla, SID, flags | `{"0":"Executar","4":"Executar (F8)","17":"E","18":"F8","27":{"SID":"wnd[0]/tbar[1]/btn[8]","Type":"GuiButton"}}` |
| `lsevents` | os eventos que ele publica | `{"Press":[{},{"1":"action/3"}]}` · no campo: `{"ActionItemActivate":[{},{"1":"vkey/0/ses[0]"}]}` — é daí que saiu o disparo do OK-code (item 13) |

### ⚠ O índice do SID MUDA por tipo de controle

Esta é a armadilha da leitura por `lsdata`, e ela falha **calada** (devolve `undefined`, não erro):

| `ct` | `Type` do SID | índice | SID medido |
|---|---|---|---|
| `PL` / `PAGE` | `GuiMainWindow` | `1` | `wnd[0]` |
| `MB` | `MESSAGEBAR` | `11` | `wnd[0]/sbar_msg` |
| `G` | `GuiBox` | `12` | `wnd[0]/usr/boxMS38M0100_03` |
| `R_standards` | `GuiRadioButton` | `13` | `wnd[0]/usr/radRS38M-FUNC_EDIT` |
| `C_standards` | `GuiCheckBox` | `14` | `wnd[0]/usr/chkALSOUSUB` |
| `L` | `GuiLabel` | `19` | `wnd[0]/usr/lblRS38M-PROGRAMM` |
| `CBS` | `GuiCTextField` / `GuiOKCodeField` | `21` | `wnd[0]/usr/ctxtRS38M-PROGRAMM` · `wnd[0]/tbar[0]/okcd` |
| `B` | `GuiButton` | `27` | `wnd[0]/tbar[1]/btn[8]` |
| `STCS` | `GuiGridView` | `34` | `wnd[0]/usr/cntlGRID1/shellcont/shell` |

Por isso `sidDoLsdata()` varre os **valores** atrás do que tem `.SID` — endereçar por conteúdo, não
por posição. Vale para o resto também: a tecla do botão é o valor com forma `F8`/`CTRL_F2`, e o
rótulo do campo é o `L` cujo `lsdata` guarda **o id do campo** (em índice que também varia).

### ⚠ `lsdata` é o estado que o SERVIDOR mandou — não o que está na tela agora

Medido: clicar no checkbox `chkALSOUSUB` da tela de seleção do RSPARAM **não mexeu um byte** do
`lsdata`. O que virou foi `aria-checked` (`false` → `true`) e a classe (`lsCheckBox--unchecked` →
`--checked`). Logo: **identidade, rótulo, tecla e SID saem do `lsdata`; marcação de radio/checkbox
sai do ARIA.** Ler marcação pelo `lsdata` devolve o estado do último render do servidor — que numa
tela que o script acabou de mexer é a resposta errada, e plausível.

### O que cada peça entrega

```js
const t = await lerTela(s);
t.janela      // { sid: 'wnd[0]', principal: true }   ← principal:false é POPUP (wnd[1])
t.mensagem    // { tipo: 'ERROR', texto: 'O programa ZZNAOEXISTE9 não existe' } | null
t.campos      // [{ id, sid, campo, rotulo, dica, valor, maxlen, editavel, visivel }]
t.radios      // [{ campo, grupo: '%RBG0257', rotulo, selecionado }]
t.checkboxes  // [{ campo, rotulo, marcado }]
t.botoes      // [{ okcode: 'btn[8]', rotulo: 'Executar', tecla: 'F8', accesskey: 'E' }]
t.grids       // [{ sid, colunas: ['NAME','USER_VALUE',…], linhas: 1617, editavel: false }] — as LINHAS saem do `lerGrid` (§ "O ALV")
t.okcode      // { sid: 'wnd[0]/tbar[0]/okcd' } — sempre invisível, sempre lá
```

Três ganhos que o filtro de DOM anterior não dava, todos medidos:

1. **A mensagem vem TIPADA.** Sem mensagem o `lsdata` da `MB` é `{"1":"TEXT","3":"NONE"}` e o
   elemento está invisível; com mensagem entram o texto e a constante do tipo — `ERROR`,
   `"O programa ZZNAOEXISTE9 não existe"`. ⚠ o `messageType` de dentro do SID vem **traduzido**
   (`"Erro"`); a chave estável é a constante. Isso troca "achar a classe CSS da barra" por
   `if (tela.mensagem?.tipo === 'ERROR')`.
2. **O rótulo da TELA, não o do data element.** O `title` do campo da SE38 é
   `"Nome do programa ABAP"` (vem do data element); o rótulo na tela é `"Programa"`, e quem o tem é
   o `L` ao lado. `lerTela` costura os dois — `rotulo` e `dica` são campos diferentes de propósito.
3. **A lista ALV se descreve**: `ColumnIDs` e `totalRows` (`1617` no RSPARAM) saem do `lsdata` do
   `STCS`, sem varrer célula nenhuma.

⚠ Dois detalhes do rótulo de botão, os dois produzindo lixo se ignorados: o `innerText` traz texto
oculto do tema colado por `\n` (`btn[8]` → `"Executar\n Destacado"`), e botão da `tbar[0]` **não tem
texto** — cair no primeiro valor string do `lsdata` devolve a constante de design
(`btn[3]` → `"TRANSPARENT"`, não `"Voltar"`). O tooltip é quem sabe: `"Voltar (F3)"`.

## ⚠ Criar é mutação IMEDIATA — fechar o navegador NÃO é rollback

**Medido no SXD 816, mandante 100, em 04/09/2026** (POC 4029823, fila `adt-client` item 38). No
FLP Designer (`/sap/bc/ui5_ui5/sap/arsrvc_upb_admn/main.html?scope=CUST`), só **abrir** o
formulário "Criar atribuição de destino" — o clique em `AdminPage--createNewTM` — já **persiste**
a linha. Quatro inspeções que abriram o formulário, leram os campos e fecharam a sessão deixaram
**quatro target mappings vazios** no catálogo `YJBV_POC_4029823`, tipo de navegação "Outro"; foi
preciso um script de limpeza para tirá-los.

Evidência: `sap-accelerate/work/POC_4029823_j1b1n/medicoes/flpd-tabela-mappings.png` (as quatro
linhas), `flpd-mappings-limpos.png` (depois da limpeza), `scripts/flpd-inspecionar-mapping.mjs` (o
script que só inspecionava — e criava).

O erro não foi do FLP Designer: foi do modelo mental. `finally { await s.fechar() }` parece
rollback e **não é** — mata o Chrome, e o que o servidor gravou fica. Numa tela em que "Novo" abre
um rascunho **antes** de qualquer Gravar, o gesto que desfaz (Cancelar, Excluir) é tão obrigatório
quanto o unlock do ADT, e pela mesma razão: quem mutou tem de saber desfazer.

⚠ Dirigir a tela de um app UI5 (o Designer, um Fiori Elements) é outro endereçamento — id de
controle, não SID — e tem receita própria: [receita-fiori.md](receita-fiori.md) (`fiori.mjs`), onde
mora o `selecionar` de ComboBox/Select. A sessão de navegador é a mesma.

⚠ Isto **não é** exclusividade de app UI5. Vale para qualquer tela que numere/insira ao entrar —
e o canal WebGUI não avisa: statusbar e print não são assert (§ "O que este canal NÃO faz"), e
uma criação silenciosa é exatamente o que eles não mostram.

### A regra

> Antes de acionar qualquer "Novo"/"Criar", saiba **qual é o gesto que desfaz** — e arme-o no
> mesmo instante em que a criação acontece, não depois.

### `transacional` — o corpo de um formulário que cria ao abrir

```js
await transacional(s, {
  rotulo: 'target mapping do YJBV_POC_4029823',   // é o nome que sai no aviso, se sobrar
  abrir:     () => clicar(s, { id: 'AdminPage--createNewTM' }),   // ← aqui já mutou
  descartar: () => excluirMappingSelecionado(s),                  // o gesto MEDIDO que desfaz
  corpo: async ({ confirmar }) => {
    await preencher(s, { id: '__xmlview9--semantic_objectInput-inner' }, 'YJBVNotaFiscal');
    await confirmar(() => clicar(s, { id: 'AdminPage--saveTileDetailsButton' }));
  },
});
```

- `abrir` roda e **a partir dali o descarte está armado**;
- se o corpo não chamar `confirmar`, o `descartar` roda no `finally` — inclusive quando o corpo
  estoura, e **sem mascarar o erro original** (ele propaga);
- `confirmar(fn)` só dá a criação por boa se `fn` **resolver**: Gravar que estoura deixa o descarte
  armado. ⚠ `confirmar` **não é assert** — que a linha ficou gravada se prova lendo em outra LUW,
  como tudo neste canal;
- sem `{ descartar }` a chamada é **recusada antes de abrir** qualquer coisa. É de propósito: um
  script de inspeção que "só olha" foi exatamente o que produziu as quatro linhas.

### `sessao.desfazer` — a rede embaixo, para o que `transacional` não cobre

Toda sessão de `abrirNavegador` nasce com uma pilha LIFO. O `fechar` a executa **com o navegador
ainda vivo** — descartar é um clique, precisa da página de pé — e só então mata o Chrome:

```js
s.desfazer.registrar('catálogo YJBV_POC_4029823', () => excluirCatalogo(s));
// …
const { desfeito } = await s.fechar();   // [{ rotulo, ok, erro? }], em ordem inversa da criação
```

Uma ação que estoura **não impede as demais**, e o que não saiu vira **aviso em stderr com o
rótulo**, mesmo com o log desligado (`⚠ webgui: NÃO consegui desfazer "…" — sobrou no sistema`) —
lixo num sistema alheio não pode depender de alguém ter lembrado do `--debug`. Se o descarte do
`transacional` falhar, a ação **fica** na pilha: o `fechar` tenta de novo.

**Medido no s4h 758/250 em 05/09/2026** (`medicoes/item38-desfazer.txt`), sobre a SE16 aberta pelo
canal: não confirmado → marcador some; confirmado → marcador fica; pendente do `fechar` → rodou e
a página **respondeu** (prova de que o Chrome ainda estava vivo); descarte que falha → `ok:false`
no relatório e o aviso em stderr. ⚠ O comportamento do FLP Designer em si não foi re-medido nessa
rodada — o SXD só responde na rede do cliente.

## O que este canal NÃO faz

1. **Botão de saída não sai — quem sai é o OK-code.** Medido no SXD: `btn[15]` (Sair, Shift+F3),
   `btn[12]` (Cancelar, Escape) e a tecla `Shift+F3` postam, o servidor responde 200 e o programa
   **reabre a mesma dynpro**; nenhum `fcode` de saída chega. Isso NÃO é mais limite do canal: a
   caixa de comando dá a saída — `comandar(s, '/3')`, `'/n'`, `'/nex'` (§ "A caixa de comando
   (OK-code) **pelo navegador**", s4h em 2026-09-04). ⚠ `/3` e `/n` **saem da transação**, e onde
   caem depende da sessão ter o menu carregado (§ "⚠ `/n` NÃO é 'ir ao menu'"); quem encerra de
   verdade é `/nex`. Fica de fora só o popup: `/15` no menu abre
   a pergunta de logoff e trava a `wnd[0]` (fila `adt-client`, item 23).
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

**Desde o item 20 (2026-09-04) isto é módulo, não só receita:** [`its.mjs`](../its.mjs) (export
`adt-client/its`), teste puro em `its.test.mjs` — ver § "O módulo `its.mjs`" no fim desta seção.
O que segue é o protocolo que ele embute.

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
| `{"post":"vkey/<n>/ses[0]"}` | **dispara a tecla** — `vkey/0` é o Enter, e é o que SUBMETE o OK-code | sim — o mapa `0/3/4/8/11/12/15` no § O teclado |
| `{"post":"okcode/ses[0]","content":"<okcode>"}` | escreve o OK-code (o `Change` do campo) — **não dispara sozinho** | sim |
| `{"post":"action/0/wnd[0]"}` | — | **não existe**: `X-Code: -101 failed to fire action: not supported` |

Os `<SID>` são os **mesmos do GUI Scripting** (`wnd[0]/usr/txtMAX_SEL`, `wnd[0]/tbar[1]/btn[8]`) —
endereço estável, não id volátil de DOM. A tela os entrega: cada `<input>` traz
`lsdata='{…"21":{"SID":"wnd[0]/usr/…"}}'` (é a mesma peça do item 18).

### De onde sai o COMANDO: o `lsevents` da própria tela (item 24)

O `<SID>` diz **onde**; o `lsevents` do mesmo elemento diz **o quê**. Cada controle publica, evento a
evento, o comando do protocolo que o aciona — e o índice `1` do segundo elemento é esse comando:

```
<input ct="CBS" lsevents='{"Enter":[{},{"1":"vkey/0/ses[0]","2":true}],
                           "Change":[{},{"1":"okcode/ses[0]"}],
                           "FieldHelpPress":[{},{"1":"vkey/4","2":true,"5":true}]}'>
<div ct="B" lsevents='{"Press":[{},{"1":"action/3","2":true,"3":true}]}'>
```

Mapa completo — 38 eventos, 19 comandos, por `ct`, agregado de 1049 controles de 7 telas do s4h
758/250 (04/09/2026): `sap-accelerate/work/POC_webgui_lsdata/medicoes/vocabulario-lsevents.md`;
a leitura, em `medicoes/item24-lsevents.md`.

⚠ **O comando não vira POST por concatenação única — a composição é por FAMÍLIA.** `action/<n>` e
`value` levam o SID (`action/3/<SID>`, `value/<SID>` + `content`); `okcode/ses[0]` e
`vkey/<n>/ses[0]` já vêm auto-endereçados. E **o `vkey/<n>` que o `lsevents` publica sem sufixo NÃO
se posta com o SID do campo**: o alvo do teclado é a sessão (`vkey/4/ses[0]`), e o campo entra pelo
`focus` anterior no mesmo batch (§ O teclado). Quem concatenar SID em tudo acerta `action/*` e
`value` e falha calado no teclado.

*Ponto aberto:* só `action/3` foi medido nessa família. `action/1`, `4`, `7`, `8`, `9`, `25`, `62`,
`74`, `309`, `810` e `901` aparecem no mapa mas **não** foram postados — a contra-prova está em
`POC_webgui_lsdata/scripts/derivar.mjs`, à espera de uma janela com o s4h no ar (fila 43). E o
`controlesDoHtml` desta lib ainda não extrai `lsevents`: por esta via a tela não entrega o mapa
(fila 44).

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

**E é por isso que o OK-code LEVA os valores desta via** (item 31, medido no s4h em 2026-09-04): o
`okcd` é campo como outro qualquer, e quem submete é o Enter — que carrega a dynpro inteira. Um
POST só, `113 ms`:

```json
[{"post":"focus/wnd[0]/usr/txtI1-LOW","logic":"ignore"},
 {"post":"value/wnd[0]/usr/txtI1-LOW","content":"Neduca"},
 {"post":"value/wnd[0]/tbar[0]/okcd","content":"ONLI"},
 {"post":"vkey/0/ses[0]"},
 {"get":"state/ur"}]
```

→ `Data Browser: Tabela T000 1 acertos` (o filtro entrou E o fcode executou). Sem o `value` do
campo, o mesmo OK-code traz a tabela inteira ("5 acertos"). Na lib: `preencher(s, …)` seguido de
`comandar(s, 'ONLI')` — o `comandar` **antes recusava** fila pendente, hoje ela vai junto.

| OK-code | O que faz | Medido |
|---|---|---|
| `/nXXXX` | vai para a transação `XXXX`, **de qualquer tela** | sim — `/nSE16` do menu; `/nSE38` de dentro de uma lista ALV |
| `/n` | **encerra a transação atual** — cai no menu (SMEN) **só se a sessão já tiver carregado o menu**; senão, na tela de sistema `S000`/`SAPMSYST` (⚠ abaixo) | sim |
| `ONLI`, `STRT`, … | o **fcode da dynpro** (o mesmo do `DYNP_OKCODE` da URL) | sim — `ONLI` executou a SE16 |
| `/8` | a **tecla** F8 — vale o `/n` de qualquer tecla de função | sim — mesma lista que o `ONLI` |
| `/o`, `/oXXXX` | abre **popup `wnd[1]`** com a lista de modos (não uma janela nova) | sim |
| `/nend` | abre **popup `wnd[1]` "Pergunta"** (Sim/Não) — a sessão continua viva | sim |
| `/nex` | **encerra a sessão**: HTTP 200 `text/html` "Adeus — o logoff foi efetuado"; o POST seguinte volta **400 Session Timed Out** | sim |

Custo por salto: **85–150 ms**. Evidência:
`sap-accelerate/work/POC_webgui_okcode/medicoes/okcode-http.md`.

### O teclado — o mapa do `vkey/<n>` (o endereço mais estável do canal)

**Medido no s4h 758/250 em 2026-09-04** (item 22; evidência em
`sap-accelerate/work/POC_webgui_vkey/medicoes/mapa-vkey.md`). O `n` do `vkey/<n>/ses[0]` é o
**mesmo número de tecla de função do SAP GUI** — e a tecla **dispensa a caixa de comando**:

```js
preencher(s, 'MAX_SEL', 2);
await tecla(s, 'F8');        // "Data Browser: Tabela T000  2 acertos" — a tecla LEVA o valor
await tecla(s, 'Voltar');    // apelido de F3
await tecla(s, 'Shift+F3');  // sai da transação num salto
await vkey(s, 21);           // a via CRUA — para MEDIR uma tecla fora do mapa
```

| tecla | `vkey` | medido (SE16 da T000) |
|---|---|---|
| Enter | `0` | submete o OK-code; avança a dynpro (item 8) |
| F3 Voltar | `3` | da lista → tela de seleção; dali → "Data Browser: 1ª tela" |
| F4 Ajuda de pesquisa | `4` | com o foco no campo, abriu **popup `wnd[1]`** de pesquisa de tabelas |
| F8 Executar | `8` | → "Data Browser: Tabela T000  5 acertos" — **igual** ao `btn[8]` e ao OK-code `/8` |
| F11 Gravar | `11` | → "Atributos variante" (`SAPLSVAR`) — o Gravar **daquela** tela |
| F12 Cancelar | `12` | da seleção → "1ª tela"; da lista → seleção |
| Shift+F3 Encerrar | `15` | da seleção → "1ª tela" **num salto** (`Shift+Fn = 12+n`) |

Por que a tecla é o endereço mais estável: não depende de `btn[n]` (que muda de barra entre
`tbar[0]` e `tbar[1]`) nem do fcode da dynpro. Quem confirma o isomorfismo com o SAP GUI é a
própria tela: todo campo com match code publica `"FieldHelpPress":[{},{"1":"vkey/4",…}]`.

⚠ **O sufixo `/ses[0]` é obrigatório.** `{"post":"vkey/8"}` cru volta `multipart` com
`X-Code -1002` / `<control-id> is expected` — não pega, e a tela não muda.

⚠ **A tecla leva o que foi preenchido; o OK-code não.** `preencher` + `tecla(s,'F8')` no mesmo POST
deu "2 acertos"; `comandar` recusa com valores pendentes (§ acima).

⚠ **`VKEYS` é o MEDIDO, não a convenção inteira.** F1, F2, F5–F7, F9, F10 e os `Ctrl+Fn` ficaram
de fora de propósito — `tecla(s,'F9')` estoura listando o que existe. Para medir um deles, use o
número cru: `vkey(s, n)`. **Não medido:** F12 × Shift+F3 não se distinguem nas telas da SE16 (nas
duas o alvo é o mesmo); a diferença apareceria num popup — item 23.

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

O **print de tela**. A leitura, desde o item 21 (2026-09-04), as duas vias têm — e é o **mesmo
modelo**: § "Ler a tela do `delta-update`" abaixo.

### Ler a tela do `delta-update` — `lerTela` sem DOM (item 21)

**Medido nos brutos do s4h 758/250 de 2026-09-04** (`POC_webgui_okcode/medicoes/raw/*`,
`POC_webgui_its_lib/medicoes/raw/*`; cruzamento em
`POC_webgui_its_lib/medicoes/lertela-xml-x-dom.md`). O `delta-update` é a **tela inteira** como
HTML dentro de `<![CDATA[…]]>`, um bloco por região — `cuaarea` (barras), `steploop0` (a dynpro),
`msgarea` (barra de mensagens), `webguiPopups` (o popup). O `its.mjs` varre esse HTML com um
scanner de tags (`controlesDoHtml`/`controlesDoDelta`) e produz **o mesmo despejo** que o
`JS_DESPEJO_CONTROLES` tira do DOM no navegador — `{ id, ct, lsdata, title, aria, accesskey, valor,
texto, visivel }` — e daí o **`montarTela` do `webgui.mjs` serve às duas vias**:

```js
import { abrirTransacao, lerTela, parametrosDaTela, fechar } from 'adt-client/its';
const s = await abrirTransacao(cfg, 'SE38');
const tela = lerTela(s);         // sem tocar a rede: lê o último delta da sessão
tela.titulo;                     // 'Editor ABAP: 1ª tela'   (+ screenId, dynpro, tcode, dnum)
tela.campos[0];                  // { sid: 'wnd[0]/usr/ctxtRS38M-PROGRAMM', campo: 'RS38M-PROGRAMM', rotulo: 'Programa', dica: 'Nome do programa ABAP', valor: '', maxlen: 40 }
tela.radios[0];                  // { campo: 'RS38M-FUNC_EDIT', rotulo: 'Texto fonte', selecionado: true, grupo: '%RBG0257' }
tela.botoes.map((b) => [b.okcode, b.rotulo, b.tecla]);   // [['btn[3]','Voltar','F3'], ['btn[8]','Executar','F8'], …]
tela.mensagem;                   // { tipo: 'OK', texto: 'Seleção restringida a 2 ocorrências' } | null
tela.popup;                      // null, ou a wnd[1] (§ abaixo)
parametrosDaTela(s);             // [{ campo: 'RS38M-PROGRAMM', rotulo: 'Programa', … }] — o ~transaction desta tela
```

**Cruzamento XML × DOM na MESMA SE38** (`c4-nse38.txt` por HTTP × `se38.json` pelo Chrome):
título, mensagem, o campo (nome, rótulo, dica, maxlen), os 16 botões (okcode, rótulo, tecla), os
5 radios (nome, rótulo, grupo) e o `okcd` saíram **iguais** pelas duas vias. A única diferença foi
`selecionado` dos radios — e é o despejo DOM daquela POC que está errado (guardou `el.checked`, que
é `false` num `<span role="radio">`; o `aria-checked="true"` do XML é o que o `RADIO_MARCADO` do
`webgui.test.mjs` já usa). 325 controles em ~40 ms.

**Três regras do texto, medidas no markup:**

| regra | por quê |
|---|---|
| nó de texto inline **cola** (`<span class="urAccessKey">P</span>rograma` = "Programa") | a letra de atalho vem em span separado; separador entre nós dá "P\nrograma" e o rótulo vira "P" |
| só tag de **bloco** quebra linha (`div`, `tr`, `p`…) | é o que o `innerText` faz — o `:` do checkbox chega em linha própria |
| subárvore **invisível** não dá texto (`lsControl--invisible` do `<xmp>` do menu, `lsControl--hidden`, `lsControl--pseudoHidden`, `display:none`) | o " Destacado" do `btn[0]` é dica de leitor de tela num `pseudoHidden` DENTRO do botão |

**O que esta via NÃO tem, e o DOM tem: layout.** `visivel` aqui é "não marcado invisível no
markup" — o `okcd` (0×0 no navegador) sai `visivel: true`. E a `wnd[0]` (`GuiMainWindow`) mora no
**shell do GET**, não no delta: sem popup, `tela.janela` é `null` por esta via.

⚠ **Com popup aberto, o delta ESVAZIA a `wnd[0]/usr`.** Medido com `/nend` e `/o`: o `steploop0`
vem `<div id="steploop0" ct="PLP"></div>`, **0** SIDs em `wnd[0]/usr` (contra 48 do mesmo menu
sem popup), e um `state/ur` posterior devolve a mesma coisa. `tela.popup` traz a `wnd[1]`:

```js
tela.popup   // { sid: 'wnd[1]', id: 'SAPLSPO1100_1', titulo: 'Efetuar logoff',
             //   textos: [{ sid: 'wnd[1]/usr/txtSPOP-TEXTLINE1', texto: 'Os dados não gravados serão perdidos.' }, …],
             //   botoes: [{ sid: 'wnd[1]/usr/btnSPOP-OPTION1', rotulo: 'Sim', accesskey: 'S' }, { …OPTION2, rotulo: 'Não' }],
             //   campos: [] }
tela.aviso   // 'popup wnd[1] aberto — a wnd[0]/usr não vem no delta enquanto ele estiver aberto'
```

⚠ Os botões do popup (`btnSPOP-OPTION1`) **não são `btn[n]`**: não entram em `tela.botoes` e
`acionar(s, 'Sim')` não os acha — o endereço é `acionar(s, { sid: tela.popup.botoes[0].sid })`.
**Responder ao popup por esta via não está medido** (item 23). O `/o` mostrou ainda que a
`wnd[1]` pode ter barra própria (`wnd[1]/tbar[0]/btn[0]` "Avançar", `btn[12]` "Cancelar") — e aí
`tela.botoes` mistura os `btn[n]` das duas janelas na ordem do documento.

### O módulo `its.mjs` — o protocolo portado para a lib

**Medido no s4h 758/250 em 2026-09-04** (fila `adt-client`, item 20; E2E em
`sap-accelerate/work/POC_webgui_its_lib/medicoes/its-lib.md`). É a **segunda via do mesmo canal**
e fala o **mesmo vocabulário** do `webgui.mjs` — trocar de via é trocar o import:

```js
import { abrirTransacao, preencher, acionar, enter, tecla, enviar, comandar, fechar, sids, campos, botoes } from 'adt-client/its';

const cfg = { base: 'http://host:8000', client: '250', idioma: 'PT', user: 'U', pass: 's3nh4' };
const s = await abrirTransacao(cfg, 'SE16', { parametros: { 'DATABROWSE-TABLENAME': 'T000' } });
try {                                          // GET + boot: 657 ms até a tela de seleção já com a T000
  campos(s);                                   // [{ sid: 'wnd[0]/usr/txtMAX_SEL', tipo: 'GuiTextField', campo: 'MAX_SEL', value: '200 ', maxlen: 11 }, …]
  botoes(s);                                   // [{ sid: 'wnd[0]/tbar[1]/btn[8]', okcode: 'btn[8]', nome: 'Executar' }, …]
  preencher(s, 'MAX_SEL', 2);                  // enfileira focus+value — NÃO posta ainda
  const r = await acionar(s, 'Executar');      // value + action/3 + state/ur num POST só (105 ms)
  if (!r.pegou) throw new Error(r.motivo);     // multipart: "-101 failed to fire action: not supported"
  r.titulo;                                    // 'Data Browser: Tabela T000          2 acertos'
  await comandar(s, '/nSE38');                 // OK-code: value/okcd + vkey/0 — de qualquer tela
} finally {
  await fechar(s);                             // /nex (75 ms); o postar seguinte estoura sem tocar a rede
}
```

**Por que módulo próprio, e não `{ via: 'http' }` no `webgui.mjs`.** A sessão é outra (jar de
cookie + `action` + `moin`, em vez de WebSocket do CDP), o endereço é outro (SID, em vez de
id/rect de DOM) e o gesto é outro (batch JSON, em vez de mouse/teclado sintético). Pôr as duas vias
na mesma função faria cada uma virar um `if` de duas pernas. O que é comum vem importado do
`webgui.mjs`: `urlWebgui`, `autorizacao`, `interpretarSonda` (a página de logon com 200 estoura no
`abrir`, com causa), `okcodeDe`/`OKCODES` (apelidos), `campoDoSid`.

**O que o módulo embute, e onde cada regra foi medida:**

| regra | onde mora | medido |
|---|---|---|
| jar de cookie obrigatório | `abrir` guarda o `set-cookie`; `postar` manda `Cookie` | item 7 (sem ele, 400 em 48 ms) |
| primeiro POST é o boot, ação nele é perdida | `abrir` boota sempre antes de devolver a sessão | item 7 |
| forma da resposta = veredito, não o HTTP 200 | `lerResposta` → `forma` (`delta`/`multipart`/`logoff`/`sem-sessao`), `pegou`, `motivo` | item 7; item 20 D4 |
| SID como endereço, tirado da própria tela | `sidsDaResposta` (regex sobre o `lsdata`), `sidDoAlvo` | item 20 (221 SIDs na seleção da SE16) |
| a barra do botão não se adivinha | `acionar(s, 'btn[8]')` casa `…/btn[8]` no fim do SID da tela; fora dela estoura com a lista | item 20 D3 |
| OK-code = `value/okcd` + `vkey/0` | `comandar` | item 8 |
| `/nex` encerra; depois é 400 | `fechar`; `postar` recusa sessão encerrada | item 8; item 20 E |

**Medição nova do item 20: o valor mandado em POST separado PERSISTE.** `preencher` + `enviar()`
(só `focus`+`value`+`state/ur`) e `acionar('btn[8]')` no POST seguinte deram "3 acertos". O batch
com a ação é otimização (um POST em vez de dois), não exigência — `enviar` é uma escrita válida.

⚠ **`comandar` recusa com valores pendentes.** O OK-code levar o que foi digitado NÃO está medido
nesta via (no navegador está medido que **não** leva — item 31). Mande os valores por
`acionar`/`enter`/`enviar` antes, ou descarte com `sessao.fila = []`.

### ⚠ `/n` NÃO é "ir ao menu" — é "encerrar a transação"

**Medido no s4h 758/250 em 05/09/2026** (item 37, onze braços, um por sessão; evidência em
`sap-accelerate/work/POC_webgui_n_menu/medicoes/item37-n-e-o-menu.md`). O item 20 tinha visto
`/n` devolver `S000`/`SAPMSYST`/"SAP" numa sessão aberta por `~transaction`, contra o SAP Easy
Access (`SMEN`, `SAPLSMTR_NAVIGATION`) do item 8 — e a hipótese era o `~transaction`. **Não é.**

O `/n` encerra a transação atual; o que aparece depois é a **tela de fundo da sessão**, e ela só é
o menu se o menu **já tiver sido carregado alguma vez naquela sessão**:

| a partir de | sessão que já carregou o menu | sessão que nunca carregou (nasceu por `~transaction`) |
|---|---|---|
| uma transação (SE38) | **SMEN**, 13 botões, 269 KB | **S000** `SAPMSYST` 0040 — 0 campos, 1 botão, 106 KB |
| o **próprio menu** | **S000** — encerra o SMEN e não há fundo abaixo | — |

O fundo se **adquire**: a mesma sessão nascida em `*SE16`, depois de um `/nSMEN`, passa a responder
`/n` com o menu. E `/3` (F3) tem o mesmo limite — da *primeira* tela de uma transação ele encerra a
transação e cai no mesmo fundo; de uma tela interna, só volta uma tela.

> **Para ir ao menu, mande `/nSMEN`** — devolveu o SAP Easy Access dos dois estados medidos (do
> S000 e de dentro da SE16), em 318–372 ms. `/n` serve para *sair da transação*; o destino é
> consequência, não garantia.

### O que **ainda não** está medido por esta via

* ~~Porte para a lib~~ **feito** (item 20): `its.mjs`. ~~`lerTela` completo~~ **feito** (item 21):
  `lerTela`/`telaDoDelta` — o mesmo modelo do navegador, lido do XML (§ "Ler a tela do
  `delta-update`"). ~~O grid sai só como cabeçalho~~ **feito** (item 25): `lerGrid` traz as LINHAS
  do ALV pelo `RequestData` (§ "O ALV: ler as LINHAS do grid"). O que fica em aberto na leitura:
  **checkbox** por esta via não foi cruzado (nenhum bruto HTTP tem um — o `chkALSOUSUB` só existe
  no despejo DOM), e no grid faltam **célula editável**, **ordenar/filtrar** e **selecionar linha**.
* ~~A saída (item 13)~~ **resolvida** por esta via: `/nex` encerra a sessão e `/n` volta ao menu
  (§ "A caixa de comando"). O obstáculo era do navegador — campo invisível —, não do canal.
* ~~O mapa do `vkey/<n>`~~ **medido** (item 22): `tecla(s, 'F8')` e o mapa `VKEYS` (§ "O teclado").
  O que fica: as teclas fora do mapa (F1, F2, F5–F7, F9, F10, `Ctrl+Fn`) e a distinção F12 ×
  Shift+F3 — `vkey(s, n)` continua no módulo para MEDIR, não para afirmar.
* Popup (`wnd[1]`) — `/o` e `/nend` abrem um, e ele **vem no mesmo `delta-update`**
  (`lerResposta` sinaliza `popup: true`; `lerTela` devolve `popup` com textos e botões por SID —
  e avisa que a `wnd[0]/usr` foi esvaziada); falta medir como responder (item 23). Table control
  (o steploop, que não é o ALV) e upload/download por esta via também não.

## O ALV: ler as LINHAS do grid, sem varrer célula

**Medido no s4h 758/250 em 2026-09-04** (fila `adt-client`, item 25; evidência em
`sap-accelerate/work/POC_webgui_grid/medicoes/item25-grid.md`). O `lsdata` do `STCS` já dava, de
graça, o CABEÇALHO do ALV — `ColumnIDs` e `totalRows` (§ "O vocabulário `lsdata`"). As LINHAS não
estão lá, e **não se leem varrendo a tela**: pede-se ao servidor, com o mesmo `RequestData` que o
Unified Renderer posta sozinho quando a rolagem passa do fim do bloco carregado.

```js
import { abrir, acionar, lerGrid, fechar } from './its.mjs';

const s = await abrir(cfg, { transacao: 'SA38', parametros: { 'RS38M-PROGRAMM': 'RSPARAM' }, okcode: 'STRT' });
await acionar(s, 'btn[8]');                       // executa: a lista ALV

const g = await lerGrid(s);                       // a tabela INTEIRA
// { id: 'C102', sid: 'wnd[0]/usr/cntlGRID1/shellcont/shell',
//   colunas: ['NAME','USER_VALUE','DEFAULT_VALUE','DEFAULT_USUBS_VALUE','DESCR'],
//   total: 1617, de: 1, ate: 1617, linhas: [ { _linha: 1, NAME: 'Autostart', … }, … ],
//   pedidos: 4, bytes: 12429053, ms: 2310, truncado: false }

await lerGrid(s, null, { de: 900, ate: 910 });    // só uma faixa (1-based, inclusiva)
await lerGrid(s, { id: 'C102' }, { lote: 1000 }); // a tela com mais de um grid: por id, sid ou índice
await fechar(s);
```

O que vai no fio é sempre o mesmo par:

```
POST …/batch/json   [{ "post": "action/710/<SID do grid>",
                       "content": "position=<n>&fragments=<de>,<ate>;" },
                     { "get": "state/ur/<SID do grid>" }]
```

### Cinco regras medidas

1. **`position` é obrigatório.** Sem ele (`fragments=900,929;` sozinho) a resposta vem
   `multipart` de 185 B e **nenhuma linha**. O `action/61` (VerticalScroll) que o renderer manda
   junto, esse é dispensável: a mesma faixa volta igual sem ele.
2. **`fragments` é 0-based; o que volta é 1-based.** Pedir `0,29` devolve as linhas 1..30 — o
   índice de cada célula é o `lsMatrixRowIndex` do `<td>`, ABSOLUTO no ALV inteiro. `lerGrid`
   recebe e devolve 1-based; o 0-based fica dentro do `batchFragmento`.
3. **O `;` não entrega faixas disjuntas.** `fragments=10,19;100,109;` devolveu 26 linhas
   CONTÍGUAS (11..36) e ignorou a segunda faixa. Uma faixa por pedido.
4. **O servidor devolve no MÍNIMO uma janela.** Pedir 3 linhas trouxe 26 e 202 KB. Por isso o
   avanço da paginação é pelo que FALTA (`faltaNaFaixa`), nunca por aritmética sobre o pedido.
   Faixa além do total é segura: `0,5000` num grid de 1617 devolveu 1617, sem erro.
5. **O custo é linear e caro: ~7,7 KB por linha** de 5 colunas (a resposta carrega `lsdata` e
   `lsevents` de cada célula). 1617 linhas = 12,4 MB em 1,7 s de rede e 42 ms de parse. O `lote`
   (default 500, ~3,8 MB por pedido) é o que segura a memória: 50→450 linhas/s, 500→661, 1617→939.
   Este canal lê lista de tela; **não é via de extração em massa** — 100 mil linhas seriam ~770 MB.

### ⚠ Delta PARCIAL não é a tela

A resposta do fragmento é um `<delta-update>` com `<control-update updateMethod="PARTIAL">` e **sem
`sap.its.aParams`** — logo sem `cuatitle`, `ScreenId`, `dynpro`. Tomá-lo pela tela zera `sids`,
`titulo` e `grids` da sessão inteira, e o `lerGrid` seguinte estoura com *"a tela não tem esse grid
(tem 0: nenhum)"*. `lerResposta` marca isso em `parcial`, e o `postar` guarda o corpo em
`sessao.parcial` sem mexer no `delta` — vale para qualquer delta parcial, não só o do ALV.

### ⚠ Pelo NAVEGADOR o gesto é a roda do mouse, não o clique

Medido na mesma lista: o DOM traz **166 linhas** (não as 27 da janela) — só 27 `<tr>` têm altura,
as outras estão lá com o texto e altura zero (`scrolling: "client"`, `clientCellThreshold: 10000`).
Rolar dentro desse bloco não toca a rede. E o que move o grid é a **roda do mouse**
(`Input.dispatchMouseEvent` `type: 'mouseWheel'`): clique sintético na célula e `PageDown` não
mexeram na janela nem geraram uma requisição. Ler célula por DOM, portanto, só alcança o bloco —
a faixa arbitrária é a via HTTP acima.

### Exportar

Não é preciso: `fragments=0,<total-1>` **é** a exportação — a tabela inteira, estruturada, num
POST. O grid publica `CopyToClipboardRequest` no `lsevents` e o ALV tem *Exportar → arquivo local*,
mas os dois desembocam numa via de SAÍDA que este canal não tem, e nenhum foi medido.
