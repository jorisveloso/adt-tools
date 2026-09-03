# Receita: Application Job (SAJC + SAJT) sem GUI — criar, agendar e provar que rodou

**Validado por POC: S4H release 758, mandante 250, 2026-09-01.** Objetos `YJBV_POC_JOBC` (SAJC),
`YJBV_POC_JOBTM` (SAJT), classe `YJBV_POC_CL_JOB`, objeto de log `YJBV_POC_JOBLOG` e tabela
`YJBV_POC_JOB_T`, todos `$TMP`, todos removidos ao final. Item 47 da fila (achado registrado na I44).

Na lib, em **dois arquivos**, porque são duas coisas diferentes — e a divisão aqui não foi escolha, foi
o que o sistema permitiu:

| O quê | O que é no SAP | Via | Onde |
|---|---|---|---|
| **entrada de catálogo** (R3TR SAJC) | objeto de repositório — a linha da **APJ_W_JCE_ROOT** | ADT REST (AFF) | `tipos/applicationJobCatalog.mjs` → `deploy(conexao, 'applicationJobCatalog', …)` |
| **template** (R3TR SAJT) | objeto de repositório — a linha da **APJ_W_JT_ROOT** | **driver classrun** (`CL_APJ_DT_CREATE_CONTENT`) | `job.mjs` → `deployJobTemplate` / `apagarJob` / `existeJob` |
| **agendamento e status** | runtime (TBTCO por baixo) | driver classrun (`CL_APJ_RT_API`) | `job.mjs` → `agendarJob` / `esperarJob` / `statusJob` / `cancelarJob` |

## O desenho: quem é quem

```
classe executora            SAJC (catálogo)           SAJT (template)         job
IF_APJ_DT_EXEC_OBJECT  →    className                 catalogName        →    SCHEDULE_JOB
  get_parameters       →    APJ_W_JCE_PAR         →   APJ_W_JT_VAL            (jobname, jobcount)
IF_APJ_RT_EXEC_OBJECT       (parâmetros do job)       (valores default)
  execute              ←───────────────────────────────────────────────────── roda em outra LUW
```

A **classe é a fonte da verdade dos parâmetros**: `GET_PARAMETERS` devolve `et_parameter_def`
(a definição de cada campo) e `et_parameter_val` (os defaults). O fonte do catálogo **não tem
parâmetro nenhum** — quem os copia para a `APJ_W_JCE_PAR` é o PUT do fonte, lendo a classe.
A própria SAP avisa, no cabeçalho de `CL_APJ_DT_CREATE_CONTENT`: mudou a assinatura em
`GET_PARAMETERS`, **apague e recrie** template e catálogo, senão a mudança não vale.

## A entrada de catálogo — o terceiro tipo "blue" (AFF) da lib

```js
import { deploy } from 'adt-client';

await deploy(conexao, 'applicationJobCatalog', {
  name: 'YJBV_POC_JOBC', pkg: '$TMP', description: 'POC fila 47 - job catalog entry',
  classe: 'YJBV_POC_CL_JOB',    // IF_APJ_DT_EXEC_OBJECT + IF_APJ_RT_EXEC_OBJECT, já ativa
});
```

Fluxo: create `blue:blueSource` (**`blues.v2+xml`** — o `v1` do APLO/NROB dá 415) com
`adtcore:version="inactive"` → lock → PUT `/source/main` em `application/json` → unlock →
**ACTIVATE EM SESSÃO NOVA**.

**O gotcha que custou a POC — e mente sobre a causa:** na sessão que fez o create/PUT, o activate
responde **200 com `activationExecuted="false"`** e duas mensagens `E`:

> *"Report ou classe  inválida"* · *"O report ou classe  não existe."*

O nome da classe vem **VAZIO**, e ela existe e está ativa. O check está lendo a versão **ativa** do
catálogo — que ainda não há — e não a inativa que acabou de ser gravada. Em **sessão nova** o mesmo
activate devolve `activationExecuted="true"` e o objeto fica `active`. Medido com duas cobaias, e
repetindo na mesma sessão (falha de novo, não é transitório). Quem lê a mensagem sai procurando a
classe; o problema é a sessão.

O fonte, na forma do `sajc-v1.json` que o próprio sistema serve em `…/catalogs/$schema`:

```json
{
  "formatVersion": "1",
  "header": { "description": "…", "originalLanguage": "pt" },
  "generalInformation": { "className": "YJBV_POC_CL_JOB" }
}
```

`originalLanguage` é **minúsculo** (`^[a-z]+$`), como no APLO e no NROB. `exitClasses`
(`check`/`valueHelp`/`notification`) e `generalInformation.programName` são opcionais e só entram
quando informados.

**Assert:** `readTable APJ_W_JCE_ROOT` (tabela de repositório, **sem mandante**) — a classe cai em
**`REPORT_NAME`**, com `JOB_TYPE_C = 'A'` (class based); os parâmetros ficam na `APJ_W_JCE_PAR`
(uma linha por `selname`, com `MANDATORY_IND`). **A linha aparece já no PUT** — o activate é o que
dá a versão ativa (como no APLO; ao contrário do NROB, em que só a ativação grava a TNRO).

