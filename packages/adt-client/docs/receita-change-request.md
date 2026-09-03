# Receita — anatomia de objeto pela change request

**Medido em 2026-08-29, S4H rel. 758, mandante 250.** Somente leitura: nenhum objeto foi criado,
alterado ou apagado. Cobaias: a TR `S4HK912769` (tarefa `S4HK912770`) que o item 10 da fila deixou
no sistema, a TR liberada `S4HK911417` (classes ABAP) e a TR de customizing `S4HK910129`
(tarefa `S4HK910130`).

Uma change request é o **inventário formal do que mudou**. Para objeto com coleção ADT própria ela
é redundante — a coleção descreve melhor. Para tipo **sem** coleção (BRF+, Adobe Forms, e todo o
customizing) ela é a única descrição que o SAP publica: `PGMID/OBJECT/OBJ_NAME` por objeto e, para
o que transporta **por chave**, a chave concatenada da linha.

Superfície na lib: [`cts.mjs`](../cts.mjs) — leitura: `lerRequest`, `listarRequests`,
`lerRequestPorTabelas`, `anatomia`, `diff` (TR × sistema, abaixo); ciclo de vida da TR modificável
(item 24, abaixo): `criarRequest`, `deletarRequest`, `destravarRequest`, `desmancharRequest`;
gestão da TR (item 76, abaixo): `criarTarefa`, `moverObjetos`, `reatribuirTarefa`,
`trocarDonoRequest`, `fundirRequests`, `compactarRequest`, `verificarConsistencia`.

---

## As duas vias não veem a mesma coisa

| | via ADT (`cts/transportrequests`) | via tabelas (`E070/E07T/E071/E071K`) |
|---|---|---|
| canal | ADT REST, sessão normal | SOAP RFC (`RFC_READ_TABLE`) |
| objetos | sim, **consolidados** (ordem + tarefas) | sim, **literais** — mostra em quem a entrada mora |
| entradas de **chave** (`TABKEY`) | **não** | **sim — só aqui** |
| tipo do objeto | `wbtype` (`CLAS/OM`, `DEVC/K`) + texto no idioma de logon | só `PGMID`/`OBJECT` |
| requer | nada além do ADT | nó `/sap/bc/soap/rfc` aberto |

Nenhuma dispensa a outra. `anatomia()` roda as duas e cruza.

## O cabeçalho: E070

```
TRKORR      S4HK912769        o número
TRFUNCTION  K                 K = ordem de workbench · W = customizing · S/Q = TAREFA
TRSTATUS    D                 D = modificável · R = liberada
TARSYSTEM   VSS               sistema de destino (vazio na tarefa)
STRKORR     ''                VAZIO na ordem; na TAREFA é o número da ordem PAI
AS4USER/AS4DATE/AS4TIME       quem criou e quando
```

`TRFUNCTION` **e** `STRKORR` juntos dizem o que a linha é: ordem tem `STRKORR` vazio, tarefa aponta
a mãe. A descrição não está aqui — está na `E07T` (`TRKORR`, `LANGU`, `AS4TEXT`), uma linha por
idioma.

## O gotcha central: antes da liberação, as entradas moram na TAREFA

Medido na cobaia do item 10:

```
E071 de S4HK912769 (a ORDEM)   →  0 linhas
E071 de S4HK912770 (a TAREFA)  →  R3TR DEVC YJBV_POC_PKGT   LOCKFLAG='X'
```

A ordem está vazia e **não** significa "ordem vazia". A liberação é que consolida as entradas na
ordem — e acrescenta, por tarefa liberada, uma entrada de marca:

```
CORR RELE  "S4HK911418 20260619 001703 MVACOELHOMED"   ← número, data, hora e usuário da liberação
```

Depois de liberada, todas as entradas ficam com `LOCKFLAG='3'` (antes, `'X'` = objeto travado
naquela TR).

Quem lê só a `E071` da ordem e conclui "não tem nada" erra a leitura de toda TR modificável — que
é justamente a que se quer inspecionar. `lerRequestPorTabelas` traz as tarefas junto por isso, e
devolve `consolidado` com a união.

## A decomposição do objeto: R3TR × LIMU

`PGMID` diz o **grão** da entrada:

| PGMID | o que é | exemplo medido |
|---|---|---|
| `R3TR` | o objeto inteiro | `R3TR CLAS ZCL_ALV_REPORTER`, `R3TR DEVC YJBV_POC_PKGT` |
| `LIMU` | **uma parte** do objeto | `LIMU METH`, `LIMU CPUB`, `LIMU CPRI`, `LIMU CLSD`, `LIMU CPRO` |
| `CORR` | marca de administração | `CORR RELE` (liberação) |

Uma classe criada nova entra como `R3TR CLAS`; uma classe **alterada** entra decomposta em `LIMU` —
uma entrada por método tocado, mais as seções (definição, cabeçalho público, cabeçalho privado).
É a anatomia do tipo escrita pelo próprio SAP.

O nome do `LIMU METH` é **posicional**: classe em 30 posições fixas, depois o método.

```
'ZCL_ALV_REPORTER              PREPARE_ALV_DATA'
 └── nome.slice(0,30).trimEnd() ─┘└── nome.slice(30) ──┘
```

O mesmo vale para outros compostos vistos na `E071` do sistema: `R3TR IWMO
"ZGW_EWM_VARIANT_SRV_MDL         0001"` (nome + versão em colunas).

## As entradas de chave: E071K — o que o ADT não conta

Para conteúdo de tabela e customizing, a `E071` diz só *qual tabela/visão*; **qual linha** está na
`E071K`:

| campo | o que é | medido |
|---|---|---|
| `OBJNAME` | a tabela cuja linha viaja | `T460T` |
| `MASTERTYPE`/`MASTERNAME` | de quem a entrada depende | `VDAT V460A` (visão de manutenção) ou `TABU <a própria tabela>` |
| `VIEWNAME` | a visão, quando o master é `VDAT` | `V460A` |
| `TABKEY` | **a chave concatenada da linha** | `300D1411Z0` |

`TABKEY` é posicional, sem separador, e começa pelo **mandante** quando a tabela depende dele.
Amostras reais:

```
250FSSA                                 mandante 250 + chave 'FSSA'
300D1411Z0                              mandante 300 + idioma 'D' + chave '1411Z0'  (tabela de texto)
CFDF      ZZ1_DELIVERY                  chave em duas colunas de largura fixa
0000AAAB040000FFFFFFFFFFFFFFFFFF*       '*' = curinga: a partir daqui, tudo
```

O par tabela + `TABKEY` **é** a receita do objeto para tipos que transportam por chave. O corte pelo
layout da tabela está medido e na lib — ver **"TABKEY fatiado"** abaixo.

Contrapartida medida: para a mesma TR, a via ADT mostra `R3TR VDAT V460A · "Atualização de visão:
dados"` e **nada mais**. Nenhuma tag do `transportorganizer` carrega chave.

## TABKEY fatiado (item 21 da fila — medido 2026-08-30, S4H 758)

`lerRequestPorTabelas(cfg, tr, { fatiar: true })` (e `anatomia(conexao, tr, { fatiar: true })`) devolve
cada entrada de chave com `tabela`, `layout`, `campos`, `curinga`, `completo`:

```
TABKEY "000E000310"  ·  T460T = MANDT(3) SPRAS(1) WERKS(4) SOBSL(2)
   → campos { MANDT: '000', SPRAS: 'E', WERKS: '0003', SOBSL: '10' }   completo: true
```

**Como se corta (medido em 17 + 5 amostras):**

- O layout vem de **`DDIF_FIELDINFO_GET`** (RFC-enabled, `layoutChave`): campos com `KEYFLAG = 'X'`,
  ordenados por `POSITION`, includes já expandidos. A `DD03L` crua vem fora de ordem e obriga a resolver
  includes à mão — não vale a pena.
- A largura de cada campo no `TABKEY` é **`LENG` em caracteres** — não `OFFSET`/`INTLEN`, que são bytes
  Unicode (2 por caractere). A soma dos `LENG` dos campos-chave bateu com o comprimento do `TABKEY` em
  todas as amostras (T460T 10, /ACCGO/T_ORDTYP 18, /AIF/ICD_DATASET 48…). `LANG` ocupa 1 (`E`), `NUMC` e
  `CHAR` a largura toda, com o padding à direita dentro do valor (`APPROVE   `).
- **Curinga `*`**: `250ZFPVCDS_RPRT_BASE_CONH_CDS_0001         *` = MANDT + SERVICE_ID, o resto livre
  (`null`); `000*` numa VDAT = todas as linhas do mandante 000; `*` sozinho = a tabela inteira; `*` no meio
  de um campo = prefixo daquele campo. `TABKEY` é CHAR 120: chave com 120 ou mais caracteres vem com `*`
  na posição 120 (TABDIRDEVC, soma dos LENG = 120 → `KEYRANGE2` parcial + curinga) — `fatiarTabkey` marca
  `curinga`, e `truncado` quando a soma passa de 120 sem `*`.
- O `RFC_READ_TABLE` devolve o `TABKEY` **sem os espaços finais**; o último campo chega curto e continua
  `completo`.
- O mandante do `TABKEY` é o de **origem** (000 nas entregas SAP, 250 no que a moovi criou). A releitura
  (`lerLinhaDaChave`) roda no mandante do logon e por isso **não** leva o CLNT no WHERE por default
  (`{ mandante: true }` para forçar — com 000 no s4h:250 não acha nada, medido). `whereDaChave` faz o
  trim dos valores e respeita os 72 caracteres por linha do FM.
- **Prova do corte**: reler a tabela com o WHERE dos campos cortados. 12 de 17 amostras SAP acharam a
  linha no 250 (as 5 restantes são linhas do 000 que não existem no 250 — é o diff do item 22, não erro
  de corte); a chave com curinga da `/IWFND/C_MGDEAM` achou a linha pelo prefixo.
- **Sem amostra**: no s4h não existe entrada de chave sobre tabela com campo-chave `RAW`/`DATS`/`INT4`/`DEC`/
  `TIMS` (todas as chaves transportadas são CHAR/NUMC/LANG/CLNT; o "GUID" das `FDT_*` é CHAR 32). Como o
  `TABKEY` representa esses tipos **não foi medido**.

