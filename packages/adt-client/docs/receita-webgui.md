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

### ⚠ 200 sem `SAP_SESSIONID` NÃO quer dizer "teto de sessões" — quer dizer "sem sessão NOVA"

Medido no s4h 758/250 em 06/09/2026 (item 88, `POC_webgui_sonda_causa`). A tentação era batizar o
antigo `causa: 'inesperado'` de teto de sessões e mandar o texto do `SessaoNasceuMorta`. Não dá: um
**segundo GET dentro da sessão já aberta** (cookie na REQUISIÇÃO) devolve a MESMA assinatura HTTP —
200, sem `SAP_SESSIONID` no `Set-Cookie`, sem página de logon — com o canal **saudável**. Os dois
corpos vieram com **36 487 bytes idênticos**: o `SAP_SESSIONID` sai na PRIMEIRA resposta e não se
repete.

O que separa a TELA do FORMULÁRIO é o shell: `webguiform0` (e `action="…/sap(…)"`) está nos dois
200 de tela e **não** está nos 23 KB da página de logon. Daí a causa `sem-sessao-nova`:

> o nó **atendeu** (veio a tela) e o que faltou foi sessão **nova**. Duas leituras: (1) o GET saiu
> dentro de uma sessão existente; (2) o servidor não emitiu sessão — o estado do `SessaoNasceuMorta`.

Se o seu GET não levou cookie, é (2), e a saída é a do teto (esperar o
`http/security_session_timeout`, ou SM04 / `TH_USER_LIST`) — o motivo da sonda já traz esse texto.

Também medido, e **não** produzem esse veredito: idioma inválido (`sap-language=ZZ`), `~transaction`
inexistente e `sap-client` omitido saem `ok`; **mandante inexistente** (999) sai `credencial`, com a
página de logon.

⚠ **Aberto:** o que este nó responde SEM cookie com o servidor no teto **não foi medido** —
reproduzir o estado doente custa ~30 min de laboratório inutilizável. Do teto, o que está medido no
nó do WebGUI é o GET **com** o cookie envenenado: 400 (item 28, M5).

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
  // ⚠ `mudou` compara o CARIMBO, e ele é cego a repaint que devolve a tela igual (item 80,
  // § "⚠ O carimbo é CEGO num repaint de grid"). Quem prova o efeito é a mensagem, abaixo.
  if (!r.mudou) throw new Error('a tela não respondeu — a ação não pegou');

  const depois = await lerTela(s);
  if (depois.mensagem?.tipo === 'ERROR') throw new Error(depois.mensagem.texto);
  await print(s, 'tela.png');
} finally {
  await s.fechar();                            // quem abre fecha (Browser.close + o perfil temporário)
}
```

**O assert NÃO está aí.** Statusbar e print não provam gravação — fecha-se com `dataPreview` /
`readTable` em **outra LUW** ([receita-ciclo-escrita-verificacao.md](receita-ciclo-escrita-verificacao.md)).

### ⚠ Uma sessão por Chrome, uma PORTA por sessão — e o anexo silencioso (item 65)

`abrirNavegador` sobe com **`porta: 0`** (o default): o SO dá uma porta livre e o Chrome escreve a
porta REAL em `<perfil>/DevToolsActivePort`, que é de onde a lib a lê. Parece detalhe de plumbing;
não é. Até 05/09/2026 a porta era **9222 fixa**, e o que isso produzia está medido em
`sap-accelerate/work/POC_webgui_porta/medicoes/item65-porta.md`:

- com a 9222 ainda ocupada por um Chrome **vivo**, o Chrome novo falha o bind e morre — **mas o
  `GET /json/list` responde, do Chrome ANTIGO**. A sessão "nova" se anexava à página VELHA sem
  aviso nenhum: `window.__marca = 'SESSAO_A'` escrita na primeira sessão era lida pela segunda.
  Duas sessões dirigindo a MESMA dynpro, caladas;
- o `CDP não respondeu na porta 9222` que se via de vez em quando era o caso **benigno** — o antigo
  já tinha fechado o listener. O caso mau não dava erro;
- e o `fechar()` matava só o processo pai: sobraram **85 pastas `jbv-webgui-*` no `%TEMP%`, 7,1 GB**,
  com 10 `chrome.exe` órfãos ainda segurando arquivo.

Duas instâncias simultâneas com porta efêmera ganham portas distintas e cada `/json/list` mostra só
o próprio target — medido. E o `fechar` passou a mandar **`Browser.close`** (derruba o grupo de
processos, 10 → 0, e solta o perfil) antes do `kill` de fallback, com o `rmSync` em até 10
tentativas; o que ainda assim não sair vira **aviso alto em stderr com o caminho**, em vez de sumir
num `catch {}` vazio.

⚠ `Browser.close` **não responde** — o navegador morre antes do retorno, e o que volta pelo ws é
`Inspector.detached / Render process gone`. Quem o mandar com `await` espera para sempre.

Passar `porta: <número>` continua valendo para quem precisa de um endereço conhecido (anexar um
DevTools de fora, por exemplo) — mas aí a porta ocupada vira **erro nomeado**, nunca anexo.

### ⚠ Chrome morto = comando que PENDURA PARA SEMPRE — as três saídas (item 104)

O `cmd()` da sessão devolve uma promessa guardada num mapa de pendentes, casada pelo `id` que volta
no `onmessage`. Até 06/09/2026 **não havia mais ninguém** para tocar nessas promessas: socket morto
significava `await` eterno. Medido em `sap-accelerate/work/POC_webgui_canal/` (mata-se o Chrome de
fora com `Stop-Process`, com um comando EM VOO e outro disparado depois):

| | comando EM VOO quando o Chrome morre | comando NOVO depois da morte |
|---|---|---|
| antes | **pendurou** (nada em 15 000 ms) | **pendurou** (nada em 15 000 ms) |
| depois | rejeitou em **0 ms** | rejeitou em **0 ms** |

O sintoma de fora é o Node **saindo calado** com `Detected unsettled top-level await` — nenhum
handle vivo, nenhum erro. Foi assim que apareceu no item 65 (duas sessões no mesmo Chrome: o
`fechar()` de uma matou o target da outra), mas o gatilho é qualquer morte do navegador: crash,
OOM, `kill` de fora, máquina que dorme.

`criarCanalCdp(ws, { tetoMs })` fecha as três portas — e nenhuma cobre o caso das outras:

- **`onclose`/`onerror` derrubam TODAS as pendentes** com a causa (`o canal do CDP fechou (código
  1006, …)`). Cobre o socket que morre com comando em voo;
- **teto por comando** (`TETO_CMD_CDP_MS`, 120 s; ajustável por sessão em `abrirNavegador({
  tetoCmdMs })` ou por chamada em `cmd(m, p, { tetoMs })`). Cobre o socket **vivo e mudo** — que
  nunca vai fechar nem responder. É rede de segurança, não política: 120 s é mais que a espera mais
  longa da lib (o `ir` dá 60 s à navegação);
- **comando novo em canal morto rejeita na hora**, sem enviar. Necessário porque `ws.send()` em
  socket fechado é **descartado em silêncio** pela spec do WebSocket — não lança. Sem esta terceira
  porta, o comando seguinte à morte pendurava de novo, mesmo com as duas primeiras no lugar.

O handshake tem o mesmo tratamento: `onclose` e teto (`tetoMs`) na abertura, para o socket que
nunca abre não pendurar o `abrirNavegador`.

⚠ O teto usa `unref()` — comando em voo **não** segura o processo vivo. Um script que só espera um
`cmd` continua podendo sair antes do teto; o que mudou é que ele sai com **rejeição**, não em
silêncio.

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

### Entrar na tela LIMPA — porque abrir a transação **não** limpa nada

**Abrir uma transação não dá tela limpa: o campo volta com o valor da última execução DAQUELA
SESSÃO.** Medido no s4h 758/250 em 2026-09-06 (item 95,
`sap-accelerate/work/POC_webgui_tela_limpa/`, fases A–D). Um roteiro que só preenche PARTE dos
campos herda o resto da vez anterior — e **o valor herdado não aparece no fio**: o renderer só
publica `value/` quando o valor difere do que o servidor mandou (§ acima), então o passo executa
com um valor que ninguém escreveu e que a instrumentação não mostra.

**Onde o valor mora — as três explicações, separadas por construção (fase A):**

| leitura | resultado | conclusão |
|---|---|---|
| `USR05` do usuário por `readTable` (outro canal), antes × depois de sujar | **idêntica**, 6 linhas | não é parâmetro persistido do usuário |
| navegador NOVO (perfil novo ⇒ logon novo) depois de sujar | campo **vazio** | não atravessa o logon |
| **mesmo** navegador, URL nova depois de sujar | campo com `TADIR` | **é a memória da SESSÃO** |

É SET/GET parameter, sim — mas da **sessão externa**, não da memória persistida do usuário. A prova
positiva veio de graça na fase B: `TADIR` foi digitado na **SE16** e apareceu na **SE11** (campo
`RSRD1-TBMA_VAL`, outro programa, outra tela) — telas diferentes que compartilham o mesmo parameter
ID herdam uma da outra. **A contaminação cruza transações.**

**Em quais telas vale (fase B, uma sessão, gesto mínimo `preencher` + `blur` + Enter):**

| transação | campo | herdou ao reabrir |
|---|---|---|
| SE16 | `DATABROWSE-TABLENAME` | **sim** (fase A; na fase B o Enter avançou para a tela de seleção e o assert não se aplicou) |
| SE11 | `RSRD1-TBMA_VAL` | **sim** — e já abriu suja pela SE16 |
| SE38 | `RS38M-PROGRAMM` | **sim** |
| SE37 | `RS38L-NAME` | **sim** |
| SE24 | `SEOCLASS-CLSNAME` | **sim** |
| SM30 | `VIEWNAME` | **sim** |

Seis de seis. Trate como **a regra**, não como exceção de tela.

**O gesto que limpa (fase C, cada candidato medido do mesmo estado sujo, com o mesmo assert):**

| candidato | resultado |
|---|---|
| **`*SE16 DATABROWSE-TABLENAME=`** (parâmetro VAZIO na URL) | **limpa** — e a reabertura crua seguinte também vem vazia: **zera a memória** (fase D1), o mesmo na SE38 (D2) |
| **apagar os cookies** (`renovarSessao`) | **limpa** — sessão SAP nova |
| publicar o campo vazio (`preencher` `''` + `blur` + Enter) | limpa, mas custa um round-trip e só serve com a tela já aberta |
| `comandar('/n')` e reabrir | **não limpa** — `TADIR` de volta |
| `&sap-sessioncmd=open` | **não limpa** — `TADIR` de volta |

E o inverso também vale: a URL com valor **grava** na memória — `*SE16 DATABROWSE-TABLENAME=T000` e
a reabertura CRUA seguinte veio com `T000` (fase D3).

```js
await abrirTransacao(s, 'SE16', { limpar: ['DATABROWSE-TABLENAME'] }); // bisturi: zera só o campo
await renovarSessao(s);                                               // martelo: sessão SAP nova
```

`limpar` aceita um campo ou uma lista, vale nas duas vias (navegador e `its.mjs`), e parâmetro
explícito ganha dele. Quem não sabe o nome do campo pergunta à tela — `await sids(s)` (§ acima).

⚠ `renovarSessao` derruba **tudo** da sessão: modos abertos, tela em edição, o que estiver
bloqueado por ela. E não é logoff — o gesto medido é só o do lado do navegador.

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

## ⚠ HTTPS com certificado interno — o outro lado do mesmo problema

O gotcha do cookie `secure` é do ICM em **HTTP puro**. O espelho dele aparece onde o ICM só atende
**HTTPS** e o certificado vem de uma **CA interna do cliente**: o Chrome barra a navegação antes de
um byte de SAP chegar.

**Medido no SXD 816/100 em 2026-09-04:** `/UI2/FLPD_CUST` redireciona para
`https://awskartsxd01.acclab.com:44300/` e a tela só abriu depois de mandar
`Security.setIgnoreCertificateErrors`. **Reproduzido em laboratório local em 2026-09-05** (sem VPN,
servidor HTTPS com certificado auto-assinado — `sap-accelerate/work/POC_https_cert/medicoes/item41-cert.md`),
que é de onde saem os números:

| como se sobe o Chrome | `Page.navigate` devolve | tela |
|---|---|---|
| nada (o default) | `net::ERR_CERT_AUTHORITY_INVALID` | "Erro de privacidade", `chrome-error://chromewebdata/` |
| `Security.setIgnoreCertificateErrors` (**sem** `Security.enable`) | — | abriu |
| `Security.enable` + `setIgnoreCertificateErrors` | — | abriu |
| `--ignore-certificate-errors` | — | abriu |
| `--ignore-certificate-errors-spki-list=<pino DESTE cert>` | — | abriu |
| `--ignore-certificate-errors-spki-list=<pino de OUTRO cert>` | `net::ERR_CERT_AUTHORITY_INVALID` | **barrou** |

A última linha é a que importa: o **pino restringe de verdade**. Não é `--ignore-certificate-errors`
com enfeite — é "aceito o certificado daquele ICM", e qualquer outro certificado quebrado da sessão
continua barrado.

### A receita: pinar o certificado do sistema, uma vez

**1. leia o pino do host** (e confira `subject`/`issuer`/validade com quem cuida da infra do
cliente — pinar o que o host mostrou agora é *trust on first use*, não prova de identidade):

```js
import { spkiDoHost } from 'adt-client/webgui';
console.log(await spkiDoHost('https://awskartsxd01.acclab.com:44300'));
// { pino: 'MPQ1+…', sha256: 'sha256/MPQ1+…', subject: 'CN=…', issuer: 'CN=…',
//   validoDe: '…', validoAte: '…', autoAssinado: false }
```

**2. grave no `sistemas.json`**, no alias daquele sistema:

```json
{ "sxd": { "url": "https://awskartsxd01.acclab.com:44300", "certificado": "sha256/MPQ1+…" } }
```

Pronto: `abrirNavegador(cfg)` já sobe com a bandeira. Nenhum script chama `s.cmd` à mão.

**O default é não ignorar nada.** Sem `certificado`, o `ir` **lança na hora** — porque o
`Page.navigate` devolve `errorText`, e o módulo passou a lê-lo:

```
webgui: a navegação para https://icm:44300/ falhou com net::ERR_CERT_AUTHORITY_INVALID.
O Chrome não confia na CA que assinou o certificado deste host — típico de ICM com certificado interno.
Não se ignora certificado por default. Para liberar ESTE sistema, em sistemas.json:
  1. leia o pino:  spkiDoHost("https://icm:44300/")  → confira subject/issuer com a infra do cliente
  2. grave:        { "<alias>": { "certificado": "sha256/<pino>" } }
Alternativa larga (a sessão inteira sem validar certificado, e ela avisa): "certificado": true
```

Antes disso o erro era **silêncio caro**: a espera do `ir` rodava os 60 s do teto contra uma
`chrome-error://` e o script culpava a tela ("nenhum campo"). Só se lança no que foi medido
(`net::ERR_CERT_*` e `net::ERR_SSL_*`); qualquer outro `errorText` sai como **aviso** e a espera
segue, porque `ERR_ABORTED` também aparece em navegação simplesmente substituída.

`certificado: true` continua existindo para quem não quer pinar — manda o
`Security.setIgnoreCertificateErrors` e **avisa alto** em stderr: é a sessão inteira sem validação.

### ⚠ A opção é do Chrome — o `fetch` valida por conta própria

`sondarWebgui`, o ADT e todo o resto da lib saem por `fetch`, que tem o **seu** validador e recusa
antes de qualquer HTTP. Medidos os três casos:

| certificado do host | código do `fetch` |
|---|---|
| auto-assinado | `DEPTH_ZERO_SELF_SIGNED_CERT` |
| assinado por CA interna desconhecida | `UNABLE_TO_VERIFY_LEAF_SIGNATURE` |
| CA confiável, nome que não bate | `ERR_TLS_CERT_ALTNAME_INVALID` |

`interpretarSonda` devolve causa `certificado` (antes dizia `sem-icm`, que manda procurar rede e
host — o lugar errado, porque o ICM está de pé). E, desde 2026-09-05, existe a saída: **declarar a
CA do cliente**, num campo próprio, porque o pino do Chrome não vale aqui.

```json
{ "sxd": { "certificado": "sha256/<pino>", "ca": "C:/certs/ca-interna.pem" } }
```

Os dois campos, o mesmo ICM, validadores diferentes: `certificado` é o Chrome (canal webgui), `ca` é
o Node (`fetch` de todo o resto). O `ca` também aceita `"sistema"` — as CAs já instaladas no
Windows — e uma lista. Ver `ca.mjs`; medido em
`sap-accelerate/work/POC_https_cert/medicoes/item69-ca-fetch.md`:

| via | o ICM da CA interna | uma raiz NÃO declarada |
|---|---|---|
| default do Node | barra | barra |
| `"ca": "…/ca.pem"` (`tls.setDefaultCACertificates`) | **passa** | **barra** |
| `NODE_TLS_REJECT_UNAUTHORIZED=0` | passa | **passa** ← por isso não existe na lib |

Ponta a ponta, com o código do `connect` de verdade contra um HTTPS de CA interna: `fetchToken`
devolveu token e cookie, e `sondarWebgui` devolveu `ok` — enquanto o "ICM" de uma raiz não declarada
seguiu barrado nos dois.

Dois gotchas medidos: **declare antes do primeiro `fetch`** daquele host (o `fetch` mantém
keep-alive por origem, e a conexão já recusada não se refaz), e o efeito é do **processo** — fazer
por chamada exigiria um dispatcher do undici, que este Node não expõe. Nome que não bate
(`ERR_TLS_CERT_ALTNAME_INVALID`) **nenhuma CA resolve**: use na `url` o host que consta no
certificado.

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

E **`mudou: false` é informação** — mas informação **fraca**: `acionar` compara o carimbo da tela
antes e depois, e é assim que `btn[15]`/`btn[12]` se denunciam neste canal. ⚠ Tela idêntica **não**
prova que a ação não pegou: medido no item 80 que um round-trip completo pode repintar o grid sem
mexer em nada do que o carimbo lê (§ "⚠ O carimbo é CEGO num repaint de grid"). Quem separa "não
houve conversa" de "houve conversa e a tela ficou igual" é o `respondeu` — hoje só no `comandar`.

### ⚠ O contêiner que você aponta pode não ser o nó que ACIONA

**Medido no SXD 816/100 em 04/09/2026** (fila `adt-client`, item 40), no FLP Designer: o gesto no
`<li>` do template estático (`X-SAP-UI2-CHIP:/UI2/STATIC_APPLAUNCHER`) **não adicionou o tile**; o
mesmo gesto no ícone de dentro (`AdminPage--universalCatalogView--X-SAP-UI2-CHIP:__UI2__STATIC_APPLAUNCHER-img`)
adicionou. O `<li>` é a caixa; o handler está no descendente.

**Reproduzido no s4h 758/250 em 05/09/2026**, UI5 1.114.0
(`sap-accelerate/work/POC_ui5_clicar_descendente/medicoes/item40-descida.md`), num
`CustomListItem` inerte com um `sap.ui.core.Icon` dentro:

| rodada | `desceu` | `recebeu` | `porQue` | efeito |
|---|---|---|---|---|
| `<li>` inerte com `{ descer: false }` | false | `liInerte` | `null` | **nada** — o sintoma do SXD |
| `<li>` inerte (padrão) | **true** | **`iconeAdd`** | `cursor` | acionou |
| ícone direto (controle positivo) | false | `iconeAdd` | `cursor` | acionou |
| `<li>` **ativo** (`sapMLIBActionable`) | false | `liAtivo` | `cursor` | acionou — **não** foi rebaixado |
| `<li>` sem nada acionável dentro | false | `liMudo` | `null` | nada — não inventa alvo |
| item de ComboBox (`role=option`) | false | `__item15` | `marcador` | `selectionChange`+`change` |

Por isso `apontar`/`clicar` **descem** quando o alvo não declara ação nenhuma, e **sempre contam
para onde o gesto foi**: `{ desceu, recebeu, de, porQue, candidatos }`.

- **A marca de ação se lê no DOM**, sem perguntar ao framework: tag/atributo de comando
  (`button`, `a[href]`, `input`, `[onclick]`), `role` de comando (`button`, `link`, `option`,
  `menuitem`, `tab`, `checkbox`, `radio`, `switch`), os atributos do Unified Renderer
  (`[ct]`, `[lsdata]`, `[lsevents]`) e, por último, `cursor: pointer` computado. Os dois `<li>`
  medidos têm o **mesmo `role`** e nenhum tem `onclick`: quem os separa é o `cursor`.
- **Isso deixa o canal WebGUI intacto**: lá quase todo elemento endereçável já tem `ct`/`lsdata`,
  então nunca há o que descer.
- **Escolhe o menor descendente por caixa e depois SOBE enquanto o pai ocupa a mesma caixa** —
  `cursor: pointer` é HERDADO, e sem essa subida o gesto sairia no `<span>` de recheio do ícone
  (medido: mesmo id vazio, mesma área de 199 px²).
- **`{ descer: false }`** volta ao gesto cru — é o contrafactual que reproduz o bug.
- **Armadilha:** o critério de `cursor` depende do **CSS do tema já ter carregado**. Medido: um
  `<li>` ativo lido logo após o `placeAt` disse `cursor: auto`. O efeito é benigno (sem CSS ninguém
  é acionável, então o alvo fica onde está), mas `desceu: false` num contêiner que se sabe inerte
  quer dizer **tela ainda se pintando**, não "não havia o que descer".

### ⚠ VÁRIOS gestos na mesma linha: escolha pelo RÓTULO, não pelo tamanho

**Medido no s4h 758/250 em 05/09/2026** (fila `adt-client`, item 68, UI5 1.114.0 —
`sap-accelerate/work/POC_ui5_clicar_descendente/medicoes/item68-dois-gestos.md`). Quando o contêiner
inerte tem **mais de um** descendente acionável, o menor-por-caixa deixa de ser "o único que havia" e
vira chute — **e o chute erra acionando OUTRA coisa**, sem erro nenhum:

| linha | gestos lá dentro | quem o tamanho escolhe | efeito |
|---|---|---|---|
| dois ícones iguais (224 px² cada) | `Adicionar`, `Detalhe` | `Adicionar` — só porque vem antes no DOM | disparou `cat:adicionar` |
| botão `Adicionar` (4012 px²) + ícone `Detalhe` (224 px²) | `Adicionar`, `Detalhe` | **`Detalhe`** | disparou `misto:detalhe` — **o gesto errado** |

Por isso **`{ dentro: '<rótulo>' }`**, que endereça o descendente pelo rótulo e implica a descida:

```js
await clicar(s, { id: 'liCatalogo' }, { dentro: 'Adicionar' });  // sai no botão, não no ícone menor
```

- **O rótulo é `aria-label` → `title` → texto → `value`**, nessa ordem, comparado sem caixa e sem
  acento (`endereco` acha `Endereço`). Medido: um `sap.ui.core.Icon` com tooltip rende
  `aria-label="Adicionar"` no controle e `title="Adicionar"` no recheio; um `sap.m.Button` **não tem
  nenhum dos dois** — só o `innerText`.
- **O nome do ícone não chega ao DOM** — `sap-icon://add` vira o *caractere* da fonte SAP-icons em
  `data-sap-ui-icon-content`. Quem traduz o nome nesse caractere é a **IconPool**, e é isso que dá
  a via `{ icone }` do § seguinte; **casar pelo texto `sap-icon://…` no DOM continua impossível**.
- **O rótulo é TRADUZIDO** — `{ dentro: 'Adicionar' }` não casa num sistema em EN/DE. Use
  `{ icone }` quando o gesto for um ícone (§ seguinte), ou o id do descendente.
- **Sem casamento ÚNICO, o `clicar` levanta erro com a lista** — nunca sorteia. Medido: `dentro:
  'Excluir'` → `nenhum gesto tem rótulo "Excluir" — os gestos de lá são: "Adicionar", "Detalhe"`;
  `dentro: 'a'` (casa com os dois) → `casa com 2 gestos (…) — seja mais específico`. Nas duas, zero
  ação disparada.
- **O padrão continua o de antes** (menor caixa), para não quebrar o caso de um gesto só — mas
  agora, havendo vários, o `clicar` **avisa** que escolheu por tamanho e lista os rótulos.
- **`gestos` no retorno de `apontar`** é a lista que se endereça: os acionáveis **independentes**,
  com rótulo. Um `sap.m.Button` publica 4 nós acionáveis encaixados (`button > -inner > -content >
  -BDI-content`, todos `cursor: pointer`); eles colapsam em **um** gesto — senão toda linha com
  botão pareceria ambígua.

### `{ icone: 'add' }` — a via que atravessa o IDIOMA (só onde há UI5)

**Medido no s4h 758/250 em 06/09/2026** (fila `adt-client`, item 109, UI5 1.114.0 —
`sap-accelerate/work/POC_ui5_clicar_descendente/medicoes/item109-icone.md`). O rótulo do § acima é
traduzido; o caractere do ícone não. A **mesma** página carregada em três idiomas:

| idioma | `aria-label` do botão | `data-sap-ui-icon-content` | `{ dentro: 'Adicionar' }` | `{ icone: 'add' }` |
|---|---|---|---|---|
| PT | `Adicionar` | `U+E058` | acionou | acionou |
| EN | `Add` | `U+E058` | **recusou** | acionou |
| DE | `Hinzufügen` | `U+E058` | **recusou** | acionou |

```js
await clicar(s, { id: 'liCatalogo' }, { icone: 'add' });          // nome de sap-icon://add
await clicar(s, { id: 'liCatalogo' }, { icone: 'sap-icon://add' }); // a URI inteira também vale
```

- **Quem traduz nome → caractere é a `IconPool`**, dentro da página:
  `sap.ui.core.IconPool.getIconInfo('add').content` → `U+E058`. Medido que o namespace global já
  existe desde o primeiro script do boot (antes do `attachInit`, e mesmo com
  `data-sap-ui-libs=""`); o `sap.ui.require('sap/ui/core/IconPool')` **síncrono** só passa a
  responder depois que alguém requereu o módulo (4 ms pela via assíncrona). Por isso a lib tenta o
  `require` síncrono **e** o global, nessa ordem.
- **O caractere pode estar num DESCENDENTE do gesto**: num `sap.m.Button({ icon })` ele fica no
  `-img`. A busca sobe do nó do atributo até o **primeiro** ancestral acionável — e para aí. Medido
  numa linha `CustomListItem type="Active"` (a linha inteira clicável, com um botão dentro): o
  clique disparou `ativo:adicionar`, **não** o `press` da linha.
- **Recusa com o motivo separado** — as três faltas pedem remédios diferentes, e zero ação é
  disparada em qualquer delas:
  | falta | mensagem |
  |---|---|
  | página sem UI5 | `{ icone: 'add' } precisa da IconPool do UI5 para virar caractere, e esta página não tem UI5 carregado` |
  | nome que a pool não conhece (`ADD`, `nao-existe`) | `a IconPool não conhece o ícone "ADD" — o nome é o de sap-icon://<nome>, minúsculo e com hífen` |
  | ícone que não está na tela | `nenhum gesto usa o ícone "add-product" — os ícones de lá são: "add", "detail-view"` |
  | dois gestos com o mesmo ícone | `o ícone "add" casa com 2 gestos (iconeDup1, iconeDup2)` |
- **`getIconInfo` é sensível a maiúsculas** (`'ADD'` não existe) e aceita `'add'` ou
  `'sap-icon://add'`. Nome desconhecido devolve `undefined` — não estoura.
- **`{ dentro }` e `{ icone }` juntos são recusados** na montagem do JS: são duas regras de escolha
  para um gesto só.
- ⚠ **`{ icone }` não serve ao WebGUI/dynpro** — lá não há UI5 na página, e a recusa diz exatamente
  isso. No canal dynpro o endereço é o SID do controle.

### `{ cliques: 2 }` — o DUPLO clique, que em três controles é o gesto (item 118)

**Medido no s4h 758/250 em 06/09/2026** (fila `adt-client`, item 118 —
`sap-accelerate/work/POC_webgui_duploclique/medicoes/item118-duplo-clique.md`). Em alguns controles
o duplo clique não é "clicar duas vezes": é **o** gesto, e o clique simples não sai no fio.

```js
await clicar(s, { id: 'grid#C102#1,1#if' }, { cliques: 2, esperarResposta: true }); // drill-down do ALV
await duploClique(s, ponto);                                    // o primitivo, quando já se tem o ponto
```