## O template — e o 500 que fecha a porta do ADT REST

**O create do SAJT por ADT REST não existe na prática.** O POST em `/sap/bc/adt/applicationjob/templates`
responde **500 "Anular referência da referência NULL"** (HTML do ICF, **sem dump na ST22**) e **nada é
criado** — TADIR e `APJ_W_JT_ROOT` vazias. Medido em todas as variantes que sobraram:

| Variante | Resultado |
|---|---|
| `blues.v2+xml`, `version="inactive"` | 500 |
| `blues.v2+xml`, sem `version` | 500 |
| `blues.v2+xml`, `version="active"` | 500 |
| `blues.v1+xml` | 415 (media type errado, o handler nem chega lá) |
| `blues.v2+xml` + `?relatedObjectUri=<uri do SAJC>` | 500 |

E não é falta de contrato: o discovery publica a coleção com `$schema`, `$configuration`,
`validation` e `source/formatter`, e `…/templates/$new/schema` até diz o que falta
(`catalogName`, required). **Coleção publicada não é create funcionando.**

A via é a que a SAP documenta — com exemplo em `if_oo_adt_classrun`, no cabeçalho da própria classe —
**`CL_APJ_DT_CREATE_CONTENT`**:

```js
import { deployJobTemplate, apagarJob, existeJob } from 'adt-client/job';

await deployJobTemplate(conexao, {
  template: 'YJBV_POC_JOBTM', catalogo: 'YJBV_POC_JOBC',
  texto: 'POC fila 47 - job template',              // TY_TEXT: 40 chars
  parametros: [{ nome: 'P_FATOR', valor: '7' }],    // vira TT_TEMPL_VAL
  pacote: '$TMP', corrNr: '',                       // objeto local: ordem vazia é aceita
});
```

Detalhes medidos:

- `iv_transport_request` e `iv_package` são **obrigatórios na assinatura**, mas `''` + `'$TMP'`
  passam — objeto local não pede ordem.
- **a API NÃO grava a TADIR — e sem ela o próprio DELETE quebra.** `delete_job_template_entry` chama
  `TR_TADIR_INTERFACE` para descobrir a devclass, e sem linha o FM responde *"Indicar pacote para
  R3TR SAJT …"*, que vira `CX_APJ_DT_CONTENT`. Por isso `deployJobTemplate` grava a TADIR logo depois
  do create (`TR_TADIR_INTERFACE` com `wi_tadir_devclass`), e `apagarJob` a remove depois do delete
  (`wi_delete_tadir_entry = 'X'`) — o delete da SAP deixa a linha para trás.
- **`exists_job_template_entry` devolve `I` (inconsistente) quando há TADIR sem entrada** — foi assim
  que a sobra apareceu; sem a TADIR ele volta a `N`. Os quatro estados são um assert barato de
  consistência, não só de existência.
- **o create não é idempotente**: com o objeto existindo, devolve *"O objeto … já existe"*. Use
  `substituir: true` — o driver apaga (entrada + TADIR) e recria. É o que a SAP manda fazer sempre que
  a assinatura de `GET_PARAMETERS` muda na classe.
- o parâmetro é `IF_APJ_DT_EXEC_OBJECT=>TT_TEMPL_VAL` (`selname`/`kind`/`sign`/`option`/`low`/`high`),
  o **mesmo tipo** que a classe usa em `GET_PARAMETERS` — não um par nome/valor solto. `selname` é
  CHAR 8; `low`/`high` são `RVARI_VAL_255`.
- `exists_job_cat_entry` / `exists_job_template_entry` são `class-methods` e respondem
  **`Y` existe · `N` não existe · `D` apagado sem transporte · `I` inconsistente** — é o assert barato,
  sem readTable.
- **Assert por tabela:** `APJ_W_JT_ROOT` (`JOB_CATALOG_ENTRY_NAME` = o catálogo) e `APJ_W_JT_VAL`
  (uma linha por parâmetro; o campo do operador chama **`OPT`**, não `OPTION`, e `LOW`/`HIGH` de 255
  estouram o buffer de 512 do `RFC_READ_TABLE` — peça só as colunas que interessam).

## Agendar, esperar, provar

```js
import { agendarJob, esperarJob, statusJob, cancelarJob } from 'adt-client/job';

const j = await agendarJob(conexao, {
  template: 'YJBV_POC_JOBTM', texto: 'POC fila 47 job',
  parametros: [{ nome: 'P_FATOR', valor: '7' }],   // vazio = usa os defaults do template
  imediato: true,                                   // ou timestamp: '20260901180000' (UTC)
});
// j.jobname (GUID de 32) + j.jobcount — a CHAVE do job

const fim = await esperarJob(conexao, { ...j, segundos: 60, intervalo: 3 });
// fim.status 'F' terminado · 'A' cancelado · 'R' em execução (STATUS/STATUS_FINAL no módulo)
```