```js
import { lerRequestPorTabelas, fatiarChaves, lerLinhaDaChave, layoutChave, fatiarTabkey, whereDaChave } from 'adt-client/cts';

const t = await lerRequestPorTabelas(cfg, 'S4HK912728', { fatiar: true });
t.consolidado.chaves[0];        // { OBJNAME, TABKEY, …, tabela, layout, campos, curinga, completo }
await lerLinhaDaChave(cfg, t.consolidado.chaves[0]);   // { existe, linhas, where } — no mandante do logon

// puro, sem SAP: layout medido + TABKEY → campos
fatiarTabkey(await layoutChave(cfg, 'T460T'), '000E000310').campos;
```

## O XML do ADT tem TRÊS lugares com entrada de objeto

Medido na `S4HK911417`: 34 `<tm:abap_object>` no mesmo documento, em três posições que **não** têm
o mesmo conteúdo.

```
<tm:request>
  <tm:attributes …/>                    ← atributos da TR (E070A), não são objetos
  <tm:abap_object …/>  ×12              ← entradas PRÓPRIAS da ordem (a E071 dela, com CORR RELE)
  <tm:all_objects>
    <tm:abap_object …/>  ×11            ← o CONSOLIDADO (ordem + tarefas), sem a marca CORR RELE
  </tm:all_objects>
  <tm:task …>
    <tm:abap_object …/>  ×11            ← as entradas daquela tarefa
  </tm:task>
</tm:request>
```