O que o renderer lê é o **`clickCount` subindo** — 1 no primeiro par press/release, 2 no segundo, no
MESMO ponto — e não o intervalo entre os pares (a lib não espera nada entre eles e o gesto pega).

| controle | clique simples | duplo clique |
|---|---|---|
| célula do ALV | **0 requisições** — a seleção é puro cliente | `action/53` + `action/50` + **`action/2`**, e abre o drill-down |
| nó da árvore | seleciona | `action/2` — expande, colapsa (toggle) ou ACIONA a folha |
| campo com match code | põe o cursor | **nada** — nenhum `action/`, nenhum popup |

- **O `action/2` é o mesmo dos dois lados**: o `OnNodeDoubleClick` da árvore (itens 50/86) e o
  drill-down do ALV são o mesmo código do renderer, mudando só o `content` (`row_index`/
  `column_index` no grid, o nó na árvore).
- ⚠ **O F4 NÃO vem por duplo clique neste canal.** Medido no `RS38M-PROGRAMM` da tela de seleção do
  SA38, com o campo preenchido e vazio: `mudou: false`, `wnd[0]` nas duas, e a única requisição não
  tinha `postData`. Quem quer o match code usa a tecla F4 ou o botão que aparece com o foco — o
  comportamento do SAP GUI de desktop não se repete aqui.
- ⚠ **Na ÁRVORE prefira `expandirNo`/`colapsarNo`/`acionarNo`.** O `clicar(…, { cliques: 2,
  descer: false })` também dirige a árvore (medido: 15 → 23 nós em 262 ms), mas é o `expandirNo` que
  lê o estado do nó antes e evita o gesto inócuo — e, na folha, o gesto CARO (acionar a transação,
  54 s frios).
- ⚠ **`mudou: true` NÃO quer dizer que o servidor fez algo.** O clique simples na célula do ALV não
  gerou requisição nenhuma e ainda assim voltou `mudou: true`: pintar a linha selecionada já muda o
  `JS_CARIMBO` (título + contagem de elementos). O carimbo é o sinal FRACO dos dois lados — ele
  perde mudança real (§ "⚠ O carimbo é CEGO num repaint de grid") e sobra em repintura de cliente.
  Quem separa é o round-trip, como `esperarArvore` faz com o `respondeu`.

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
(`Network.requestWillBeSent` — o hook no XHR dá a mesma leitura, item 56). Alvo: tela de seleção da
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

1. ~~**Hook no `XMLHttpRequest` não vê todo o tráfego.**~~ **Isto estava errado** — ver o § abaixo
   (item 56): não há canal invisível, o hook viu tudo o que havia. A armadilha verdadeira é
   **estado do servidor contaminando o cenário seguinte**.
2. **"Ficou na mesma tela" não é "não executou".** Com um filtro que não casa (`MTEXT='250'`), o
   caminho que sabidamente leva valores (o **botão**) devolve a MESMA tela e a mesma statusbar
   ("Não foi encontrada nenhuma entrada em tabela para chave indicada") do caminho em teste — e
   `preencher` + `comandar` pareceu falhar quando na verdade tinha funcionado. Sem o controle
   positivo e sem um valor de filtro que EXISTE, o assert não distingue as hipóteses.

### O `value/` só sai quando o valor **mudou** — e a SE16 reabre com o valor de ontem (item 56)

A armadilha 1 acima ("hook no XHR não vê todo o tráfego") **era falsa** e foi desmentida por
medição no s4h 758/250 em **2026-09-05**
(`sap-accelerate/work/POC_webgui_okcode_valores/medicoes/item56-hook-xhr.md`). Um hook amplo
(`xhr.send`, `fetch`, `sendBeacon`, `WebSocket.send`, `form.submit`) lido em **todos** os contextos
de execução deu **exatamente a mesma leitura do CDP** nos dois cenários — inclusive no que
"vazava": lá o CDP **também** não viu `value/` nenhum. Não há canal invisível. Bate com o fonte:
`webgui_min.js` tem 7 `XMLHttpRequest`, **zero** `fetch(`, **zero** `sendBeacon`, **zero**
`.submit()`, e o batch sai por um XHR singleton.

O que realmente acontecia são duas coisas que continuam valendo para qualquer medida aqui:

> **A lei do `value/`:** o renderer publica `value/<SID>` quando o valor **atual** difere do que o
> servidor mandou naquela dynpro. Valor igual → nada no fio, e está **certo** (o servidor já tem).

Medido com a variável isolada, cinco cenários com previsão declarada antes, cinco bateram: digitar
o mesmo valor que veio + Enter → **não** publica; digitar valor diferente + Enter → publica;
digitar `ZZZZ` e **voltar** ao valor original + Enter → **não** publica (é comparação com o estado,
não "houve digitação"); e o `blur` do `comandar({ publicarValores: true })` obedece à mesma lei.

> **Sessão nova do ITS não é estado limpo.** A SE16 reabre com a **última tabela do usuário já no
> campo** — `/nex` e uma URL nova não limpam isso. Dois cenários seguidos com o mesmo valor **não
> são independentes**: o segundo herda o resultado do primeiro, avança a tela sem mandar nada, e
> parece um vazamento de instrumento. O contrafactual que fecha: **não digitar nada e só dar
> Enter** chega à mesma tela, com zero `value/` no fio.

Na prática, ao medir este canal: leia o que o servidor mandou no campo
(`document.getElementById(id).value` logo na abertura) e **use um valor diferente por cenário**.
O CDP segue sendo o instrumento preferido — não por ver mais tráfego, mas porque é externo à
página (sobrevive à troca de documento, que mata o `window.__…` do hook) e o `initiator.stack`
aponta a linha do `webgui_min.js` que originou o POST.

### Os OUTROS gestos **não** tinham a armadilha — só o `comandar` (item 55)

O § acima levanta a suspeita natural: se o `comandar` perdia o valor, quais outros gestos perdem?
**Nenhum.** Medido no s4h 758/250 em 2026-09-05 (`sap-accelerate/work/POC_webgui_gestos_valores/`),
com o **mesmo ciclo** do item 31 — SE16 sobre a T000, `MTEXT='Neduca'`, 1 das 5 linhas — e a linha
de base repetida na mesma rodada (`comandar` cru sem valor = 5 acertos · `preencher` + `comandar`
cru = 5 acertos · `preencher` + `acionar('btn[8]')` = 1 acerto):

| gesto, com o campo preenchido | tela | leva o valor? |
|---|---|---|
| `tecla(s, 'F8')` | `T000 1 acertos` | **sim** |
| `clicar` em **outro campo** | `T000 1 acertos` | **sim** |
| `clicar` num **rótulo** `<L>` (`descer: false`) | `T000 1 acertos` | **sim** |
| `clique` cru **por coordenada, em área inerte** (foco vai ao `BODY`) | `T000 1 acertos` | **sim** |
| `abrirMenu` (e `abrirMenu` + `fecharMenu`) | `T000 1 acertos` | **sim** |
| `navegarMenu('Programa > Executar')` | `T000 1 acertos` | **sim** |

Nos que não executam sozinhos (`clicar`, `abrirMenu`) o executor foi o `comandar` **cru**
(`publicarValores: false`) — que a linha de base mede perdendo o valor. Logo o "1 acerto" só pode
ter vindo do gesto em teste.

**São dois mecanismos, e o batch os separa** (bisseção com listener de `blur`/`change` no campo):

* **gesto de MOUSE** — o foco sai do campo, o `blur` dispara, o `Change` publica. Vale **até** para
  o clique em área inerte: o foco vai ao `BODY` e sai um POST isolado
  `[{"post":"value/…","content":"…","logic":"ignore"}]`.
* **gesto de TECLA** — o campo **não** perde o foco (nenhum `blur`) e o valor vai assim mesmo: o
  `vkey` sai endereçado ao **controle** (`vkey/8/wnd[0]`) e leva o `value/` dele junto, ao contrário
  do `vkey/0/ses[0]` do `submitOkCode`, que é da **sessão**.

> **A regra, e por que só o `comandar` caía nela:** ele é o único gesto deste canal que **não é
> nativo** — escreve o `value` do `ToolbarOkCode` (0×0) e despacha um `KeyboardEvent` sintético
> **nesse outro elemento**, então o campo preenchido não perde o foco nem recebe evento. Todo o
> resto é `Input.dispatchMouseEvent`/`dispatchKeyEvent` de verdade, e aí Chrome e renderer fazem o
> trabalho sozinhos. Por isso `publicarValores` existe só no `comandar`, e não em `clicar`/`tecla`.

⚠ O `change` **não discrimina**: apareceu nos três cenários da bisseção, inclusive no que perdeu.
Quem discrimina é o `blur` ou o endereço do `vkey`.

### ⚠ O carimbo é CEGO num repaint de grid — o sinal é o round-trip (item 80)

**Medido no s4h 758/250 em 06/09/2026**
(`sap-accelerate/work/POC_webgui_grid_edit/medicoes/item80-carimbo-repaint.md`, bruto em
`raw/j-carimbo.json`, `k-oque-muda.json`, `l-comandar-novo.json`).

O sintoma era um mistério do item 47: **o mesmo `comandar('FC01')`, na mesma sessão**, custou 4,2 s
numa corrida e **42,8 s** na outra. Não é intermitência — é o `esperarMudanca` pagando o teto
inteiro quando o carimbo não muda. Cinco gestos numa tela com ALV editável, **um round-trip
completo em cada um**:

| gesto | resposta do ABAP | `carimbo` |
|---|---|---|
| `FC01` 1ª vez (statusbar ganha msg) | 396 ms | mudou (`nEl` 873→874) |
| `FC01` de novo (repaint IDÊNTICO) | 183 ms | **igual** |
| escrever célula + `FC01` (o valor já está no DOM) | 2 072 ms | mudou (`nEl` 874→879) |
| `FCZZ` (fcode que a dynpro não tem) | 186 ms | **igual** |
| `FC03` (muda só a mensagem da statusbar) | 374 ms | **igual** |

**Por quê:** os 300 caracteres que o `JS_CARIMBO` lê são o **começo** do `innerText` — título, menu
e botões. Nem o grid nem a statusbar (que aparece no caractere ~1 000) chegam ali. Quando o carimbo
salvou, salvou pela contagem de elementos, por acaso.

Procurou-se um sinal melhor **dentro do DOM** e não existe um que seja genérico e honesto ao mesmo
tempo: o `lsdata` do container do grid tem um `"version"` que incrementa a cada round-trip
(`1→2→3→4`, medido) — mas só existe onde há grid; e o painel de informação do sistema reescreve
`Tempo E2E`/`Tempo WebGUI` no `innerText` — mas depende do tema e repete quando o tempo repete.

O sinal que serve já estava na sessão: **o POST do renderer e a resposta dele** (`Network.*` do
CDP). É o que `esperarTroca` usa — round-trip **ou** carimbo, o que vier primeiro, assentando
sempre antes de julgar (a resposta chega ~200 ms **antes** do repaint). Por isso `comandar` devolve
`respondeu` ao lado de `mudou`:

```js
const r = await comandar(s, 'FC01', { tetoMs: 40000 });
// { okcode:'FC01', mudou:false, respondeu:true, ms:1484, publicado:'M0:46:::0:34' }
```

| | significa |
|---|---|
| `respondeu: false` | **nenhuma conversa com o ABAP** — o gesto não saiu do navegador |
| `respondeu: true, mudou: false` | houve round-trip e **a tela ficou igual** (repaint que confirma) |
| `respondeu: true, mudou: true` | houve round-trip e a tela trocou |

⚠ **`respondeu: true` NÃO quer dizer "o comando pegou".** O `FCZZ` da tabela prova: fcode
inexistente também faz round-trip completo, o ABAP só o ignora. Quem diz se houve **efeito** é a
mensagem (`lerTela(s).mensagem` — `null` no `FCZZ`, `ITEM47 GRAVOU…` nos outros) ou o dado.

Com o teto em 40 s de propósito, os cinco gestos fecharam entre **1 476 e 1 678 ms** — quatro deles
custariam o teto inteiro na espera antiga.

⚠ **Isto ainda vale só para o `comandar`.** `acionar`/`clicar({esperarResposta})`, `ordenarGrid`,
`filtrarGrid`, `inserirLinha`, `apagarLinhas` e `navegarMenu` continuam com `esperarMudanca` (só
carimbo) e têm a mesma cegueira — ordenar um grid pequeno é justamente o caso em que a tela volta
igual. Cada um precisa da sua contra-prova antes de migrar: `abrirMenu`, por exemplo, muda a tela
**sem** round-trip nenhum, e ali o carimbo é o sinal certo.

### ⚠ OK-code que abre popup trava a `wnd[0]` — **só no NAVEGADOR**

`/15` (Shift+F3) no menu abre a pergunta de logoff: `sap.its.getPopupCount()` vira `1` e a partir
daí o `okcd` de `wnd[0]` **não responde mais** — o `/nSE16` seguinte não postou nada e a tela ficou
parada 20 s. Bisseção: a mesma sequência **sem** o `/15` (`/nSE16` → `/3` → `/nSE38` → `/n`) anda
inteira. Dirigir popup é `wnd[1]` (fila `adt-client`, item 23).

⚠ **A trava é DESTE canal, não do SAP** — é uma das divergências medidas entre as duas vias. Na via
HTTP pura o mesmo gesto passa, inclusive com o modal **duro**: medido no s4h 758/250 em 05/09/2026
(item 58, `POC_webgui_popup/medicoes/spop-comandar.md`) que com o **SPOP** de `/nend` aberto — 11
SIDs na `wnd[1]`, **zero `btn[n]`**, só `usr/btnSPOP-OPTION1|2` — `comandar(s, '/nSE38')` devolveu
`delta`/`pegou: true` em 170 ms, `cuatitle` "Editor ABAP: 1ª tela", `tcode` SE38, popup sumido; e a
repetição de SE38→SE16 fez o mesmo em 86 ms. O SPOP era o de **logoff**, e a sessão continuou aberta
(`s.aberta`, mais um `state/ur` sem ação para confirmar o estado estável): o modal foi **descartado**,
não respondido "Sim". Ou seja, **na via HTTP o `comandar` não precisa fechar o popup antes** — quem
precisa é o navegador. Não medido: SPOP com campo obrigatório, ou popup de erro que a dynpro reponha.

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

**Medido no s4h 758/250 em 2026-09-04** (fila `adt-client`, item 26), **em 2026-09-05** pela via
HTTP pura (item 49) e **em 2026-09-06** de novo no DOM (item 82). Bruto, agregado e prova em
`sap-accelerate/work/POC_webgui_menu/`; a leitura em `medicoes/item26-menu.md`,
`medicoes/item49-menu-http.md` e `medicoes/item82-arvore-no-xmp.md`.

⚠ **As duas vias divergem só no ACIONAMENTO:** as duas recebem a árvore INTEIRA no boot e a leem de
graça — na HTTP ela está no delta, no navegador está guardada como marcação inerte dentro de `<xmp>`
(§ abaixo). O que muda é o gesto: na HTTP só a FOLHA vira POST (`action/4`); no navegador o clique é
em ELEMENTO, e a folha só vira elemento depois de o pai ser clicado — a cascata é irredutível.

```js
import { arvoreDeMenu, abrirMenu, navegarMenu, itensDeMenu } from './webgui.mjs';

const arvore = await arvoreDeMenu(s);   // 146 itens, 4 níveis, ZERO clique, ~20 ms (SE38)
const sob = await navegarMenu(s, 'Sistema > Serviços', { acionar: false });   // só DESCOBRE
sob.filhos.map((i) => i.rotulo);        // Reporting | QuickViewer | Batch input | … — 8 ms, 0 clique

const r = await navegarMenu(s, 'Sistema > Serviços > Reporting');
r.mudou;   // true — partiu da SE38 e chegou na SA38, sem o script saber o tcode
```

### O menu não é ELEMENTO antes de aberto — mas a árvore inteira já está no DOM, em `<xmp>`

Quem materializa a barra é o botão `cua2sapmenu_btn` (SID `wnd[0]/tbar[0]/[0]`). ⚠ O `lsdata[14]`
dele nomeia o popup (`mnu0_63`, `mnu0_494`) e **muda a cada render** — não serve de âncora. Estáveis
são o id do botão e o SID `wnd[0]/mbar`.

Elemento não há mesmo: na SE38 recém carregada, `querySelectorAll('[ct="POMNI"]')` **sem** filtro de
visível devolve 0 de `wnd[0]/mbar` (os 7 que aparecem são o menu de informação do sistema). Mas o
boot escreve a marcação de CADA popup num `<xmp>` inerte (`class="lsPopupMenu__metaData"`, 28 na
SE38), e ali estão os **146 `POMNI` em quatro níveis com os 11 cinzas** — os mesmos que a via HTTP
recebe no delta. O renderer **guarda a marcação e infla sob demanda**, um popup por clique: o botão
inflou os 7 do nível 0; "Sistema" inflou só os 12 filhos dele.

É disso que vive o `arvoreDeMenu` (`DOMParser` sobre o texto dos `<xmp>`, documento solto que não
entra na página) e é por isso que `navegarMenu` resolve o caminho INTEIRO — rótulo inexistente,
item cinza — **antes de tocar na tela**: medido na SE38, a guarda do cinza caiu de 13 559 ms (e 51
elementos materializados, com o menu ficando aberto) para 6 ms com o DOM intocado.

Aberto, o menu é o modelo mais legível deste canal: **o `id` de cada item É o caminho**, igual ao
SID do SAP GUI.

```
wnd[0]/mbar/menu[5]                    Sistema
wnd[0]/mbar/menu[5]/menu[3]            Sistema > Serviços
wnd[0]/mbar/menu[5]/menu[3]/menu[0]    Sistema > Serviços > Reporting
```

### O vocabulário `lsdata` do `POMNI` — oito índices, nenhum sobrando

Os sete primeiros do item 26 (121 itens da SE38); o `5` entrou no item 48 (279 itens, 5 telas).

| índice | o que é | cobertura |
|---|---|---|
| `1` | o rótulo | 121/121 |
| `4` | `true` = há uma **linha separadora logo acima** (início de grupo) — provado por posição `y` | 14 |
| `5` | `false` = item **DESABILITADO**; ausente = habilitado | 7 de 279 |
| `6` | `true` = tem submenu | 26 |
| `7` | o id do popup filho — **volátil** | 26 |
| `15` | o atalho (`F5`, `CTRL_F3`, `ESCAPE`) | 29 |
| `18` | `{ SID, Type: 'GuiMenu' }`; o SID é **igual** ao `id` do DOM | 121/121 |
| `19` | o rótulo de novo — igual ao `1` | 121/121 |

`lsdata[6] === true` ⟺ existe `lsdata[7]` ⟺ `aria-haspopup="true"`, 1:1 nos 121.

### O item DESABILITADO: `lsdata[5] === false` — e o ARIA engana