`esperarJob` faz o poll **dentro do driver** (`DO … WAIT UP TO n SECONDS`), não em JavaScript: uma
classe, uma execução, em vez de criar e apagar uma classe por sondagem.

**A prova de que rodou é sempre em outra LUW** — o job roda em background, com sua própria transação:

1. **o dado**: `readTable` da tabela que o executor gravou (o `INSERT` + `COMMIT WORK AND WAIT` dele);
2. **o log de aplicação**: `comLog` do `bal.mjs` em volta do agendar+esperar — marca d'água no
   `lognumber` antes, leitura depois, com `espera: { semErro: true, contem: '…' }`. É o assert que o
   canal já tinha (fila 29), e o executor só precisa de um `BAL_LOG_CREATE`/`MSG_ADD`/`DB_SAVE`
   com um objeto de log criado por `deploy(conexao, 'applicationLogObject', …)`;
3. **o próprio job**: `GET_JOB_DETAILS` devolve `catalog`, `template`, `logstatus`, `started_at`,
   `ended_at` — `esperarJob` já traz isso em `.detalhe`.

**Contra-prova medida:** com um parâmetro que a regra do executor recusa (`P_FATOR = 'ZZ'`), o
executor grava a mensagem `E` no log e levanta `CX_APJ_RT_CONTENT`; **nenhuma linha é gravada** e o
job termina com status **`A` (cancelado)**, não `F`. O framework não devolve erro a quem agendou — a
diferença só aparece no status e no log, que é exatamente por que este canal precisa do `bal.mjs`.

### Quando o job aborta e o log de aplicação está VAZIO

Aconteceu duas vezes na POC: status `A`, `logstatus = 'E'`, **zero logs** no BAL e **nenhum dump na
ST22**. O executor morreu antes de escrever qualquer coisa, e nenhum dos asserts habituais diz por quê.
Quem responde é o **log do job** (o da SM37), por `BP_JOBLOG_READ` num driver:

```js
import { lerJobLog } from 'adt-client/job';
const r = await lerJobLog(conexao, { jobname, jobcount });
// r.joblog: [{ msg: '00516', texto: 'Job … iniciado' }, …]
```

Foi ele que entregou a causa:

```
BT645  Class successfully instantiated
BT570  Erro ao instanciar 'YJBV_POC_CL_JOB' (Ocorreu um exceção do tipo CX_SY_RANGE_OUT_OF_BOUN)
00564  Job cancelado após System-Exception ERROR_MESSAGE
```

⚠ **A mensagem `BT570` mente na cara:** diz *"Erro ao instanciar"* — e a linha anterior, `BT645`, diz
que a classe foi instanciada com sucesso. A exceção veio de **dentro do `execute`**, não da
instanciação; o framework só reaproveita o texto errado. Quem acredita nela vai depurar o construtor.

Os dois erros que a POC realmente cometeu, e que o joblog denunciou, valem como aviso ao executor:

| Sintoma | Causa |
|---|---|
| `CX_SY_RANGE_OUT_OF_BOUNDS` "ao instanciar" | `lv_diag(50)` — substring fixa numa string mais curta. Atribuir a string ao campo `c` corta sozinho; a substring explode |
| o parâmetro chega certo e a validação recusa | `lv_fator TYPE char3` com `'7'` vale `'7  '` — e `CN '0123456789'` é **verdadeiro** por causa dos brancos. O teste tem de aceitar o espaço (`CN '0123456789 '`) ou olhar só o pedaço preenchido |

## Desfazer

```js
await cancelarJob(conexao, { ...j, confirm: true });                       // se ainda estiver agendado
await apagarJob(conexao, { template: 'YJBV_POC_JOBTM', catalogo: 'YJBV_POC_JOBC', confirm: true });
```

`apagarJob` apaga **o template antes do catálogo** (o template refere o catálogo) e imprime o
`exists_*` de cada um depois — o assert vem junto. Depois disso, TADIR (`SAJC`/`SAJT`),
`APJ_W_JCE_ROOT` e `APJ_W_JT_ROOT` ficam vazias.

## O que ficou fora

- **job periódico** (`is_scheduling_info`/`is_end_info`: granularidade, dias da semana, calendário,
  número de execuções) — os tipos estão em `CL_APJ_RT_API`, a lib não os expõe; medido só o
  `start_immediately`.
- **job em nome de outro usuário** (`iv_username`) — o parâmetro está montado em `buildAgendarSource`,
  não foi exercitado.
- **exits do catálogo** (`check`/`valueHelp`/`notification`) — entram no fonte, sem POC.
- **`SAJC` transportável** — o `corrNr` é aceito como em qualquer tipo; medido só em `$TMP`.
- **job CLÁSSICO** (SM36/SM37) — era outro mecanismo, fora deste item por decisão da fila; medido no
  item 68 (I71), seção própria abaixo.
- `COPY_JOB`, `FIND_JOBS_WITH_JCE`, `GET_STEPLIST_OF_JOB`, `CAN_SCHEDULE_JOB` — existem na
  `CL_APJ_RT_API` e não foram medidos.