`parseRequest` devolve os três separados: `objetos` (o consolidado — a resposta a "o que esta TR
carrega"), `proprios` e `tarefas[].objetos`. Contar `<tm:abap_object>` no documento inteiro conta
o mesmo objeto até três vezes.

## Gotchas de chamada

**A árvore falha em silêncio sem `requestStatus`.** `GET cts/transportrequests?user=X` devolve
**HTTP 200** com um `<tm:root/>` vazio (300 bytes) — não é erro, é lista vazia. Com
`&requestStatus=D`, as 8 requests aparecem. Medido também: `requestStatus=R` devolve vazio neste
release (a árvore serve as modificáveis); para as liberadas, ir pela `E070`. O `user` filtra de
verdade (usuários diferentes → conjuntos diferentes).

**Accept diferente por recurso.** Uma TR: `application/vnd.sap.adt.transportorganizer.v1+xml`. A
árvore: `application/vnd.sap.adt.transportorganizertree.v1+xml`. Trocar um pelo outro dá 406 — e o
corpo do 406 informa o media type certo.

**`RFC_READ_TABLE` levanta `TABLE_WITHOUT_DATA` quando um CAMPO não existe.** Não tem nada a ver com
a tabela estar vazia, e manda procurar no lugar errado. Medido: `E071` com `GENFLAG` (o nome certo
é `GENNUM`) e com um campo inventado levantam a mesma exceção; com `GENNUM`, lê. A lib anexa a dica
ao erro (`dicaDeLeitura`), e `cts.mjs` lê as tabelas do CTS **sem** `campos` de propósito — os nomes
vêm na própria resposta.

## Como usar

```js
import { criarConexao } from 'adt-client';
import { lerRequest, listarRequests, lerRequestPorTabelas, anatomia } from 'adt-client/cts';

const conexao = criarConexao(cfg);

// as minhas ordens modificáveis
const minhas = await listarRequests(conexao);                 // status 'D' por default

// o que uma TR carrega, do jeito do Transport Organizer
const tr = await lerRequest(conexao, 'S4HK912769');
tr.objetos;        // consolidado: [{ pgmid, tipo, nome, wbtype, descricaoTipo, posicao, lock }]
tr.proprios;       // as entradas da própria ordem
tr.tarefas;        // [{ numero, dono, status, objetos: [...] }]

// a mesma TR pelas tabelas — com as entradas de chave
const t = await lerRequestPorTabelas(cfg, 'S4HK910129');      // cfg, não conexao: é SOAP RFC
t.consolidado.chaves;  // [{ OBJNAME, MASTERTYPE, MASTERNAME, VIEWNAME, TABKEY }]

// as duas, cruzadas
const a = await anatomia(conexao, 'S4HK910129');
a.chaves;          // o que só as tabelas enxergam
a.soNasTabelas;    // vazio quando as vias concordam nos objetos (medido: vazio)
```

## Diff "TR × sistema" (item 22 da fila — medido 2026-08-30, S4H 758)

`diff(conexao, tr)` responde **"o que esta TR diz que carrega ainda corresponde ao que está no sistema?"**
— por entrada, com um veredito. Somente leitura; a leitura do ADT é **stateless** (ver gotcha abaixo).

```js
import { diff } from 'adt-client/cts';
const d = await diff(conexao, 'S4HK911417');            // { numero, status, liberada, referencia, fuso, entradas, chaves, resumo }
d.resumo;        // { objetos: { 'alterado-depois': 8, 'em-edicao': 3, 'sem-medida': 1 }, chaves: { existe: 14, 'outro-mandante': 40 } }
d.entradas[1];   // { pgmid, object, nome, familia, existe, tadir, versoes, outrasTrs, depois, abertas, adt, veredito }
d.chaves[0];     // { tabela, tabkey, campos, existe, mandante, mandanteDiferente, outrasTrs, veredito }
```

**Cobaias medidas:** `S4HK911417` (liberada, 11 partes `LIMU` de duas classes), `S4HK911370` (liberada, 7 objetos
inteiros `R3TR`), `S4HK912769` (modificável, pacote do item 10) e `S4HK910129` (customizing, 18 visões, 55 chaves).

### As três fontes, e o que cada uma prova

| fonte | grão | prova | não prova |
|---|---|---|---|
| **`VRSD`** (base de versões, SOAP RFC) | a PARTE (`METH`, `CLSD`, `CPUB`, `CINC`, `REPS`…) | versão **numerada** com `KORRNUM` de outra TR e carimbo posterior = o conteúdo **mudou** depois desta TR | o `VERSNO 00000` (versão ativa) re-carimbado por outra TR — é só "saiu noutra TR" |
| **`E071` da família** | objeto inteiro + partes | `LOCKFLAG = 'X'` numa ordem `D` = **em edição agora**; ordem `R` posterior = transportado de novo | mudança de conteúdo (uma liberação sem mudança também aparece) |
| **`adtcore:changedAt`** (ADT, tipos que a lib conhece) | objeto inteiro | última ativação **depois** da referência = mudou | qual parte; e precisa do fuso |
| **`TADIR`** | objeto inteiro | existe · `DELFLAG` (marcado para apagar) · pacote/autor/origem | data de alteração (`CHECK_DATE` é do ATC); `SEOCLASSDF-CHANGEDON` vem zerado |

O que a medição ensinou:

- **A versão da TR nasce na liberação da ORDEM** (tarefa liberada 00:17:03 → versão 00:17:09 → ordem liberada
  00:17:14). TR modificável não tem versão própria; a referência dela é o `AS4DATE/AS4TIME` da E070.
- **Versão numerada só nasce se o conteúdo difere da última.** O transporte de cópias `S4HK911429` (`TRFUNCTION T`)
  levou `ZCL_TRANSPORT_READER` inteira e só re-carimbou o `00000`; `ZCL_ALV_REPORTER` ganhou `00004` porque tinha
  mudado — e o `changedAt` do ADT confirma os dois (`false` / `true`). Daí a separação `alterado-depois` ×
  `noutra-tr-depois`.
- **Cruzar só pela entrada exata perde.** Esta TR levou `LIMU METH`; a seguinte levou `R3TR CLAS` inteira. O diff
  cruza pela **família** (`familiaDe`: parte → objeto inteiro; nome de classe nas 30 primeiras colunas, ou até o `=`
  das includes `ZCL_X==============CCAU`), com `OBJ_NAME LIKE 'base%'` no servidor e filtro exato no cliente.
- **`LOCKFLAG X` não mexe no `00000`.** `S4HK911451` (modificável) tem `DISPLAY_REPORT` travado e a versão ativa
  continua apontando para `S4HK911446` — "em edição" só se enxerga pela E071.
- **O CTS carimba em hora LOCAL; o ADT, em UTC.** `TTZCU-TZONESYS` = `CET` no s4h; `REPOSRC` `20260629 183230` ↔
  `changedAt 2026-06-29T16:32:30Z`. `fusoDoSistema` lê a TTZCU e `paraHoraLocal` converte (mapa SAP → IANA para os
  fusos comuns; fuso desconhecido = sem comparação, não palpite). Pacote (`DEVC`) tem `changedAt` só com data.
- **Parte (`LIMU`) não tem existência própria** — a existência é a do pai (TADIR do `R3TR`). `LIMU FUNC` não revela
  o grupo de funções no nome: fica `sem-medida`.
- **Conteúdo (`TABU`/`VDAT`/`CDAT`) não está na TADIR** — o que existe é `TABL`/`VIEW`/`VCLS`, e a LINHA é
  assunto da E071K: veredito `por-chave`. Outra ordem de customizing aberta com a mesma visão **não** é "edição"
  desta entrada (16 das 18 visões da `S4HK910129` estão em ordens abertas — customizing é assim).
- **Chave de outro mandante não é verificável daqui.** O `RFC_READ_TABLE` lê o mandante do logon; chave `300…`
  com logon 250 e linha ausente sai como `outro-mandante`, não `inexistente`. `outrasTrs` da chave vem da E071K
  (`T161 300FNB` também na `S4HK909178`).
- **`E071/E071K` de outras TRs também são a resposta para "esta linha já foi transportada por outra ordem?"** —
  é o `outrasTrs` de cada chave.

### Vereditos

| objeto | quando |
|---|---|
| `inexistente` | não está na TADIR, ou `DELFLAG X` (`YJBV_POC_PKGT`: pacote apagado com a TR ainda aberta) |
| `em-edicao` | travado (`LOCKFLAG X`) por outra ordem modificável agora |
| `alterado-depois` | versão numerada posterior à desta TR, ou `changedAt` depois da referência |
| `noutra-tr-depois` | família noutra TR liberada depois, ou só o `00000` re-carimbado — sem prova de mudança |
| `por-chave` | conteúdo de tabela/visão: a tabela existe; ver `chaves` |
| `igual` | existe e nenhum sinal |
| `sem-medida` | `CORR RELE`, parte sem pai conhecido |

| chave | quando |
|---|---|
| `existe` | a linha está no mandante do logon |
| `outro-mandante` | a chave é de outro mandante e a linha não está neste |
| `inexistente` | mesmo mandante, linha ausente |
| `sem-medida` | sem layout (tabela inexistente) |

### O que ficou fora

- **Comparar o CONTEÚDO** da versão da TR com o ativo (o `diff` de texto): a `VRSD` diz que mudou, não o quê.
  `SVRS_GET_VERSION_*` / `SVRS_COMPARE` são o caminho (não medido).
- **`LIMU FUNC`** → grupo de funções (`TFDIR-PNAME`), e outras partes fora do mapa `PARTES` (`familiaDe`).
- **Sistema-alvo de verdade**: o diff olha o sistema do logon. "TR × QAS" é rodar contra o QAS — mesma lib, outro `cfg`.
- **Fusos fora do mapa** `FUSOS`: a comparação com o ADT fica desligada (`changedAtLocal: null`), sem palpite.

### Gotcha: leitura do CTS é stateless

Com o ADT stateful do s4h no estado "Session not found" (órfãs acumuladas), a leitura **stateful** da TR volta
**200 sem `<tm:request>`**, o logoff dá 400 e cada tentativa deixa mais uma órfã (medido: 1 → 3 em três
rodadas). A leitura **stateless** responde 200. Por isso `lerRequest`, `listarRequests`, `anatomia` e `diff`
abrem sessão **stateless** quando têm senha (`sessaoDeLeitura`), e uma sessão aberta stateless **fica**
stateless (`session.stateless`, em `sap-connection.mjs`) — um `getObject(s)` qualquer não a converte em contexto
no servidor. **Nunca** `fetch` cru com o cookie de uma sessão stateful: foi o que a derrubou.

## Ciclo de vida da TR modificável (item 24 da fila — medido 2026-08-31, S4H 758)

A pergunta do item: dá para entregar fora do `$TMP` sem abrir a SE09? Dá — o ciclo inteiro fechou
pela lib, **13/13 PASS**, incluindo o desfazer completo (zero restos em E070/E071/TADIR/TDEVC).

### Criar: POST `tm:root useraction="newrequest"`

```js
import { criarRequest } from 'adt-client/cts';
const tr = await criarRequest(conexao, { descricao: 'Sprint 12 — relatórios ZFI' });
tr.numero;    // 'S4HK912780' — pronto para ser o corrNr de qualquer deploy*
```

- POST na própria coleção `cts/transportrequests`, Content-Type `text/plain`, body `tm:root
  tm:useraction="newrequest"` com um `tm:request tm:desc tm:type="K" tm:target="" tm:cts_project=""`.
  Resposta **201** com o `tm:request` completo (o `parseRequest` lê). Body vazio → 400
  "Elem.'{…tm}root' esperado" e **nada criado** (E070 conferida antes/depois).
- **Nasce só a ORDEM, sem tarefa** — e não precisa criar tarefa: **o primeiro deploy com `corrNr` =
  o número cria a tarefa do usuário na ordem sozinho** (medido: pacote transportável com corrNr →
  tarefa nova na MINHA ordem, entrada `R3TR DEVC` nela, **nenhuma TR paralela gerada**). O
  auto-gerar TR do create de pacote (item 10) só acontece quando o corrNr NÃO é informado.
- `tm:target` vazio ganha o default do sistema (TARSYSTEM `VSS` no s4h). Só tipo `K` medido —
  customizing (`W`) é POC futura.
- A gramática do recurso: o segmento depois do número é uma **Benutzeraktion** (`POST …/<nr>/xxx` →
  SCTS_ADT_MSG 005 "Benutzeraktion xxx não suportada"). ~~Não existe ação de remover entrada no
  758~~ — **desmentido no item 78**: existe, no OUTRO handler (PUT no próprio recurso,
  `tm:useraction="removeobject"` no corpo) — ver **§ O editor de TR** adiante.
  `POST …/<nr>` sem ação e sem corpo devolve **200 no-op** (E070/E071 idênticas — não confundir com
  "fez algo").

### Apagar: DELETE só remove TR vazia; com entradas, é driver

- `deletarRequest(conexao, numero, { confirm: true })` — DELETE na coleção. **TR modificável e
  VAZIA: 200, a linha some da E070** (medido, ordem e tarefa). Com entradas travadas: 400
  SCTS_ADT_MSG 009 "contém objetos bloqueados" — o mesmo que o item 10 mediu na TR do pacote.
- `destravarRequest(conexao, numero, { confirm: true })` — driver classrun com **`TRINT_UNLOCK_COMM`
  por tarefa** (o "desbloquear objetos" da SE03): solta os locks das entradas **mantendo a TR**.
- `desmancharRequest(conexao, numero, { confirm: true })` — driver com unlock + **`TR_DELETE_COMM`
  `WI_DIALOG=' '`** (o delete da SE09): apaga ordem + tarefas + entradas (subrc 0, msg SD 832;
  E070/E071 ausentes depois). Guard-rails antes da rede: forma de TRKORR (o número entra em literal
  ABAP), TR existe, é ordem (não tarefa), modificável e **minha** (`E070-AS4USER`).

### O desfazer completo de um ciclo transportável — a ordem importa

O delete de objeto transportável **não remove a linha da TADIR: marca `DELFLAG='X'`** (a exclusão
fica pendente de transporte; TRDIR/conteúdo somem de verdade). E é essa linha marcada que faz o
delete do pacote responder PAK 051 "ainda contém objetos". A linha só sai por
`TR_TADIR_INTERFACE wi_delete_tadir_entry` (`removerTadirOrfa`, enho.mjs) — e esse FM **falha
(subrc 1) enquanto a entrada estiver travada na TR**; depois do unlock, subrc 0 (medido nas duas
pontas). A sequência que fecha limpa:

```js
await deleteObject(conexao, { type: 'prog', name: P, corrNr: tr, confirm: true });  // TADIR fica X
await destravarRequest(conexao, tr, { confirm: true });                             // solta os locks
await removerTadirOrfa(conexao, { object: 'PROG', objName: P });                    // agora sai (subrc 0)
await deleteObject(conexao, { type: 'package', name: PKG, corrNr: tr, confirm: true });
await desmancharRequest(conexao, tr, { confirm: true });                            // TR + tarefas + entradas
await removerTadirOrfa(conexao, { object: 'DEVC', objName: PKG });                  // a marca do pacote
```

Re-remover uma TADIR já ausente devolve subrc 1 com msg `TR 245` — é "não existe", não erro novo.

### O que segue fora

- ~~LIBERAR~~ — desde o item 74 (2026-09-02) existe `liberarRequest`, via ADT (`newreleasejobs`).
  Ver **§ Liberar TR pelo ADT** adiante. O `TRINT_RELEASE_REQUEST_RFC` (FMODE='R', achado do item
  39) segue não medido — a via ADT bastou.

## Paridade com a SE09 no create (item 39 da fila — medido 2026-09-01, S4H 758, mandante 250)

A pergunta do item era "o que a SE09 faz no create que a via ADT não faz". A engenharia reversa
respondeu que **a SE09 não faz nada** — ela só tem a tela:

```
SE09/SE10/SE01 → RDDM0001 → CL_CTS_REQUEST → TRINT_POPUP_TO_CREATE_REQUEST (SAPLSCTSREQ)
                                             └─ CALL SCREEN 200; colhe tipo, texto, usuários,
                                                pacote, camada, alvo, projeto — e devolve.
quem cria, sempre:  TR_INSERT_REQUEST_WITH_TASKS (SAPLSTR8)
                    └─ TRINT_INSERT_NEW_COMM  (a ordem, e cada tarefa)
```

E o mesmo FM é o que a **API REST do CTS** chama: `CL_CTS_REST_API_IMPL~create_request` passa
`it_users`, `it_attributes`, `iv_target` e `iv_with_badi_check` (lido no fonte). A diferença entre
as portas **não está no motor, está no que cada uma preenche** — a via ADT do item 24 manda só
descrição/tipo/alvo/projeto, e é por isso que a TR nasce sem tarefa.

### Três portas para a mesma TR

| porta | função da lib | custo | o que dá | E07T-LANGU |
|---|---|---|---|---|
| ADT | `criarRequest` | sessão ADT | ordem, alvo, projeto — e **tarefa por usuário** (fila 72: `usuarios` vira `<tm:task tm:owner>`) | idioma de **logon** (P) |
| RFC | `criarRequestPorRfc` | **SOAP puro** — sem sessão, sem driver | ordem, alvo, 1 atributo | **EN** (o canal SOAP não manda idioma) |
| FM | `criarRequestComTarefas` | driver classrun **só quando precisa** (fila 72: sem atributo/simulação/dono alheio ele roteia pela porta ADT) | **tudo**: tarefa por usuário, dono, N atributos, alvo, simulação | idioma de logon (P) |

`TR_EXT_CREATE_REQUEST` é `FMODE='R'` (o carimbo do item 38 já dizia) e é um wrapper fino sobre o
mesmo FM — só que **sem `it_users`**. `TR_INSERT_REQUEST_WITH_TASKS` não é RFC, daí o driver.
As três produzem E070/E070C idênticas; só o idioma do texto muda.

```js
import { criarRequestComTarefas, criarRequestPorRfc, apagarRequestPorRfc } from 'adt-client/cts';

// a via completa da SE09, sem GUI
const tr = await criarRequestComTarefas(conexao, {
  descricao: 'Sprint 12 — relatórios ZFI',
  usuarios: ['MVJVELOSO', 'MVJNETO'],                       // uma tarefa por usuário
  atributos: [{ atributo: 'SAPNOTE', valor: '0002345678' }],
});
tr.numero;    // 'S4HK912796'
tr.tarefas;   // [{ numero:'S4HK912797', tipo:'X', usuario:'MVJNETO' }, …]

// dry-run do próprio FM: devolve subrc 0, número VAZIO, e não grava nada
await criarRequestComTarefas(conexao, { descricao: 'x', usuarios: ['X'], simular: true });
```

### O que custou uma rodada cada

- **O tipo da TAREFA sai do tipo da ORDEM**, não da lista de usuários — o FM sobrescreve o `type`
  do `scts_user`: ordem `K` → tarefa `X`; ordem `W` → tarefa `Q`.
- **Usuário inexistente derruba a criação DEPOIS de a ordem estar gravada, e o `ROLLBACK WORK` do
  FM não a desfaz.** Medido: `it_users = ('YJBVFAKE39')` → subrc 1, `TR 809`, `es_request_header`
  vazio — e a ordem `S4HK912800` ficou no sistema, sem tarefa e sem ninguém sabendo dela. Por isso
  `criarRequestComTarefas` confere cada nome na **USR02 antes da rede**.
- `iv_devclass`/`iv_tardevcl` numa ordem `K` **não geram linha na E070M** — silêncio, não erro.
- **O projeto CTS não mora na `E070C-REPOID`** (que fica vazio nas três portas): mora na **E070A,
  como atributo `SAP_CTS_PROJECT`**, e o valor é o **TRKORR do projeto** (`S4H_P00002`), não o id
  externo. O `tm:cts_project` do ADT grava exatamente isso — as três vias convergem na mesma linha.

### ⚠ `SAPCORR` imuniza a request — o atributo que não se desfaz

Pôr `SAPCORR` numa TR a torna **permanente**: não se edita, não se apaga, e o **próprio atributo
não sai**. Medido nas três tentativas (`TO 086` "Request … cannot be edited"): DELETE do ADT,
`TR_DELETE_COMM` (subrc 1) e `TR_EXT_ADD_REQ_ATTR` com `IV_DEL_FLAG='X'` recusam pelo mesmo motivo.
A mensagem explica: *"This attribute is set automatically by the system when you create the
request"* — é a marca de correção SAP, e o sistema presume que ninguém a põe à mão.
`ATRIBUTOS_IMUNIZANTES` no `cts.mjs` recusa antes da rede. **A TR `S4HK912799`, criada antes desse
guard-rail existir, ficou no s4h e não sai por nenhuma via da lib.**

### Atributos e projeto por SOAP puro

- `gravarAtributo` / `removerAtributo` → `TR_EXT_ADD_REQ_ATTR` (RFC). **O `remover` exige o valor
  exato**: com `REFERENCE` errado o FM devolve **sucesso** (`EV_EXCEPTION` vazio, `ES_MSG` vazio) e
  **não apaga nada** — por isso a lib confere a E070A depois e só então diz `ok`.
- `criarProjeto` / `lerProjeto` / `listarProjetos` / `apagarProjeto` → `TR_RFC_CREATE_PROJECT` e
  família (todos RFC). O projeto **nasce como uma entrada da E070 de tipo `G`** ("Generated Project
  Piece List") com número próprio `<SID>_P0000n`, mais a linha da `CTSPROJECT`.
  `IV_EXTERNALPS` é **obrigatório e tem de existir** na `CTS_EXT_PS` (a condição está no FORM
  `CHECK_PROJECT_DESCRIPTION`, `LTR_CTS_PROJECTSF03`); sem ele, `INVALID_INPUT` (TK 697) sem dizer
  qual campo faltou. No s4h os cadastrados são `SAP_IMG_PS` e `SAP_DEV_PS` — `sistemasDeProjeto`
  lista.
- `apagarRequestPorRfc` → **`CTS_WBO_DELETE_REQUEST` é RFC**: apaga ordem + tarefas + entradas por
  SOAP puro, sem o driver que o `desmancharRequest` custa (`initialtask_only = false` por dentro).
  É a via barata para desfazer o que a POC criou.

### O que ficou fora do item 39

- ~~Inserir objeto na TR por RFC~~ — medido no item 75 (2026-09-02): ver **§ Inserir objeto na
  ordem por RFC** adiante. O medo que adiou a medição ("travar objeto tem efeito sobre
  terceiros") caiu: o FM **não trava**.
- `iv_repoid`, `iv_tarlayer` e `iv_with_badi_check` do FM: passados, sem efeito observável em
  ordem `K` — não isolei o cenário em que mordem.

## Inserir objeto na ordem por RFC (item 75 — medido 2026-09-02, S4H 758, mandante 250)

`TR_EXT_INSERT_IN_REQUEST` (SAPLTRWB_REQUESTS, FMODE='R') é o "Incluir objetos" da SE01 sem GUI:
`inserirObjetosNaRequest(cfg, numero, [{ tipo, nome, pgmid? }])` — SOAP puro, sem sessão ADT. É a
outra metade do pipeline do item 74: **montar a TR de entrega a partir de uma LISTA** (o objeto já
existe, pronto e ativo) e liberá-la, sem passar pelo deploy com `corrNr`.

```js
import { criarRequestPorRfc, inserirObjetosNaRequest, liberarRequest } from 'adt-client/cts';

const tr = await criarRequestPorRfc(cfg, { descricao: 'Entrega sprint 12' });
const r = await inserirObjetosNaRequest(cfg, tr.numero, [
  { tipo: 'PROG', nome: 'YRELATORIO_ZFI' },
  { tipo: 'CLAS', nome: 'YCL_CALCULO' },
]);
r.ok;        // exceção vazia E cada objeto conferido na E071 da ordem, em outra LUW
r.entradas;  // as linhas E071 dos pedidos (com LOCKFLAG)
r.faltando;  // o que o FM não gravou (dedup não conta como falta)
```

Interface (FUPARAREF, tudo obrigatório): `IV_REQ_ID` + `IT_OBJECTS TYPE TREXREQOB`
(`PGMID/OBJECT/OBJ_NAME`, sem LOCKFLAG); saídas `EV_EXCEPTION`/`ES_MSG` — **o erro vem estruturado
em HTTP 200** (`EV_EXCEPTION='CALL_FUNCTION_ERROR'` + a mensagem), não como SOAP Fault. Por dentro
(fonte lido): `ENQUEUE_E_TRKORR` → `TRINT_CHECK_REQUEST_CHANGEABLE` →
`TRINT_APPEND_TO_COMM_ARRAYS` com **`iv_append_at_order = 'X'`**.

O que cada rodada mediu, com contra-prova:

- **A entrada cai na E071 da ORDEM**, não numa tarefa — e nenhuma tarefa é criada (E070 por
  STRKORR: 0 linhas). É o oposto do deploy com `corrNr`, que cria tarefa e grava nela.
- **NÃO TRAVA o objeto: `LOCKFLAG` fica VAZIO.** A hipótese da I64 ("conferir LOCKFLAG='X'") caiu
  — quem grava `'X'` é o deploy com `corrNr`. Consequência medida: o MESMO objeto entrou em duas
  ordens sem colisão (a "contra-prova de objeto travado noutra ordem" não existe por esta via,
  porque esta via nunca trava). O `destravarRequest` sobre a TR do deploy só limpa o LOCKFLAG —
  a entrada fica.
- **Duplicado na mesma ordem deduplica em silêncio** (sem erro, E071 continua com 1 linha — o
  comentário do próprio fonte confirma: `lt_e071 is returned initial`).
- **Objeto sem TADIR é recusado limpo**: "Object R3TR PROG … requires a directory entry".
- **Tarefa e tipo fora de K/T/W o FM recusa** (TR 054 "Request type S … Only types K, T or W");
  **liberada** idem ("already released (not modifiable)"). A lib recusa antes, com mensagem em
  contexto (tarefa → "passe a ordem"; o guard `assertMinhaModificavel` é o mesmo do liberar).
- **Dono alheio o FM ACEITA** (`iv_no_owner_check = 'X'` quando `as4user <> sy-uname` — só
  escreve no actionlog da ordem). Como no release, a recusa de ordem alheia é **da lib**, antes
  da rede (E2E: recusou a ordem de SECCO).
- **Só objeto Z/Y entra pela lib** (`assertZY` sobre o nome) — o risco que a I64 nomeava.
- `pgmid` default `R3TR` — o único medido; `LIMU` deve funcionar pelo mesmo motor, não medido.
- O par com o item 74 fecha: a TR montada por lista passou na **simulação** de release
  (`chkrun released`, E070 'D' intacta).

## O que ficou fora (anatomia)

- **Datafile/cofile** em `/usr/sap/trans/data` + `R3trans` — exige acesso ao filesystem do servidor,
  fora do alcance da lib e sem decisão do Joris.

## Leitura por SOAP puro — a terceira via (item 71 da fila — medido 2026-09-02, S4H 758, mandante 250)

O motivo: o ADT stateful do s4h caiu três vezes só em 2026-09, e TODA leitura de TR da lib exigia
sessão ADT (`lerRequest`/`listarRequests`) ou uma salva de `readTable` (`lerRequestPorTabelas`,
5–6 chamadas por TR). Dois FMs `FMODE='R'` fecham a lacuna — leitura sem sessão nenhuma:

| FM | O que traz | Na lib |
|---|---|---|
| `TR_READ_COMM` (SAPLSTRI) | E070 + E07T + E070C + E071 + E071K + **E070A** de UMA ordem/tarefa, numa chamada | `lerRequestPorRfc` |
| `TR_EXT_GET_REQUESTS` (SAPLTRWB_REQUESTS) | a listagem por autor/status/tipo/atributo | `listarRequestsPorRfc` |

Validação campo a campo contra o `parseRequest` do ADT e o `lerRequestPorTabelas`, nas três TRs
que a I65 pedia (modificável S4HK912769 · liberada S4HK900740 · com chaves S4HK912728): cabeçalho
idêntico nos 8 campos comparáveis, consolidado ordem+tarefas idêntico ao da via tabelas (1×1,
3×3, 51×51), TABKEY inteiro e `fatiarChaves` funcionando sobre ele. E2E 48/48.

**O que a listagem RFC tem que o ADT NÃO tem:** `status 'R'` lista as **liberadas** (123 no s4h) —
a árvore ADT com `requestStatus=R` devolve **vazio** neste release (medido no item 24). A via RFC
é a ÚNICA listagem de TR liberada da lib.

**O que a via RFC NÃO traz** (a hipótese da I65, confirmada): `wbtype`, `obj_info` e
`status_text` são enriquecimento do ADT — a E071 vem crua (`PGMID/OBJECT/OBJ_NAME/LOCKFLAG`).
Quem precisa do texto do tipo continua no `lerRequest`. Por isso é via própria, não troca
silenciosa.

### Os gotchas, cada um medido com contra-prova

- **Tabela fora do envelope = resposta vazia SEM ERRO** (o gotcha do canal, ver
  `canal-soap-rfc.md`): `TR_EXT_GET_REQUESTS` devolveu 0 até o request levar
  `<ET_REQUESTS></ET_REQUESTS>`; com a tag, 9. Idem `ET_E070A` (o SAPCORR da S4HK912799 só
  aparece com a tabela no envelope). As funções da lib mandam as tabelas vazias SEMPRE.
- **`IV_REQ_STATUS` NÃO é TRSTATUS**: o fonte valida `NA 'ACR'` — `'A'` todas, `'C'`
  modificáveis, `'R'` liberadas; `'D'` dá `CALL_FUNCTION_ERROR` "Invalid value". O guard-rail da
  lib traduz a recusa antes da rede.
- **O FM filtra o tipo com igualdade estrita** (`WHERE trfunction = iv_req_type` no fim do fonte):
  tipo `'K'` não traz `'W'` nem `'T'`.
- **A árvore ADT não é "ordens do autor"**: ela inclui ordens de OUTROS donos onde o usuário tem
  tarefa (medido: 10 na árvore × 9 do FM — a décima era de MVJZUCATTI, com tarefa minha). A
  paridade exata é `comTarefasDoAutor: true` (`IV_ALL_REQ_AND_ALL_OWN_TASK='X'`, 10×10 com os
  mesmos números). A variante `IV_ALL_REQ_WITH_OWN_TASK` PERDE as ordens do autor sem tarefa
  própria (8 de 10) e ficou fora da lib.
- **`WI_DIALOG` default é `'X'`** — a lib manda `' '` sempre (canal sem GUI).
- **TR inexistente → SOAP Fault `NOT_EXIST_E070`** (exceção limpa, não silêncio); a lib traduz
  para "não existe na E070 deste sistema".
- **`WE_E07T` é UMA linha** (idioma `WI_LANGU`); a via tabelas traz todas as línguas. E o canal
  SOAP serializa DATS/TIMS **com separadores** (`2026-08-28`, `23:33:10`) onde o `readTable`
  devolve cru (`20260828`) — comparar por dígitos.
- **`ET_E071KF`/`WT_E071K_STR` vieram VAZIOS** na TR com chaves mesmo com `IV_SEL_E071KF='X'` —
  o TABKEY fatiado continua sendo trabalho da lib (`fatiarChaves`). Não afirmado além disso.
- **De brinde, um bug do canal corrigido**: o ICF escapa entidade XML nos valores (`&` → `&#38;`)
  e os parsers da lib nunca desescapavam — a descrição da S4HK900740 vinha errada por TODA via
  SOAP (readTable incluído) desde sempre. Corrigido em `xmlField`/`xmlItems`/`xmlStruct`.

### Quando usar qual via de leitura

| Situação | Via |
|---|---|
| texto do tipo, wbtype, consolidação pronta | `lerRequest` (ADT) |
| ADT fora do ar, ou zero sessão | `lerRequestPorRfc` / `listarRequestsPorRfc` |
| todas as línguas da E07T, controle chamada a chamada | `lerRequestPorTabelas` |
| listar TR **liberada** | `listarRequestsPorRfc` — única via |

## Criar TR COM tarefas por HTTP (item 72 da fila / I63 — medido 2026-09-02, S4H 758, mandante 250)

A I63 perguntava se existe um endpoint HTTP que crie TR com tarefas sem driver. Existe — e **não é
outro endpoint: é o MESMO `POST /sap/bc/adt/cts/transportrequests`** que a lib usa desde o item 24.
O handler (`CL_CTS_ADT_TM_RES_COLL_CONT->post`, lido no fonte) deserializa o corpo pela ST
`ST_CTS_ADT_TM_MAIN`, colhe os `tm:owner` de cada `<tm:task>` filho do `<tm:request>` e os passa
como `it_users` a `if_cts_rest_api~create_request` → `TR_INSERT_REQUEST_WITH_TASKS` — o mesmo FM
das outras três portas. A TR do item 24 nascia sem tarefa porque **a lib não mandava o pedaço do
XML que o contrato aceita**, não porque a porta não desse.

```xml
<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="newrequest">
  <tm:request tm:desc="…" tm:type="K" tm:target="" tm:cts_project="">
    <tm:task tm:owner="MVJVELOSO"/>
    <tm:task tm:owner="ME00083"/>
  </tm:request>
</tm:root>
```

Na lib: `criarRequest({ usuarios })` monta isso, e **`criarRequestComTarefas` roteia** — sem
atributo, sem simulação e com dono = usuário logado, vai por HTTP (`via: 'http'`, zero driver);
`dono` alheio, `atributos` ou `simular` seguem no driver (`via: 'driver'`). E2E 11/11 (POC 10/10),
TRs de POC apagadas por `apagarRequestPorRfc`, ausência confirmada.

### Os limites do POST, cada um medido

- **A resposta do 201 NÃO traz as tarefas** — só o `tm:request` da ordem. Elas existem (E070 com
  `STRKORR` na mesma hora, outra LUW); quem quiser vê-las no retorno lê depois (`lerRequestPorRfc`,
  ou o próprio `criarRequestComTarefas`, que devolve `tarefas` lidas da E070).
- **`tm:attributes` no corpo é IGNORADO pelo create** (contra-prova: E070A vazia). O fonte explica:
  o handler só monta `it_attributes` a partir do `tm:cts_project`. Atributo é `gravarAtributo`
  (SOAP) ou a rota driver.
- **Não há onde mandar o dono**: a ordem nasce do usuário logado, sempre (`create_request` não tem
  parâmetro de owner). Dono alheio = rota driver.
- **Owner duplicado deduplica**: dois `<tm:task>` com o mesmo usuário → **1** tarefa.
- **Owner inexistente é recusado ANTES de criar** — 400 `ADT_TM_COMMON_EXCEPTION` com mensagem
  limpa ("Usuário … não existe no sistema (ou está bloqueado)") e **nada gravado**. Repare o
  contraste com o FM cru da rota driver, onde o usuário fake deixa a ordem órfã no sistema (item
  39) — o `validate` do handler ADT fecha exatamente esse buraco, por isso a rota HTTP dispensa o
  `assertUsuarios` local.
- Só tipo `K` medido (o guard-rail do item 24 continua).

### Achado para depois

O mesmo fonte/ST mostra o `tm:useraction` de **release** (`releasetimestamp`, `releaseobjlock`) —
liberar TR pelo ADT, o único verbo do ciclo que a lib não tinha. Virou a **I94** (nasceu como
"I87"; renumerada por colisão com a I87 de eventos RAP) — **medida e fechada no item 74**, seção
seguinte.

## Liberar TR pelo ADT (item 74 da fila / I94 — medido 2026-09-02, S4H 758, mandante 250)

O último verbo do ciclo. A ação real é **`newreleasejobs`** — a mesma do Eclipse:

```
POST /sap/bc/adt/cts/transportrequests/<nr>/newreleasejobs        (SEM corpo)
```

O caminho no servidor, lido no fonte: `CL_CTS_ADT_TM_REST_RES_CONT->post` roteia pelo segmento da
URL (`traction`) → `do_release` → `if_cts_rest_api->release`. Na lib:

```js
import { liberarRequest } from 'adt-client/cts';
await liberarRequest(conexao, tr, { simular: true });     // dry-run do servidor, não grava nada
await liberarRequest(conexao, tr, { confirm: true });     // libera; poll na E070 até 'R'
```

### O que cada rodada mediu (todas com contra-prova)

- **HTTP 200 NÃO é sucesso — TODA resposta é 200**: sucesso, TR inexistente, já liberada e tarefa
  vazia respondem 200. O veredito mora no `<chkrun:checkReport>`: `chkrun:status="released"` +
  `tm:releasetimestamp` preenchido no sucesso; `abortrelapifail`/`abortrelgen` + mensagem tipo E
  (`TR 768` "já liberada", `TK 494` "tarefa não classificada", "não existe no sistema") na falha.
  `parseRelease` lê isso; `liberado` do retorno é o chkrun, nunca o HTTP.
- **A liberação é ASSÍNCRONA** — o statusText do sucesso diz "foi **iniciada**": a E070 passa por
  `O` (export rodando) antes de `R` (medido: a TR alheia do teste ficou ~5 s em `O`). Por isso
  `liberarRequest` faz poll na E070 (`esperar`, default 60 s) e devolve `statusFinal`.
- **`?release_simulation=true` NÃO simula — LIBERA de verdade** (custou uma TR permanente): o
  handler lê o valor num `abap_bool`, e só **`X`** é verdadeiro. Com `=X` a simulação funciona,
  mas **o corpo MENTE**: responde `released` com timestamp preenchido igualzinho ao real — a E070
  intacta (`D`) é a única prova de que era simulação. `simular: true` da lib usa `X` e confere a
  E070 no retorno.
- **O servidor NÃO recusa dono alheio**: a ordem de OUTRO usuário foi liberada sem erro nenhum
  (perfil largo do laboratório — `S_TRANSPRT` aberto). O guard-rail de dono é da LIB
  (`AS4USER = cfg.user`, recusa antes da rede), não do SAP.
- **Tarefa vazia × com objeto**: tarefa vazia não se libera sozinha (`TK 494` — "não
  classificada"); mas a **ordem** com tarefa vazia libera e **APAGA a tarefa vazia** (paridade com
  a SE09). Tarefa **com objeto** libera sozinha; a liberação da **ordem** consolida as entradas na
  E071 dela e grava a marca `CORR RELE` por tarefa liberada (`lock_status` vira `3`).
- **`releasejobs` (sem "new") é o caminho LEGADO e NÃO libera**: devolve 200 com
  `tm:uri="/sap/bc/adt/vit/tm/releasejobs/…"` — a tela do SAP GUI para o Eclipse abrir — e a E070
  não muda. Não confundir as duas ações.
- **Liberada é PERMANENTE**: `CTS_WBO_DELETE_REQUEST` recusa com `INVALID_REQUEST` ("already
  released"); não há via de apagar TR liberada na lib. Por isso `confirm: true` obrigatório — e
  POC libera só TR nomeada "POC".
- A TR liberada **aparece na listagem RFC** `listarRequestsPorRfc({ status: 'R' })` (fila 71) — o
  ciclo completo criar → objeto → liberar → ver liberada fecha sem GUI e sem sessão stateful.
- ~~Ações vizinhas no mesmo dispatcher, NÃO medidas~~ — medidas no item 76 (I95): ver
  **§ As demais useractions do dispatcher** adiante. Três nomes que o switch do fonte sugeria
  estavam ERRADOS (os valores reais vêm de `IF_CTS_ADT_TM_CONSTANTS`): `reassign` (não
  "reassigntask"), `merge` (não "mergerequests"), `lockobject` (não "lockobjects").

E2E 12/12 (S4H 758, 2026-09-02); fixtures reais em `cts.test.mjs`. POC deixou liberadas de
propósito (decisão consciente, todas "POC74"): S4HK912853, 912855, 912859, 912861 (+tarefa
912862, a que levou objeto), 912863 (dono ME00083 — a prova do desmentido) e 912871 (E2E).
O pacote YJBV_POC74_PKG foi apagado e a TADIR confirmada limpa; a E071 da 912861 segue apontando
para ele (entrada histórica de TR liberada — inofensiva, é como o sistema registra).

## As demais useractions do dispatcher (item 76 da fila / I95 — medido 2026-09-02, S4H 758, mandante 250)

O mesmo `CL_CTS_ADT_TM_REST_RES_CONT->post` roteia todas pelo segmento da URL. Os nomes REAIS
estão em **`IF_CTS_ADT_TM_CONSTANTS`** — e três diferem do que o switch do fonte sugere; o chute
custou um 400 `Benutzeraktion reassigntask wird nicht unterstützt` antes de a interface ser lida:

| ação (URL) | verbo | corpo | na lib |
|---|---|---|---|
| `tasks` | POST `<ordem>/tasks` | `tm:root @tm:targetuser` | `criarTarefa` |
| `moveobjects` | POST `<origem>/moveobjects` | `tm:root @tm:number=destino` + `<tm:request><tm:abap_object…>` | `moverObjetos` |
| **`reassign`** (≠ "reassigntask") | POST `<tarefa>/reassign` | `tm:root @tm:number=nova ordem` | `reatribuirTarefa` |
| **`merge`** (≠ "mergerequests") | POST `<origem>/merge` | `tm:root @tm:number=destino` | `fundirRequests` |
| `sortandcompress` | POST `<nr>/sortandcompress` | sem corpo | `compactarRequest` |
| `consistencychecks` | POST `<nr>/consistencychecks` | sem corpo → `chkl:messages` | `verificarConsistencia` |
| `changeowner` | **PUT** `<nr>/changeowner?targetuser=U` | sem corpo | `trocarDonoRequest` |

O contrato do corpo é a ST `ST_CTS_ADT_TM_MAIN` (baixada pelo próprio ADT): `user_action.user` →
`@tm:targetuser` no `tm:root`, `user_action.number` → `@tm:number`, objetos → `<tm:abap_object
tm:pgmid/tm:type/tm:name>` filhos de `<tm:request>`. `buildAcaoBody` monta os quatro formatos.
Ao contrário do release, **aqui erro é 400 de verdade** (`exc:exception` com `<message>` legível —
`mensagemDeAcao` extrai); o veredito de efeito continua sendo tabela em outra LUW.

```js
import { criarTarefa, moverObjetos, reatribuirTarefa, trocarDonoRequest,
         fundirRequests, compactarRequest, verificarConsistencia } from 'adt-client/cts';

const { tarefa } = await criarTarefa(cx, ordem, { usuario: 'MVJNETO' });   // default: o logado
await moverObjetos(cx, ordemA, ordemB, [{ tipo: 'PROG', nome: 'YREL' }]);  // só ordem→ordem
await reatribuirTarefa(cx, tarefa, ordemB);                                // a tarefa muda de mãe
await trocarDonoRequest(cx, ordem, 'MVJNETO', { confirm: true });          // sai do meu alcance
await fundirRequests(cx, ordemA, ordemB, { confirm: true });               // A SOME da E070
const { ok, mensagens } = await verificarConsistencia(cx, ordemB);         // o check da SE01
```

### O que cada rodada mediu (contrafactuais incluídos)

- **`tasks` cria tarefa também para OUTRO usuário, e o mesmo usuário pode ter N tarefas** na
  mesma ordem (3 criadas, zero dedup — o CONTRÁRIO do create com `usuarios`, que deduplica).
  Usuário inexistente: 400 limpo ("Usuário … não existe no sistema"), nada gravado. A resposta
  traz o número da tarefa nova em `@tm:number`.
- **`moveobjects` só move ORDEM→ORDEM.** Ordem→tarefa — da própria ordem ou de outra — o servidor
  recusa com *"O objeto só pode ser deslocado em uma ordem do mesmo tipo"* (tarefa é tipo X, ordem
  K). Objeto que não está na origem: 400 limpo, nada muda. Tarefa→tarefa e tarefa→ordem não foram
  medidos (o guard da lib exige duas ordens).
- **`reassign` muda o STRKORR da tarefa** — ela muda de mãe com as entradas dela dentro. Numa
  ORDEM: 400 *"Entrar uma tarefa"*.
- **`merge` APAGA a origem**: entradas e tarefas passam ao destino e a ordem de origem **some da
  E070** — irreversível na prática (confirm obrigatório). Fica uma entrada-marca na E071 do
  destino com número+data+hora+usuário no OBJ_NAME (o irmão do `CORR RELE` da liberação).
- **`changeowner` é PUT, e o segmento `/changeowner` é obrigatório**: PUT no recurso sem ele
  devolve 400 "Elem.'{…tm}root' esperado" (não é a via). ⚠ **O servidor NÃO recusa trocar o dono
  de TR ALHEIA** (medido nos dois sentidos — o mesmo perfil largo do release): o guard de dono é
  da LIB. A recuperação de laboratório (tomar de volta uma TR que ficou de outro) é o PUT cru.
- **`consistencychecks` devolve `chkl:messages` de verdade** — flagrou a cobaia travada noutra TR
  (tipo E). `parseChecklist` lê; `ok` = nenhum E.
- ~~Não medidos: `lockobject`, `preparerelease` e os resumes de release~~ — medidos no item 77
  (I96): ver **§ O fim do dispatcher** adiante.

E2E 14/14 pela lib (POC 10/13 + fases de isolamento antes); TRs de POC todas apagadas com ausência
confirmada — a fusão apagou a própria origem, e a de changeowner voltou para o dono certo antes do
delete. Zero sessões órfãs.

## O fim do dispatcher: lockobject, preparerelease e as retomadas de release (item 77 da fila / I96 — medido 2026-09-02, S4H 758, mandante 250)

As sobras do item 76, medidas por POC em 4 fases + E2E 12/12 pela lib. O fonte
(`CL_CTS_ADT_TM_REST_RES_CONT`, lido antes de qualquer chamada) deu o contrato; cada afirmação
abaixo tem contra-prova.

### `lockobject` — o lock mora na TLOCK, não no E071.LOCKFLAG

```js
import { travarObjetosNaRequest } from 'adt-client/cts';
await travarObjetosNaRequest(cx, ordem, [{ tipo: 'PROG', nome: 'YREL' }]);
```

- POST `<nr>/lockobject` com o mesmo corpo do `moveobjects` (`<tm:abap_object>` em `<tm:request>`;
  `buildAcaoBody` serve). O handler trava a TR, chama `if_cts_rest_api->lock_object` por entrada e
  destrava. Resposta 200 ecoando os objetos.
- **A hipótese da I96 caiu**: o `E071.LOCKFLAG` fica VAZIO — o lock de verdade é uma linha na
  **TLOCK** (`OBJECT`/`LOKEY` por objeto), e é ela que faz outra TR ser recusada ("YJBV_POC77 está
  bloqueado em ordem/na tarefa …", 400 limpo). O `LOCKFLAG='X'` que o deploy grava é outra marca.
- ⚠ **O servidor trava até objeto que NÃO está na E071 da TR** (lock "fantasma"): a TLOCK ganha a
  linha, a E071 não — e o delete do objeto passa a falhar com 409 `ResourceLockConflict` sem
  rastro visível na TR. O guard da lib exige a entrada por isso.
- Corpo sem objetos: 200 vazio, no-op (o fonte nem entra no loop).
- **Desfazer**: `TRINT_UNLOCK_COMM` **na própria ordem** limpa a TLOCK inteira, fantasma incluído.
  O `destravarRequest`/`desmancharRequest` rodavam o unlock SÓ por tarefa — numa ordem sem tarefa
  (o que `inserirObjetosNaRequest` + `travarObjetosNaRequest` produzem) a TLOCK ficava presa e o
  `TR_DELETE_COMM` recusava. Corrigido no item 77: o driver agora inclui a ordem no loop.

### `preparerelease` — o gancho do code review do gCTS

POST `<nr>/preparerelease` (com ou sem corpo) → `if_cts_rest_api->prepare_release`, que devolve
uma **pull request URL** (campo `tm:review tm:pull_request_url` da resposta). Sem gCTS (o caso do
s4h) responde **200 com request_data sem `<tm:review>`** — não é erro. Na lib: `prepararRelease`.

### As retomadas de release — o "continuar mesmo assim" do Eclipse

O fluxo medido de ponta a ponta (real na S4HK912911, que ficou liberada de propósito):

1. `liberarRequest` (newreleasejobs) numa TR com objeto travado noutra TR **não aborta**: HTTP
   200, E070 segue 'D', e o chkrun responde `chkrun:status="relwithignlock"` com a PERGUNTA no
   statusText ("Nicht alle Objekte … konnten gesperrt werden. Möchten Sie sie dennoch
   freigeben?") — e o `tm:root` traz o `user_action` a reenviar (`tm:releasetimestamp` +
   `tm:releaseobjlock="yes"`). O retorno da lib traz isso em **`retomar`**.
2. `retomarLiberacao(cx, nr, { ...retomar, confirm: true })` → POST `<nr>/relwithignlock` com o
   corpo reenviado → `released` ("foi iniciada", assíncrono como sempre) → E070 'R'.

O que cada rodada mediu:

- **A simulação vale para a interrupção E para a retomada**: `?release_simulation=X` no
  newreleasejobs devolve a MESMA interrupção sem liberar nada, e no resume responde `released`
  com a E070 intacta ('D') — dá para ensaiar o ciclo inteiro sem liberar (é o que o E2E faz).
- **`relObjigchkatc` é camelCase NA URL** (constante `co_sap_rel_obj_ign_atc` =
  `'relObjigchkatc'`): tudo minúsculo → 400 "Benutzeraktion … nicht unterstützt" (contra-prova
  rodada). É a única ação do dispatcher com maiúscula no meio.
- **O `releasetimestamp` é lock otimista das verificações**: `relObjigchkatc` sem o timestamp
  devolvido na interrupção responde status **`relobjchkobs`** ("Veraltete Objektprüfungen.
  Starten Sie die Freigabe erneut") — verificações obsoletas, recomece do newreleasejobs.
  `relobjchkobs` como AÇÃO roda um release comum (não tem case no `do_release`); o papel dele é
  ser STATUS de resposta.
- **`relwithignwarning`** liga `force_mode-ignore_warnings` e roda o release (sem warnings,
  libera normal — medido em simulação).
- **O lock ignorado sobrevive**: liberar a TR-C com `relwithignlock` NÃO roubou nem limpou a
  TLOCK da TR-B — a B continua dona do lock e modificável.
- Flags no servidor (fonte): `relwithignlock` → `iv_ignore_locks`; `relObjigchkatc` →
  `iv_ignore_objects_check` (+ locks se o corpo trouxer `releaseobjlock="yes"`) e usa o
  timestamp como `iv_tr_change_tst`; os abortos não retomáveis são os `abortrel*` do item 74.

### O desfazer depois de um release — a TADIR "distribuída"

Achado do teardown, com contra-prova nas duas pontas: **objeto que viajou numa TR liberada não
sai mais por `removerTadirOrfa`** — o `TR_TADIR_INTERFACE` recusa com `object_is_distributed`
(subrc 4, TR 024). O caminho é a exclusão VIAJAR também: `deleteObject` (TADIR fica `DELFLAG='X'`),
entrada do objeto numa TR (`inserirObjetosNaRequest`) e **release dessa TR** — a TADIR some
DEPOIS do export (com atraso de segundos; logo após o poll 'R' ela ainda estava lá). O DEVC da
mesma POC, que nunca viajou, saiu pelo caminho clássico (`removerTadirOrfa` subrc 0) — o
contraste isola a causa no histórico de transporte, não no tipo.

## O editor de TR — o OUTRO handler do mesmo recurso (item 78 da fila / I97 — medido 2026-09-02, S4H 758, mandante 250)

O dispatcher dos itens 74–77 atende `…/<nr>/<ação>`. O que a I97 chamava de "outro recurso" é na
verdade **outro handler no MESMO recurso**: `CL_CTS_ADT_RES_APP` registra
`/cts/transportrequests/{trnumber}` para `CL_CTS_ADT_TM_RES_REQUEST_CONT` (o EDITOR — GET, PUT,
POST, DELETE) e `/{trnumber}/{traction}` para `CL_CTS_ADT_TM_REST_RES_CONT` (o dispatcher). O
**PUT no próprio recurso** roteia pelo `tm:useraction` DO CORPO (o mesmo `tm:root` da
`ST_CTS_ADT_TM_MAIN`); qualquer useraction desconhecida — inclusive nenhuma — cai no `save( )`,
o "salvar" do editor do Eclipse. Não existe useraction `editdesc` roteada: quem edita descrição É
o save. Contrato lido no fonte ANTES de qualquer chamada; cada linha abaixo tem medição.

```js
import { editarRequest, trocarAlvoRequest, trocarProjetoRequest, mudarAtributoRequest,
         protegerRequest, mudarTipoTarefa, removerObjetosDaRequest,
         lerActionLog, lerTransportLog } from 'adt-client/cts';

await editarRequest(cx, tr, { descricao: 'nova', descricaoLonga: 'docu\nem linhas' });
await trocarAlvoRequest(cx, tr, 'VSS');
await trocarProjetoRequest(cx, tr, 'S4H_P00005');   // '' remove (via save)
await mudarAtributoRequest(cx, tr, { atributo: 'SAPCOMPONENT', valor: 'BC-CTS' });
await protegerRequest(cx, tr);                      // { desfazer: true } desprotege
await mudarTipoTarefa(cx, tarefa, 'R');
await removerObjetosDaRequest(cx, tr, [{ tipo: 'PROG', nome: 'YREL' }]);
const { entradas } = await lerActionLog(cx, tr);    // a SE03 "action log", sem GUI
```

### ⚠ O save grava o documento INTEIRO — e apaga o que o corpo não traz

`update_target` compara o alvo do corpo com a E070 e grava a DIFERENÇA; `update_cts_project`
remove o atributo `SAP_CTS_PROJECT` quando o corpo vem sem projeto. Medido: um PUT só com
`tm:desc` **limpou o TARSYSTEM** da TR em silêncio. Por isso `editarRequest` LÊ alvo e projeto
antes e os reenvia intactos. O reverso é útil: como `changeproject` com valor vazio é 400
(`ExceptionInvalidData`), **remover o projeto da TR só se faz pelo save com `tm:cts_project=""`**
— é o que `trocarProjetoRequest(cx, tr, '')` faz (reenviando desc e alvo). A descrição LONGA
(`<tm:long_desc><tm:long_desc_line tm:long_desc_text="…">`) vira a docu da TR (`change_docu`) —
nenhuma outra via da lib a escrevia.

### ⚠ `removeobject` é MUDO — position errada ou ausente = 200 sem efeito

A remoção que o item 24 deu como inexistente no 758 **existe aqui** ("Remove Locked Object").
O fonte faz `SELECT SINGLE` na E071 por pgmid/object/obj_name/**as4pos** e, se não acha, cai num
`else` VAZIO: respondeu **200 com o tm:root ecoado e não removeu nada** nas duas contra-provas
(position errada; sem position). `removerObjetosDaRequest` resolve a AS4POS por leitura, recusa
entrada ausente ANTES da rede e confere a E071 depois. Funciona em ordem E em tarefa (medidos), e
remove também entrada TRAVADA (`LOCKFLAG='X'` — o lock some com a linha). Remover a entrada não
toca o objeto.

### O resto do vocabulário do PUT, cada um com contra-prova

- **`changetarget`**: alvo inexistente → 400 "Sintaxe incorreta p/destino", nada gravado; alvo
  VAZIO → 400 (limpar alvo é privilégio da armadilha do save). Alvo válido conferido na E070.
- **`changeproject`**: grava `SAP_CTS_PROJECT` na E070A (o TRKORR do projeto, não o id externo).
- **`addattribute`/`removeattribute`/`modifyattribute`**: E070A. O modify EXIGE a `tm:position`
  (da E070A) e passa por `TRINT_CHECK_ATTR_CHANGEABLE` — atributo imutável é recusado com
  mensagem limpa, o que o remove+add por RFC (`gravarAtributo`/`removerAtributo`) não checa.
  Atributo inexistente → 400 "não é um atributo válido". Na lib só o modify é novo
  (`mudarAtributoRequest`, com o mesmo guard de `ATRIBUTOS_IMUNIZANTES`).
- **`protect`/`unprotect`**: E070.TRSTATUS 'D'→'L'→'D', medido nos dois sentidos.
- **`setstatusmodifiable`**: 400 em TR 'D' ("já modificável") **e em TR 'L'** — o caso de sucesso
  não foi isolado (deve exigir TR travada em release); não virou função.
- **`changetasktype`**: `<tm:task tm:type="R"/>` — o CÓDIGO de 1 letra (o GET devolve o texto,
  "Entwicklung/Korrektur", mas o PUT quer `trfunction`). E070.TRFUNCTION X→R→S medidos. Em ORDEM
  → 400; o guard da lib explica antes.
- **`addobject`**: aceito e gravado (LOCKFLAG vazio) — mas **não valida posse nem lock**: entrou
  objeto SAP (SAPMV45A) e objeto travado noutra ordem sem um aviso. Inexistente → 400 limpo
  ("necessita de entrada no diretório"). A via da lib continua `inserirObjetosNaRequest` (RFC,
  guard Z/Y) — o editor não acrescenta proteção, só o mesmo efeito por outro canal.
- **`changeowner` sem segmento**: o case existe no PUT do editor também — o item 76 mediu a via
  com segmento; as duas convivem.

### As leituras vizinhas (handlers registrados à parte)

- `GET …/<nr>/actionlogs` → **o action log da SE03** em `log:log`
  (`application/vnd.sap.adt.logs+xml`); `lerActionLog` parseia (id, severidade, chave T100,
  texto — entidades numéricas `&#231;` decodificadas). `GET …/transportlogs` idem
  (`lerTransportLog`); `…/transportlogs/independentlogs` existe no registro.
- `GET …/<nr>/objectkeys` (o "Object Key Editor") → **400 "I::000"** sem query que o destrave —
  fora por ora.
- `GET …/<nr>/transportchecks` → 200 com `chkrun:checkRunReports` de STATUS ("Nenhuma preparação
  assíncrona iniciada para ID de verificação Build Pipeline"); POST → 405. É o status do check
  assíncrono de release, não um check sob demanda.

### Gotcha de ambiente pago no teardown

Com o ADT **stateful** caído (o 400 HTML "Service nicht erreichbar" conhecido do s4h), o
**DELETE de pacote com `corrNr` respondeu sem lançar e NÃO efetivou** (TDEVC/TADIR intactos,
nenhuma entrada de exclusão) — mais um caso de "HTTP ok não é sucesso", agora no delete. As
escritas do EDITOR (PUT stateless) e todo o SOAP seguiram funcionando — foi o que limpou as TRs
do E2E sem driver: `removerObjetosDaRequest` tira até a entrada de exclusão travada, e
`apagarRequestPorRfc` leva o resto.

**Fechado no item 80 (2026-09-02):** a causa era o GET inicial do `deleteObject` lendo o 400 como
"não existe" (retorno `deleted:false` com status forjado 404, sem lançar). Agora só 404 explícito
vale, e todo delete confere a ausência por GET stateless depois do DELETE — detalhe e medições em
`receita-ciclo-escrita-verificacao.md § O DELETE também se prova`.

E2E 19/19 pela lib (POC em 4 fases antes). Guard-rails: escrita só em TR minha e modificável
(`assertMinhaModificavel`), tipos de tarefa conhecidos, atributos imunizantes recusados.

## O Object Key Editor — objectkeys (item 79 da fila / I98 — medido 2026-09-02, S4H 758, mandante 250)

O TERCEIRO handler do CTS ADT: `…/transportrequests/<nr>/objectkeys`, servido por
`CL_CTS_ADT_TM_OBJECT_KEY_RES` (rota em `CL_CTS_ADT_RES_APP`). É o editor das ENTRADAS DE CHAVE
(E071K) — a metade que faltava do TABKEY do item 21: fatiar existia (`fatiarTabkey`); MONTAR e
GRAVAR não. Com ele, uma TR de customizing se monta por completo sem GUI: criar (RFC) → entrada
TABU → chaves → liberar.

Media type `application/vnd.sap.adt.transportorganizer.objectkeys.v1+xml`
(ST `ST_CTS_ADT_TM_OBJECT_KEY`, raiz `TK_OBJ_KEYS`, namespace `tk = http://www.sap.com/cts/adt/tk`).

### O contrato (lido no fonte ANTES de qualquer chamada, e medido)

| Verbo | Forma | O que faz |
|---|---|---|
| GET | `…/objectkeys?objName=<tabela>&objType=TABU` | chaves atuais + metadata dos campos-chave (`tk:keyField` com offset/length — o layout do TABKEY servido pelo próprio CTS) + `tk:isReadOnly` (whitelist) |
| PUT | `…/objectkeys?lockHandle=` (vazio FUNCIONA) | SUBSTITUI o conjunto de chaves do objeto do corpo |
| POST | `…/objectkeys/checkruns` | valida as chaves SEM gravar (resposta chkrun) |

O corpo (as três formas usam o mesmo):

```xml
<tk:objectKeys xmlns:tk="http://www.sap.com/cts/adt/tk"
    tk:objName="TVARVC" tk:objType="TABU" tk:objPgmId="R3TR">
  <tk:tableKeys tk:isReadOnly="false">
    <tk:tableKey tk:tableName="TVARVC" tk:value="250ZJBV_POC79_A                  P0000" tk:position="0001"/>
  </tk:tableKeys>
  <tk:tables><tk:table tk:isStringTable="false" tk:name="TVARVC"/></tk:tables>
</tk:objectKeys>
```

### O 400 "I::000" do item 78, explicado

O GET exige `objName`+`objType` de objeto que ESTÁ na lista (E071) da TR. Sem os query params, ou
com objeto fora da lista, o handler segue com `ls_object_data` vazio, a API do CTS levanta exceção
de texto vazio e o `SCTS_ADT_MSG 009` sai como `I::000`. Não era corpo faltando — era isso.

### As armadilhas, cada uma com contra-prova

- **Corpo SEM a seção `<tk:tables>` → HTTP 200 MUDO que grava ZERO e APAGA as chaves que o objeto
  tinha.** Causa no fonte: `fill_table_key_details` itera `obj_key_tables`; sem a seção, o
  `update_request` recebe a tabela de chaves VAZIA — e vazio, no PUT-documento, significa "apague".
  Medido nos dois sentidos (sem tables: 0 gravadas; com chave existente + corpo sem tables: a chave
  sumiu). O `buildObjectKeysBody` da lib manda `tk:tables` SEMPRE.
- **O PUT é DOCUMENTO POR OBJETO**: 1 chave no corpo → só ela fica; zero → apaga todas (por isso
  `gravarChavesNaRequest` com lista vazia exige `confirm:true`). As chaves dos OUTROS objetos da TR
  são preservadas (medido: as da T005 sobreviveram ao PUT da TVARVC — o handler reenvia
  `where mastername ne` o objeto editado).
- **Objeto fora da lista → 400 limpo** ("Valores não permitidos de uma chave de objeto"), sem
  varrer a E071 (a lista sobreviveu — medido; o medo do `update_request` com `it_e071` vazio não
  se concretiza).
- **Só `objType TABU` é gravável** (msg 038 para o resto) e a tabela passa por whitelist
  (`cl_ars_object_check` — TVARVC e T005 passam no s4h; `tk:isReadOnly` do GET conta a resposta).
- **"System objects" nem entram na LISTA**: `TR_EXT_INSERT_IN_REQUEST` recusa `TABU T000` com
  mensagem limpa ("System objects cannot be transported directly (e.g. T100, TRDIR, TFDIR..)") —
  foi isso que derrubou uma rodada inteira da POC (o insert em lote é tudo-ou-nada: um objeto
  recusado e NADA entra).
- ~~Chave string (E071K_STR, `isStringTable=true`) NÃO foi medida~~ → **medida no item 81**, seção
  própria abaixo.

### O ramo STRING — E071K_STR (item 81 da fila / I100 — medido 2026-09-02, S4H 758, mandante 250)

Quem decide se a tabela transporta chave string é o **dicionário**: existe campo-CHAVE de
`DATATYPE = 'SSTR'` (critério lido no fonte do `TR_NAMETAB_GET` — **não** é o comprimento total
da chave: uma chave CHAR de 200 continua convencional e é recusada pelo CHAR 120 do TABKEY). O
GET do objectkeys declara `tk:isStringTable="true"` e serve o layout (`tk:keyField` com
`tk:type="g"` para os campos string). Cobaias: `DEMO_CLOB_TABLE` (chave única `NAME` SSTR 30) e
`STWD_BO_TOPIC` (CLNT 3 + CHAR 50 + CHAR 90 + SSTR 255). A E071K_STR do s4h estava **vazia** —
as chaves da POC foram as primeiras do sistema.

O TABKEY string é **concatenação sem largura fixa**, e quem diz onde cada campo termina é o
`tk:length` de cada `tk:tableKey` = o **KEY_LENS**: números de **5 dígitos concatenados**, um por
campo informado, cada um com quantos caracteres daquele campo há no TABKEY (formato lido no fonte
de `TR_CONVERT_STRING_TO_FIELDS`; teto de 3000 chars por chave, `lc_max_keylength`). Provado por
PUT + leitura da E071K_STR em outra LUW: chave mista `250YJBV_APPYJBV_BOYJBV_TOPICO_81` com
`KEY_LENS = 00003000080000700014`, byte a byte. Chave string mora **só** na E071K_STR — a E071K
convencional fica vazia. O checkrun valida o mandante como no ramo convencional (chave de outro
mandante → E TK420 limpa) e o curinga `'*'` no fim vale (o `*` **conta** no comprimento; campo
inteiro em aberto = valor `*` com length `00001`).

Armadilhas medidas, cada uma com contra-prova:

- **PUT sem `tk:length` → 400 limpo mas ENGANOSO**: TK318 *"Para tabela X não estão definidos
  campos-chave"* (a tabela TEM chave — o que falta é o KEY_LENS; sem ele `spec_keynum = 0` e o
  check acha que nenhum campo foi informado). As chaves que existiam ficam intactas.
- **Valor mais largo que o LENG do dicionário → HTTP 500 SEM dump que DERRUBA a sessão de
  segurança ADT** (checkrun E PUT): a resposta é a página do ICM, a SNAP não ganha linha nenhuma
  (medido por `marcaDagua`/`dumpsDesde`) e as chamadas seguintes da mesma sessão respondem
  `400 Session Timed Out` por ~1–2 s. É a `MESSAGE e337(tk)` do `TR_CONVERT_STRING_TO_FIELDS`
  estourando fora de RAISING. `montarTabkeyString` recusa ANTES da rede por isso.
- **Entrada TABU de tabela classe A** (`DEMO_CLOB_TABLE`, `STWD_BO_TOPIC`): o
  `TR_EXT_INSERT_IN_REQUEST` recusou **genérico** (`CALL_FUNCTION_ERROR`, ES_MSG vazio) em ordem
  **W** e aceitou em ordem **K** — medido nas duas tabelas, nas duas direções. (TVARVC, classe C,
  entra em W — item 79.)

Na lib: `ehTabelaString(layout)` + `montarTabkeyString(layout, campos)` → `{ tabkey, lens }`
(puros; cada campo entra com o comprimento REAL — só NUMC ganha zeros à esquerda, senão `'2'` e
`'02'` virariam chaves diferentes da mesma linha). `gravarChavesNaRequest`/
`verificarChavesNaRequest` detectam a tabela string pelo layout e montam o corpo sozinhas; o
assert do gravar vai na **E071K_STR por `dataPreview`** (TABKEY/KEY_LENS são string — o
`RFC_READ_TABLE` não os lê) comparando valor E lens. **TABKEY pronto (string crua) é recusado em
tabela string** — sem o KEY_LENS a lib não tem como saber onde cada campo termina.

### Como usar

```js
import { gravarChavesNaRequest, verificarChavesNaRequest, montarTabkey, layoutChave } from 'adt-client/cts';

// ensaio sem gravar (checkrun): tabela inexistente/inativa volta como mensagem E
await verificarChavesNaRequest(cx, 'S4HK912944', { tabela: 'TVARVC', chaves: [{ NAME: 'Z_MEU_PARAM', TYPE: 'P', NUMB: 0 }] });

// gravar: SUBSTITUI o conjunto do objeto. String = TABKEY pronto; objeto = montado pelo layout
// do dicionário (CLNT entra sozinho com o mandante do logon; NUMC completa com zeros; '*' de
// curinga vale sozinho ou como sufixo de prefixo). A entrada R3TR TABU <tabela> entra sozinha
// na lista se faltar. Assert na E071K em outra LUW (faltando/sobrando no retorno).
await gravarChavesNaRequest(cx, 'S4HK912944', {
  tabela: 'TVARVC',
  chaves: [{ NAME: 'Z_MEU_PARAM', TYPE: 'P', NUMB: 0 }, '250Z_OUTRO*'],
});

// tabela de chave STRING: a MESMA chamada — a lib detecta pelo layout e monta o KEY_LENS
// (TABKEY cru é recusado nela; o assert vai na E071K_STR por dataPreview)
await gravarChavesNaRequest(cx, 'S4HK912954', {
  tabela: 'DEMO_CLOB_TABLE',
  chaves: [{ NAME: 'YJBV_E2E81_A' }, { NAME: 'YJBV_E2E81_*' }], // curinga vale; o * conta no lens
});

// montar/fatiar na mão (puros, inversos um do outro)
const layout = await layoutChave(cfg, 'TVARVC');
montarTabkey(layout, { MANDT: '250', NAME: 'Z_X', TYPE: 'P', NUMB: '0' }); // '250Z_X…P0000'
```

Guard-rails: TR minha e modificável (`assertMinhaModificavel`); TAREFA recusada (só a ORDEM foi
medida); lista vazia exige `confirm:true`; campo fora do layout, valor mais largo que o campo e
`'*'` fora do fim são recusados no `montarTabkey` (typo viraria chave errada em silêncio).

POC em 5 fases (contrato no fonte → ciclo → contra-provas) + E2E 13/13 pela lib, zero órfã, TRs
de POC apagadas com ausência confirmada.