Medido no item 48 (s4h 758/250, 05/09/2026), 279 itens de 5 telas — SE38, SAP Easy Access, SE16,
SM37, SU01. **A SE38 não tem nenhum item cinza**; as outras quatro têm 7 no total (SU01 "Usuário >
Gravar", Easy Access "Processar > Criar ligação no desktop", …). Os 7 trazem, sempre juntos:

```
lsdata[5] === false   ·   aria-disabled="true"   ·   class="urMnuRowDsbl…"
```

e os 272 habilitados **omitem o `5`** — o `lsdata` só transporta o que difere do default, como já
fazia com `4` e `6`. Por isso `interpretarItemDeMenu` lê a habilitação do **`lsdata[5]`**, ausente
é `habilitado: true`, e não há mais `null`.

⚠ **`aria-disabled="false"` NÃO quer dizer "habilitado".** Ele aparece só no item **realçado** de
cada popup — 47/47 batem com a classe `urMnuRowOn`, nas 5 telas. Quem lia habilitação do ARIA
estava lendo o realce; era isso que fazia o `"true"` nunca aparecer na SE38 (nenhum item cinza lá).

⚠ **O cinza não está na cor.** A cor computada do item desabilitado é a mesma do habilitado
(`rgb(50,54,58)` em todos os nós da árvore, os dois). A única marca é a classe `urMnuRowDsbl` — não
adianta procurar item desabilitado por `getComputedStyle`.

**O que "desabilitado" faz**, medido no MESMO popup ("Processar", do Easy Access): clicar no cinza
deixa o menu **aberto** e o carimbo **igual**; clicar no irmão habilitado **fecha** o menu e muda o
carimbo. O clique é engolido — por isso `navegarMenu` **lança** ao topar com um item desabilitado,
em vez de esperar 8 s por filhos que nunca vêm:

```
webgui: navegarMenu — "Criar ligação no desktop" está DESABILITADO nesta tela
        (wnd[0]/mbar/menu[1]/menu[3]); o clique não faria nada
```

### ⚠ Seis armadilhas, todas silenciosas

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
6. **Fechar o menu NÃO apaga nem esconde os `POMNI` — empurra o popup para fora da tela.** Medido
   no s4h 758/250 em 06/09/2026 (item 94, `POC_webgui_fecharmenu/medicoes/item94-fecharmenu.md`):
   depois do toggle de fechamento, os 6 `<tr>` continuam no DOM medindo 289×32, com
   `display: block` e `visibility: visible` — só o `rect.y` vai a **-100000** (e a raiz do popup,
   `mnu…-r`, encolhe para 1×1). Quem afere "menu aberto" por `offsetWidth || offsetHeight` lê
   SEMPRE aberto: era isso que fazia `fecharMenu` gastar 15,5 s nas 3 tentativas e devolver `false`
   com o menu já fechado no primeiro clique. O teste certo é o **retângulo contra o viewport** (é o
   que `JS_ITENS_DE_MENU` faz); a segunda testemunha é o `aria-expanded` do `cua2sapmenu_btn`
   (`true` aberto, `false` fechado). Com o assert certo, fechar custa **~20 ms** — é DOM puro, sem
   ida ao servidor.

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

- ~~A árvore do SAP Easy Access (`TV` + `MG`)~~ **medida** (item 50): é outro caminho, com outro
  vocabulário — § "A ÁRVORE do SAP Easy Access" abaixo. E o `action/74` do `lsevents` dela **não
  existe** no protocolo.
- **A árvore inteira também está no DOM da via CDP, invisível?** O navegador recebe o mesmo
  delta-update que traz os 146 itens. Se estiver, a cascata de cliques daqui vira uma leitura só
  (fila item 82).
- ~~Folha de menu que abre POPUP~~ **medida** (item 83): o `mudou` diz QUE mudou, nunca O QUE —
  quem separa "abriu modal" de "trocou de tela" é o `popup` que a via HTTP agora devolve
  (§ "A folha de menu que abre POPUP" abaixo).

### O mesmo menu pela via HTTP pura — um POST, sem Chrome

**Medido no s4h 758/250 em 2026-09-05** (item 49, `medicoes/item49-menu-http.md`).

```js
import { abrirTransacao, itensDeMenu, navegarMenu } from './its.mjs';

const s = await abrirTransacao(cfg, 'SE38');              // o boot JÁ traz a árvore: 146 itens
itensDeMenu(s).filter((i) => i.nivel === 0);              // Programa | Processar | … — ZERO rede
(await navegarMenu(s, 'Sistema > Serviços', { acionar: false })).filhos;   // idem, 27 ms

const r = await navegarMenu(s, 'Sistema > Serviços > Reporting');
r.mudou;   // true — SE38 → SA38 em 91 ms, UM POST
```

**Não há menu a abrir aqui.** O boot da SE38 devolve **146 `POMNI` de `wnd[0]/mbar/…`** em três
níveis, com `id` == SID == caminho — o renderer é que materializa o popup sob demanda, o
delta-update já transporta tudo. Consequência: `abrirMenu`, `fecharMenu`, o toggle e a cascata
**não têm equivalente** nesta via, e não fazem falta. (Contra-prova: `action/3/wnd[0]/tbar[0]/[0]`,
clicar o botão de menu, devolve `-102 control not found` — ele não é endereçável por SID.)

O comando é o `action/4` que o `POMN` **pai** publica no `Select` (o `POMNI` não publica nada), e
ele **leva o SID do item**:

| POST | resposta | efeito |
|---|---|---|
| `action/4/wnd[0]/mbar/menu[5]/menu[3]/menu[0]` ("Reporting") | `delta` **76 ms** | SE38 → **SA38** |
| `action/4/wnd[0]/mbar/menu[5]` ("Sistema", com submenu) | `delta` 85 ms | **nada** — 146 menus antes e depois |
| `action/3/…/menu[3]/menu[0]` (contra-prova) | `multipart` **`-101` not supported** | nada |

As três linhas juntas: o comando é o `4` (o `3` é recusado no mesmo SID), o endereço é o SID do
item, e `action/4` em nó COM submenu é aceito e inócuo — "abrir" é gesto de UI, não de protocolo.
Só a folha vira POST. A guarda do item desabilitado (`lsdata[5] === false`, item 48) vale igual e
custa **zero rede**: os 11 cinzas dos 146 já vieram no delta.

### A folha de menu que abre POPUP — `mudou` diz QUE mudou, nunca O QUE

**Medido no s4h 758/250 em 2026-09-06** (item 83, `medicoes/item83-menu-popup.md`), sempre de uma
SE38 limpa, uma sessão por caso:

| caminho | `mudou` | dynpro | `popup` |
|---|---|---|---|
| `Sistema > Status...`            | `true` | SE38/SAPLWBABAP **igual** | `wnd[1]` "Sistema: status" |
| `Ajuda > Configurações...`       | `true` | **igual** | `wnd[1]` "Configurações individuais…" |
| `Utilitários > Configurações...` | `true` | **igual** | `wnd[1]` "Configurações específicas…" |
| `Sistema > Serviços > Reporting` | `true` | SE38 → **SA38/SAPMS38M** | `null` |

As quatro são `forma: 'delta'`, `pegou: true`, `mudou: true`. **O `mudou` sozinho não separa "abriu
modal" de "trocou de tela"** — e a dynpro tampouco, porque a modal vem no MESMO delta sem trocá-la.
(O carimbo do item 59 já pega as três primeiras por causa da `janelaAtiva`; o veredito ANTIGO, de só
título + dynpro, dava `false` nelas. O que faltava era **dizer qual das duas coisas** foi.)

Quem diz é o `popup` que `navegarMenu` devolve — o objeto, com título e botões por SID:

```js
const r = await navegarMenu(s, 'Sistema > Status...');
const veredito = !r.mudou ? 'nada' : r.popup ? 'popup' : 'tela';   // uma expressão, sem 2º lerTela
r.popup.botoes.map((b) => b.rotulo);   // ['Detalhes', 'Avançar', 'Navegar', …, 'Cancelar']
```

⚠ **Com uma modal já aberta o menu MENTE.** Medido: os 146 itens continuam no delta (os mesmos 7 da
barra) e `navegarMenu` resolve o caminho sem reclamar, mas o `action/4` volta **`multipart`,
`pegou: false`** — o modal engole o gesto. Leia `popup` **antes** de navegar; responda a modal
primeiro. (A guarda que faria isso lançar ainda não existe — fila item 131.)

⚠ **`temPopup` não é `popup`.** `lerResposta().temPopup` é um farejador do **corpo** (`regex` por
`wnd[n>0]`, ~0 ms) e vale `false` num `multipart` **mesmo com a modal aberta** — foi exatamente o
que o passo 3 mediu. Quem quer o estado da TELA lê `popup`/`popupDaSessao(s)`/`lerTela(s).popup`, ou
o `janela` que todo `postar` devolve (`wnd[0]` ou a modal de maior índice). O objeto custa os 8–17 ms
de `controlesDoDelta` num delta de 300 KB, e por isso `popupDaSessao` só o paga quando os SIDs já
dizem que há modal. Até 06/09/2026 o booleano se chamava `popup` — e `r.popup?.sid` dava `undefined`
em silêncio.

## A ÁRVORE do SAP Easy Access — o outro menu, o único que enxerga os FAVORITOS

**Medido no s4h 758/250 em 2026-09-05** (item 50). Bruto, agregado e prova em
`sap-accelerate/work/POC_webgui_arvore/`; a leitura em `medicoes/item50-arvore.md`.

```js
import { abrirTransacao, arvore, navegarArvore, expandirNo } from './its.mjs';

const s = await abrirTransacao(cfg, 'SMEN');       // o SAP Easy Access
arvore(s).nos;   // [{ n: 1, chave: 'Favo', rotulo: 'Favoritos', pai: -1, nivel: 0,
                 //    expansao: 'EXPANDED', temFilhos: true }, …] — zero rede

const d = await navegarArvore(s, ['Menu SAP', 'Escritório'], { acionar: false });   // .filhos, um POST
d.mudou;   // true — sem acionar NADA: a expansão já mudou a tela (§ o `mudou` depende do ramo)
const r = await navegarArvore(s, ['Menu SAP', 'Escritório', 'Agenda', 'Próprio']);
r.mudou;   // true — SMEN → SSC1 "Exibir compromissos", 2 561 ms (2 expansões + 1 acionamento)

await navegarArvore(s2, ['Favoritos', 'Produção']);   // → CO01, 386 ms, UM POST
```

### O container é quem sabe: o `nodeindexes`

A árvore são quatro `ct` que só juntos dizem alguma coisa. O **container** é o `STCS` (`tree#C105`)
e é o único que importa: no objeto do SID do `lsdata` dele (`Type: 'GuiTree'`) vem o **SID**
(`wnd[0]/usr/cntlIMAGE_CONTAINER/shellcont/shell/shellcont[0]/shell`) e o campo `nodeindexes` — a
árvore visível inteira, `[chave, categoria, índiceDoPai]`, 1-based, `-1` na raiz:

```
[0, ["Favo",2,-1], ["F00002",3,1], ["F00003",3,1], ["Root",0,-1], ["0000000004",1,4], …]
```

Cada linha visível tem três controles, e **o índice está no id deles**: `MG` (`#<n>#1#mg`, o
rótulo), `L` (`#<n>#ni`, o ícone) e `TV` (`#<n>#1#1#i`, com o rótulo em `lsdata[0]`).
`tree#C105#6#1#1#i` ⟺ `nodeindexes[6]` — é assim que rótulo e chave se encontram.

⚠ **O índice `n` é POSICIONAL e a expansão reindexa.** Abrir "Escritório" (6) empurrou "Logística"
do 8 para o 15. **Só a chave é estável** — guardar o `n` entre dois POSTs é o erro silencioso deste
vocabulário; `navegarArvore` refaz o percurso por chave a cada passo.

### ⚠ O `lsevents` da árvore MENTE sobre o protocolo

O `TV` publica `DoubleClick → action/74` e o `L` publica `Activate → action/1`. **Nenhum dos dois é
postável:**

| POST | resposta |
|---|---|
| `action/74/tree#C105#3#1#1#i` (o que o nó publica) | **`-102` control not found** |
| `action/1/tree#C105#6#ni` (idem, no ícone) | `-102` control not found |
| `action/74/<SID do container>` | **`-101` not supported** |

`-102` × `-101` separa as causas: o id `tree#…` **não é endereço** (é do renderer, o servidor não o
conhece); o SID do container **é**, mas `action/74` não é comando dele. Lido do próprio Chrome
(`Network.requestWillBeSent`), o gesto real endereça o **container pelo SID** e nomeia o nó por
**chave** no `content` — a mesma forma do `action/710` do ALV:

```json
[{"post":"action/41/<SID>","content":"type=node&node_key=0000000004"},
 {"post":"action/2/<SID>", "content":"type=OnNodeDoubleClick&node_key=0000000004"},{"get":"state/ur"}]
```

### Expandir e acionar são o MESMO gesto — quem decide é o nó

| POST | resposta | efeito |
|---|---|---|
| `action/2` `OnNodeDoubleClick&node_key=F00003` (folha) | `delta` **15,5 s** (fria) / 386 ms | SMEN → **CO01** |
| `action/2` `OnNodeDoubleClick&node_key=0000000004` (com filhos) | `delta` 108 ms | **expande**: 15 → 22 nós |
| `action/8` (o `CellExpand` do CONTAINER) com `type=node&node_key=…` | `delta` 129 ms | **expande**, igual |
| `action/2` `type=OnNodeExpand` (contra-prova) | `multipart` **`-132`** invalid argument | nada |

O `type` é vocabulário **fechado**; o `action/41` da seleção é dispensável (o duplo clique sozinho
navegou); e o comando publicado pelo **container** funciona, ao contrário do publicado pelo nó.

⚠ **O acionamento pode ser LENTO** — 15,5 s na primeira vez (transação fria), e um tiro anterior
estourou o teto de 30 s do `postar`. Por isso `acionarNo`/`navegarArvore` usam `TETO_ARVORE` (120 s).

⚠ **Rótulo com `>` dentro** (o favorito "Produção -> Controle de produção -> …"): o caminho corta em
`>`, então passe **array** — `navegarArvore(s, ['Favoritos', 'Produção'])`.

### A flag de "tem filhos" — o `<td subct="HIC">`, que o despejo por `[ct]` não vê (item 84)

**Medido no s4h 758/250 em 06/09/2026**; a leitura em `medicoes/item84-flag-filhos.md`. Os quatro
`ct` da árvore são CEGOS quanto a isto: o `lsdata` do `MG`, do `L` e dos dois `TV` é byte a byte o
mesmo numa folha e numa pasta, e a `categoria` do `nodeindexes` também não separa (folha e pasta do
menu são as duas `1`). A flag mora numa célula **sem `ct`**, que nem `controlesDoHtml` nem o
`JS_DESPEJO_CONTROLES` enxergam:

```html
<td id="tree#C105#9#1" subct="HIC" lsdata='{"x":0,"4":2,"5":"COLLAPSED"}' altAction="HICEXP" st="-" lv="2">
```

| `lsdata[5]` | `st` / `altAction` / ícone | `temFilhos` | o que é |
|---|---|---|---|
| `EXPANDED` | `+` / `HICCOL` / `s_opfold` | `true` | pasta ABERTA |
| `COLLAPSED` | `-` / `HICEXP` / `s_clofol` | `true` | pasta FECHADA |
| `INDENT` | `-` / *(sem)* / `s_f_favo`, `s_wfwire` | **`false`** | **FOLHA** |

`expansaoDoHtml(delta)` lê isso, `arvore(sessao)` já cola em cada nó (`expansao`, `temFilhos`), e
**`expandirNo` numa folha não posta nada** (devolve `{ pulou: true, abriu: false, filhos: [] }`) —
`navegarArvore(…, { acionar: false })` até uma folha caiu de 1 POST/~180 ms para **0 POST/22 ms**, e
o acionamento continua chegando na transação.

⚠ **A flag é assimétrica** (31 nós medidos, 30 acertos): `INDENT` → folha acertou 10/10 e é o lado
que poupa o POST; `COLLAPSED` é "expansível" DECLARADO — houve uma pasta que abriu com **zero**
filhos ("Pesquisa de payload"). Errar para esse lado custa o POST que já se pagava.

⚠ **`temFilhos: null` é "não sei"**, não "não tem": a tela veio sem `HIC` (ou os brutos vieram de
outra via). Aí o POST sai como antes.

### O `mudou` do `navegarArvore` depende do RAMO (item 99)

O `mudou` é sempre o veredito da TELA (carimbo ANTES × DEPOIS, § item 59) — mas **de qual POST**
muda com o `acionar`:

| chamada | o `mudou` responde | onde está o resto |
|---|---|---|
| `navegarArvore(s, caminho)` | o **duplo clique** (`action/2`) — a ação pegou? | as expansões do caminho, em `expandidos` |
| `navegarArvore(s, caminho, { acionar: false })` | as **expansões** (`action/8`), agregadas | — não há acionamento nenhum |

Até 06/09/2026 o ramo `{ acionar: false }` devolvia **`mudou: false` fixo**, e isso era mentira
sempre que `expandidos.length > 0`: cada expansão é um `action/8` que muda a árvore (o `nodeindexes`
ganha nós). Quem lesse o campo para decidir "preciso reler?" releria de menos.

A agregação é `agregarMudou(vereditos)` — puro, em `webgui.mjs`, reexportado pelo `its.mjs`: `true`
se **alguma** expansão mexeu, `null` se nenhuma mexeu mas alguma foi inconclusiva (o `mudou` da via
ITS é ternário), `false` quando nada postou. **Não é o `mudou` do último POST**: numa árvore a
expansão que muda a tela costuma ser a do MEIO do caminho, e o último passo é justamente o que já
estava aberto — aí o último POST nem sai.

Só entra na agregação a expansão que **postou**: `expandirNo` com `pulou: true` (folha, ou nó já
`EXPANDED`) não conta, e — desde o mesmo item — também não entra mais em `expandidos`.

**Por que o carimbo enxerga uma expansão**, se os nós (`TV`/`MG`/`L`) não têm SID nenhum: o
`sidsDaResposta` guarda o `nodeindexes` DENTRO do objeto do SID do container `GuiTree`, e o
`carimboDosSids` hasheia os SIDs com `lsdata` e tudo. Nó a mais na árvore ⇒ `nodeindexes` diferente
⇒ hash diferente. Conferido em 06/09/2026 com os deltas sintéticos do `its.test.mjs`.

### Colapsar — o `action/9`, o irmão IDEMPOTENTE do `action/8` (item 85)

**Medido no s4h 758/250 em 06/09/2026**; a leitura em `medicoes/item85-colapsar.md`. O container
declara `CellCollapse → action/9` ao lado do `CellExpand → action/8`, e ele **existe** de verdade —
mesmo content (`type=node&node_key=<chave>`), 70–84 ms. Seis POSTs sobre "Favoritos":

| POST | estado antes | efeito |
|---|---|---|
| `action/9` | `EXPANDED` | **COLAPSA** — 15 → 13 nós |
| `action/9` | `COLLAPSED` (o mesmo nó, ou um virgem) | **nada**, e é aceito |
| `action/9` | FOLHA (`INDENT`) | nada, e é aceito |
| `action/8` | `COLLAPSED` | expande — 13 → 15 nós |
| `action/8` | `EXPANDED` | **COLAPSA** — 15 → 13 nós |

⚠ **A assimetria dos irmãos é o que importa: o `9` é IDEMPOTENTE, o `8` é TOGGLE.** Quem repetisse o
`action/8` para "garantir aberto" **fecharia** o nó. Por isso os dois viraram operações de ESTADO na
lib, e nenhuma delas posta quando o nó já está como se pede:

```js
await colapsarNo(s, { chave: 'Root' });      // { fechou: true, nosAntes: 22, nosDepois: 4 } — 83 ms
await colapsarNo(s, { chave: 'Root' });      // { pulou: true, fechou: false } — 0 POST
await expandirNo(s, { chave: '0000000004' }); // nó já aberto: { pulou: true }, 0 POST — NÃO fecha mais
```

**Vale porque encolhe todo POST seguinte.** O peso do `delta` medido no mesmo E2E: 22 nós =
**304.231 B**, 4 nós = **214.393 B** — colapsar a raiz do menu tirou **89.838 B (29,5%) de cada
resposta**, ~5 KB por nó visível.

**Reabrir restaura a árvore inteira** — `Root` voltou com os mesmos 22 nós, "Escritório" ainda
aberto: o servidor guarda a expansão de DENTRO do nó colapsado, e o percurso já feito não se perde.

### Árvore × barra de menu — quando usar qual

| | barra (`navegarMenu`, item 49) | árvore (`navegarArvore`, item 50) |
|---|---|---|
| vem no boot | **inteira** (146 itens na SE38) | **só o nível aberto** (15 nós) |
| endereço | o SID do item | a **chave** do nó, no container |
| descer um nível | zero rede | **um POST** por nível fechado |
| acionar | `action/4/<SID do item>` | `action/2/<SID do container>` + `node_key` |
| enxerga FAVORITOS | não | **sim — é o único caminho que enxerga** |
| existe onde | em toda tela | só onde há `GuiTree` (o SMEN) |

O que **ainda não** está medido: a `categoria` do `nodeindexes` (`0`/`1`/`2`/`3` — item 84 mediu que
ela NÃO é a flag de filhos; o que ela significa segue aberto) e por que uma pasta declarada abre
vazia.

### A MESMA árvore pelo navegador — um gesto só, e ele não fecha a raiz (item 86)

**Medido no s4h 758/250 em 06/09/2026**; a leitura em `medicoes/item86-arvore-navegador.md`. O
`webgui.mjs` tem hoje `arvore`, `expandirNo`, `colapsarNo`, `acionarNo` e `navegarArvore` com a
MESMA assinatura da via HTTP — as puras (`indiceDoNo`, `containerDaArvore`, `arvoreDosBrutos`,
`acharNoDaArvore`) são literalmente as mesmas funções, e moram no `webgui.mjs`; o `its.mjs` as
importa. O que muda é de onde vêm os brutos (delta × DOM) e o GESTO:

```js
import { abrirTransacao, arvore, navegarArvore, colapsarNo } from './webgui.mjs';

const a = await arvore(s);          // 15 nós, ~15 ms, ZERO rede — inclusive `expansao`/`temFilhos`
await navegarArvore(s, ['Menu SAP', 'Escritório'], { acionar: false });   // os 7 filhos, 611 ms
await navegarArvore(s, ['Favoritos', 'Produção']);                       // → CO01
```

⚠ **A flag de filhos exige despejar `[subct="HIC"]` além de `[ct]`** — o `<td>` do estado não tem
`ct`, então `lerTela` não o traz; quem o lê é o `JS_ARVORE`.

⚠ **Aqui o gesto é UM só e é TOGGLE**: o duplo clique expande o nó fechado, FECHA o aberto e ACIONA
a folha (54 s no favorito frio, contra 15,5 s no POST). Por isso as guardas de estado deixam de ser
economia e viram **segurança** — `expandirNo` numa folha acionaria a transação, e num nó aberto o
fecharia. O ícone (`L`) também expande com duplo clique (o item 50 tinha medido só o clique simples,
que não posta nada).

⚠ **A RAIZ não fecha por gesto.** `Root` e `Favo`, as duas `EXPANDED`: o duplo clique posta o mesmo
`action/2` `OnNodeDoubleClick`, o servidor responde, e a árvore fica idêntica — enquanto um nó de
nível 1 fecha em 253 ms. É a única operação que esta via não alcança, e é a que mais encolhe o delta
(item 85: fechar a `Root` tira 29,5%). Quem precisa disso usa a via HTTP (`its.colapsarNo`,
`action/9`). O resultado sai honesto e rápido — `{ fechou: false, respondeu: true }` em 1,8 s —
porque a espera fecha no **round-trip** (item 80) e não no teto: sem isso eram 30 s por gesto inócuo.

| | HTTP (`its.mjs`) | navegador (`webgui.mjs`) |
|---|---|---|
| ler a árvore | do delta, zero rede | do DOM, zero rede (~15 ms) |
| expandir | `action/8` (toggle) | duplo clique (toggle) |
| colapsar nó interno | `action/9` (**idempotente**) | duplo clique (toggle) |
| colapsar a RAIZ | **sim** (22 → 4 nós) | **NÃO** — posta e nada muda |
| acionar folha | `action/2`, 15,5 s fria | duplo clique, **54 s** fria |

### `action/41` — a seleção isolada, e os FAVORITOS pela via HTTP (item 54)

**Medido no s4h 758/250 em 05/09/2026** (`sap-accelerate/work/POC_webgui_tstcc/`). O `action/41` que
o item 50 dispensou (o duplo clique sozinho navega) **tem função própria**: ele é quem torna o nó o
CORRENTE, e é disso que os comandos de menu que agem sobre o nó dependem.

```js
// selecionar sem acionar — delta, 75 ms
await postar(s, [{ post: `action/41/${arvore(s).sid}`, content: `type=node&node_key=F00004` }, ESTADO]);
await navegarMenu(s, 'Favorites > Delete');    // statusbar "Node deleted from favorites list"
```

Sem o `action/41` antes, o mesmo `Favorites > Delete` recusa. E o ciclo inteiro dos favoritos é HTTP:

| gesto | POST | resultado |
|---|---|---|
| inserir | `navegarMenu(s, 'Favorites > Insert Transaction')` → popup `wnd[1]` "Manual Entry of Transaction" (1 campo, `txtSVALD-VALUE[0,21]`) + `preencher` + `enter` | statusbar `Node added to favorites list`; a árvore vai de 15 a 16 nós, o novo é `F0000<n>` "Transaction \<TCODE\>" sob `Favo` |
| tcode que não existe | idem | **recusa na inserção**: `Transaction … does not exist`, nenhum nó novo |
| acionar | `acionarNo(s, { chave })` | a transação abre (92–108 ms) |
| apagar | `action/41` + `Favorites > Delete` | `Node deleted from favorites list` |

⚠ **O SID do container não sobrevive ao `/nSMEN` na mesma sessão.** Voltando ao menu depois de ter
entrado na transação pelo favorito, o `action/41` responde `multipart` e o `Favorites > Delete` dá
**`-103 failed to fire action: not available`**. Em sessão NOVA os mesmos dois POSTs apagam em
165 ms. Quem gerencia favorito depois de navegar: abra outra sessão.

#### Por que isto é RECEITA e não API (item 92, 06/09/2026)

O gesto de **escrever** favorito (inserir/apagar) apareceu **uma vez**: a fase C2 do item 54. O que
parece uma segunda e uma terceira vez são os seus próprios ecos — a C3 é a limpeza do favorito que a
C2 deixou, e o item 91 investiga o `-103` que essa limpeza produziu. Uma dor e os seus ecos, não
três dores.

E o uso era instrumental: a transação `$TMP` recém-criada não está em menu de área nenhum (fase C1:
zero `YJBV` nos 15 nós), então **Favoritos era o único ramo da árvore que ela alcançava**. Caminho de
medição, não requisito.

Contra o que a lib já entrega — números do MESMO item 54, mesmo par de transações:

| para… | pelo favorito | pela via que já existe |
|---|---|---|
| entrar numa transação | inserir 129–208 ms + acionar 92–108 ms = **221–316 ms**, escreve estado persistente do usuário, e desfazer exige sessão nova | `comandar(s, '/n<TCODE>')` — **103–119 ms**, sem efeito colateral, e alcança transação que não está em menu nenhum |
| saber se o tcode existe | recusa no popup (`Transaction … does not exist`) | `readTransaction` (sem GUI, sem escrever) ou o próprio `/n`, com a mesma mensagem |
| ler / acionar favorito que **já existe** | — | **já é API** desde o item 50: `arvore`, `acharNoDaArvore`, `navegarArvore(['Favoritos', …])`, `acionarNo` |

O que falta de API é exatamente o que ninguém pediu: **escrever** favorito. E escrever cobra em outra
moeda — favorito é estado persistente do usuário no sistema do cliente; uma API que os cria deixa
lixo no SAP de quem roda a lib, e a receita acima já mostra que desfazer exige sessão nova.

**O que reabre a decisão:** um uso real, fora de medição, que precise ESCREVER favorito — reproduzir
o ambiente de um usuário final, ou testar autorização de menu. Isso é hipótese, não dor: não apareceu
em nenhuma sessão até aqui. Quando aparecer, a receita acima já é a implementação — promover é
embrulhá-la.

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

### O BOTÃO desabilitado: `lsdata[5] === false` — o mesmo índice do item de menu

Medido no item 81 (s4h 758/250, 06/09/2026) com **irmãos construídos de propósito**: o report
`ZJBV_BTN81` põe três pushbuttons na mesma tela de seleção — um normal, um com `SCREEN-INPUT = 0`,
um com `SCREEN-ACTIVE = 0`. Mesma tela, mesmo estado, uma variável só. Os `lsdata` diferem em **um**
índice, e é o `5`:

```
BT_ON  {"0":"BTN ON", "3":"100%",           "17":"B","20":true,"21":true,"27":{SID:"wnd[0]/usr/btnBT_ON"}}
BT_OFF {"0":"BTN OFF","3":"100%","5":false, "17":"B","20":true,"21":true,"27":{SID:"wnd[0]/usr/btnBT_OFF"}}
```

Com o `5` vêm sempre juntos: `aria-disabled="true"`, `tabindex="-1"`, `hidefocus="true"`, a classe
`lsButton--disabled` (e a saída de `lsButton--active`/`--focusable`), `opacity: 0.4` e
`cursor: default`. **Habilitado OMITE o `5`** — a mesma economia do menu (item 48). Por isso
`habilitadoDoBotao(lsdata, aria)` é `!(lsdata[5] === false || aria === 'true')`, e o `lerTela`
devolve `habilitado` em cada botão.

⚠ **A regra é por PAPEL, não geral.** No campo de entrada (`ct="CBS"`) o `lsdata[5]` é o **valor
digitado** (`"ativo"`), não flag nenhuma. Ler o `5` de qualquer controle mente.

⚠ **`el.disabled` mente sempre.** O botão é um `<div ct="B">`, e a propriedade DOM nem existe nele:
`false` em **390 botões de 27 estados**, o cinza inclusive. Era o único campo de habilitação que o
despejo tinha antes deste item. No CAMPO (`<input>`) quem carrega a verdade é `el.readOnly`
(`P_OFF` com `SCREEN-INPUT = 0` sai `readOnly: true`, `disabled: false`) — o `editavel` já vinha
certo por causa dele.

⚠ **O `lsevents` NÃO distingue.** O `Press` continua declarado no botão cinza, byte a byte igual ao
do irmão habilitado. Quem lê pela via HTTP (§ menu por HTTP) também precisa do `lsdata[5]`.

**O que "desabilitado" faz:** o clique **não sai do navegador**. Contra-prova com o report
carimbando a statusbar a cada `USER-COMMAND`:

| clicado | POSTs | mensagem |
|---|---|---|
| `btnBT_OFF` (`5:false`) | **0** | nenhuma |
| `btnBT_ON` (irmão, sem `5`) | **1** | `ITEM81 CLICOU BT_ON` |

É mais radical que no menu (lá o clique também era engolido, mas pelo popup): aqui o ITS nem monta
o round-trip. Esperar resposta de um botão cinza é esperar para sempre.

⚠ **Desabilitado ≠ escondido.** O `BT_HID` (`SCREEN-ACTIVE = 0`) **não está no DOM** —
`innerHTML.indexOf('btnBT_HID') === -1`. Procurá-lo e não achar não quer dizer "cinza".

### ⚠ A BARRA não acinzenta: o `EXCLUDING` REMOVE o botão

Foi o que custou a medição: **390 botões, 27 estados, 18 telas — nenhum botão de toolbar cinza.**
Varridos: telas iniciais (SE38, SE16, SU01, SM37, SE11, SM30, SE93, SM59, ST22, SE24,
SM36, SP01, SE09, SM12, SM21, AL11, SAP Easy Access), estados navegados (SM30 em exibição, SE16
executado, ALV do RSPARAM com e sem linha selecionada, tela de seleção longa do RSUSR002) e a
barra do ALV. O botão inaplicável **some** da barra: é o `SET PF-STATUS … EXCLUDING`, que no menu
deixa o item cinza (item 48) e na barra não renderiza nada.

Duas consequências práticas:

1. **Quem fica cinza é o pushbutton da dynpro** (`wnd[n]/usr/btn…`), desabilitado por
   `SCREEN-INPUT = 0`. Ele **não tem `::btn[n]` no id**, então `botoes()` não o vê — é o `lerTela`
   que o traz (`okcode: null`, acionado pelo id).
2. No SAP Easy Access não existe `btn[3]`: no lugar do Voltar o ITS põe um **placeholder**
   `wguEmptyF3` — `ct="B"`, `aria-hidden="true"`, sem SID, sem `lsevents`, e com `lsdata[5]: false`.
   Procurar "o botão Voltar cinza" acha esse artefato, que não é botão de tela nenhum.

### O que cada peça entrega

```js
const t = await lerTela(s);
t.janela      // { sid: 'wnd[0]', principal: true }   ← a janela ATIVA; principal:false é POPUP (wnd[1])
t.mensagem    // { tipo: 'ERROR', texto: 'O programa ZZNAOEXISTE9 não existe' } | null
t.campos      // [{ id, sid, campo, rotulo, dica, valor, maxlen, editavel, visivel }]
t.radios      // [{ campo, grupo: '%RBG0257', rotulo, selecionado }]
t.checkboxes  // [{ campo, rotulo, marcado }]
t.botoes      // [{ okcode: 'btn[8]', rotulo: 'Executar', tecla: 'F8', accesskey: 'E', habilitado: true }]
              //   `okcode: null` é PUSHBUTTON de dynpro (`wnd[0]/usr/btnBT_ON`) — aciona pelo id
t.grids       // [{ sid, colunas: ['NAME','USER_VALUE',…], linhas: 1617, editavel: false }] — as LINHAS saem do `lerGrid` (§ "O ALV")
t.okcode      // { sid: 'wnd[0]/tbar[0]/okcd' } — sempre invisível, sempre lá
```

### O que o gesto DEVOLVE — e por que `mudou` não é "a ação surtiu efeito"

`comandar`, `acionar` e `clicar(…, { esperarResposta: true })` devolvem, além de `mudou`/`respondeu`,
o **`{ mensagem, janela }`** — o que o ABAP disse sobre a ação e onde a tela está:

```js
await comandar(s, 'SHOW')
// { okcode: 'SHOW', mudou: true, respondeu: true, ms: 1743,
//   mensagem: { tipo: 'ERROR', texto: 'O programa ZJBV100NAOEXISTEA não existe' },
//   janela: 'wnd[0]' }                       ← 'wnd[1]' = tem popup na frente
```

⚠️ **Não leia `mudou` como "a ação pegou".** Medido no s4h 758/250 em 06/09/2026 (item 100,
`sap-accelerate/work/POC_webgui_mensagem/medicoes/item100-mensagem.md`), o carimbo do DOM
(`title | nº de elementos | 300 chars do innerText`) inclui a barra de mensagem **por acidente**:
na MESMA tela SE38, a mensagem NASCER conta como "a tela mudou" (`nEl` 630→632), e o TEXTO dela
trocar **não conta** (a msgbar está no char 317, o carimbo lê 300) — e depois de um `/n`, quando a
tela encurta, a msgbar cai no char 58 e passa a contar. Quem responde "a ação surtiu efeito" é a
`mensagem` ou o dado. (O carimbo estrutural que resolve isso é o item 162 da fila.)

**O AVISO do popup.** Sai em `stderr` quando o mesmo popup continua na frente e a ação não conseguiu
nada — `!respondeu` **ou** `mudou === false`:

```
⚠ webgui: comandar(/nSE38) não conseguiu NADA e o popup wnd[1] continua aberto
  (a conversa com o ABAP nem aconteceu: o modal engoliu o gesto)
  — popup se responde clicando o botão DELE, não por tecla.
```

⚠️ **Com modal aberto, este canal é o pior dos dois.** Medido (item 100, fase F, 2/2): com o SPOP do
`/nend` de pé, `comandar('/nSE38')` devolve `respondeu: false, mudou: false` e paga **21 s** de teto
— nada sai do navegador. A via HTTP faz o MESMO gesto em 170 ms e descarta o modal (item 58). E
`acionar(s, 12)` nem tenta: com a modal aberta o `btn[12]` **sai do DOM**. Popup, aqui, se responde
clicando o botão dele.

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

## ⚠ Criar é mutação IMEDIATA — fechar a sessão NÃO é rollback

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

### As duas vias têm a MESMA pilha — o que muda é o momento de rodá-la (item 66)

O código é **um só**: `criarPilhaDeDesfazer` e `transacional` moram no `webgui.mjs` e o `its.mjs`
os **importa e reexporta**, como já fazia com o `montarTela`. Cabe: as duas funções só compõem
callbacks — não sabem de CDP nem de HTTP —, e a sessão de **cada** via tem a **sua** instância.
Trocar de via continua sendo trocar o import:

```js
import { abrirTransacao, comandar, fechar, transacional } from 'adt-client/its';   // ← via HTTP
const s = await abrirTransacao(cfg, 'SE16');   // nasce com s.desfazer, como a do navegador
```

O que **é** por via é o momento — e é a mesma regra dita duas vezes: **a pilha corre antes do gesto
que mata a sessão.** No navegador, antes do `Browser.close` (descartar é um clique, precisa da
página). Na via HTTP, antes do `/nex` (descartar é um POST, precisa da sessão do ITS): depois do
logoff o POST seguinte volta 400 `Session Timed Out` (regra 5 do handshake, item 20).

⚠ **A via HTTP tem um modo de falha que o navegador não tem:** a sessão do ITS morre **sozinha**
(timeout do servidor, um `/nex` adiantado) e aí não há descarte possível por ela. Nesse caso o
`fechar` **não** executa a pilha — executar gastaria os gestos um a um sem chance nenhuma e
apagaria os rótulos. Ele avisa alto, devolve `pendentes` e **preserva** a pilha, para quem abrir
outra sessão poder limpar:

```
⚠ its: NÃO consegui desfazer "rascunho órfão" — a sessão do ITS já estava encerrada, sobrou no sistema
```

**Medido no s4h 758/250 em 05/09/2026** (`POC_webgui_its_lib/medicoes/item66-desfazer-http.md`),
com gestos reais e reversíveis (`/nSE38` ↔ `/nSE16`) sobre a SE16: sessão nasce com pilha vazia;
não confirmado → a tela **voltou** para a SE16; confirmado → ficou na SE38, sem descarte; pendente
do `fechar` → o POST do descarte voltou `delta` em **81 ms** (prova de que a sessão ainda estava de
pé) e só então o `/nex`; descarte que falha → `ok: false` no relatório de `fechar` + aviso em
stderr; sessão morta com pendência → nada executado, `pendentes: ["rascunho órfão"]`, pilha
intacta.

### A morte tem DUAS caras, e uma delas mentia (item 106)

O parágrafo acima cobria a sessão que morre e **o objeto sabe** (`aberta: false`). Falta a outra: a
sessão morre **por trás** — timeout do servidor, logoff ICF pelo cookie — e `sessao.aberta` continua
`true`, porque quem descobre é o **próximo POST**. Sem sonda, esse próximo POST era o do DESCARTE, e
ele volta `sem-sessao` (400 `Session Timed Out`) **sem estourar**: o gesto resolvia, a pilha o dava
por bom e **consumia o rótulo**. Medido no s4h 758/250 em 06/09/2026
(`POC_its_retomada/medicoes/item106-retomada-sessao-b.md`):

```
fechar → {"encerrada":true,"via":"desfazer","desfeito":[{"rotulo":"rascunho …","ok":true}]}
pilha depois: []          ← e o rascunho AINDA no banco: LINHAS=1
```

Desfeito com `ok: true`, `pendentes: []`, lixo sem nome — o oposto do que a seção acima promete.
Hoje o `fechar` gasta um POST de `BOOT` como **sonda de vida** antes de correr a pilha (**53–63 ms**
com a sessão viva, **87–92 ms** com ela morta) e só corre se a sessão respondeu tela; e a pilha
aceita `executar({ guarda })`, que PARA o laço e deixa na pilha o que não rodou, para o caso de a
sessão morrer no meio. Sessão **sem** pendência não paga a sonda — fecha pelo `/nex` direto.

⚠ O contraste que explica o bug: um gesto **isolado** contra a sessão morta estoura (`its: a sessão
já foi encerrada (logoff) — abra outra`), porque aí `aberta` já é `false`. O falso `ok` só existia
no PRIMEIRO POST depois da morte silenciosa — exatamente o que o `fechar` fazia.

### Retomar numa sessão NOVA: roda, e custa ~843 ms (item 106)

Nesta via, abrir outra sessão é barato — então "sessão morta com pendência" não é necessariamente o
fim. **Medido no s4h 758/250 em 06/09/2026** contra uma tela que cria ao entrar **e bloqueia**
(`ENQUEUE_E_TABLEE` no `INITIALIZATION`, o que a tela do item 105 não tinha):

| dependência | medida |
|---|---|
| LOCK, com a A **viva** | a sessão nova entra na tela e lê `LOCK ALHEIO de MVJVELOSO - nao criei`; o descarte responde `Sem o lock`. Banco inalterado |
| LOCK, com a A **morta** | o lock **cai com a sessão** (`LOCKS=` vazio), pelas duas mortes — `/nex` e logoff ICF |
| TELA, gesto cru | **estoura**: a sessão nova nasce em "SAP Easy Access" — `its: campo "P_ACAO" não está na tela — tenho (nenhum)` |
| TELA, depois de navegar | **roda**: `comandar(B,'/nYJBV106')` **117 ms** + descarte **92 ms**; com a sessão nova, **~843 ms** no total. Banco: `LINHAS=0` |

As duas dependências são a mesma: enquanto a A segura o lock a B não chega na tela, e quando a A
morre o lock cai junto — que é o instante em que a retomada faria sentido.

⚠ **Mas o que está na pilha hoje NÃO é retomável.** `registrar(rotulo, fn)` guarda um closure que já
capturou a sessão A; rodá-lo na B não é reparametrizar, é reescrever. A medição só funcionou porque
o gesto foi escrito como função **da sessão** e porque alguém sabia **em que tela** ele vale. Uma
retomada de verdade exige a pilha guardar uma RECEITA (como chegar na tela + o gesto parametrizado),
não uma função — mudança de API, ainda não feita.

### E contra uma dynpro que CRIA AO ENTRAR (item 105)

O item 66 provou a primitiva com gestos reversíveis — nada era criado. **Medido no s4h 758/250 em
06/09/2026** (`POC_webgui_cria_ao_entrar/medicoes/item105-cria-ao-entrar.md`) contra o análogo do
FLP Designer: um report `$TMP` cuja `INITIALIZATION` grava em `INDX(ZZ)` e commita — quem só abriu
a tela já mutou —, dirigido por `comandar(s, '/nYJBV105')` dentro do `transacional`, com o descarte
na própria tela (`preencher(s,'P_ACAO','DESCARTAR')` + `enter`). Cada assert é um `runClass` em
**sessão nova** (outra LUW, outro canal):

| etapa | leitura em outra LUW |
|---|---|
| depois do `abrir`, antes do descarte | **1 linha** — a tela criou ao entrar |
| não confirmado → descarte no `finally` (`delta` em **69 ms**) | **0 linhas** |
| confirmado → descarte desarmado | **1 linha**, com carga nova |
| pendente do `fechar` (POST **68 ms**, antes do `/nex`) | **0 linhas**, `desfeito: [{ok:true}]` |

E a contra-prova, o roteiro do item 38 repetido aqui: `abrirTransacao` → `comandar('/nYJBV105')` →
`fechar(s)`, **sem** `transacional`, deixou **1 linha** no banco. `fechar` não é rollback também na
via HTTP — o `/nex` encerra a sessão, o que o servidor commitou fica.

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

⚠ **E existe comando que já vem ENDEREÇADO com o SID de OUTRO controle.** Medido em 05/09/2026
(fila 44): o `ActivateHelp` da barra de mensagens (`ct="MB"`) publica `action/1/wnd[0]/sbar` — o alvo
vem no comando, e não é o SID do próprio elemento (`wnd[0]/sbar_msg`). Antes de concatenar SID,
verifique se o comando já traz um (`/wnd[`, ou o sufixo `/ses[0]`).

**As duas vias leem o `lsevents`** — `controlesDoHtml`/`controlesDoDelta` do `its.mjs` (HTTP puro) e o
`JS_DESPEJO_CONTROLES` do `webgui.mjs` (DOM) despejam o mesmo campo, JSON já parseado, `null` quando o
controle não publica nada. Cruzado na MESMA SE38 (fila 44, 05/09/2026): dos 56 controles com id nas
duas vias, o mapa evento→comando é **igual em 56, diferente em 0**; e nos 4 raws do
`POC_webgui_its_lib` o parser acha 334 de 334 atributos (`medicoes/item44-lsevents-http.md`).

⚠ **Controle de SHELL não publica comando nenhum — o `lsevents` dele é só a lista de eventos.**
Medido em 05/09/2026 (fila 45) no grid `C102` da lista do RSPARAM: dos **17** eventos que ele
publica (`CellSelect`, `BlockSelect`, `RequestData`, `VerticalScroll`, `CopyToClipboardRequest`…),
**0 têm o índice `1`** — na mesma tela, os controles comuns têm 43 pares evento→comando. Vale até
para o `RequestData`, cujo `action/710` só apareceu capturando a rede (item 25). Para grid, árvore e
afins o comando vem do mapa `RGACTIONS` do renderer, não da tela: ausência de índice `1` ali **não**
quer dizer que o evento não tenha via — quer dizer que a tela não a declara.

⚠ **Mas o container da ÁRVORE publica, e o que ele publica FUNCIONA** (item 50): o `STCS` do SMEN
traz `CellExpand → action/8`, `RequestData → action/901`, `CellCollapse → action/9` com o índice
`1`, e o `action/8` postado no SID dele expandiu o nó. A regra fina é outra: **o container é
endereçável, o nó não** — o `action/74` que o `TV` publica devolve `-102 control not found`.

*Ponto aberto:* `action/2`, `3`, `4`, `8` e `41` já foram medidos nessa família (o `4` é o do MENU —
§ "O mesmo menu pela via HTTP pura", item 49; o `2`, o `8` e o `41` são os da ÁRVORE — § "A ÁRVORE
do SAP Easy Access", item 50). `action/7`, `9`, `25`, `62`, `309`, `810` e `901` aparecem no mapa mas
**não** foram postados; `action/1` e `74` foram e **não existem** no protocolo (`-102` no id do nó) — a contra-prova está em
`POC_webgui_lsdata/scripts/derivar.mjs`, à espera de uma janela com o s4h no ar (fila 43).

### Compor o POST a partir do `lsevents` — `acionar(s, alvo, { evento })` (item 71)

A composição virou código: `batchDoEvento(controle, evento, { valor })` no `its.mjs` é PURA — bruto
+ nome do evento → passos do batch —, e `acionar(s, alvo, { evento })` a liga na sessão. É assim que
se aciona o que **não é botão**:

```js
acionar(s, { sid: 'wnd[0]/mbar/menu[0]' }, { evento: 'Select' })   // action/4/<SID> — o POST do item 49
acionar(s, 'RS38M-PROGRAMM', { evento: 'FieldHelpPress' })         // focus/<SID> + vkey/4/ses[0]
acionar(s, 'ToolbarOkCode', { evento: 'Change', valor: '/nSE38' }) // okcode/ses[0] + content
eventosDoAlvo(s, 'btn[8]')   // o cardápio: [{ evento: 'Press', comando: 'action/3' }]
```

⚠ **O SID do controle mora ANINHADO no `lsdata`**, num índice numérico que varia por `ct` (`27`
botão, `21` campo, `5` menu, `19` rótulo, `13` radio, `11` barra de mensagens) — não é o `id` do
markup, que é `M0:56::btn[3]`/`ToolbarOkCode`/`mnu0_531`. Medido em 05/09/2026 (fila 71,
`POC_webgui_its_lib/medicoes/item71-compor-lsevents.md`): dos 392 controles com `lsevents` dos 5
raws, **387 trazem exatamente um** par `{ SID, Type }`, **nenhum traz dois**, e os 5 sem SID
(`sysInfoAreaToggle`) também não publicam comando. É o `sidDoLsdata` do `webgui.mjs` que o acha.

⚠ **SID repetido existe, e é sempre o menu:** 18 a 26 por tela — o `POMNI` (o item, sem `lsevents`)
e o `POMN` (o submenu, que publica o `action/4`) declaram o mesmo `wnd[0]/mbar/menu[n]`. **Nunca
dois com `lsevents`**, então `controleDoSid` desempata por quem declara disparo.

**Cobertura:** passado por todo par evento→comando dos 5 raws, **709 de 709 pares postáveis
compõem**, sem família desconhecida; as 239 recusas são 234 sem índice `1` (o renderer trata
sozinho) e 5 com `JScript`. Das 709 composições, **51 (7,2%) não são "comando + `/` + SID"** — 47
`vkey/<n>` sem sufixo e 4 `action/1/wnd[0]/sbar`. **Nada disso foi postado:** a contra-prova de
execução continua sendo a fila 43.

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
modelo**: § "Ler a tela do `delta-update`" abaixo. A **pilha de desfazer** também é das duas desde
o item 66 (§ "As duas vias têm a MESMA pilha").

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
tela.popup;                      // null, ou a modal ATIVA — a de maior wnd[n] (§ abaixo)
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

⚠ **"Com popup aberto o delta ESVAZIA a `wnd[0]/usr`" é FALSO** — foi conclusão do item 21, caiu na
medição do item 58 (05/09/2026) e virou código no item 98. O `steploop0` não "esvazia": ele é
**SEMPRE** a mesma casca de 119 bytes (`<div id="steploop0" ct="PLP" class="lsPagelayout__panel
lsPagelayout__panel--end"></div>`) nos 12 brutos varridos, com popup e sem. A dynpro mora no bloco
**`userpanel`**, e `telaDoDelta` a enxerga com o modal na frente. O controle que faltava ao item 21 é
a primeira linha desta tabela — reprocessando os brutos, sem tocar a rede:

| bruto | tela de trás | popup | campos `wnd[0]` |
|---|---|---|---|
| `POC_webgui_okcode/raw/c5-n.txt` | SMEN (menu) | **não** | **0** |
| `POC_webgui_okcode/raw/d3-nend.txt` | SMEN (menu) | SPOP | 0 |
| `POC_webgui_okcode/raw/d2-o.txt` | SMEN (menu) | Sessões ABAP | 0 |
| `POC_webgui_popup/raw/b-o.txt` | SE16 (seleção) | Sessões ABAP | **34** |
| `POC_webgui_popup/raw/i58-b-nend.txt` | SE16 (seleção) | **SPOP** | **34** |
| `POC_webgui_popup/raw/f0-nend.txt` | SE38 | SPOP | 1 |

**O SMEN sem popup nenhum também dá 0** — o menu não tem campos de dynpro para dar. A variável era a
tela de origem, não o modal. Toda tela com campos os manteve no delta com o popup aberto: na SE16 o
`userpanel` com modal traz os MESMOS 85 SIDs `wnd[0]/usr` do sem-popup. O único bruto em que o bloco
`userpanel` não veio é o **SMEN com popup** — e ali não muda leitura nenhuma (0 campos dos dois
lados); por que ele some, não está medido.

O `tela.aviso` foi reescrito no item 98: ele é de **endereçamento**, não de ausência, e dispara
sempre que há modal (antes só quando `campos.length === 0` — ou seja, mentia justamente na tela que
não tinha campos). `tela.popup` traz a modal ATIVA:

```js
tela.popup   // { sid: 'wnd[1]', id: 'SAPLSPO1100_1', titulo: 'Efetuar logoff',
             //   textos: [{ sid: 'wnd[1]/usr/txtSPOP-TEXTLINE1', texto: 'Os dados não gravados serão perdidos.' }, …],
             //   botoes: [{ sid: 'wnd[1]/usr/btnSPOP-OPTION1', rotulo: 'Sim', accesskey: 'S' }, { …OPTION2, rotulo: 'Não' }],
             //   campos: [], atras: [] }
tela.aviso   // 'popup wnd[1] aberto — campos e botoes são a wnd[0] ATRÁS do modal; o conteúdo da modal está em popup'
```

##### Modais EMPILHADAS: o popup é a de CIMA (item 70)

Duas modais abertas ao mesmo tempo é estado normal — medido em 05/09/2026 (`/o` e, com ele aberto,
`/ose16`; `POC_webgui_okcode/medicoes/raw/d2-ose16.txt`): o delta declara `wnd[1]` ("Sessões ABAP",
4 botões) **e** `wnd[2]` ("Informação — Nº máximo de janelas GUI atingido", 2 botões), com os
controles das duas. Quem responde é a de cima; a de baixo só volta quando ela fechar.

`tela.popup` / `popupDaTela` devolvem **a de maior índice** (a mesma regra da `janelaAtiva`), com
`atras` listando as de baixo. A pilha inteira, quando for preciso ler a de trás, é a
`popupsDaTela` — de baixo para cima:

```js
popupsDaTela(controlesDoDelta(s.delta)) // [{ sid: 'wnd[1]', titulo: 'Sessões ABAP', atras: [] },
                                        //  { sid: 'wnd[2]', titulo: 'Informação', atras: ['wnd[1]'] }]
tela.popup.sid                          // 'wnd[2]' — a de CIMA
tela.popup.atras                        // ['wnd[1]']
tela.aviso                              // 'popup wnd[2] aberto (sobre wnd[1] — é a de cima que responde) — campos e botoes são a wnd[0] …'
```

⚠ Até 05/09/2026 o `popupDaTela` era `find(Type === 'GuiModalWindow')` — a **primeira do markup**,
que é a de BAIXO: sobre o `d2-ose16.txt` devolvia a `wnd[1]` "Sessões ABAP" com os botões dela, e
quem lia o popup lia o de trás. Mesmo defeito de ordem-de-markup do item 42, § abaixo.

⚠ Os botões do popup (`btnSPOP-OPTION1`) **não são `btn[n]`**: entram em `tela.botoes` como
pushbutton da dynpro (`wnd[n]/usr/…`, `okcode: null` — o filtro do item 81), e por isso
`acionar(s, 'Sim')` não os acha — o endereço é `acionar(s, { sid: tela.popup.botoes[0].sid })`.
**Responder pelo SID está medido** (item 23, `POC_webgui_popup/medicoes/dirigir-popup.md`): o SID do
botão dispara, o apelido estoura e a **tecla não fecha o popup** (F12 voltou `pegou: true` e o modal
continuou lá — hoje isso vem como `mudou: false` mais o aviso alto, § "`pegou` × `mudou`"). E **não é preciso responder para sair**: `comandar` atravessa o modal (item 58, §
"OK-code que abre popup trava a `wnd[0]`").

#### O alvo tem JANELA — e por padrão é a ATIVA (item 42)

A `wnd[1]` pode ter **barra própria**, e a barra da `wnd[0]` **continua no delta** atrás do modal.
Medido no `/o` (`POC_webgui_okcode/medicoes/raw/d2-o.txt`): 17 botões — 4 da `wnd[1]`, 13 da
`wnd[0]` — e `btn[0]` existe **nas duas** (`wnd[1]/tbar[0]/btn[0]` "Avançar" e
`wnd[0]/tbar[0]/btn[0]`). Com `/ose16` são **três** janelas (`d2-ose16.txt`: `wnd[1]` e `wnd[2]`
modais empilhadas) e `btn[0]` nas três. Só o `btn[n]` não endereça nada nesse estado.

Por isso o alvo é resolvido **dentro de uma janela**:

```js
janelaAtiva(sids(s));                 // 'wnd[1]' — a GuiModalWindow de MAIOR índice declarada; 'wnd[0]' se não há
ativa(s);                             // o mesmo, direto da sessão
await acionar(s, 'btn[0]');           // wnd[1]/tbar[0]/btn[0] — a janela ATIVA, por regra
await acionar(s, 'btn[0]', { janela: 'wnd[0]' });   // a barra de trás, DITA
await acionar(s, 'wnd[0]/tbar[0]/btn[0]');          // o SID inteiro passa por cima de tudo
botoes(s);                            // as duas barras, cada botão com a `janela` dona
botoes(s, ativa(s));                  // só a de cima
```

**Como a janela ativa se descobre:** sem popup, nenhuma janela se declara no delta (a `wnd[0]` mora
no shell do GET); cada modal aberta se declara com o próprio `wnd[n]`/`GuiModalWindow`. Daí a regra
ser *o maior índice declarado*, e não "existe popup". Antes disto a resolução pegava o **primeiro**
SID que casasse, e acertava a `wnd[1]` só porque o bloco `webguiPopups` vem antes do `cuaarea` —
ordem de markup, não regra; com `wnd[2]` aberta ela errava a janela.

**O que não está na janela ativa não é clicado por baixo do modal** — é erro que mostra as duas:

```
its: botão btn[15] não está em wnd[1] (a janela ativa) — está em wnd[0]/tbar[0]/btn[15];
     wnd[1] tem btn[0]=Enter, btn[5], btn[14], btn[12]=Cancelar.
     Se é a outra janela mesmo, peça { janela: 'wnd[0]' }
```

O mesmo `btn[n]` duas vezes **na mesma janela** (duas barras) também estoura, pedindo o SID inteiro:
nenhum bruto medido faz isso, mas a lib não escolhe no escuro. `preencher(s, campo, valor,
{ janela })` escopa igual.

### O módulo `its.mjs` — o protocolo portado para a lib

**Medido no s4h 758/250 em 2026-09-04** (fila `adt-client`, item 20; E2E em
`sap-accelerate/work/POC_webgui_its_lib/medicoes/its-lib.md`). É a **segunda via do mesmo canal**
e fala o **mesmo vocabulário** do `webgui.mjs` — trocar de via é trocar o import:

```js
import { abrirTransacao, preencher, acionar, enter, tecla, enviar, comandar, navegarMenu, fechar, sids, campos, botoes } from 'adt-client/its';

const cfg = { base: 'http://host:8000', client: '250', idioma: 'PT', user: 'U', pass: 's3nh4' };
const s = await abrirTransacao(cfg, 'SE16', { parametros: { 'DATABROWSE-TABLENAME': 'T000' } });
try {                                          // GET + boot: 657 ms até a tela de seleção já com a T000
  campos(s);                                   // [{ sid: 'wnd[0]/usr/txtMAX_SEL', tipo: 'GuiTextField', campo: 'MAX_SEL', value: '200 ', maxlen: 11 }, …]
  botoes(s);                                   // [{ sid: 'wnd[0]/tbar[1]/btn[8]', okcode: 'btn[8]', nome: 'Executar' }, …]
  preencher(s, 'MAX_SEL', 2);                  // enfileira focus+value — NÃO posta ainda
  const r = await acionar(s, 'Executar');      // value + action/3 + state/ur num POST só (105 ms)
  if (!r.pegou) throw new Error(r.motivo);     // multipart: "-101 failed to fire action: not supported"
  if (r.mudou === false) throw new Error(r.mensagem?.texto);  // delta que não mexeu na tela (§ pegou × mudou)
  r.titulo;                                    // 'Data Browser: Tabela T000          2 acertos'
  await comandar(s, '/nSE38');                 // OK-code: value/okcd + vkey/0 — de qualquer tela
  await navegarMenu(s, 'Sistema > Serviços > Reporting');   // caminho de menu: action/4, um POST (91 ms)
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
| a forma boa NÃO prova efeito: a tela pode não ter mudado | `carimboDosSids` + `mudouDaTela` no `postar` → `mudou`, `mensagem`, `carimbo` | item 59 (F12 no SPOP: `pegou: true`, `mudou: false`) |
| SID como endereço, tirado da própria tela | `sidsDaResposta` (regex sobre o `lsdata`), `sidDoAlvo` | item 20 (221 SIDs na seleção da SE16) |
| a barra do botão não se adivinha | `acionar(s, 'btn[8]')` casa `…/btn[8]` no fim do SID da tela; fora dela estoura com a lista | item 20 D3 |
| OK-code = `value/okcd` + `vkey/0` | `comandar` | item 8 |
| o menu inteiro já vem no boot; a folha é `action/4/<SID>` | `itensDeMenu`, `navegarMenu` — sem abrir nada | item 49 (146 itens na SE38; SE38 → SA38 em 91 ms) |
| a árvore do SMEN se endereça por CHAVE, no container | `arvore`, `expandirNo`, `colapsarNo`, `acionarNo`, `navegarArvore` | item 50 (SMEN → SSC1 em 2,5 s; favorito → CO01 em 386 ms); item 85 (colapsar tira 29,5% do delta) |
| a FOLHA da árvore se declara antes do POST (`subct="HIC"`) | `expansaoDoHtml`, `arvore(s).nos[].temFilhos` | item 84 (30/31; folha: 1 POST/180 ms → 0/22 ms) |
| o nó CORRENTE da árvore é `action/41`; sem ele o menu que age sobre o nó recusa | `postar` cru (`action/41/<SID>` + `node_key`) — **receita por decisão**, item 92 | item 54 (favorito inserido, acionado e apagado só por HTTP) |
| `/nex` encerra; depois é 400 | `fechar`; `postar` recusa sessão encerrada | item 8; item 20 E |

#### `pegou` × `mudou` — o protocolo aceitou ≠ aconteceu alguma coisa (item 59)

`pegou` responde **"o servidor aceitou o POST?"** (a FORMA da resposta). Ele NÃO responde "a ação
surtiu efeito" — e a diferença tem caso real medido: `vkey(s, 12)` (F12) com o SPOP
"Efetuar logoff" aberto volta `delta` de 226 KB, `pegou: true`… **e o popup continua lá**.

Quem responde a segunda pergunta é o `mudou`, que toda resposta do `postar` traz junto:

```js
const r = await tecla(s, 'F12');
r.pegou      // true  — o servidor aceitou
r.mudou      // false — E NÃO FEZ NADA: o carimbo da tela saiu igual
r.mensagem   // { tipo: "OK", texto: "Não se pode selecionar código de função" }
r.carimbo    // 'SE38/SAPLWBABAP/0100 wnd[1] "Editor ABAP: 1ª tela" #9905e6b8787d33c3'
```

e quando o popup CONTINUA aberto depois de uma ação que não mudou nada, a lib avisa alto em
stderr (não depende do `--debug`) — é a armadilha de responder popup por tecla:

```
⚠ its: a ação não mudou NADA e o popup wnd[1] continua aberto — "Não se pode selecionar código de
  função" — popup se responde pelo SID do botão (lerTela(s).popup.botoes), não por tecla nem por apelido.
```

**O carimbo** é `<tcode>/<dynpro>/<d-num> <janela ativa> "<cuatitle>" #<sha1 dos SIDs>` — os SIDs
com todo o `lsdata` que carregam (valor de campo, rótulo, estado de botão), **menos a barra de
mensagem**. Medido no s4h 758/250 em 05/09/2026
(`sap-accelerate/work/POC_webgui_mudou/medicoes/item59-mudou.md`):

- **a barra de mensagem fica fora por medição.** No par SPOP × F12 dos brutos do item 23, os 198
  SIDs são idênticos e a ÚNICA diferença em toda a tela é `wnd[0]/sbar_msg`. A mensagem é o
  *comentário do ABAP sobre a ação*, não a tela — dentro do carimbo, "apareceu uma recusa"
  contaria como "a tela mudou", que é o falso positivo de volta com outra roupa. Ela sai no
  `mensagem` da resposta, que é onde serve.
- **⚠ o `messageType` não é veredito**: essa recusa veio com tipo `OK` (sucesso!) e texto de
  recusa. Só a comparação ANTES × DEPOIS diz.
- **o carimbo não é volátil**: dois POSTs na mesma tela devolveram os 223 SIDs byte a byte
  iguais, e o hash da SE38 limpa (`#bad69abf2a47074f`) saiu igual em sessões e rodadas
  diferentes. Nada de contador nem de carimbo de tempo dentro do delta.

| forma da resposta | `pegou` | `mudou` |
|---|---|---|
| `delta` inteiro | `true` | o carimbo decide (`true`/`false`) |
| `delta` do BOOT (não havia tela antes) | `true` | `null` |
| `delta` **parcial** (fragmento do ALV — não é a tela) | `true` | `null` |
| `multipart` (o protocolo recusou; `motivo` diz por quê) | `false` | `false` |
| `logoff` | `false` | `true` |
| `sem-sessao` / `outra` | `false` | `null` |

⚠ `mudou: false` **não é erro por si** — `enviar` de valores, nó folha de árvore e `state/ur` puro
legitimamente não mudam nada (medido: `state/ur` sem ação dá `mudou: false` e **nenhum aviso**).
É informação: quem precisa saber que a ação surtiu efeito olha os dois sinais.

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
  do ALV pelo `RequestData` (§ "O ALV: ler as LINHAS do grid"), e ~~pelo navegador só o cabeçalho~~
  **feito** (item 46): o `lerGrid` do `webgui.mjs` lê o BLOCO do DOM sem tocar a rede (§ "Pelo
  NAVEGADOR"); ~~e pelo navegador o alcance para no bloco~~ **resolvido** (item 74):
  `lerGridInteiro` posta o `action/710` DENTRO da sessão da página e traz a tabela toda
  (§ "`lerGridInteiro`"). ~~Célula editável~~ **feita** (item 47): `escreverCelula` pelo navegador, com o ciclo
  escrever → gravar → conferir em outra LUW medido (§ "Escrever numa célula"). O que fica em aberto
  na leitura: **checkbox** por esta via não foi cruzado (nenhum bruto HTTP tem um — o `chkALSOUSUB`
  só existe no despejo DOM). ~~Combo~~ **medido** (item 114): escolher uma opção é postar a
  CHAVE, e `preencher` traduz o texto (§ "O COMBOBOX (`ct="CB"`)"). ~~Ordenar/filtrar~~ **medido** (itens 77 e 116): `ordenarGrid`/`filtrarGrid` marcam a coluna no cabeçalho e acionam a barra do ALV, a medição fixou o que o `_linha` significa (§ "Ordenar e filtrar o ALV"). ~~Ordenar por VÁRIAS colunas~~ **medido** (item 121): `ordenarGridPorVarias` dirige o diálogo "Ordenação" — o que a barra não alcança, porque ela ordena por uma coluna e substitui o critério (§ "Ordenar por VÁRIAS colunas"), e o `lerGridInteiro` sob filtro devolve só as filtradas — com o `totalRows` já filtrado — enquanto a sessão de fora não vê nada disso (§ "O FILTRO, a linha selecionada e o drill-down"). ~~Selecionar linha~~ **medido** (item 76): `selecionarLinhas` clica a caixa da coluna 0 e `lerSelecao` a lê, com a prova do `get_selected_rows` (§ "Selecionar linha no ALV"). ~~Desmarcar / limpar a seleção~~ **medido** (item 119): `desmarcarLinhas` (`ctrl`+clique), `limparSelecao` e `selecionarTudo` pelo toggle do cabeçalho — que alterna pelo **próprio ícone**, não pela tela (§ "Desmarcar e limpar a seleção do ALV"). ~~Chegar a uma linha fora do bloco~~ **medido** (item 75): `posicionarGrid` arrasta o thumb do `_vscroll` e põe a linha na tela num gesto, com o drill-down provado (§ "`posicionarGrid`").
* ~~A saída (item 13)~~ **resolvida** por esta via: `/nex` encerra a sessão e `/n` volta ao menu
  (§ "A caixa de comando"). O obstáculo era do navegador — campo invisível —, não do canal.
* ~~O mapa do `vkey/<n>`~~ **medido** (item 22): `tecla(s, 'F8')` e o mapa `VKEYS` (§ "O teclado").
  O que fica: as teclas fora do mapa (F1, F2, F5–F7, F9, F10, `Ctrl+Fn`) e a distinção F12 ×
  Shift+F3 — `vkey(s, n)` continua no módulo para MEDIR, não para afirmar.
* Popup (`wnd[1]`) — `/o` e `/nend` abrem um, e ele **vem no mesmo `delta-update`**
  (`lerResposta` sinaliza `temPopup: true` — do CORPO, item 83; `lerTela` devolve `popup` com textos e botões por SID —
  e avisa que a `wnd[0]/usr` foi esvaziada); falta medir como responder (item 23). Table control
  (o steploop, que não é o ALV) continua por medir.
* ~~Upload/download por esta via~~ **medidos** — os dois são o **ITSDoc**: download no item 45
  (§ "Exportar a lista por ARQUIVO"), upload no item 72 (§ "SUBIR arquivo para o SAP").

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

### Pelo NAVEGADOR: `lerGrid` do BLOCO, de graça — e a roda NÃO é via de leitura

**Medido no s4h 758/250 em 2026-09-05** (fila `adt-client`, item 46; evidência em
`sap-accelerate/work/POC_webgui_grid/medicoes/item46-webgui-grid.md`). O `webgui.mjs` tem o seu
próprio `lerGrid`, e ele lê **o que a tela já carregou**, sem tocar a rede:

```js
import { abrirNavegador, ir, urlWebgui, acionar, lerGrid } from './webgui.mjs';

await ir(s, urlWebgui(cfg, { transacao: 'SA38', parametros: { 'RS38M-PROGRAMM': 'RSPARAM' }, okcode: 'STRT' }));
await acionar(s, 'btn[8]');

const g = await lerGrid(s);
// { id: 'C102', sid: 'wnd[0]/usr/cntlGRID1/shellcont/shell', colunas: [ … ], total: 1617,
//   bloco: { de: 1, ate: 166, n: 166 }, de: 1, ate: 166,
//   linhas: [ { _linha: 1, NAME: 'Autostart', … }, … ], parcial: true, ms: 240 }

await lerGrid(s, { id: 'C102' }, { de: 100, ate: 104 });   // recorta o bloco — não pede nada a mais
```

Por que ele existe, tendo a via HTTP: **é a única leitura de célula que a sessão do NAVEGADOR tem.**
O `its.lerGrid` roda em outra sessão de diálogo, que não enxerga o estado desta (filtro aplicado,
drill-down, linha selecionada). E é barato: o bloco já está no DOM.

| | bloco pelo DOM (`webgui`) | fragmento por HTTP (`its`) |
|---|---|---|
| 166 linhas / 830 células | **0 requisição**, 19 ms na página | 1 pedido, 1,28 MB de corpo (41 KB gzip), ~230 ms |
| alcance | só o bloco carregado (166 de 1617) | qualquer faixa, a tabela inteira |
| o dado | **830 de 830 células iguais** entre as duas vias |

Quatro regras medidas:

1. **O DOM guarda um BLOCO, não a janela.** A tela mostra 27 linhas e o DOM tem 166 (`grid#C102#1,1`
   … `#166,5`); as outras 139 estão lá com o texto e altura zero. É `scrolling: "client"` +
   `clientCellThreshold: 10000` do `lsdata`.
2. **O bloco CRESCE com a navegação, não desliza.** 30 rodadas de roda levaram o DOM de `1..166` a
   `1..362`, contíguo, sem perder o começo. `lerGrid` devolve tudo o que a sessão já trouxe.
3. **`parcial: true` é resposta normal, não erro** — `bloco.ate < total`. Pedir `ate: 1000` num bloco
   de 166 devolve 166 e `parcial: true`: este módulo não vai buscar o que falta.
4. **O valor sai do `lsdata` do span `#if`** (`{"21":{"value":"Autostart",…}}`), com o `innerText`
   como reserva — nas 830 células os dois coincidiram. A coluna 0 fica de fora: é a caixa de
   seleção da linha (`SAPTABLECSSELECTIONCELL`).

**⚠ Rolar por roda para LER não vale.** Clique sintético e `PageDown` não movem a janela nem geram
requisição; quem move é a **roda** (`Input.dispatchMouseEvent` `type: 'mouseWheel'`), e ao chegar
perto do fim do bloco o próprio ITS dispara um `action/710` (`fragments=166,173;`) que acrescenta 28
linhas. Mas é o **mesmo pedido** que a via HTTP faz, ao **mesmo preço** — 8,97 KB gzipados por 28
linhas nos dois canais —, só que em fatias de 28 e a ~2,9 s por rodada: **~222 rodadas, ~11 min**
para as 1617 linhas. Quem lê a tabela inteira é o `lerGridInteiro`, logo abaixo.

### `lerGridInteiro`: a tabela toda **na sessão da tela** (item 74)

**Medido no s4h 758/250 em 2026-09-05** (fila `adt-client`, item 74; evidência em
`sap-accelerate/work/POC_webgui_fragmento/medicoes/item74-fragmento.md`). O `lerGrid` acima alcança
só o bloco; o `its.lerGrid` alcança tudo mas **em outra sessão**, que não vê o filtro nem a ordem
desta tela. O `lerGridInteiro` junta os dois: posta o **mesmo `action/710`** do `its.mjs`, mas de
**dentro da página**, com o `action` e o `moin` que ela já carrega.

```js
import { abrirNavegador, ir, urlWebgui, acionar, lerGridInteiro } from './webgui.mjs';

await acionar(s, 'btn[28]');                       // ordena o ALV NESTA tela
const g = await lerGridInteiro(s);                 // e a leitura sai na ordem NOVA
// { id: 'C102', sid: 'wnd[0]/usr/cntlGRID1/shellcont/shell', colunas: [ … ], total: 1617,
//   de: 1, ate: 1617, linhas: [ … ], pedidos: 4, bytes: 11930653, ms: 2383, truncado: false }

await lerGridInteiro(s, { id: 'C102' }, { de: 900, ate: 910, lote: 1000 });
```

A página tem as três peças do POST, e nenhuma delas precisa de credencial nova: o **`action`** (o
token da sessão, no `<form id="webguiform0">`), o **`moin`** (`var` global) e o **cookie**
`SAP_SESSIONID`, que é `HttpOnly` — não aparece no `document.cookie` e não precisa aparecer: o
`fetch` same-origin o manda sozinho. O `Authorization` sai pelo `Network.setExtraHTTPHeaders` do
`abrirNavegador`.

| | `lerGrid` (bloco) | `lerGridInteiro` | `its.lerGrid` |
|---|---|---|---|
| alcance | 166 de 1617 | **1617 de 1617** | 1617 de 1617 |
| custo (1617 × 5) | — (0 requisição) | 4 pedidos, 11,9 MB, **2,4 s** | 4 pedidos, 12,4 MB, 1,9 s |
| sessão | a da tela | **a da tela** | outra |
| vê a ordem da tela (item 74) | sim | **sim** | não |
| vê o FILTRO da tela (item 116) | sim | **sim** | não |

Quatro fatos medidos:

1. **O `moin` NÃO é contador de sequência.** Ele não muda entre a tela de seleção e a lista, e o
   POST que o **próprio framework** manda ao rolar leva exatamente o mesmo valor do `window.moin`.
   Não há nada a incrementar — e por isso não há o que dessincronizar.
2. **⚠ Mas o header `moin` é OBRIGATÓRIO, e omiti-lo MATA A SESSÃO.** O mesmo POST sem ele voltou
   **HTTP 500 `Application Server Error`** (9,8 KB de HTML) e, dali em diante, a sessão virou casca:
   a roda ainda POSTAVA (`fragments=194,203;`) mas o bloco não crescia mais, e o `btn[3]` trocou a
   tela por uma **vazia** (título `""`, 0 campo, 0 grid). Não é "degradou": é a sessão perdida, sem
   aviso na tela. Por isso `lerGridInteiro` estoura **antes** de postar quando a página não tem
   `moin`.
3. **Com o `moin`, o POST é inócuo** — contra-prova com positiva de controle antes e depois:
   rolando até o framework pedir sozinho, ele pediu antes (bloco 166→194) e **continuou pedindo
   depois** do nosso POST (194→222, em 3 rodadas), e o round-trip `btn[3]` trouxe a tela de seleção
   viva. O DOM não muda: a resposta é um delta **parcial** que ninguém aplica.
4. **O dado é o mesmo, e a ordem é desta tela.** 8.085 de 8.085 células iguais às do `its.lerGrid`.
   Com o ALV ordenado por `btn[28]`, o `lerGridInteiro` devolveu `_CPARG0, _DW, _IG, _PF, abap/aab`
   e a sessão HTTP paralela, no mesmo instante, `Autostart, CPU_CORES, DIR_ATRA, …` — a ordem
   original. É exatamente o que a segunda sessão não consegue ver.

### O FILTRO, a linha selecionada e o drill-down — a lacuna do 74, fechada (item 116)

**Medido no s4h 758/250 em 2026-09-06** (fila `adt-client`, item 116; evidência em
`sap-accelerate/work/POC_webgui_grid_filtro/medicoes/item116-filtro.md`, fases A–D). O item 74
provou o eixo da **ordem**; este prova o do **filtro**, e com ele a frase "a sessão da tela vê o que
a de fora não vê" deixa de ser plausibilidade.

Filtro `NAME` de `a` a `e` no `RSPARAM`. O esperado não foi estimado: o controle leu os 1617 nomes,
e 279 caem no intervalo.

| | tela (navegador) | sessão HTTP paralela, no MESMO instante |
|---|---|---|
| `totalRows` declarado | **279** | **1617** |
| linhas lidas | 279/279, 1 pedido, 2,05 MB, **518 ms** | 1617, 4 pedidos, 12,4 MB, 1895 ms |
| primeiras | `abap/NTfmode, abap/aab, …` | `Autostart, CPU_CORES, DIR_ATRA` |

O conjunto é **exatamente** o previsto — 279 de 279 nomes idênticos, nenhum fora do intervalo. E
**o `totalRows` passa a declarar o filtrado**: é ele que define até onde o `lerGridInteiro` pede
fragmento, então sob filtro o laço para em 279 sozinho. Filtrar na tela antes de ler é 6× menos byte
no fio.

**A linha selecionada chega TRADUZIDA ao ABAP.** O item 77 fixou que sob filtro o `_linha` é "a
n-ésima linha VISÍVEL", não o índice da outtab. A consequência, agora medida com `btn[2]`
("Selecionar (F2)"):

| K | linha K FILTRADA | linha K ORIGINAL | o drill-down abriu |
|---|---|---|---|
| 5 (dentro do bloco) | `abap/advanced_listmasking` | `DIR_BINARY` | **o filtrado** |
| 200 (fora do bloco, via `posicionarGrid`) | `dbs/db6/dbsl_trace_deadlock_time` | `abap/rabax_no_debug` | **o filtrado** |

Nos dois, `lerSelecao` devolveu `[K]` e o detalhe veio do parâmetro certo. **Quem seleciona pelo
`_linha` da própria leitura acerta**, mesmo sob filtro e mesmo fora do bloco — a tradução é do
servidor, do lado desta sessão. E o filtro sobrevive ao drill-down e à volta (`totalRows` = 279,
`NAME` ainda `filtrada: true`).

#### ⚠ Com MODAL aberta o servidor RECUSA o `action/710`

Com o popup do drill-down de pé, o mesmo POST volta **200 `multipart/mixed` de 180 B**:

```
X-Order: 1
X-Code: -103
X-Status: failed to fire action: not available
```

**A recusa é do SERVIDOR, não do DOM.** O modal não esconde o grid do JavaScript — ele torna a ação
indisponível na sessão. E é a assimetria que separa as duas funções: o `lerGrid`, que só lê o bloco
do DOM, **continua funcionando** nessa mesma tela. Feche a modal antes do `lerGridInteiro`. Mesma
família dos itens 131 (`action/4` do menu engolido com modal aberta) e 132; a guarda que falta é o item 180.

#### ⚠ Nesta tela o `filtrarGrid` NÃO serve — o `RSPARAM` não tem barra de ALV

A primeira rodada estourou com *"o ALV C102 não tem o botão `MB_FILTER` na barra — esta tela não tem
barra de ALV nenhuma"*. Ordenar e filtrar do `RSPARAM` moram na barra da **aplicação**
(`wnd[0]/tbar[1]`): `btn[28]` crescente, `btn[40]` decrescente, `btn[29]` filtro — de onde o item 74
ordenou e o item 115 postou o sort. O gesto, à mão:

```js
await marcarColuna(s, null, 'NAME');          // cliente puro, pendente de round-trip
await acionar(s, 'btn[29]');                  // o botão da barra da APLICAÇÃO leva a marca junto
const low = await avaliar(s, jsPorSid('DYN001-LOW'));
await preencher(s, { id: low.id }, 'a');
const high = await avaliar(s, jsPorSid('DYN001-HIGH'));
await preencher(s, { id: high.id }, 'e');
await clicar(s, { id: (await avaliar(s, jsPorSid('wnd[1]/tbar[0]/btn[0]'))).id });
```

`ordenarGrid`/`filtrarGrid` caírem para a barra da aplicação é o item 179.

#### O `ctxt` do filtro NÃO converte para maiúsculas SEMPRE

Escrito `a`/`e`, o campo leu de volta `{"low":"a","high":"e"}` e casou os 279 nomes minúsculos. O
item 77 mediu a conversão no `ZJBV_ALV47_EDIT`, e ela é real lá — logo **a conversão é da COLUNA (do
domínio), não do diálogo**. O aviso do `filtrarGrid` vale como risco a conferir, não como regra.

**⚠ O corpo tem MEGABYTES e não atravessa o CDP.** A extração das células acontece **na página**
(~48 ms para 11,9 MB) e só a matriz volta. E lá o `lsdata` vem com **entidade HTML** (`&#39;`,
`&lt;`) — o DOM decodificaria sozinho, o XML cru não: sem decodificar, 28 das 8.085 células saíam
com `&#39;` no valor.

### Até onde o fetch da página vai: só o delta PARCIAL (item 117)

**Medido no s4h 758/250 em 2026-09-06** (fila `adt-client`, item 117; evidência em
`sap-accelerate/work/POC_webgui_repertorio/medicoes/item117-repertorio.md`, fases A–D). O item 74
disse que o canal "não tem nada de específico do `action/710`". É verdade quanto ao CANAL — e falso
quanto ao uso: o que faz o `710` passar é a **resposta** dele ser um delta **parcial** (um controle
só, sem `sap.its.aParams`), que ninguém precisa aplicar no DOM.

Com um `action/` que muda a tela, a resposta é um delta **completo** — e ninguém o aplica:

| POST pelo fetch da página | resposta | o DOM depois | a sessão |
|---|---|---|---|
| `vkey/0` (ENTER, mesma dynpro) | 200, completo, 1,45 MB, `cuatitle` igual | inalterado | **viva** — a roda voltou a pedir fragmento (194 → 222) |
| `vkey/3` (F3, voltar) | 200, completo, 136 KB, `cuatitle` **"ABAP: execução do programa"**, `dynpro` `SAPMS38M` | **inalterado** — ainda a lista, com as 222 linhas | **descolada** |

Depois do `vkey/3` o servidor está na tela de seleção e o navegador mostra a lista. A partir daí a
roda **parou de pedir** fragmento (12 rodadas, 222 → 222: o grid virou órfão) e o round-trip real
seguinte — `acionar(s, 'btn[3]')`, o "voltar" da lista — foi interpretado contra a dynpro NOVA e
caiu no **SAP Easy Access** (`S000`/`SAPMSYST 0040`).

**Não é o 500 sem `moin` (item 74).** Lá a sessão MORRE e a tela seguinte vem vazia. Aqui ela
continua viva — só deixou de ser a que a tela mostra, e nada avisa. (O `moin` veio IGUAL na resposta
completa: ele não serve de detector.)

Por isso o canal virou primitiva **com guarda**:

```js
import { postarNaPagina, extratorDeCelulas } from './webgui.mjs';

const r = await postarNaPagina(s, [
  { post: `action/710/${sid}`, content: 'position=0&fragments=0,499;' },
  { get: `state/ur/${sid}` },
], { extrair: extratorDeCelulas('C102') });
// { status: 200, tipo: 'text/xml; charset=utf-8', bytes: 2050…, ms: 518, ehDelta: true,
//   completo: false, inicio: '<?xml…', celulas: { … }, nLinhas: 279, primeira: 1, ultima: 279 }
```

* sem `form`/`moin`, **não posta** (o 500 mata a sessão);
* resposta que não é delta estoura com o começo do corpo;
* **delta completo estoura** dizendo para onde o servidor foi — mas aí o estrago já está feito: o
  que muda a tela vai por GESTO (`clicar`, `comandar`, `tecla`), que é o que faz o renderer aplicar
  o delta;
* `extrair` é a fonte de uma função `(corpo) => ({…})` que roda **na página** — é o que impede os
  11,9 MB de atravessarem o CDP. O `lerGridInteiro` é escrito sobre ela.

💡 **O caminho para o repertório inteiro não é este fetch — é a fila do próprio renderer**, e ela é
alcançável: `window.mysap` expõe `oBatch` (`add`/`insert`/`replace`/`clear`, a MESMA fila do
`its.mjs`), `addBatch`, `send`, `submitOkCode` e `oMgrs.communicaton.sendWithPromise()` — quem monta
o XHR e **aplica o delta**. Sondado no item 117 (fase C), **não exercitado**.

### `posicionarGrid`: a linha DISTANTE na tela, num gesto (item 75)

**Medido no s4h 758/250 em 2026-09-05** (fila `adt-client`, item 75; evidência em
`sap-accelerate/work/POC_webgui_grid/medicoes/item75-posicionar.md`). Isto é **navegação, não
leitura**: o que se quer é *clicar* numa linha que está fora do bloco carregado — drill-down,
seleção. Para LER a tabela inteira a via é o `lerGridInteiro` acima.

O gesto é **arrastar o thumb do scrollbar vertical do grid** — `<cid>_vscroll-hdl` (`acf="Hndl"`),
dentro do trilho `<cid>_vscroll-bar`. O `<cid>_vscroll` é um `ct="SCB"` cujo `lsdata` traz o mapa da
tabela: `{"0":posição,"1":máximo,"2":passo,"3":janela,"6":dono,"10":total}` — na lista do RSPARAM,
`{0:1, 1:1591, 3:27, 10:1617}` (1617 linhas, janela de 27, última posição 1591 = 1617 − 27 + 1).

```js
import { abrirNavegador, ir, urlWebgui, acionar, posicionarGrid, lerGrid, clicar } from './webgui.mjs';

const p = await posicionarGrid(s, null, 900);
// { id: 'C102', linha: 900, janela: { de: 888, ate: 914, n: 27 },
//   gestos: [ { gesto: 'arrasto', dy: 366, desejada: 887 } ], pedidos: 1, ms: 2719 }

await lerGrid(s, null, { de: 900, ate: 900 });      // a linha 900 agora está no bloco
await clicar(s, { id: 'grid#C102#900,1#if' });      // e é clicável
```

| ir até a linha 900 | gestos | rede | tempo |
|---|---:|---:|---:|
| `posicionarGrid` (arrasto do thumb) | **1** | 1 pedido, ~9 KB | **~1–2,7 s** |
| roda do mouse (item 46, fase J) | ~90 rodadas | ~9 pedidos | ~4 min |

**Cinco fatos medidos**

1. **Um arrasto basta.** 12 de 13 alvos (1, 50, 200, 456, 777, 900, 1234, 1500, 1600, 1617, 300)
   acertaram no primeiro gesto; o E2E da lib fechou 6 de 6, com ~1 s por alvo.
2. **O framework publica o gesto ao SOLTAR**, num batch só — e é o mesmo par do `lerGridInteiro`:

   ```
   POST …/batch/json  [{ "post": "action/61/<SID>",  "content": "position=899", "logic": "ignore" },
                       { "post": "action/710/<SID>", "content": "position=899&fragments=899,925;" },
                       { "get":  "state/ur/<SID>" }]
   ```

   O `position` é **0-based**. Arrastar de volta para uma faixa já carregada não gera requisição
   nenhuma (medido: alvos 1 e 1617, 0 pedidos), e o bloco no DOM deixa de ser contíguo — ele passa a
   ter buracos (`1..1617` com 221 linhas e 2 buracos), o que o `parcial`/`faltaNaFaixaDoBloco` já
   trata.
3. **E o servidor entende a linha nova.** Depois de posicionar em 1234, o duplo clique na célula
   mandou `action/53 row_index=1234` — aqui **1-based**, ao contrário do `position` — e a tela virou
   o popup "Exibir parâmetro de perfil" com o campo em `rec/empty_stxx_as_white_list`, que é a linha
   1234 lida pelo `lerGrid`. O clique SIMPLES não gera requisição: seleção é puro cliente.
4. ⚠️ **O `lsdata` do scrollbar não acompanha a rolagem**, nem o `firstVisibleRow` do grid: os dois
   ficam parados em `1` e `0` mesmo com a janela na linha 1600, porque o delta que volta é PARCIAL e
   ninguém o aplica no DOM. Quem diz onde a janela está é o **`iidx` das `<tr>` com altura > 0**
   (0-based; a lib devolve 1-based). Perguntar ao `lsdata` seria ler sempre "linha 1".
5. ⚠️ **Arrasto curto não move, e refinar por pixel não corrige.** O trilho tem 647 px para 1591
   posições — 1 px vale ~2,5 linhas, 1 linha vale 0,4 px. Pedir a linha 1617 com o thumb já em 1586
   é um deslocamento de 2 px: três arrastos seguidos não mudaram nada (46 s perdidos). Abaixo de
   `LIMIAR_ARRASTO_PX` (4 px) o ajuste sai pela **roda**, que anda ~10 linhas por rodada.

Duas decisões de desenho que a medição impôs, e que valem para qualquer gesto neste canal:

- **mirar o alvo no MEIO da janela, não no topo.** O arrasto erra de 0 a +3 linhas; mirando o topo,
  um erro de +1 já deixa o alvo *acima* da janela (medido em 777, 1234 e 1500). Mirando o meio
  (`miraDoScrollbar`), ±3 linhas cabem folgadas numa janela de 27.
- **esperar por CONDIÇÃO, não por tempo.** Com espera fixa de 2,2 s um dos alvos foi lido no meio do
  repinte, com **zero** `<tr>` visível — e o "refino" seguinte, calculado sobre esse nada, jogou a
  janela para 200 linhas longe. `posicionarGrid` espera a janela pintada CONTER a linha; e se não
  contiver dentro das tentativas, **estoura dizendo onde ela ficou** — um posicionamento que "quase"
  chega e volta calado faria o clique seguinte cair na linha errada.

## Selecionar linha no ALV — o gesto é CLIENTE, e a prova é o ABAP (item 76)

**Medido no s4h 758/250 em 2026-09-05** (fila `adt-client`, item 76; evidência em
`sap-accelerate/work/POC_webgui_grid_sel/medicoes/item76-selecionar.md`, fases A–G). O item 47 tinha
visto o `action/50`/`action/53` saírem sozinhos ao clicar numa célula; aqui a seleção foi exercitada
de propósito, no laboratório `ZJBV_ALV47_EDIT`, que ganhou o fcode **`FC02`** para despejar
`get_selected_rows`/`get_selected_columns`/`get_selected_cells`/`get_current_cell`.

```js
import { abrirNavegador, ir, urlWebgui, selecionarLinhas, lerSelecao, comandar } from './webgui.mjs';

await selecionarLinhas(s, null, [2]);                       // clique simples: SUBSTITUI
await selecionarLinhas(s, null, [1, 3]);                    // ctrl no resto: acrescenta
await selecionarLinhas(s, null, [1, 3], { faixa: true });   // shift no último: 1..3
await selecionarLinhas(s, null, [5], { acrescentar: true }); // sem desfazer o que já estava

const sel = await lerSelecao(s);
// { linhas: [1, 2, 3],                       ← o que a TELA mostra (a verdade)
//   publicado: { linhas: [2], texto: ';2;' },← o que o SERVIDOR sabe (um round-trip atrás)
//   defasado: true, celulaCorrente: { linha: 3, coluna: 0 },
//   bloco: { de: 1, ate: 3, n: 3 }, total: 3, modo: { type: 'rowscols', … } }

await comandar(s, 'FC02');   // ← só AGORA o action/47 sai, e o ABAP enxerga
```

### A caixa não está no `<tr>` do dado

O grid do WebGUI monta **duas faixas de `<tr>` paralelas**, e a caixa de seleção vive na congelada:

| | `<tr>` | id | tag |
|---|---|---|---|
| dado | `<cid>-mrss-cont-**none**-Row-<n-1>` | `grid#<cid>#<n>,<c>` (campo: `…#if`) | `<td>` |
| **caixa da linha** | `<cid>-mrss-cont-**left**-Row-<n-1>` | `grid#<cid>#<n>,0` — **sem `#if`** | `<td subct="SC">` |
| cabeçalho da caixa | `<cid>-mrss-hdr-left-Row-0` | `grid#<cid>#0,0` | `<th subct="HC">` |

A caixa é uma `SAPTABLECSSELECTIONCELL`; o cabeçalho, `{"2":"SELECTIONCOLUMN","3":"SELECTION_TOGGLE"}`.
Quem procura a coluna 0 no `<tr>` do dado não acha nada — foi o que a fase A fez, e por isso ela
concluiu (errado) que a coluna 0 não existe, com o `lsdata` dizendo `hasSelectionColumn: true`.

O estado de cada caixa está na **classe do `<div role="gridcell">`** de dentro:
`urSTRowUnSelIcon urST4LbUnselIcon` ↔ `urSTRowSelIcon urST4LbSelIcon`.

### ⚠ Zero requisição — e o `lsdata` está sempre um round-trip atrás

Cinco gestos de seleção, cada um com 2,5 s de espera (mais que o `delayedChangedSelectionTimeout`
de 1500 ms que o próprio `lsdata` anuncia): **0 requisição**, nas cinco. E o `selectedRows` ficou
`";"` o tempo todo.

É o mesmo modo de falha do scrollbar no item 75: o `lsdata` é o que o **servidor** publicou. Com as
linhas 1 e 3 pintadas na tela ele ainda dizia `";2;"` — a seleção do round-trip anterior —, e só
virou `";1;3;"` **depois** do `FC02`. Por isso `lerSelecao` responde pela classe da caixa e devolve
o `publicado` à parte, com `defasado: true` quando os dois divergem.

### A prova: o `action/47` e o que o ABAP respondeu

| pintado no DOM | o batch levou | **`get_selected_rows` devolveu** |
|---|---|---|
| nenhuma (contra-prova) | — | `rows=0: cols=0: cells=1 cur=1/1/ID` |
| linha 2 | `action/47 rows=;2;` | `rows=1:0000000002` |
| 1 e 3 (ctrl) | `action/47 rows=;1;3;` | `rows=2:0000000001,0000000003` |
| 1..3 (shift) | `action/47 rows=;1-3;` | `rows=3:…001,…002,…003` |
| clique numa **célula** | `action/50` + `action/53`, **sem `action/47`** | `rows=0: cells=1 cur=2/3/QTD` |

`action/47` é a seleção de LINHAS, `action/48` a de células, `action/50` o bloco e `action/53` a
célula corrente. Duas armadilhas:

1. **`action/47` compacta faixa contígua com `-`**: 1, 2 e 3 saem como `;1-3;`, não `;1;2;3;`. Um
   `split(';')` leria "a linha 1-3" e perderia duas linhas — é o que `interpretarSelectedRows` trata.
2. **Clicar numa célula NÃO seleciona a linha.** O que muda é a célula corrente e o bloco; o
   `get_selected_rows` volta vazio. Quem quer linha clica na caixa da coluna 0.

### Compõe com o `posicionarGrid`, e o bloco só cresce

No RSPARAM (1617 linhas, somente leitura, `hasSelectionColumn: true`):

```
posicionarGrid(s, null, 900)    janela 888..914, 1 arrasto, 1211 ms
selecionarLinhas(s, null, [900]) linhas=[900] pendente=true, 368 ms
lerSelecao(s)                    linhas=[900] bloco=1..941 (247 caixas) defasado=true
voltar para a linha 1            e a caixa da 900 CONTINUA no DOM, ainda lida como selecionada
```

O bloco de caixas **só cresce** (166 → 247): rolar não apaga a seleção. O que `lerSelecao` não
enxerga é a linha que **nunca** esteve na tela — aí `selecionarLinhas` estoura dizendo o bloco e
apontando o `posicionarGrid`.

### O que ainda NÃO está medido

- ~~Desmarcar~~ **medido no item 119** — e a conclusão de cima ("não desmarcou") estava errada pelo
  motivo certo: o toggle alterna pelo **próprio ícone**, não pelo que está pintado. § "Desmarcar e
  limpar a seleção do ALV".
- **Selecionar COLUNA e BLOCO de células.** Marcar a coluna pelo cabeçalho **saiu no item 77**
  (`marcarColuna`, e o `action/46 columns=;2;` que ela emenda no gesto seguinte); o item 119 cruzou
  com o ABAP por acaso — `selecionarTudo` devolveu `cols=3:ID,NOME,QTD`, então o toggle marca as
  colunas junto. O BLOCO segue aberto: `action/48`
  (`cells=`) e `action/50` (`top_left`/`bottom_right`) existem e o `lsevents` publica `BlockSelect`,
  sem gesto medido.
- **ALV de seleção ÚNICA.** O laboratório e o RSPARAM são os dois `selectionMode.type: "rowscols"`.
  `selecionarLinhas` estoura com o modo no texto quando a tela não fica como o pedido, mas o caso
  não foi exercitado num ALV que recuse a segunda linha.

## Desmarcar e limpar a seleção do ALV — o toggle segue o ÍCONE, não a tela (item 119)

**Medido no s4h 758/250 em 2026-09-06** (fila `adt-client`, item 119; evidência em
`sap-accelerate/work/POC_webgui_grid_sel/medicoes/item119-desmarcar.md`, fases H–K). Fecha o único
buraco que o item 76 deixou no gesto de seleção — e corrige a conclusão dele.

```js
import { limparSelecao, selecionarTudo, desmarcarLinhas, lerSelecao, comandar } from './webgui.mjs';

await selecionarTudo(s);              // { selecionadas: 1617, total: 1617, todas: true, gestos: 1 }
await desmarcarLinhas(s, null, [2]);  // ctrl+clique na caixa: { linhas: [1, 3] }
await limparSelecao(s);               // { linhas: [], gestos: 2, jaLimpa: false }
await comandar(s, 'FC02');            // e o ABAP responde rows=0 — a limpeza chegou
```

### ⚠ Por que o item 76 concluiu que o cabeçalho "não desmarca"

Dentro do `<th subct="HC">` mora o alvo de verdade:

```html
<th id="grid#C102#0,0" subct="HC" lsdata='{"2":"SELECTIONCOLUMN","3":"SELECTION_TOGGLE"}'>
  <div class="lsSTBSHCDIV"><div class="urST5HCMetricSelColToggle">
    <div id="grid#C102#0,0-SELCOLTOGGLE" acf="SELCOLTOGGLE" tabindex="0"
         class="… urSTSelColToggleUnSelIcon urST4LbUnselIcon"    ← ↔ …SelColToggleSelIcon urST4LbSelIcon
         title="Foram selecionadas 3 linhas de 3 linhas possíveis.">
```

**O toggle alterna pela classe DELE, não pelas linhas pintadas.** No item 76 as 3 linhas tinham sido
marcadas pelas *caixas* (shift), o ícone continuou `UnSel`, e o clique **marcou tudo sobre o que já
estava tudo marcado** — na tela, indistinguível de "não fez nada". Reproduzido na fase I:

| estado | ícone antes → depois | tela |
|---|---|---|
| `[1,2,3]` pintadas pelas caixas | `UnSel` → `Sel` | **não mudou** ← o caso 6 do item 76 |
| o clique **seguinte** | `Sel` → `UnSel` | **limpou tudo** |
| marcação parcial `[2]` | `UnSel` → `Sel` | marcou `[1,2,3]` |

⚠ E o ícone **volta a `UnSel` depois de um round-trip** mesmo com linhas pintadas (o `title` chegou a
dizer "0 linhas" com `[1,3]` na tela): ele não é leitor da seleção. Por isso `limparSelecao` e
`selecionarTudo` **conferem e batem de novo** — no máximo 2 cliques — em vez de clicar uma vez e
acreditar.

### Os gestos, todos com ZERO requisição

| gesto | efeito |
|---|---|
| `ctrl`+clique numa caixa **marcada** | **desmarca aquela linha** (`[1,2,3]` → `[1,3]`; `[2]` → `[]`) |
| clique **simples** numa caixa marcada | **não** desmarca: SUBSTITUI a seleção por ela (`[1,3]` → `[1]`) |
| clique no cabeçalho | alterna pelo ícone: marca tudo ou limpa tudo |
| `ctrl`+clique no cabeçalho | igual ao clique simples |
| `shift`+clique no cabeçalho | ignorado |
| clique numa **célula de dado** | limpa a seleção de linhas — mas é efeito colateral (`action/50`+`53`, move a célula corrente), não gesto de limpar |

### A seleção do cabeçalho é LÓGICA — e por isso `linhas` subconta

No RSPARAM (1617 linhas, 166 caixas no DOM):

```
selecionarTudo(s)     gestos=1, selecionadas=1617 de 1617 — e só 166 caixas pintadas no DOM
posicionarGrid(900)   as caixas novas JÁ NASCEM pintadas (247 de 247)
limparSelecao(s)      gestos=1, 0 de 1617
```

**Quem conta a seleção inteira é o `title` do toggle**, não as caixas: `lerSelecao().toggle` traz
`{ marcado, selecionadas, total, todas }`, e `interpretarTituloDoToggle` faz a leitura pelos dois
primeiros números (o texto é traduzido). ⚠ O `title` **pode não existir antes do primeiro gesto** —
aí `selecionadas`/`total` saem `null`, e não `0`.

### A prova ABAP (fcode `FC02` do `ZJBV_ALV47_EDIT`)

| gesto no navegador | o batch levou | **o ABAP respondeu** |
|---|---|---|
| `limparSelecao` | `action/47 rows=;` | `rows=0: cols=0: cells=0` |
| `selecionarTudo` | `action/47 rows=;1-3;` | `rows=3:…001,…002,…003` **`cols=3:ID,NOME,QTD`** |
| `desmarcarLinhas([2])` | `action/47 rows=;1;3;` | `rows=2:0000000001,0000000003` `cols=0:` |

⚠ **O toggle marca as COLUNAS junto** (num ALV `selectionMode.type: "rowscols"`) — e um `ctrl`+
clique numa caixa qualquer devolve `cols=0`. Quem quer só linhas usa `selecionarLinhas`.

## Selecionar COLUNA, CÉLULA e BLOCO — e o que o ABAP vê de cada um (item 120)

**Medido no s4h 758/250 em 2026-09-06** (fila `adt-client`, item 120; evidência em
`sap-accelerate/work/POC_webgui_grid_sel/medicoes/item120-coluna-bloco.md`, fases L–P). Fecha os
dois gestos que o item 76 deixou por exercitar. Laboratório `ZJBV_ALV47_EDIT` com o `FC02`, que
ganhou nesta rodada o parâmetro `P_SELMOD` e o fcode `FC04` (§ no fim da medição).

```js
import { selecionarColunas, selecionarCelulas, selecionarBloco, lerSelecao } from './webgui.mjs';

await selecionarColunas(s, null, ['NOME']);                  // uma coluna
await selecionarColunas(s, null, [1, 3]);                    // duas (ctrl no resto)
await selecionarColunas(s, null, [1, 3], { faixa: true });   // 1..3 de uma vez (shift)
await comandar(s, 'FC02');       // → cols=3:ID,NOME,QTD

await selecionarCelulas(s, null, [[1, 'ID'], [2, 'NOME'], [3, 'QTD']]);
// { celulas: […3], correnteForaDoAbap: { linha: 3, coluna: 3 }, pendente: true }
await comandar(s, 'FC02');       // → cells=2 — a CORRENTE não entra (leia abaixo)

await selecionarBloco(s, null, { de: [1, 'ID'], ate: [3, 'NOME'] });
// { celulas: […6], visivel: true } — e o ABAP NÃO o vê (leia abaixo)
```

`lerSelecao` passou a devolver as três marcas de uma vez: `linhas`, `colunas` (+ `nomes`) e
`celulas`. Cada uma sai da CLASSE do elemento, não do `lsdata`:

| o quê | elemento | classe de MARCADO |
|---|---|---|
| linha | `<td subct="SC">` da coluna 0 | `urSTRowSelIcon` |
| **coluna** | `<th id="grid#<cid>#0,<c>">` | `urST3HSel urST4LbHdrSelBg` (↔ `urST3HUnsel`) |
| **célula** | `<td id="grid#<cid>#<r>,<c>">` | `urST4Sel2` |

### A COLUNA é o mesmo gesto da linha, e o ABAP a vê inteira

Clique simples SUBSTITUI, `ctrl` acrescenta, `shift` fecha a faixa — **0 requisições** nos três. A
seleção viaja no round-trip seguinte como `action/46 columns=`:

| gesto | o batch levou | **`get_selected_columns` respondeu** |
|---|---|---|
| clique na 2 | `columns=;2;` | `cols=1:NOME` |
| clique na 1 + `ctrl` na 3 | `columns=;1;3;` | `cols=2:ID,QTD` |
| clique na 1 + `shift` na 3 | `columns=;1-3;` | `cols=3:ID,NOME,QTD` |

⚠ **O `action/46` compacta faixa com `-`**, como o `action/47`: `interpretarSelectedRows` serve para
os dois. ⚠ **Selecionar coluna não seleciona linha** (`rows=0`) — o contrário não vale, o toggle do
`selecionarTudo` marca as colunas junto.

⚠ **Correção do item 77:** a marca da coluna **sobrevive** a um round-trip de fcode (dois `FC02`
seguidos e o `cols=1:NOME` se repetiu). Quem a apaga é o REDESENHO do grid — para `ordenarGrid` e
`filtrarGrid` a regra do 77 continua valendo, e é por isso que eles marcam a coluna eles mesmos.

### A CÉLULA depende do `sel_mode` do LAYOUT — sem ele o gesto é decorativo

```
sem sel_mode   →  selectionMode {type: "rowscols", cells: 0}   get_selected_cells = a corrente, só
sel_mode = 'D' →  selectionMode {type: "free",     cells: 2}   get_selected_cells = o action/48
```

Por isso `selecionarCelulas` **estoura** quando `selectionMode.cells` é 0, dizendo o modo e
apontando o `is_layout-sel_mode`: pintar sem viajar seria a pior falha silenciosa possível.

⚠ **A célula CORRENTE fica de fora do `cells=`.** `ctrl`+clique em 3 células levou
`action/48 cells=;1,1;2,2;` e a terceira foi só no `action/53` — **o ABAP viu 2 de 3**. A última
clicada é sempre a corrente; `correnteForaDoAbap` diz qual é. Quem precisa das N põe uma célula
descartável no fim da lista, ou lê a corrente por `get_current_cell`.

### ⚠ O BLOCO é gesto VISUAL — o `get_selected_cells` NÃO o vê

O bloco viaja como `action/50` (`top_left`/`bottom_right`/`reference`), e aquele método lê o
`action/48`, que sai **vazio**. Provado três vezes: com 6 células pintadas o ABAP respondeu
`cells=1` (a corrente), e dois round-trips seguidos não mudaram nada.

| gesto | pinta | o batch leva | **o ABAP vê** |
|---|---|---|---|
| `ctrl`+clique em N células | as N | `48 cells=;…;` | **N−1** (sem a corrente) |
| `shift`+clique nas pontas | o retângulo | `50 top_left/bottom_right` | **`cells=1`** |
| ARRASTAR | o retângulo, **só se `cells != 0`** | `50` | **`cells=1`** |

`selecionarBloco` usa `shift`+clique de propósito: **o arrasto só pinta o retângulo com `cells !=
0`**; em `rowscols` ele marca uma célula só. O bloco continua valendo para o que é do CLIENTE (é
ele que o copiar/colar do grid usa) — quem precisa das células no ABAP usa `selecionarCelulas`.

## Ordenar e filtrar o ALV — marcar a coluna e acionar a barra (item 77)

**Medido no s4h 758/250 em 2026-09-05/06** (fila `adt-client`, item 77; evidência em
`sap-accelerate/work/POC_webgui_grid_ord/medicoes/item77-ordenar-filtrar.md`, fases A–L). Fecha o
que o item 25 tinha deixado aberto no grid. Laboratório `ZJBV_ALV47_EDIT`, que ganhou o fcode
**`FC03`**: ele despeja `ITEM77 n=<lines(gt_tab)> sel=<n> <índice>=<NOME> tab1=<gt_tab[1]-nome>` —
sem isso não dá para saber o que o **ABAP** vê quando a **tela** mostra outra coisa.

```js
import { ordenarGrid, filtrarGrid, lerColunas, marcarColuna } from './webgui.mjs';

await ordenarGrid(s, null, 'NOME');                        // crescente
await ordenarGrid(s, null, 'NOME', { ordem: 'desc' });     // decrescente
// { id: 'C102', coluna: 2, nome: 'NOME', ordem: 'desc', total: 3, linhas: [ … ], ms: 2279 }

await filtrarGrid(s, null, 'NOME', { de: 'E2E-776551' });  // igual a
await filtrarGrid(s, null, 'QTD',  { de: '1', ate: '100' }); // intervalo
await filtrarGrid(s, null, 'NOME', { de: '' });            // LIMPA o filtro da coluna

await lerColunas(s);   // sem tocar a rede
// [{ coluna: 1, nome: 'ID', ordem: null, filtrada: false },
//  { coluna: 2, nome: 'NOME', ordem: 'desc', filtrada: true }, … ]
```

### Um gesto em duas metades — e a de cliente MORRE no round-trip

| metade | onde | rede |
|---|---|---|
| marcar a coluna | clique no `<th>` `grid#<cid>#0,<c>` | **zero POST** — puro cliente |
| acionar | botão da barra (`SORT_ASC`/`SORT_DSC`/`MB_FILTER`) | 1 POST, com a coluna a reboque |

O POST do acionamento leva `action/46 columns=;2;` — irmão exato do `action/47 rows=;1;` da seleção
de linha (item 76), e a mesma disciplina: **o gesto de cliente só vale se viajar junto do próximo
round-trip.** A marca do cabeçalho não sobrevive ao SORT (medido: depois do `SORT_ASC` o `<th>` já
voltou a `urST3HUnsel`). Por isso `ordenarGrid` e `filtrarGrid` marcam a coluna eles mesmos, e
`marcarColuna` devolve `pendente: true` — quem a chama sozinha tem de emendar o gesto seguinte.

⚠ **Precisado no item 120:** quem apaga a marca é o **redesenho** do grid, não o round-trip. Num
fcode que só lê ela sobrevive — dois `FC02` seguidos e o `get_selected_columns` respondeu
`cols=1:NOME` as duas vezes. Para ordenar e filtrar a regra acima continua exata; para uma seleção
de coluna que você quer que o ABAP leia, o gesto é `selecionarColunas` (§ item 120).

### O botão da barra é o SID, nunca o id do DOM

Cada botão traz `"SID":"<sid do grid>/tbar/btn&SORT_ASC"` (ou `dbtn&MB_FILTER`) no `lsdata`. O id
(`C102_toolbar_btn15`) é **posicional** e aponta para outro lugar numa tela com outra barra ou com
dois ALVs. `jsBotaoDaBarra(sid, fcode)` casa pelo SID; quando o fcode não está lá, o erro **lista os
fcodes que aquela barra tem** (`JS_FCODES_DA_BARRA`).

### ⚠ Sem coluna marcada, o botão abre um diálogo — e o clique seguinte cai atrás dele

`SORT_ASC` sem coluna marcada não ordena: abre "Ordenação" (`SAPLSALV_CUL_…`). O clique seguinte cai
**atrás do modal e sai calado**; foi o que cegou a fase B inteira. Quem o enxerga na hora é
`[ct^="PW"]` visível (`JS_MODAL_DO_ALV`), e é por isso que `ordenarGrid` confere e estoura com o
título do diálogo em vez de devolver uma tabela que não mudou.

Dirigir esse diálogo **de propósito** é o gesto do item 121 — `ordenarGridPorVarias`, § "Ordenar por
VÁRIAS colunas" abaixo. É o único caminho para mais de um critério.

#### ⚠ Correção do item 121: ele **É** `wnd[1]`, e o aviso do 77 era artefato de TEMPO

O item 77 concluiu que "ele não é `wnd[1]`, o `lerTela` segue dizendo `janela.principal: true`".
Medido em **06/09/2026** (`POC_webgui_grid_ordmulti`, fase G), o mesmo clique lido em quatro
momentos da mesma sessão:

| momento | `lerTela.janela` | `JS_MODAL_DO_ALV` |
|---|---|---|
| logo após clicar (340 ms) | `wnd[0]` / `GuiMainWindow` / `principal: true` | 0 |
| +300 ms (702 ms) | `wnd[0]` / `GuiMainWindow` / `principal: true` | 0 |
| +1 s (1447 ms) | **`wnd[1]` / `GuiModalWindow` / `principal: false`** | **1** |
| após `esperarQuieto` (3126 ms) | `wnd[1]` / `GuiModalWindow` / `principal: false` | 1 |

Os dois passam a ver **no mesmo instante** — o `JS_MODAL_DO_ALV` não é "o que enxerga o que o
`lerTela` não enxerga", é só o que estava sendo consultado **depois** da espera. Todos os SIDs de
dentro do diálogo começam por `wnd[1]/`.

⚠ **O que continua verdade:** `lerTela.popup` fica `null` e o `titulo` continua o da janela
principal, com ou sem espera. Quem procurar o diálogo em `t.popup` não o acha — e é por isso que a
guarda do `ordenarGrid`/`gestoDeLinha` usa o `JS_MODAL_DO_ALV`, não o `popup`.

### Ordenar mexe no ABAP; filtrar não — e é aí que o `_linha` se define

| gesto | tela | ABAP (`FC03`) |
|---|---|---|
| `NOME desc`, linha 1 | `1:tres` | `0000000001=tres`, **`tab1=tres`** |
| `NOME = E2E-776551`, linha 1 | `1:E2E-776551` | `0000000002=E2E-776551`, `n=3`, `tab1=CP-POSITIVA` |

Ordenar **reordena a tabela interna do programa** (`gt_tab[1]-nome` virou `tres`) — DOM e ABAP
andam juntos. Filtrar não toca a outtab: o framework **traduz** o índice visual (1) para o da
outtab (2). A linha é a mesma dos dois lados; o número não.

> ⚠ **É a definição do `_linha` do `lerGrid`: "a n-ésima linha VISÍVEL agora", nunca uma
> identidade.** Guardado antes de ordenar/filtrar, aponta para outro dado depois; e sob filtro nem é
> o número que o `get_selected_rows` usa. Quem precisa de identidade guarda a **chave** da linha e a
> reencontra (`lerGrid` + busca pela coluna-chave).

### O diálogo do filtro, e os dois modos de falha dele

`MB_FILTER` **com** coluna marcada abre "Determinar valores para critérios filtro" — esse **é**
`wnd[1]` de verdade. Campos `ctxt%%DYN001-LOW` / `%%DYN001-HIGH`, OK em `wnd[1]/tbar[0]/btn[0]`;
ids do DOM posicionais (`M1:46:1::1:34`), achados por `jsPorSid`.

- ⚠ **O campo é `ctxt` e converte para MAIÚSCULAS.** Filtrar `tres` (que existe, minúsculo) devolveu
  **0 linhas, sem erro nenhum**. `total: 0` é resposta, não exceção — o ALV fica com corpo vazio e
  `totalRows: 0`.
- ⚠ **O diálogo reabre com o filtro ANTERIOR preenchido.** Limpar um intervalo escrevendo só o
  `LOW` deixava o `HIGH` de pé (`QTD 1..100` "limpo" continuava em 2 linhas — fase K, caso 8). Por
  isso `filtrarGrid` escreve o `HIGH` **sempre** que ele existe, inclusive vazio; revalidado contra
  o sistema na fase L.

### O estado está no NOME do PNG do cabeçalho

O `<th>` mostra `head<ordem>o<filtro>.png` — composicional:

| ícone | ordem | filtrada |
|---|---|---|
| (nenhum) | `null` | `false` |
| `headaoo` / `headdoo` | `asc` / `desc` | `false` |
| `headoof` | `null` | `true` |
| `headaof` / `headdof` | `asc` / `desc` | `true` |

Daí saem duas regras medidas: **ordenar por outra coluna substitui o critério** (mas preserva o
filtro da coluna anterior) e **limpar o filtro não derruba a ordenação**. Vários critérios de
ordenação de uma vez só pelo diálogo "Ordenação" — o gesto do item 121, logo abaixo.

## Ordenar por VÁRIAS colunas — o diálogo "Ordenação" (item 121)

**Medido no s4h 758/250 em 2026-09-06** (fila `adt-client`, item 121; evidência em
`sap-accelerate/work/POC_webgui_grid_ordmulti/medicoes/item121-ordenacao.md`, laboratório
`ZJBV_ALV47_EDIT`).

O botão da barra ordena por **uma** coluna e **substitui** o critério anterior (item 77). Mais de um
critério só pelo diálogo `SAPLSALV_CUL_CONFIGURATION` — que é justamente o que aparece quando o
botão é acionado **sem** coluna marcada:

```js
import { ordenarGridPorVarias } from './webgui.mjs';

await ordenarGridPorVarias(s, null, [{ coluna: 'NOME' }, { coluna: 'QTD', ordem: 'desc' }]);
await ordenarGridPorVarias(s, null, ['NOME', 'QTD']);   // as duas crescentes
// → { id, sid, criterios, total, linhas, colunas, ms }
```

A lista é **na ordem de prioridade**, e o nome é o **`SELTEXT`** que o diálogo lista (o rótulo do
fieldcat, que pode não ser o `ColumnIDs` do `lerColunas`) — quando não bate, o erro diz o que o
conjunto tem.

### A anatomia: dois ALVs e dois botões, todos em `wnd[1]/usr/subSUB_CONFIGURATION:…:0610/`

| peça | SID | o que é |
|---|---|---|
| `cntlCONTAINER1_SORT` | …`/shellcont/shell` | "Conjunto de colunas" — as ainda disponíveis (`SELTEXT`) |
| `cntlCONTAINER2_SORT` | …`/shellcont/shell` | "Critérios de ordenação" — `SELTEXT` + `SORT_DIRECTION` |
| `btnAPP_WL_SING` | …`/btnAPP_WL_SING` | "Incluir critério ordenação (F7)" |
| `btnAPP_FL_SING` | …`/btnAPP_FL_SING` | "Retirar critério ordenação (F6)" |
| Aceitar / Cancelar | `wnd[1]/tbar[0]/btn[0]` / `btn[12]` | |

A barra do grid de critérios ainda traz `btnDTC_UP`/`DTC_DOWN`/`DTC_UPPOS1`/`DTC_DOWNEND` (mover o
critério de lugar) — não exercitados: aqui a ordem sai da ordem de inclusão.

#### ⚠ O ID do grid do diálogo NÃO é estável

Numa rodada os grids foram `C138`/`C162`; com **um round-trip a mais** antes de abrir, vieram
`C140`/`C164`. Quem endereça por id acerta por sorte. O endereço estável é o **SID do container**, e
é o que `jsGridDoDialogoDeOrdenacao(DIALOGO_DE_ORDENACAO.criterios)` usa — irmão exato do
`jsBotaoDaBarra`, que casa o SID em vez do `C102_toolbar_btn15`.

#### A direção é o COMBO do item 114 — e o `lerGrid` não a lê

A célula de `SORT_DIRECTION` é um `ct="CB"` com duas opções, `Ordem crescente (↑)` e
`Decrescente (↓)`. **Um clique na célula abre a lista, e isso é puro cliente (zero POST)**; quem
posta é o clique na opção. A escolha vai pelo **índice** (0 = asc, 1 = desc), porque a chave vem no
idioma da sessão.

⚠ **`lerGrid` devolve `SORT_DIRECTION: ""`** — o combo não põe o texto no `innerText`, ele mora no
`lsdata["4"]` (é o que `jsDirecoesDosCriterios` lê). E esse `lsdata` é *o que o servidor mandou*:
uma escolha feita no cliente e ainda não postada **não aparece nele** (medido: os quatro casos da
fase F leram "Ordem crescente" nos dois critérios e saíram com as direções certas). **A direção
efetiva se lê depois, no cabeçalho do ALV** — `lerColunas`, que passa a mostrar N colunas ordenadas
ao mesmo tempo (`NOME:asc` + `QTD:desc`), coisa que a barra nunca produziu.

#### ⚠⚠ A DIREÇÃO DE UM CRITÉRIO SOBREVIVE À RETIRADA DELE

O modo de falha caro, e irmão exato do `HIGH` do filtro (§ acima). Na mesma sessão, com o diálogo
reaberto: retirar `QTD` e reincluí-la trouxe de volta a `Decrescente (↓)` da vez anterior — e um
pedido de `asc` que confiasse no "default crescente" sairia **`desc`, sem erro nenhum**. Foi
exatamente o que aconteceu na fase E (caso E2: pedi `QTD asc`, saiu `QTD desc`, e a tabela era a
mesma do caso anterior).

Por isso `ordenarGridPorVarias` **limpa os critérios que o diálogo trouxer** e **escreve a direção
de todo critério, inclusive a crescente**.

### A prova — quatro casos com o esperado calculado, e distintos entre si

Ordem de entrada medida `BB/10 AA/20 BB/05 AA/30` (o laboratório foi semeado com **empate** na 1ª
coluna de propósito: sem empate o 2º critério não tem onde se manifestar).

| critérios | medido | cabeçalho depois | ABAP (`FC03`) |
|---|---|---|---|
| `NOME asc` + `QTD desc` | `AA/30 AA/20 BB/10 BB/05` | `NOME:asc QTD:desc` | `tab1=AA` |
| `NOME asc` + `QTD asc` | `AA/20 AA/30 BB/05 BB/10` | `NOME:asc QTD:asc` | `tab1=AA` |
| `NOME desc` + `QTD asc` | `BB/05 BB/10 AA/20 AA/30` | `NOME:desc QTD:asc` | `tab1=BB` |
| só `NOME asc` | `AA/20 AA/30 BB/10 BB/05` | `NOME:asc QTD:-` | `tab1=AA` |
| `ID desc` + `NOME` + `QTD` | `AA/30 BB/05 AA/20 BB/10` | `ID:desc NOME:asc QTD:asc` | `tab1=AA` |

Os cinco resultados são **distintos entre si** — um resultado errado não passa por certo. E, como a
ordenação de uma coluna (item 77), **isto reordena a tabela interna do ABAP**: o `tab1` acompanha.

⚠ Só serve para ALV **com barra**: sem `SORT_ASC` na barra do grid o erro diz o que aquela barra tem
(listas como a do `RSPARAM` ordenam pela barra da **aplicação** — item 116, e o item 179).

### O que ainda NÃO está medido

- **Os botões de mover critério** (`btnDTC_UP`/`DOWN`/`UPPOS1`/`DOWNEND`) — a ordem aqui sai da
  ordem de inclusão, e reordenar critério já montado não foi exercitado.
- **O diálogo com o ALV já ordenado**: em sessão nova ele reabriu vazio (`reabriuCom: []`) nos
  quatro casos; que ele reabra com os critérios de antes só foi visto **dentro** da mesma sessão.
- **O mesmo diálogo por HTTP puro** (`its.mjs`), não exercitado. ⚠ Não confundir com o
  `ordenarGrid` de lá, que aceita **lista de colunas** (item 115): aquilo é o `columns=;a;b;` da
  barra, e é outra coisa — a precedência é a das colunas **na tela**, não a da lista, e a direção é
  do BOTÃO (`btn[28]`/`btn[40]`), uma só para todos os critérios. **Direção por critério, e ordem de
  precedência escolhida, só pelo diálogo.**
- ~~**O menu de contexto da célula** (`CellContextMenu`)~~ — medido no item 122, § abaixo.
- **`ColumnResize`** e o arrasto de coluna.

### O mesmo sort por HTTP PURO — um POST, e o botão se acha pelo ÍCONE (item 115)

Sem navegador não há clique no `<th>`: a marca da coluna **se posta**, junto do botão, no mesmo
batch. É o gesto inteiro:

```js
import { abrir, acionar, ordenarGrid, lerGrid, fechar } from './its.mjs';
const s = await abrir(cfg, { transacao: 'SA38', parametros: { 'RS38M-PROGRAMM': 'RSPARAM' }, okcode: 'STRT' });
await acionar(s, 'btn[8]');
await ordenarGrid(s, null, 'NAME', { ordem: 'desc' });   // 1 POST
await ordenarGrid(s, null, ['USER_VALUE', 'DESCR']);     // dois critérios
const g = await lerGrid(s);                              // o dado, já na ordem nova
```

```
action/46/wnd[0]/usr/cntlGRID1/shellcont/shell   columns=;1;
action/3/wnd[0]/tbar[1]/btn[40]
get state/ur
```

As quatro ações que o renderer manda a reboque do clique (`action/50`, `53`, `246`, `346`) são
**dispensáveis**: medido que o par `46` + `3` basta.

**O botão se endereça pelo ícone `lsdata[11]`** (`s_b_srtu` crescente / `s_b_srtd` decrescente) — é
o que `botaoDeOrdenacao` faz. O rótulo é traduzido ("Ordenar em ordem decrescente") e o `btn[n]` é do
GUI status daquela tela: na lista do RSPARAM o sort desc é o `btn[40]`, vizinho do `btn[28]`
crescente — **não** um botão de exportação, ao contrário do que o item 73 supôs.

⚠ **Marca inválida não é recusada, é ignorada — e aí o botão abre o diálogo "Ordenação".** Caem aí:
nenhum `action/46`, `columns=;0;` (a coluna 0 é a caixa de seleção) e coluna fora do grid. Não vem
`-107` nem mensagem; o sinal é a modal. **Neste canal ela É `wnd[1]` de verdade** — o `popupDaSessao`
a vê, com título e botões. (O item 121 mediu que no navegador ela também é `wnd[1]`; a diferença é
que lá o `lerTela.popup` continua `null`, então a modal só se detecta pelo `JS_MODAL_DO_ALV`.) O
`ordenarGrid` detecta, **cancela o diálogo** e estoura: a sessão continua utilizável.

⚠ **`columns=;a;b;` é um CONJUNTO: a precedência é a das colunas na TELA, não a da string.** Medido:
`;2;5;` e `;5;2;` deram o mesmo resultado (2 primária, 5 desempatando), e `;2;1;` ordenou por `NAME`
puro. Empate sem desempate é **estável**.

⚠ **Quem reordena é o servidor.** Com a tela em `NAME` desc, o XLSX do `exportarPlanilha` saiu na
mesma ordem (`ztta/short_area` na primeira linha, `_CPARG0` na última).

⚠ **Aqui a tela não declara a ordenação.** Os cabeçalhos (`ct="CP"`) vieram iguais antes e depois, e
nenhum ícone de sort entra no delta — não há o `head<ordem>o<filtro>.png` do navegador. Quem quer
saber a ordem corrente lê os dados. E **o filtro (`btn[29]`, `s_b_filt`) por esta via não está
medido**.

## O MENU DE CONTEXTO do ALV — a porta que funciona sem barra (item 122)

O `lsevents` do grid publica `CellContextMenu` desde o item 25, e até aqui nenhum gesto o tinha
aberto. Ele importa porque a via da barra (`ordenarGrid`, `filtrarGrid`, item 77) depende de a barra
do ALV **ter** o botão — e há ALV sem barra nenhuma. Medido no s4h 758/250 em 06/09/2026
(`POC_webgui_grid_ctxmenu`, fases A–G; laboratório `ZJBV_ALV47_EDIT` e a lista do `RSPARAM`;
leitura em `medicoes/item122-menu-contexto.md`).

```js
import { menuDoGrid, fecharMenuDoGrid, acionarNoMenuDoGrid } from 'adt-client/webgui';

const m = await menuDoGrid(s, null, { coluna: 'NAME' });   // linha 0 (o default) = CABEÇALHO
m.itens.map((i) => i.fcode);      // ['LOCAL&COPY','COL_INV','COL0','OPTIMIZE',…,'SORT_ASC','SORT_DSC',…]
await fecharMenuDoGrid(s);        // ⚠ `menuDoGrid` deixa o menu ABERTO

await acionarNoMenuDoGrid(s, null, 'SORT_DSC', { coluna: 'NAME' });          // pelo FCODE
await acionarNoMenuDoGrid(s, null, 'OPTIMIZE', { linha: 2, coluna: 'NOME' }); // pela CÉLULA
await acionarNoMenuDoGrid(s, null, 'Ordenar ord.crescente', { coluna: 'NOME' }); // ou pelo rótulo
```

### O gesto é o botão DIREITO pelo CDP — e só ele

| gesto | abriu? |
|---|---|
| `Input.dispatchMouseEvent` `button: 'right'` (o `cliqueDireito`) | **sim** |
| `el.dispatchEvent(new MouseEvent('contextmenu', …))` | **não** — `defaultPrevented: true, passou: false` |

O sintético o próprio renderer cancela. É a mesma razão pela qual `clique` precisa do `mouseMoved`
e do `buttons`: o gesto tem de entrar pela fila de eventos do navegador, não pelo DOM.

### O menu vem por ROUND-TRIP, e o gesto de abrir já carrega a COLUNA

```
focus/wnd[0]/shellcont/shell
action/53/…  row_index=2&column_index=2                     ← a célula corrente
action/50/…  top_left_…=2&…&reference_row_index=2           ← o bloco selecionado
action/12/…                                                 ← o CellContextMenu
get state/ur/wnd[0]/shellcont/shell/mnu   (logic: inverse)  ← o menu, do servidor
```

No **cabeçalho** saem ainda `action/246 column_index=2`, `action/346` e `action/46 columns=;2;`.
Por isso o sort daqui **não precisa** da marca pendente que `ordenarGrid` tem de fazer antes
(§ `marcarColuna`): a coluna viaja no próprio gesto de abrir.

### O vocabulário é o do menu da barra — mais o FCODE no SID

O menu é um `POMN` de SID `<sid do grid>/mnu` com itens `POMNI`, e o `Select` do `POMN` é o mesmo
`action/4` do item 49 — com um `LinkedControlId` a mais, que é o **id do grid**:

```json
{"Select":[{},{"1":"action/4","2":true,"15":true,"LinkedControlId":"C102"}]}
```

É o **único endereço estável**: o id do DOM (`menu_1_1`) e os dos itens (`u2EB53`, `u3D774`…)
mudam a cada abertura — e por isso `jsMenuDoGrid` casa pelo `LinkedControlId`.

`interpretarItemDeMenu` (itens 26/48) lê os itens **inteiros**: rótulo no `lsdata[1]`, cinza no
`lsdata[5]`, início de grupo no `[4]`, SID no `[18]`. Só o `nivel` sai errado (`-1`) — ele conta
`/menu[` no id, e aqui o id não é o caminho. `itensDoMenuDoGrid` reusa a pura, tira o `nivel` e põe
no lugar o que só existe aqui:

> o **FCODE do ALV vem no SID**: `wnd[0]/shellcont/shell/mnu/menu&SORT_DSC` → `SORT_DSC` — o mesmo
> vocabulário do `jsBotaoDaBarra`, e é o que deixa comparar as duas portas fcode a fcode.

### São DOIS menus, e o do CABEÇALHO é o que ordena

`ZJBV_ALV47_EDIT`, cuja barra já tem 23 fcodes:

| | célula (10 itens) | cabeçalho (16 itens) |
|---|---|---|
| comuns | `LOCAL&CUT` `LOCAL&COPY` `LOCAL&PASTE` `OPTIMIZE` `CDF` `FIND` `FIND_MORE` `FILTER` `XXL` | idem |
| só nele | `DETAIL` | `COL_INV` `COL0` `CFI` **`SORT_ASC` `SORT_DSC` `SUMC` `SUBTOT`** |

Ordenar, totalizar e subtotalizar **não estão no menu da célula**. E oito desses fcodes não estão
na barra deste ALV — `OPTIMIZE`, `CDF`, `CFI`, `COL_INV`, `FILTER`, `SUMC`, `SUBTOT`, `XXL`.

### A prova: o `RSPARAM`, onde a barra do ALV não existe

| | barra (item 77) | menu de contexto (item 122) |
|---|---|---|
| `JS_FCODES_DA_BARRA` | `[]` — **zero** | — |
| `ordenarGrid(… 'NAME', { ordem: 'desc' })` | estoura: *"esta tela não tem barra de ALV nenhuma"* | — |
| menu do cabeçalho | — | 12 fcodes, com `SORT_ASC`/`SORT_DSC`/`FILTER` |
| `acionarNoMenuDoGrid(… 'SORT_DSC', { coluna: 'NAME' })` | — | 1 `action/4`; `lerColunas` → `NAME:desc`, e as 1617 linhas vão de `Autostart…` para `ztta/short_area…` |

Listas como a do `RSPARAM` ordenam pela barra da **aplicação** (item 116) — o menu de contexto é a
via que dispensa saber qual botão daquela barra faz o quê.

### ⚠ FECHAR não é o que parece — e foi o que quebrou a primeira versão

O renderer **não remove nem esconde** o menu: ele o **move para `y = -100000`** (e some o
`<id>-lsPopupMenuElement`). Quem testar "visível" por `offsetWidth/offsetHeight` vê menu aberto
para sempre — foi assim que duas fases da POC concluíram, errado, que nada o fechava. O critério é
o `rect.top`, e é o que `jsMenuDoGrid` devolve em `aberto`.

Com o critério certo: **o `Escape` fecha e não posta nada** (`acoes: []`) — o renderer consome a
tecla. `fecharMenuDoGrid` usa o `Escape` **com a guarda** de só mandá-lo enquanto o menu estiver
aberto, porque com o menu fechado o mesmo `Escape` cancela a TRANSAÇÃO (§ `fecharMenu`).

**Clicar "fora" não serve.** Foi a primeira implementação — um "ponto inerte" escolhido por não ter
`ct` nos ancestrais próximos. Ele caiu no `<div id="<cid>-mrss-cont-left">`, a margem à esquerda do
ALV, e o clique postou `action/304` + `action/3` e **trocou a dynpro**: o grid sumiu. Adivinhar
região morta num renderer que não declara o que é acionável é apostar — a pura foi **removida** da
lib, não corrigida.

### ⚠ `mudou: false` não quer dizer que falhou

`OPTIMIZE` ("Largura otimizada"), pela célula, encolheu as colunas de `46/206/116` para `33/84/45`
**sem POST nenhum**: alguns itens o renderer resolve no cliente. Quem precisa saber o efeito olha o
efeito (`lerColunas`, `lerGrid`, a largura), não o `mudou`.

### O que ainda NÃO está medido

- **Os itens que abrem DIÁLOGO** (`FILTER`, `COL0`, `XXL`, `FIND`, `DETAIL`): o gesto volta com a
  janela de pé e fechá-la é de quem chamou. ⚠ O `FILTER` do menu **não é** o `MB_FILTER` da barra
  — fcodes diferentes, e não se sabe se o diálogo é o mesmo que `filtrarGrid` dirige.
- **`SUMC`/`SUBTOT`** (Total/Subtotais) e os primos `MB_SUM`/`MB_SUBTOT` da barra — nenhum dos
  quatro foi acionado.
- **O mesmo menu por HTTP puro** (`its.mjs`): o comando é o `action/4` com o SID do item, e o SID
  traz o fcode — em tese posta sem navegador, como `its.navegarMenu` faz com o menu da barra.
- **O submenu**: nenhum item medido tinha `lsdata[6]`/`aria-haspopup`.
- **A tecla `ContextMenu` (VK 93)** como gesto alternativo — nunca medida em estado limpo.

## Escrever numa célula do ALV — e provar que gravou (item 47)

**Medido no s4h 758/250 em 2026-09-05** (fila `adt-client`, item 47; evidência em
`sap-accelerate/work/POC_webgui_grid_edit/medicoes/item47-escrever-celula.md`). Os itens 25 e 46
pararam na leitura porque a lista do `RSPARAM` é `editable: false` — não havia laboratório. Ele foi
construído: **`ZJBV_ALV47` + `ZJBV_ALV47_EDIT`** (`$TMP`, ALV editável num docking container sobre a
tela de seleção, `FC01` = `check_changed_data` + `MODIFY` + `COMMIT WORK AND WAIT`).

```js
import { escreverCelula, lerGrid, comandar } from './webgui.mjs';

const e = await escreverCelula(s, null, { linha: 2, coluna: 'NOME', valor: 'E2E-776551' });
// { id: 'grid#C102#2,2#if', linha: 2, coluna: 2, nomeColuna: 'NOME',
//   de: 'ITEM47-OK', para: 'E2E-776551', publicado: 'grid#C102#2,2#if', pendente: true, ms: 1280 }

await escreverCelula(s, { id: 'C102' }, { linha: 3, coluna: 3, valor: '815' });  // coluna por índice
await comandar(s, 'FC01');                       // ← é ISTO que manda; escreverCelula só publica
```

**A célula editável só vira campo quando alguém clica nela.** Em repouso é o mesmo
`<span ct="CBS">` da leitura; o clique a troca por um **`<input type="text">` de mesmo id**
(`grid#<CID>#<r>,<c>#if`). Por isso o gesto é clicar → digitar (nativo), nunca `.value =`.

**Quem publica é o `blur`; quem MANDA é o round-trip seguinte.** O `Change` do `lsevents` da célula
enfileira, e o próximo post ao servidor leva:

```
POST …/batch/json  [{ "post": "focus/<SID do grid>", "logic": "ignore" },
                    { "post": "action/622/<SID do grid>",
                      "content": "row_index=2&column_id=NOME&value=E2E-776551" },
                    { "post": "vkey/0/ses[0]" }, { "get": "state/ur" }]
```

⚠ **A coluna vai pelo NOME** (`column_id=NOME`, o `ColumnIDs`), não pelo índice — daí
`escreverCelula` aceitar `coluna: 'NOME'` e `coluna: 3` e resolver por `indiceDaColuna`.

### ⚠ O modo de falha é SILENCIOSO — e a mensagem de sucesso mente

Contra-prova pareada, mesma sessão, mesmo valor (`raw/h-contraprova.json`):

| | `action/622` no batch | mensagem do ABAP | a tabela em OUTRA LUW |
|---|---:|---|---|
| digitar **sem** publicar (`publicarValores: false`) | **0** | `ITEM47 GRAVOU subrc=0 n=3` | **inalterada** |
| digitar **com** `blur` | **1** | `ITEM47 GRAVOU subrc=0 n=3` | `NOME = 'CP-POSITIVA'` |

As duas dizem "gravou subrc=0", e só uma gravou. **A mensagem do programa não é prova de que o que
você digitou chegou** — a prova é o `action/622` ter saído (`publicado` no retorno) e a leitura em
outra LUW. É a mesma armadilha do campo comum (§ "A caixa de comando"), com um agravante: aqui o
ABAP roda de qualquer jeito e responde com sucesso.

⚠ **Digitar não valida nada.** O renderer aceita texto em qualquer célula do grid editável e monta o
`action/622` até para coluna que a tela pinta como protegida (medido no `BCALV_EDIT_01` com `PRICE`,
cujo `lsdata` não tem as chaves `12`/`16` das demais). Quem recusa é o ABAP, na resposta.

### O que o `lerGrid` do navegador ganhou (e o bug que isso corrigiu)

A célula em edição **quebrava a leitura, calada**: virando `<input>`, o `lsdata[21]` deixa de ser
objeto e vira **string JSON**, a busca por valor-objeto não acha nada e o `innerText` de um `<input>`
é vazio — a coluna saía `''` como se o dado não existisse. Corrigido em `jsBlocoDoGrid` (o `21`
re-parseado + o `el.value`), e a leitura agora **avisa**:

```js
(await lerGrid(s)).editando   // { linha: 3, coluna: 3, digitado: '815', servidor: '4.747' }
```

`editando ≠ null` é dado NÃO publicado: `digitado` é o que está na tela, `servidor` é o que o SAP
tem. Depois do round-trip os dois coincidem — é um assert de graça.

### Onde há ALV editável para medir

Fase A, 14 programas sondados por `SA38` no s4h (`raw/a-cacar.json`): **`BCALV_EDIT_01`, `_03`…`_08`,
`BCALV_GRID_EDIT`, `BCALV_TEST_GRID_EDIT` e `BCALV_TEST_GRID_EDITABLE`** trazem `editable: true`;
`BCALV_EDIT_02`, `BCALV_GRID_04` e `BCALV_GRID_DEMO` são somente leitura.
⚠ **Nenhum deles GRAVA** — fase B, lendo o fonte por ADT: todos mexem só em tabela interna. Servem
para medir o gesto, **não** o ciclo com LUW; para esse, laboratório próprio.

## Inserir e apagar LINHA no ALV — o gesto que viaja e mesmo assim não grava (item 78)

**Medido no s4h 758/250 em 2026-09-06** (fila `adt-client`, item 78; evidência em
`sap-accelerate/work/POC_webgui_grid_linha/medicoes/item78-inserir-apagar-linha.md`). O item 47
deixou anotado que o `lsevents` da célula publica `DeleteItem` — não era por ali: **quem cria e
apaga linha é a BARRA do ALV**, e só num ALV editável.

```js
import { inserirLinha, apagarLinhas, comandar } from './webgui.mjs';

await inserirLinha(s);                                              // linha vazia no FIM
await inserirLinha(s, null, { valores: { ID: '005', NOME: 'x' } }); // no fim, já preenchida
await inserirLinha(s, null, { antesDe: 2 });                        // empurra a 2 para baixo
await apagarLinhas(s, null, [1, 3]);                                // as duas de uma vez
await comandar(s, 'FC01');                       // ← é ISTO que grava; o resto só mexe na tela
```

Com `layout-edit = 'X'` a barra publica os quatro, endereçáveis pelo SID (`<sid do
grid>/tbar/btn&LOCAL&APPEND`), como o `SORT_ASC` do item 77 — o id do DOM (`C102_toolbar_btn10`) é
posicional:

| fcode | title | o que faz |
|---|---|---|
| `LOCAL&APPEND` | "Anexar linha" | linha nova no **FIM, sempre** — seleção e célula corrente não o desviam |
| `LOCAL&INSERT_ROW` | "Inserir linha" | **ANTES** da linha selecionada (ou, sem seleção, da CORRENTE) |
| `LOCAL&DELETE_ROW` | "Eliminar linha" | apaga **todas as selecionadas** de uma vez; **sem seleção, a CORRENTE** |
| `LOCAL&COPY_ROW` | "Duplicar a linha" | medido na barra, gesto ainda não exercitado |

O `lsdata` do grid ainda anuncia `hasRowInsertAllowed: true`. Num ALV somente leitura
(`BCALV_GRID_DEMO`) **nenhum dos quatro existe**, e o erro sai dizendo o que a barra tem:
`o ALV C102 não tem o botão "LOCAL&APPEND" na barra — a barra desta tela tem: DETAIL, SORT_ASC, …`.

### ⚠ O round-trip acontece — e não é gravação

É o espelho da armadilha do item 47, e mais fácil de cair: lá o valor digitado ficava preso no
navegador; aqui o gesto **chega ao servidor** (`action/3` no batch), a tabela interna do ABAP muda na
hora, a tela volta com uma linha a mais ou a menos — e o banco não mudou nada. Contra-prova pareada,
mesma sequência, só o fcode de gravar mudando (`raw/e-ciclo.json`):

| | gesto no servidor | `FC01` | a tabela em OUTRA LUW |
|---|---|---|---|
| **NEGATIVA** | sim, nos dois gestos | **não mandado** | **inalterada** (as 3 linhas de antes) |
| **POSITIVA** | sim | mandado | linha nova gravada, apagada some |

⚠ **`MODIFY FROM TABLE` não apaga.** Um programa que grava assim aceita a linha nova e **deixa a
apagada no banco, calado** — o `FC01` do laboratório teve de virar `DELETE FROM` + `MODIFY` para que
"apagou" fosse falseável. Antes de confiar num "apaguei pelo ALV", saiba o que o programa faz no
gravar dele.

⚠ **A linha nova nasce com os campos INICIAIS, chave incluída** — inserida sem preencher o `ID`
(`numc(3)`), chegou ao banco como `ID = '000'`. Duas linhas novas sem chave colidem: quem insere
preenche a chave.

⚠ **`apagarLinhas` exige a lista de propósito.** Sem seleção o ALV apaga a linha CORRENTE, que
qualquer clique numa célula move — "a que estiver marcada" não é endereço.

⚠ **O `_linha` das que sobram RENUMERA na hora** (apagada a 2, a 3 vira 2) — mais uma face do §
"`_linha` é a n-ésima linha VISÍVEL agora, nunca uma identidade". Apagar `[1, 3]` em duas chamadas
apaga a linha errada na segunda: passe as duas juntas, ou releia o bloco entre uma e outra.

`valores` sai por `escreverCelula` e por isso fica **pendente no navegador** (`pendente: true`): ele
viaja no próximo round-trip, junto do gesto de gravar. Os dois conferem o total depois do gesto e
estouram quando o programa recusou a inserção ou a exclusão.

## Colar um BLOCO no ALV — N células num round-trip só (item 79)

**Medido no s4h 758/250 em 2026-09-06** (fila `adt-client`, item 79; evidência em
`sap-accelerate/work/POC_webgui_grid_paste/medicoes/item79-colar-bloco.md`). O item 47 deixou
anotado que a célula editável publica
`"ClipboardTablePaste":[{},{"0":"GuiTextField","1":"action/25","2":true,"3":true}]` — um dos raros
`lsevents` de shell que **traz** o comando. Ele traz, e **mente**: colar não posta `action/25`
nenhum.

```js
import { colarBloco, comandar } from './webgui.mjs';

await colarBloco(s, null, { linha: 1, coluna: 'NOME', valores: [
  ['ITEM79-A', 201], ['ITEM79-B', 202], ['ITEM79-C', 203] ] });   // 6 células, 1 requisição
await colarBloco(s, null, { linha: 1, coluna: 'NOME', valores: 'a\t1\r\nb\t2' }); // TSV do Excel
await comandar(s, 'FC01');                       // ← é ISTO que grava; colar só mexe no ALV
```

### O que o gesto POSTA de verdade

Um POST só, com o batch inteiro (`raw/a-sonda.json`, `raw/b-forma.json`):

```
focus/<SID do shell>                      ← só quando o foco ainda não estava no grid
action/50/<SID>   top_left_column_index=2&top_left_row_index=1&bottom_right_…&reference_…
action/53/<SID>   row_index=1&column_index=2          ← a célula CORRENTE: a ÂNCORA
action/770/<SID>  c0=ITEM79-A&c1=201&curColIdx=2&curRowIdx=0
action/770/<SID>  c0=ITEM79-B&c1=202&curColIdx=2&curRowIdx=1     ← um action/770 POR LINHA
state/ur
```

`curColIdx` é a coluna ÂNCORA, 1-based (a mesma numeração do `lerGrid` e do `indiceDaColuna`);
`curRowIdx` é 0-based e **relativo à âncora** — ancorado na linha 2, a primeira linha colada sai
com `curRowIdx=0`. O `content` vai URL-encoded (`a;b` → `a%3Bb`). Separador de coluna é o TAB, de
linha é a quebra: `\n` e `\r\n` produziram o **mesmo** batch, e é isso que faz o TSV copiado do
Excel servir direto.

### O que isso economiza

As mesmas 6 células do laboratório, medidas na mesma sessão (`raw/d-e2e.json`):

| via | tempo | requisições | estado depois |
|---|---|---|---|
| 6 × `escreverCelula` | **9748 ms** | 0 (tudo pendente) | `pendente: true` — só viaja no próximo gesto |
| 1 × `colarBloco` | **2578 ms** | **1** | já chegou ao ALV |

⚠ **`colarBloco` faz round-trip, então ele LEVA JUNTO o que estava pendente** de `escreverCelula`:
no e2e, o POST do paste saiu com os 6 `action/622` da fila anterior antes dos seus `action/770`.

### ⚠ A âncora é a célula CORRENTE do ALV, não o elemento onde o `paste` cai

O achado que mais dói. Disparando o evento no span da célula `3,NOME` **sem clicar nela antes**, o
ALV colou na célula `(1,1)` — a corrente dele — e o `content` saiu `curColIdx=1`: `REP79` foi para
o `ID` (truncado a `REP`, maxlen 3) e `931` para o `NOME` (`raw/c-luw.json`, caso `a`). O elemento
do `dispatchEvent` não escolhe nada; quem escolhe é o clique anterior. Por isso `colarBloco` clica
na âncora e exige o campo de entrada aberto antes de colar.

### ⚠ Os três silêncios

| situação | o que acontece | como `colarBloco` reage |
|---|---|---|
| texto **sem TAB e sem quebra** | o renderer nem chama `preventDefault`: 0 requisição, nada muda | recusa antes, apontando `escreverCelula` |
| **coluna estoura à direita** | `c0=601&c1=X&c2=Y` é postado inteiro; o ALV aplica o que cabe e **descarta o resto calado** | recusa antes, dizendo quantas sobram |
| **linha estoura embaixo** | o ALV **ANEXA**: entra um `action/771 pasteOption=Append` entre os `770`, e o total foi de 3 para 5 | deixa acontecer e devolve `anexadas` |

A linha anexada nasce **vazia fora do bloco** — o renderer manda `c1=&c2=` —, então a chave que não
veio no bloco fica em branco (mesma armadilha do `inserirLinha` do item 78).

### ⚠ A tela depois do paste não é prova

Colar `ABC` na coluna numérica `QTD` deixou `ABC` no grid, o `FC01` respondeu *"ITEM47 GRAVOU
subrc=0 n=3"* — e o banco ficou com o valor **antigo** (815), sem mensagem e sem a tela se corrigir
(`raw/c-luw.json`, caso `d`). O `check_changed_data( )` do laboratório é chamado sem ler `e_valid`;
outro programa reagiria. A lição vale para qualquer um: a prova é ler em outra LUW. `colarBloco`
devolve `divergentes` — o que a tela não mostrou como pedido —, que pega o truncamento mas **não**
pega este caso.

### ⚠ Colar não grava

Contra-prova pareada, mesma sequência, só o fcode mudando (`raw/c-luw.json`):

| | round-trip do paste | `FC01` | a tabela em OUTRA LUW |
|---|---|---|---|
| **NEGATIVA** | sim, 1 POST | **não mandado** | **inalterada** |
| **POSITIVA** | sim | mandado | `931`, `ITEM79B`, `ITEM79C` gravados |

E o e2e fechou o item: o bloco `ITEM79-A/201`, `ITEM79-B/202`, `ITEM79-C/203` colado num gesto
chegou ao banco idêntico, pelo mesmo caminho do `action/622` (`raw/d-e2e.json`).

### A via do gesto: `ClipboardEvent` sintético, não o clipboard do SO

O paste NATIVO do CDP (`Input.dispatchKeyEvent{ commands: ['paste'] }` depois de
`navigator.clipboard.writeText`) produziu **exatamente o mesmo batch** (fase A) — funciona, e é bom
saber que funciona. Mas ele passa pelo clipboard do SISTEMA, que é da máquina inteira e do usuário
logado: rodar a lib apagaria o que a pessoa tinha copiado. Por isso `colarBloco` usa o
`ClipboardEvent` com `DataTransfer`, que só existe dentro da página. O recibo de que o renderer
tratou é o `preventDefault` — sem ele, `colarBloco` estoura em vez de deixar o silêncio passar.

### O que ainda NÃO está medido

- **`action/770` pela via HTTP** (`its.mjs`), sem navegador — seria escrita em lote sem Chrome.
- **Colar com mais de um bloco selecionado**, ou sobre uma seleção de faixa (o `action/50` sugere
  que a área importa; aqui ela sempre foi 1×1).
- **`LOCAL&COPY_ROW`** e o caminho inverso (copiar do ALV para o clipboard) — o
  `CopyToClipboardRequest` já se sabe sem via HTTP (item 45).

## O COMBOBOX (`ct="CB"`) — escolher uma opção é postar a CHAVE (item 114)

Medido no s4h 758/250 em 06/09/2026, `work/POC_webgui_combo/medicoes/item114-combo.md`.

O `ct="CB"` do ITS **não é um `<select>`**: é um `<input readonly>` que mostra o TEXTO da opção
corrente, e a lista de opções vem separada — **no mesmo delta** — como um `<div ct="LIB_PS" id="…">`
com um `<div ct="LIB_I" data-itemkey="…" data-itemvalue2="…">` por opção. O elo entre os dois é o
**`aria-controls`** do input, que é o `id` da lista.

```js
const cardapio = opcoes(s, { campo: 'GS_EXPORT-FORMAT' });
// { sid: '…/cmbGS_EXPORT-FORMAT', chave: 'xlsx-LEAN-STANDARD', texto: 'Microsoft Excel (*.xlsx)',
//   opcoes: [ { indice: 0, chave: 'xlsx-LEAN-STANDARD', texto: 'Microsoft Excel (*.xlsx)' },
//             { indice: 1, chave: 'csv-LEAN-STANDARD',  texto: 'File separado por vírgula (*.csv)' } ] }

preencher(s, { campo: 'GS_EXPORT-FORMAT' }, 'File separado por vírgula (*.csv)');
// enfileira `value/…/cmbGS_EXPORT-FORMAT` com **csv-LEAN-STANDARD** — a lib traduz texto → chave
```

**O que se posta é a CHAVE.** Uma sessão por candidato, mesmo ponto da tela, `preencher` + `enviar`:

| postado em `value/<SID>` | resposta |
|---|---|
| `csv-LEAN-STANDARD` (a chave) | `delta` — e o combo voltou com a chave nova e o TEXTO traduzido pelo servidor |
| `File separado por vírgula (*.csv)` (o texto **que a tela mostra**) | `multipart` **`-107 failed to set value: invalid value`** |
| `BANANA` | **o mesmo `-107`** |

O combo valida do outro lado, e a distância entre "quase certo" e "errado" é zero: o rótulo da
própria tela é recusado com o mesmo código que lixo. Por isso `preencher` num `GuiComboBox` passa o
valor pelo `chaveDaOpcao` do combo — que aceita a **chave**, o **texto** (sem diferenciar caixa nem
espaço de sobra) ou o **índice** — e opção inexistente estoura **na hora de enfileirar**, com o
cardápio, em vez de virar o `-107` mudo. `{ cru: true }` desliga a tradução, para medir.

E a escolha **chega ao ABAP**, não fica no eco da tela: com `csv-LEAN-STANDARD` no combo do
*Export As*, o ITSDoc virou `DefExt: 'csv'` / `Filter: 'csv file (*.csv)'` e o arquivo saiu CSV
UTF-8 com BOM (156 528 B), contra o XLSX (`50 4b 03 04`, 88 061 B) do outro.

### ⚠ Quatro armadilhas

1. **Um `value` recusado derruba o batch INTEIRO.** O `-107` veio como `multipart`, sem `delta`: o
   `focus`, o `value` e o `state/ur` do mesmo POST não produziram tela. Nada mudou — a sessão não
   fica num meio-termo, e a tela anterior continua valendo.
2. **A chave corrente sai do `lsdata` pelo CONTEÚDO, não pelo índice** — é o valor que também é
   `data-itemkey` de alguma opção. (No Export As o índice era `4`, mas índice de `lsdata` muda por
   tipo de controle; ver *⚠ O índice do SID MUDA por tipo de controle*.)
3. **O `aria-activedescendant` da lista NÃO acompanha a escolha.** Com o combo já em `csv` no
   `lsdata`, ele continuava apontando o item do `xlsx`: é o primeiro item, não o corrente.
4. **A opção corrente pode ser MEMÓRIA DO USUÁRIO, não constante da tela.** Depois de *exportar* uma
   vez em `csv`, toda sessão nova abriu o Export As já em `csv` — e só voltou a `xlsx` depois de
   exportar em `xlsx` de novo (escolher sem exportar não gravou nada). Quem depende do default está
   dependendo do que aquele usuário fez por último naquele sistema.

### O que ainda NÃO está medido

- **Combo editável** (sem `readonly`): os dois medidos são `readonly`. Daí `chaveDaOpcao` só recusar
  quando há lista no delta — sem lista, o valor passa cru.
- **Combo cuja lista o delta não traz** (que só a carregue no `ListAccess`).
- **Combo fora do Export As** — a leitura é do markup do renderer, não do programa, mas medido só lá.

## Exportar a lista por ARQUIVO — o ITSDoc (item 45)

**O canal TEM via de saída** — não pelo `batch/json`, por um diálogo à parte. Medido no s4h 758/250
em 05/09/2026 na mesma lista do RSPARAM (`work/POC_webgui_export/medicoes/item45-exportar.md`):

```js
const s = await abrirTransacao(cfg, 'SA38', { parametros: { 'RS38M-PROGRAMM': 'RSPARAM' }, okcode: 'STRT' });
await acionar(s, 'btn[8]');
const { conteudo, bytes, partes } = await exportarLista(s, { formato: 'tabuladores' });
// 182 015 B de TSV, 1617 linhas — as MESMAS do lerGrid, com 68× menos bytes
```

O gesto é o do próprio ALV: **`wnd[0]/tbar[1]/btn[45]` "File local..."** (`CTRL_SHIFT_F9`) — a barra
da lista publica os botões de exportação, e não é preciso caminho de menu. Ele abre o popup
*Gravar lista em file...* (`SAPLSPO5`, 6 radios `SPOPLI-SELFLAG[n,0]`); o radio se marca com
`action/4/<SID>` e quem confirma é o **`vkey/0/ses[0]`** (o Avançar da modal publica
`Press: vkey/0/ses[0]`, não `action/3`).

Confirmado, a dynpro vira `SAPLSIT1` e o delta deixa de trazer tela: traz um **pedido ao frontend**,
o `sap.its.arrITSDocParams`. Cada método é um POST **fora do batch**, na URL que o pedido trouxe
(`…/bc/gui/sap/its/webgui/<n>/data/<id>~<verbo>`), corpo vazio, `x-www-form-urlencoded`:

| `ITSDocMethod` | o POST | a resposta |
|---|---|---|
| `Query` (`CD`/`FL`/`FE`/`DE`) | `<URL>query?RetQuery=<caminho\|tamanho\|1\|0>` | vazia |
| `FileSaveDialog` | `<URL>filesavedialog?FileName=…&FileEncoding=…` | vazia |
| `FileOpenDialog` | `<URL>fileopendialog?` + `FileEncoding=…&count=1&FileName0=…` **no corpo** | vazia |
| `Export` | `<URL>get` | **o arquivo** |
| `Import` | `<URL>post`, multipart `LOCALFILE1` — **leva o arquivo** | vazia |
| `GuiSapInfo` + `Method:'ClipboardExport'` | `<URL>clipboardexport` | **o texto** |
| `Execute` | **nenhum** — só o `OK_ITSDOC` de volta | — |

⚠ **`GuiSapInfo` não é um método, é um ENVELOPE** (item 113): quando o `ITSDocMethod` é
`GuiSapInfo`, o verbo verdadeiro está no campo **`Method`** — `GetTempPath`, `ClipboardExport`,
`ClipboardImport`, `DirectoryCreate`, `DirectoryRemove`. Quem resolve é `verboDoItsdoc(doc)`. Os
outros treze verbos, e o que a lib responde a cada um, estão no § *O ITSDoc que não é arquivo*.

Depois de CADA um, o controle volta à dynpro com o trio fixo do renderer (`OK_ITSDOC`):
`okcode/ses[0]` = `=OK`, `vkey/0/ses[0]`, `state/ur`. Sem ele o programa fica esperando o frontend.
O laço inteiro está em **`atenderItsdoc(sessao, resposta, opts)`** — é dele que `exportarLista` vive,
e é ele que a via de ENTRADA (§ abaixo) usa.

⚠ **O `Query` é uma pergunta de verdade, tem QUATRO sub-verbos, e responder o errado DERRUBA o
programa** (item 72): `CD` = qual o diretório corrente (responder `Z:\`; vazio faz o servidor
repetir o `CD`), `FL` = o TAMANHO do arquivo em bytes, `FE` = o arquivo existe (`1`/`0`), `DE` = o
diretório existe (`1`/`0`). A CG3Y pergunta `FE`, e respondendo `Z:\` deu **dump**. O `Z:\` é a raiz
do filesystem VIRTUAL que o renderer inventa para o browser (`nfstosfs`), não disco de ninguém.
⚠ **A SAÍDA vem FATIADA, em pedaços de 5 120 000 B** — o HTML veio em dois `Export` (5 120 000 B +
1 643 878 B), e 64 MB desceram em **14** (item 112). Daí `exportarLista` acumular `partes` e
concatenar. Conta grosseira: `voltas ≈ bytes / 5 120 000 + 2`, e por isso o `voltasMax` padrão é
**40**. Estourá-lo agora ESTOURA (era arquivo truncado devolvido calado); se um download grande
morrer aí, suba o `voltasMax`, não o ignore.
⚠ **`planilha` tem uma etapa a mais**: o Avançar abre o popup *Export As*, e é o botão de lá que
dispara o ITSDoc — § abaixo (item 73).

| formato | saída | bytes | download |
|---|---|---:|---:|
| `nao-convertido` | texto de largura fixa, 1617 linhas + cabeçalho | 1,08 MB | 77 ms |
| `tabuladores` | **TSV** com cabeçalho | 182 KB | 62 ms |
| `html` | HTML, em 2 partes | 6,76 MB | 251 ms |
| `clipboard` | texto, num POST só, sem arquivo | 1,07 MB | 100 ms |

**Exportar ou `lerGrid`?** Cruzados na mesma sessão, os 1617 nomes batem **1617 de 1617**. Mas a
exportação traz a lista **como o ALV a formata** (cabeçalho traduzido, valor com máscara, ordem da
tela) e o `lerGrid` traz o dado por `ColumnID`. Para *ver o que o usuário veria*, exportação; para
*ler campo*, `lerGrid`.

### O XLSX sai por OUTRO popup — o *Export As*, e o botão dele (item 73)

O formato *Planilha eletrônica* é o único dos seis que **não** vai ao ITSDoc pelo Avançar: ele abre
uma segunda modal, o **Export As** (`SAPLSALV_GUI_CUL_EXPORT_AS`, título *Export As*), e quem
dispara o download é o **"Exportar para..."** dela — `wnd[1]/tbar[0]/btn[20]`, `SHIFT_F8`. Medido no
s4h 758/250 em 06/09/2026 (`work/POC_webgui_planilha/medicoes/item73-planilha.md`).

```js
const s = await abrirTransacao(cfg, 'SA38', { parametros: { 'RS38M-PROGRAMM': 'RSPARAM' }, okcode: 'STRT' });
await acionar(s, 'btn[8]');
const { conteudo, bytes, metodos } = await exportarPlanilha(s, { nome: 'PARAMETROS' });
// 88 061 B de XLSX real (PK\x03\x04, 9 partes OOXML) — 1618 linhas × 5 colunas
// metodos: [ 'FileSaveDialog', 'Export', 'Execute' ]
```

Três peças no popup, e `exportAsDoPopup(popupDaTela(...))` devolve as três: `txtGS_EXPORT-FILE_NAME`
(nome **sem** extensão — quem põe é o `DefExt` do ITSDoc), `cmbGS_EXPORT-FORMAT` e
`cmbGS_EXPORT-DESTINATION`. No sistema medido os dois combos tinham **uma opção cada**
(`xlsx-CUSTOM` "Microsoft Excel (*.xlsx)" e `L` "Local"), e é por isso que a função devolve os
`valores` de tela. ⚠ **Isso vale para ESTA via.** Pelo `btn[43]` o mesmo `cmbGS_EXPORT-FORMAT` traz
DUAS opções (`xlsx-LEAN-STANDARD` e `csv-LEAN-STANDARD`), e aí há escolha a fazer — ver § *O
COMBOBOX (`ct="CB"`)*, item 114, inclusive a armadilha de o default ser memória do usuário.

O laço do ITSDoc tem **três** voltas, e a terceira é o método novo: `FileSaveDialog` → `Export` →
**`Execute`**. O `Execute` (`Operation:'OPEN'`, `CommandLine:'<o arquivo>'`) é "abra no frontend o
arquivo que acabou de baixar" — no renderer é `showBlob`, **sem XHR nenhum** —, então a resposta
certa é *não postar nada*. Medido dos dois lados: responder `cancel` também conclui (mesma mensagem,
mesmos bytes), mas mente sobre o que o frontend fez.

⚠ **`btn[43]` e `btn[45]`→radio *planilha* NÃO dão o mesmo arquivo.** As duas vias abrem o MESMO
popup, chamam o MESMO ITSDoc, e os 1617 parâmetros batem **1617 de 1617** — mas:

| | `btn[45]` → radio *planilha* (`exportarLista`) | `btn[43]` (`exportarPlanilha`) |
|---|---:|---:|
| bytes | 206 650 | **88 061** |
| linhas × colunas | 1620 × **32** | 1618 × **5** |
| cabeçalho | linha 2 (a 1 é vazia), coluna A de margem | linha 1 |
| o que é | a **LISTA** (o layout de impressão espalhado em células, texto com *padding*) | o **GRID** (uma coluna por coluna do ALV) |

Para planilha que alguém vai abrir e usar: `exportarPlanilha`. O `btn[43]` é *Planilha
eletrônica...*, `CTRL_SHIFT_F7`, e vive na mesma barra do `btn[45]` (*File local...*,
`CTRL_SHIFT_F9`). ⚠ São **dois**: o `btn[40]`, que este parágrafo já contou como terceiro da faixa,
é *Ordenar em ordem decrescente* (item 115) — a numeração `btn[n]` não segue a posição na barra, e
agrupar por `btn[4x]` é inventar uma faixa que não existe.

### ⚠ O `CopyToClipboardRequest` do grid NÃO tem via HTTP

Não é falta de descoberta — é ausência de comando, por três medições independentes:

1. **Controle de shell não publica comando no `lsevents`.** Dos 17 eventos do grid `C102`
   (`CellSelect`, `BlockSelect`, `RequestData`, `CopyToClipboardRequest`…), **0 têm o índice `1`**,
   enquanto na mesma tela os controles comuns têm 43 pares evento→comando. Vale até para o
   `RequestData`, cujo `action/710` só apareceu **capturando a rede** (item 25): para o grid, o
   `lsevents` diz o QUE, nunca o COMO.
2. **O renderer marca o evento como não-submetível** (`q.rgv.submit = !1`): o handler monta a string
   das células do DOM e chama `navigator.clipboard.writeText`. É gesto de browser, ponta a ponta.
3. **O mapa `RGACTIONS` do `GuiGridView` tem 33 ações e nenhuma de copiar/exportar** — as duas do
   clipboard são `760 COPYCLIPBOARDFAILED` (avisar que o cliente falhou) e `772` (o *cut*).

Quem quer o texto usa o *Exportar → Clipboard* (radio 5), que é ITSDoc — e está medido acima.

## SUBIR arquivo para o SAP — o ITSDoc de ENTRADA (item 72)

O par exato da exportação. Medido no s4h 758/250 em 06/09/2026 pela **CG3Z** (frontend → servidor de
aplicação), com contra-prova pela CG3Y (`work/POC_webgui_import/medicoes/item72-import.md`).

```js
const s = await abrirTransacao(cfg, 'CG3Z');
if (lerTela(s).popup) await acionar(s, { sid: 'wnd[1]/tbar[0]/btn[0]' });   // a nota 1949906
preencher(s, { sid: 'wnd[1]/usr/ctxtRCGFILETR-FTFRONT' }, 'Z:\qualquer.bin');   // nome VIRTUAL
preencher(s, { sid: 'wnd[1]/usr/txtRCGFILETR-FTAPPL' }, '/usr/sap/trans/x.bin'); // o destino real
preencher(s, { sid: 'wnd[1]/usr/ctxtRCGFILETR-FTFTYPE' }, 'BIN');
await enviar(s);
let r = await acionar(s, { sid: 'wnd[1]/tbar[0]/btn[14]' });                     // "Carregar"
if (s.sids.some((x) => x.sid === 'wnd[2]/usr/btnSPOP-OPTION1')) {                // "sobregravar?"
  r = await acionar(s, { sid: 'wnd[2]/usr/btnSPOP-OPTION1' });
}
const { ultima } = await atenderItsdoc(s, r, { dado: meuBuffer, arquivo: 'Z:\qualquer.bin' });
ultima.mensagem;  // S "File Z:\qualquer.bin foi transferido para /usr/sap/trans/x.bin"
```

**O nome do arquivo de origem é uma FICÇÃO.** `Z:\qualquer.bin` não existe em disco nenhum — é o
endereço no filesystem virtual do renderer, e serve só para a dynpro ter o que mostrar e o `Import`
ter o que pedir. O byte que sobe é o `dado` que se passa ao `atenderItsdoc`.

⚠ **O POST do `Import` NÃO leva `Content-type` nem `X-Requested-With`.** No renderer,
`UpDownSendRequest(url, null, "X", …)`, e o `"X"` é justamente o que desliga os dois — quem manda é o
`multipart/form-data; boundary=…` do `FormData` (campo `LOCALFILE1`, `Blob` de
`application/octet-stream`). Pôr o `Content-type` à mão quebra o boundary. O `updown` do `its.mjs` já
faz essa bifurcação; ela existe só por causa disto.

**Medido:** 57 B de texto e 256 KB de binário aleatório num POST só, `sha256` idêntico na ida e na
volta (subiu por CG3Z, voltou por CG3Y). 1 volta do ITSDoc para subir (`Import`), 2 para baixar
(`Query(FE)` → `Export`).

### O TETO da subida — 100 MiB, e quem corta é o ICM (item 112)

Medido no s4h 758/250 em 06/09/2026 (`work/POC_webgui_import/medicoes/item112-teto.md`), ao byte e
pelo canal real:

| | |
|---|---|
| quem corta | **não** é o renderer: o `maximum file size` dele é `Math.pow(2,31)-1` (2 GiB−1), constante literal, sem parâmetro de sistema por trás (nenhum `updown*`/`its/*` na RSPARAM) |
| quem corta de verdade | o **ICM**, pelo `icm/HTTP/max_request_size_KB` (102400 aqui), sobre o **corpo inteiro** do POST |
| a conta | passa enquanto `floor(corpo/1024) <= max_request_size_KB` — 1 023 B **acima** do produto |
| o teto de ARQUIVO | `tetoDoImport(102400)` = **104 858 437 B**; o multipart custa 186 B fixos (`MULTIPART_IMPORT`) |
| a contra-prova | 104 858 437 B ACEITO (16 s), 104 858 438 B RECUSADO, no mesmo CG3Z |

⚠ **A recusa não chega como 413.** No `Import` (multipart) o ICM **fecha a conexão no meio do
envio** — `UND_ERR_SOCKET`/`ECONNRESET`; o `413` limpo só apareceu com corpo `x-www-form-urlencoded`.
O `updown` estoura nos dois casos e cita o teto; o que **não** dá é decidir pelo código HTTP.

**Subir não fatia** (ao contrário de descer): 64 MB subiram num `Import` só, `sha256` idêntico, a
~6,5 MB/s. Arquivo maior que o teto não tem via por aqui — teria que ser partido pela aplicação, e
a CG3Z não tem "anexar ao fim".

### O `FileOpenDialog` — escolher o arquivo em vez de digitar

F4 no campo de origem (`acionar(s, alvo, { evento: 'FieldHelpPress' })` → `vkey/4`) traz
`ITSDocMethod:'FileOpenDialog'` com `Title`, `Filter`, `DefFile`, `DefPath` e `MultiSelection`.
Respondê-lo **preenche o campo da dynpro** — medido. E, ao contrário do `FileSaveDialog`, ele manda
os parâmetros no **corpo** (`FileEncoding=…&count=1&FileName0=…`), com a URL terminada em `?`. As duas
formas convivem no mesmo módulo do renderer; não se deduz uma da outra.

### Os desvios da CG3Z que não são ITSDoc

Dynpro comum — se respondem pelo SID do botão, não por tecla:

| quando | janela | como sair |
|---|---|---|
| ao abrir a transação (nota SAP 1949906) | `SAPMSSY0120` em `wnd[1]` | `wnd[1]/tbar[0]/btn[0]` |
| destino fora do diretório lógico (`EHS_FTAPPL_2` = `/usr/sap/trans/`) | `SAPMSDYP10` em `wnd[2]` | não há saída — corrija o destino |
| o arquivo de destino já existe | `SAPLSPO1300` em `wnd[2]` | `btnSPOP-OPTION1` (Sim) / `OPTION2` (Não) |

## O ITSDoc que NÃO é arquivo — o servidor mandando o "frontend" listar, apagar e executar (item 113)

Medido no s4h 758/250 em 06/09/2026 na **TEST_FRONT_SERVICES** — a transação PADRÃO da SAP que
exercita os frontend services, achada pelo índice de uso do próprio sistema — e num report Z mínimo
rodado por SA38 (`work/POC_webgui_itsdoc/medicoes/item113-nao-arquivo.md`).

**A superfície existe e é grande.** No where-used do sistema (`WBCROSSGT`, cruzado com `D010INC` e
`TSTC`), os métodos da `CL_GUI_FRONTEND_SERVICES` têm **10 736 usos** em 9 978 programas, dos quais
**3 367 têm transação**. Não é um canto exótico: `EXECUTE` tem 439 usos (MB80, KEHA, KSEUD, SCIF_URL…),
`FILE_DELETE` 167, `DIRECTORY_LIST_FILES` 148 (CV01N/CV02N/CV03N, MU01, J1BECD, EDOC_*), e as FMs
clássicas ainda somam `WS_EXECUTE` 91 e `WS_QUERY` 380.

### O despacho, e o que a lib responde

| verbo (`ITSDocMethod`, ou `Method` sob `GuiSapInfo`) | o POST que a lib faz | por quê |
|---|---|---|
| `GetTempPath` | `gettemppath?RetGetTempPath=Z%3A%5Ctemp` | o temp é CONSTANTE no renderer (`updown_temp_path` = `/temp`) |
| `DirectoryListFiles` | `directorylistfiles?` + `count=…&filename<n>=…` no CORPO | a lista que o chamador der; sem lista, `count=0` |
| `Directory`, `FileBrowser` | `cancel` | são DIÁLOGOS — sem usuário, "cancelei" é verdade |
| `Delete` | `delete?RetDelete=2` | 2 = não existe |
| `DirectoryRemove` | `directoryremove?RetDirectoryRemove=2` | 2 = não existe |
| `DirectoryCreate` | `directorycreate?RetDirectoryCreate=5` | 5 = não consegui criar |
| `FileCopy` | `filecopy?RetFileCopy=5` | 5 = a cópia falhou |
| `DpUrlCopy` | `dpurlcopy?RetDpUrlCopy=-1` | −1 = erro |
| `ShowDocument` | `showdocument?RetString=3;` | 3 = não exibi |
| `ClipboardImport` | `clipboardimport?` + `ImpClpbrdLength=-1&count=0` | clipboard vazio (com `texto`, vai linha a linha) |
| `Execute` | **nada** — só o `OK_ITSDOC` | o renderer também não POSTa |
| `DpGetStreamFromUrl`, e o desconhecido | `exception` | é o `T ? g(T,K) : updown_sendexception(K)` do renderer |

Os códigos (`0`/`2`/`3`/`5`/`32`/`183`/`−1`) são os do próprio `webgui_min.js` — não foram
inventados: `Delete` 0 removido · 2 não existe · 5 é diretório · 32 falhou; `DirectoryRemove` 0 · 1
erro · 2 não existe · 5 falhou; `DirectoryCreate` 0 criado · 3 caminho não encontrado · 5 erro · 183
já existe.

⚠ **`cancel` NÃO é a resposta neutra — é uma mentira, e a dynpro segue por ela.** O renderer manda
`cancel` só quando um DIÁLOGO é fechado; para verbo sem handler ele manda `exception`. A mesma
TEST_FRONT_SERVICES, com `cancel` às cegas × com a tabela acima:

| método | com `cancel` (o que a lib fazia) | com a resposta certa |
|---|---|---|
| `GET_TEMP_DIRECTORY` | *(vazio)* | `Z:\temp` |
| `DIRECTORY_GET_CURRENT` | *(vazio)* | `Z:\` |
| `FILE_DELETE` | `deleted, RC=0` ← **diz que apagou** | `deleted, RC=2` |
| `DIRECTORY_DELETE` | `deleted, RC=6357109` ← lixo de memória | `deleted, RC=2` |
| pedidos no laço | 12 | **16** — o `cancel` fez o ABAP PULAR o `Query(FE/FL)` e o `Delete` |

Ou seja: cancelar às cegas não é "não fazer nada". Faz o programa **pular ramos** e **ler variável
não atribuída** — e, no pior caso medido, concluir que apagou um arquivo que ninguém apagou.

### O DirectoryListFiles, ponta a ponta

```js
const r = await atenderItsdoc(s, resposta, { arquivos: [{ nome: 'nota.xml', tamanho: 57 }, { nome: 'sub', dir: true }] });
```

O ABAP do outro lado recebeu, medido: `subrc=0`, `count=3`, e cada linha com `filename` (o `+` do
form-urlencode volta como espaço), `filelength` e `isdir`. O `filter` do pedido é aplicado **no
cliente** (`filtroDoItsdoc`), e `RetLong` falso corta o tamanho em 2³¹−1 — os dois como no renderer.
Os outros doze atributos por arquivo (`ishidden`, `createdate`, `writetime`…) o renderer TAMBÉM manda
zerados: o FS virtual dele não os tem.

### O ITSDoc como superfície de ataque — o que um servidor SAP pode pedir ao cliente

Vale ler antes de rodar a lib num sistema de cliente.

- **No browser, o "filesystem do frontend" é um FS emulado sobre IndexedDB da própria origem**
  (lido no `webgui_min.js`: `getDirectory`/`getFile`/`filewrite` sobre `indexedDB.open`), e
  `nfstosfs` reescreve QUALQUER letra de unidade para a mesma raiz `Z:\`. `Delete`, `FileCopy` e
  `DirectoryRemove` do WebGUI não alcançam o disco do usuário — alcançam essa caixa de areia.
- **`Execute` não executa binário**: o renderer abre uma janela quando a `CommandLine` é
  `http(s)://`/`mailto:`, e no resto faz *download/exibição* do Blob que está no FS virtual. O que
  existe de verdade é o servidor **escolher a URL que o browser vai abrir**.
- **Do lado do agente, o risco não é o que a lib faz; é o que alguém a faria fazer.** Uma
  implementação "natural" — mapear `Z:\` para uma pasta real e atender `Delete`/`FileCopy`/`Execute`
  com `fs`/`child_process` — entrega ao SERVIDOR o poder de apagar, copiar e executar no host do
  agente, com o gesto disfarçado de "abrir uma transação". Um sistema comprometido (ou um programa Z
  qualquer, já que qualquer ABAP pode chamar `cl_gui_frontend_services=>execute`) tem esse canal
  aberto para todo cliente que se apresente como WebGUI.
- **A decisão desta lib, e o invariante a manter:** o `pedidoDoItsdoc` não tem filesystem e não vai
  ter. Ele responde papel — o código de falha de cada verbo — e o único dado que oferece é o que o
  chamador lhe entregou explicitamente (`arquivos`, `dado`, `texto`). `Execute` nunca vira processo;
  `Delete` nunca vira `unlink`. Quem precisar de um frontend com disco, que o construa FORA da lib e
  saiba o que está ligando.