## O E2E

`24/24 PASS` pela lib local (S4H 758, mandante 250): infraestrutura (tabela + objeto de log + classe
executora) → catálogo por ADT REST com os três asserts de tabela → template pela API DT com TADIR →
job agendado, terminado `F`, linha lida em outra LUW e log conferido pelo `comLog` → contra-prova
(`ZZ` → `A`, log `E`, nenhuma linha) → quatro guard-rails recusando antes da rede → desfazer com
ausência confirmada (TADIR, `APJ_W_JCE_ROOT` e `APJ_W_JT_ROOT` vazias, zero sessões).

## Job CLÁSSICO (SM36/SM37) — a outra metade do agendamento (item 68 — I71 — medido 2026-09-02, S4H 758, mandante 250)

Cobaias `YJBV_JOB68_T` (tabela), `YJBV_JOB68_REP` (report), `YJBV_JOB68_VAR` (variante) e três jobs
(`YJBV_JOB68`, `YJBV_JOB68_2`, `YJBV_JOB68E`), todos `$TMP`, todos apagados (ausência confirmada por
`readTable` — TRDIR, TADIR, VARID e TBTCO). O Application Job (acima) é a camada nova, que exige uma
classe `IF_APJ_RT_EXEC_OBJECT`; isto é o que roda 99% do batch de cliente de verdade — um REPORT
existente, agendado por `JOB_OPEN`/`SUBMIT … VIA JOB`/`JOB_CLOSE`.

### O desmentido: `SUBMIT … VIA JOB` não é o `SUBMIT` que dá 500

O guard-rail do `tipos/prog.mjs` diz "NÃO testar report por SUBMIT dentro de um driver classrun: HTTP
500" — medido no item 7 com `SUBMIT … AND RETURN` **síncrono** (roda na hora, dentro da mesma
requisição HTTP do classrun). `SUBMIT <report> … VIA JOB <jobname> NUMBER <jobcount> AND RETURN` é
outra coisa: só REGISTRA o step para rodar depois, em background — e funciona dentro do classrun sem
erro nenhum. É essa diferença que destrava o item: `JOB_OPEN` → `SUBMIT … VIA JOB … AND RETURN` →
`JOB_CLOSE`, os três com `subrc=0`, e o job aparece na TBTCO/TBTCP para rodar.

```js
import { criarVarianteJob, agendarJobClassico, apagarJobClassico } from 'adt-client/job';

await criarVarianteJob(cx, {
  report: 'YJBV_JOB68_REP', variante: 'YJBV_JOB68_VAR', texto: 'timbre da fatura',
  parametros: [{ nome: 'P_VALOR', valor: 'via-lib-e2e' }],
});

const j = await agendarJobClassico(cx, { jobname: 'YJBV_JOB68E', report: 'YJBV_JOB68_REP', variante: 'YJBV_JOB68_VAR' });
// j.jobname / j.jobcount — a chave; a prova é sempre em outra LUW (readTable da TBTCO/tabela)
```

Duas formas de passar valor ao report, as duas medidas: `variante` (nomeada, `USING SELECTION-SET`)
ou `parametros` (ad-hoc, `WITH SELECTION-TABLE` — o mesmo formato `selname`/`kind`/`sign`/`option`/
`low`/`high` do `RSPARAMS`, sem precisar criar variante nenhuma). São mutuamente exclusivas —
`agendarJobClassico` recusa as duas juntas antes da rede.

### `RS_VARIANT_CREATE` não existe — o nome certo é `RS_CREATE_VARIANT`

A primeira tentativa (`RS_VARIANT_CREATE`, o nome mais citado em fóruns) deu `HTTP 500` mudo, sem
dump — e a causa não estava no driver: o FM **não existe no S4H 758** (ausente da `TFDIR`; confirmado
por `dataPreview`). O que existe é `RS_CREATE_VARIANT`, com assinatura BEM diferente: `vari_desc` é a
estrutura `VARID` (basta preencher `report`/`variant`), e os valores entram por **duas TABLES
clássicas** — `vari_contents TYPE STANDARD TABLE OF rsparams` e `vari_text TYPE STANDARD TABLE OF
varit` (`report`/`variant`/`langu`/`vtext` — sem isso a variante nasce sem descrição). `criarVarianteJob`
já chama a FM certa.

⚠️ **`TBTCP-VARIANT` não é o nome da variante usada.** Mesmo com `USING SELECTION-SET
'YJBV_JOB68_VAR'` de verdade, o step gravou `VARIANT = '&0000000000000'` (e `'&0000000000001'` no
próximo job) — um identificador interno, snapshot dos valores no momento do agendamento, que **não
vira linha na `VARID`** (conferido: `SELECT * FROM VARID WHERE VARIANT LIKE '&%'` veio vazio). Não dá
para provar "qual variante rodou" por esse campo — a prova é o valor que o EXECUTOR gravou, em outra
LUW.

### Periodicidade: sem flag própria, e uma armadilha de tipo que dumpa mudo

`JOB_CLOSE` **não tem parâmetro `PERIODIC`** (confirmado na `FUPARAREF`) — quem torna o job periódico
é só ter `PRDDAYS`/`PRDHOURS`/`PRDMINS`/`PRDWEEKS`/`PRDMONTHS` > 0, junto com `SDLSTRTDT`/`SDLSTRTTM`
no futuro (não dá para ser `imediato` **e** periódico ao mesmo tempo — a lib recusa antes da rede). O
SAP marca `TBTCO-PERIODIC = 'X'` sozinho; medido com `PRDDAYS = 1`, agendado para o dia seguinte,
`STATUS = 'S'` (liberado, aguardando).

⚠️ **Armadilha medida, dump silencioso**: `DATA(lv_data) = sy-datum + 1.` (declaração inline) infere
um tipo que **não bate** com o parâmetro `SDLSTRTDT` do `JOB_CLOSE` — o classrun devolve só `HTTP 500
"Application Server Error"`, sem nada no corpo; a ST22 mostra `CALL_FUNCTION_CONFLICT_TYPE`
(`CX_SY_DYN_CALL_ILLEGAL_TYPE`). O fix: declarar o tipo explícito (`DATA lv_data TYPE sy-datum.`
antes de atribuir) — ou, como a lib faz, **nunca calcular a data dentro do ABAP**: `data`/`hora` em
`agendarJobClassico` são strings `AAAAMMDD`/`HHMMSS` prontas, calculadas pelo CHAMADOR em JS.

### Desfazer: o `subrc` do `BP_JOB_DELETE` já mentiu

```js
await apagarJobClassico(cx, { jobs: [{ jobname: j.jobname, jobcount: j.jobcount }], confirm: true });
await deleteObject(cx, { type: 'prog', name: 'YJBV_JOB68_REP', confirm: true }); // cascateia a variante
await deleteObject(cx, { type: 'table', name: 'YJBV_JOB68_T', confirm: true });
```

Numa das três rodadas da POC, `BP_JOB_DELETE` devolveu **`subrc = 1`** para os três jobs — parecia
falha — e os três **sumiram da TBTCO mesmo assim** (mesma classe do `BT570` do item 47: mensagem do
framework que não corresponde ao resultado real). Por isso `apagarJobClassico` não confia no `subrc`:
o driver relê a `TBTCO` **na mesma passada** e devolve `aindaExiste` — é esse campo que vira o `ok`.

⚠️ **Apagar só a variante não tem via headless**: `RS_VARIANT_DELETE` dispara
`DYNPRO_SEND_IN_BACKGROUND` em `SAPLSVAR`/`LSVARU09`, mesmo com `SUPPRESS_INPUT_DIALOG = 'X'`
(medido, dump confirmado por `dumpsDesde`). **Não bloqueia o desfazer**, porque apagar o REPORT por
ADT REST (`deleteObject`) **cascateia**: a variante sai da `VARID` junto — confirmado por leitura em
outra LUW.

### O E2E

Pela lib LOCAL, funções de produção (não o driver raw da POC): tabela + report (arrange) →
`criarVarianteJob` (`ok:true`) → `agendarJobClassico` imediato via variante (`ok:true`, os três subrc
zero) → poll da TBTCO até `STATUS = 'F'` + a linha exata lida em outra LUW (`VALOR =
'VIA-LIB-E2E'`) → `apagarJobClassico` + `deleteObject` do report/tabela → ausência confirmada dos
quatro (report, tabela, variante, job).

### O que ficou fora

- **job em nome de outro usuário**, **`TARGETSERVER`/`TARGETGROUP`** (roteamento para servidor de
  aplicação específico) — os parâmetros existem no `JOB_CLOSE`, não foram exercitados;
- **predecessor/sucessor** (`PRED_JOBNAME`/`PRED_JOBCOUNT`, jobs encadeados) — não medido;
- **`CALENDAR_ID`** (calendário de exceção para periodicidade) — não medido, só `PRDDAYS` puro;
- **step MÚLTIPLO** (mais de um `SUBMIT`/programa externo no mesmo job) — cada `agendarJobClassico`
  faz um `JOB_OPEN` + um `SUBMIT` só; step de programa externo (`XPGPROG`) nem foi olhado.

## Ambiente (2026-09-01)

O ADT **stateful** do s4h caiu no meio da sessão (400 `Service nicht erreichbar` a tudo) com **zero**
sessões minhas no sistema — de novo sem relação com contagem (é o mesmo sintoma das filas 21, 44 e 52).
SOAP RFC e o ADT **stateless** seguiram 200 o tempo todo, e foi por eles que a sonda de "voltou?" foi
feita, nunca abrindo sessão stateful nova. As leituras deste documento (discovery, `$schema`, moldes,
fontes de classe) são todas stateless.

## Job PERIÓDICO de Application Job (item 69 — I72 — medido 2026-09-02, S4H 758, mandante 250)

Cobaias `YJBV_JOB69_T` (tabela), `YJBV_JOB69_CL` (classe executora), `YJBV_JOB69_C` (SAJC) e
`YJBV_JOB69_TM` (SAJT), todas `$TMP`, todas apagadas ao final (ausência confirmada por `existeJob`
e TADIR). O item 47 mediu só `start_immediately`; este item preenche `is_scheduling_info`/
`is_end_info`, que a lib deixava com zero.

### O que a leitura de fonte deu (`CL_APJ_RT_API`, `CL_APJ_RT_JOB_SCHEDULING_API`, `IF_APJ_RT_TYPES`)

```
ty_scheduling_info: { test_mode, periodic_granularity (CHAR2: MI·H·D·W·MO·WM), periodic_value (INT2),
                       timezone, exception{calender_id,start_restriction_code},
                       weekday_info{on_monday..on_sunday}, month_info{day,use_working_days_ind,
                       shift_direction,week_number} }
ty_end_info: { type (''·NUM·DATE), timestamp, max_iterations }
```

Só `W`/`MO`/`WM` entram na lógica de calendário do `__adjust` (com `ASSERT is_weekday_info IS NOT
INITIAL` para semanas) — `MI`/`H`/`D` não tocam essa lógica. `job.mjs` expõe por isso só
`periodicidade: { granularidade: 'minutos'|'horas'|'dias', valor, timezone }` (o caso "roda toda
madrugada") e `fim: { quantidade }` (NUM) `| { ate }` (DATE); semanas/meses/calendário de exceção
ficam de fora até medir `weekday_info`/`month_info` — candidato a idea futura.

```js
import { agendarJob } from 'adt-client/job';

const j = await agendarJob(cx, {
  template: 'YJBV_JOB69_TM', imediato: false, timestamp: '20260902104602',
  periodicidade: { granularidade: 'minutos', valor: 1 },
  fim: { quantidade: 2 },
});
```

`schedule_job` aceita a chamada sem erro, e a `TBTCO` reflete corretamente `PERIODIC = 'X'` e
`PRDMINS` = `periodic_value` — a parte estrutural do agendamento periódico está certa.

### ⚠️ PONTO ABERTO: o `timestamp` não é UTC passthrough, e o disparo real não foi confirmado

O item 47 documentava `timestamp` como "AAAAMMDDHHMMSS, UTC" — mas isso **nunca tinha sido
exercitado de ponta a ponta** (só `start_immediately`). Medido agora:

- `SCHEDULE_JOB` chama `CL_APJ_FW_UTILITIES=>CONVERT_USER_TO_SYSTEM_TSTMP` sobre
  `is_start_info-timestamp`, e o valor gravado em `TBTCO-SDLSTRTDT`/`SDLSTRTTM` é **sempre o
  `timestamp` enviado + 2 horas** — reproduzido em três agendamentos (um cru, um pré-compensado em
  -2h, um SEM periodicidade isolando essa variável). O mesmo "fuso torto" que `dumps.mjs` já tinha
  medido para o `SNAP` (`systemTime` local ≠ `datetime` UTC por +2h) — **não** é o fuso da sessão
  interativa (`sy-zonlo = BRAZIL`, `sy-uzeit` bate com UTC-3 de verdade, medido contra
  `utclong_current( )` no mesmo instante).
- **Nenhum dos três agendamentos saiu do status `S` (liberado) em até 4 minutos de observação** —
  nem o cru, nem o compensado em -2h (que deveria coincidir com "agora" se o dispatcher comparasse
  o valor gravado como UTC puro), nem o não-periódico isolado (afastando a periodicidade como
  causa). O relógio que o **dispatcher de batch** usa para decidir "já é hora" não foi identificado;
  esperar as várias horas necessárias para ver se o job eventualmente dispara ficou fora do tempo
  desta sessão.
- **Consequência prática:** `agendarJob` com `timestamp` (periódico ou não) é aceito sem erro e
  grava os campos certos, mas o disparo em si **não está confirmado** neste sistema. Só
  `imediato: true` tem disparo medido de ponta a ponta (itens 47/68). Quem precisar de agendamento
  por horário tem de medir o atraso real no próprio sistema antes de confiar nele.
- **Achado lateral:** `cancelarJob`/`cancel_job` sobre um job em status `S` (ainda não rodou) **apaga
  o job** (confirmado duas vezes: `GET_JOB_STATUS` depois devolve "O job não existe") — mais um
  ponto na mesma família do `BP_JOB_DELETE`/`BT570` que mente sobre apagar vs. cancelar.

### Causa investigada (item 69, 2ª sessão, 2026-09-02): não é a lib — é uma JANELA DE BATCH do ambiente

Troca de abordagem pedida pelo Joris: em vez de esperar horas o disparo de um job de POC, ler
`TBTCO`/`TBTCS` por SOAP RFC (`readTable`, sem nenhum driver) para caracterizar o **comportamento do
dispatcher** neste sistema.

- **Todo job que rodou nos últimos 4 dias corridos (29/30/31-08 e 02-09) começou entre 00h00 e
  01h30 — nenhum minuto fora dessa janela**, medido nos 4 dias (`TBTCO` filtrado por `STRTDATE`,
  distribuição de `STRTTIME` por hora: 100% das ~500-600 linhas de cada dia caem em `00`/`01`).
  02-09 (dia da sessão) tem exatamente os mesmos 200 jobs de `STRTTIME` entre `000022` e `002926` e
  **zero** depois disso até `08:50` (quando a medição foi feita) — é o mesmo padrão do item 69: os
  3 agendamentos de teste, criados de dia, nunca tinham chance de disparar em minutos.
- **Não é falta de work process**: `TH_GET_PARAMETER('rdisp/wp_no_btc')` devolve `6` **às 08:50,
  fora da janela** — o perfil não zera os processos BTC durante o dia.
- **Não é RZ04 (operation mode)**: `BTCOMSET`/`BTCOMSDL` (sets de modo de operação e a tabela de
  controle do scheduler de modos) estão **vazias** — este sistema não usa troca de modo de operação
  nativa do kernel.
- **`TH_WPINFO`/`TH_SERVER_LIST` não servem de assert por este canal**: os dois voltam com o
  elemento de resposta **vazio** (nem `<WPLIST>` nem `<item>`), sem SOAP Fault — a assinatura
  confere via `FUPARAREF` (`WPLIST` é tabela de exportação, estrutura `WPINFO`), mas o SOAP RFC do
  ICF não serializa esse tipo de saída (estrutura profunda/shared-memory, diferente do
  `RFC_READ_TABLE`). Não afirme "zero work processes" a partir disso — é o canal que não devolve,
  não o sistema que não tem.
- **Teste natural encontrado, não confirmado nesta sessão**: `/1LT/IUC_HEALTH_C`
  (`JOBCOUNT 05122900`) está agendado (status `S`) para HOJE `20260902` às `10:22:26` — mais de 1h
  no futuro da janela de madrugada. Reconferir via `readTable(cfg, 'TBTCO', { where:
  ["JOBNAME = '/1LT/IUC_HEALTH_C'", "AND JOBCOUNT = '05122900'"] })` depois das 10h30: se seguir em
  `S`, reforça a janela fixa; se `F`, derruba a hipótese e o dispatcher despacha fora da madrugada
  também (e a causa do não-disparo do item 69 teria que ser outra).
- **Comparação com o SXD (KART, 816:100) — o mesmo dia, o mesmo método, resultado oposto**: pedido
  do Joris ("dá pra medir isso noutro ambiente?") em vez de esperar o teste natural do s4h.
  `readTable(TBTCO)` nos mesmos 3 dias (31-08, 01-09, 02-09) mostra jobs **distribuídos o dia
  inteiro** (`08h`–`19h`, todas as horas com dezenas de disparos, inclusive HOJE às `09h` — dado
  colhido em tempo real, dentro da janela do SXD) — nenhuma concentração de madrugada.
  `rdisp/wp_no_btc = 18` no SXD (vs `6` no s4h). **Isso isola a causa**: não é uma política geral de
  appliance de treinamento nem do tipo de sistema — é uma característica ESPECÍFICA da bancada s4h
  (moovi). O SXD despacha jobs por `timestamp` normalmente ao longo do dia; o s4h, não.
- **Consequência prática**: quem agendar um job por `timestamp` no **s4h** durante o dia não deve
  esperar disparo em minutos — o padrão medido em 4 dias é uma janela de batch por volta de
  `00h–01h30`, e ela é exclusiva desta bancada (o SXD não repete o padrão). Isso não é bug de
  `agendarJob` (a TBTCO grava os campos certos, ver acima); é AMBIENTE, não é a lib. Mecanismo exato
  (script de infraestrutura do provedor da bancada moovi, provavelmente, para conter custo de CPU
  fora do horário comercial) fica **não identificado** — RZ04/operation mode foi descartado
  (`BTCOMSET`/`BTCOMSDL` vazias nos dois sistemas) e não há evidência alcançável por ABAP puro de
  qual processo liga/desliga o dispatcher. Quem precisar testar disparo por horário no s4h deve
  fazê-lo dentro da janela `00h–01h30`, ou usar o SXD (que não tem essa restrição) quando o teste
  não depender de ser no s4h.

### O E2E

`33/33 PASS` em `job.test.mjs` (646/646 na suíte inteira) pelos testes PUROS
(`buildAgendarSource`/`linhasSchedulingInfo`/`linhasEndInfo`, sem rede) — validam a montagem do
ABAP e os guard-rails (granularidade fora de minutos/horas/dias, `fim` com os dois seletores ao
mesmo tempo, periodicidade sem `imediato:false`+`timestamp`). O lado de rede confirmou a chamada
aceita e os campos da TBTCO; o disparo real ficou em aberto (acima) — por isso este item fecha com
a ressalva, não com "medido fim a fim".

## Inventário de jobs de aplicação, só leitura (item 70 — I73 — medido 2026-09-02, S4H 758, mandante 250)

O item 47 mapeou onde o SAJC/SAJT moram sem nunca ver as duas camadas JUNTAS. `scripts/inventario-jobs.mjs`
faz essa passada única — "o que está agendado, por quem, com que parâmetros e quando rodou pela última
vez" — inteira por `dataPreview` (SELECT simples, sem classrun, sem driver), sobre quatro tabelas:

- **`APJ_W_JCE_ROOT`** — catálogo de entrada (repositório, sem mandante). No s4h: **910 entradas**, todas
  `JOB_TYPE_C = 'A'`.
- **`APJ_W_JT_ROOT`** — templates de repositório (sem mandante — o que o DEV cria). **924**, e a distribuição
  por criador já separa standard de custom sem precisar de heurística de nome: **920 são `SAP`**; os 4
  restantes (`MVPCABRAL` 2, `MVDMARTINS` 1, 1 vazio) são o que vale olhar num sistema de cliente.
- **`APJ_X_JT_ROOT`** — templates de MANDANTE, os que o usuário de NEGÓCIO cria pela app Fiori (achado do
  item 47). No s4h só **1**: `MVPOLIVEIRA2` / `SAP_SCM_MRP`.
- **`APJ_D_JOB_EXE`** — o log de EXECUÇÃO. No s4h, **16** — mas **12 são resíduo da própria POC do item
  47** (`YJBV_POC_JOBC`, criador `MVJVELOSO`), e só 4 são execução real de cliente
  (`SAP_PP_MRP_RMPROG00` ×2, `SAP_FIN_TAX_ADJUST_WHT`, `SAP_PP_MRP_SITUATION_HANDLING`).

### Achado 1: apagar o catálogo/template NÃO apaga o histórico de execução

O item 47 apagou `YJBV_POC_JOBC` e confirmou ausência do catálogo — mas a `APJ_D_JOB_EXE` continua com as
12 linhas dessa execução, mais de 24h depois. **`APJ_D_JOB_EXE` é um log durável, independente do ciclo de
vida do catálogo/template** — quem quiser "ausência confirmada" de um job de aplicação de POC não pode
checar só o catálogo; o rastro da execução persiste à parte (e é exatamente o que este inventário lê).

### Achado 2: `dataPreview` não aceita alias de tabela nem JOIN neste sistema — e o erro não diz isso

Cruzar `APJ_D_JOB_EXE` × `TBTCO` (para "qual o status/último início real") pareceu natural por `JOIN`. Toda
variação testada devolveu o MESMO erro genérico:

```
Só é permitida uma instrução SELECT.
```

— com `AS e`/`AS t`, sem `AS`, com `nome.campo` completo, com `INNER JOIN` e com `LEFT OUTER JOIN`. A
contraprova que isola a causa: **`SELECT e.job_name FROM apj_d_job_exe AS e` (sem JOIN nenhum) já falha
com o mesmo erro** — não é o `JOIN`, é qualquer alias de tabela. Um `SELECT` sem alias, de tabela única,
sempre funciona (inclusive agregando com `COUNT`/`GROUP BY`/`ORDER BY`, como o `cobertura-tadir.mjs` já
usa). **A mensagem de erro não descreve a causa real** — o mesmo texto genérico cobre "alias não
suportado" e (medido à parte) SQL genuinamente inválido (referência a alias inexistente). O cruzamento
saiu por um `SELECT` por execução (16 chamadas no s4h) — funciona, mas não escala para um catálogo de
execução muito maior sem paginar.

### Achado 3: `dataPreview` em sequência pode devolver 500 "Application Server Error" sem exceção ADT

Depois de ~14 chamadas seguidas na mesma sessão (mesmo cookie/token, sem reabrir), a 15ª devolveu HTTP 500
com uma página HTML genérica do ICM ("Application Server Error"), não a exceção XML normal do
`dataPreview`. Reproduzido no MESMO índice em duas sessões novas (não é dado da linha — o job que falhou
não tem nada de especial). Um retry único, com 1s de pausa, passou. Causa não identificada — pode ser
limite de taxa do ICM ou algo específico da bancada s4h (mesma família dos blips de ADT stateful já
registrados nesta fila); o script trata com retry e segue em frente marcando a linha que falhar duas vezes,
em vez de abortar o inventário inteiro.

### Confirmação do "Provaria"

A pergunta "o que está agendado neste sistema, por quem, com que parâmetros e quando rodou pela última
vez" tem resposta **sem classrun e sem driver** — as quatro tabelas + o cruzamento pontual com `TBTCO`
saem inteiros por `dataPreview`. `TBTCO` sozinha SUBESTIMA "quando rodou pela última vez": no s4h, 3 das 4
execuções REAIS de cliente não tinham mais linha na `TBTCO` (arquivada/apagada), só na `APJ_D_JOB_EXE`.

Uso: `node scripts/inventario-jobs.mjs <sid>[:<mandante>]` (mesmas credenciais `SAP_<SID>_USER/PASSWORD`
do `cobertura-tadir.mjs`). 646/646 testes (nenhum novo — script de leitura, sem lógica pura a isolar).
