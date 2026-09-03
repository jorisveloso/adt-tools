# Receita: TOBJ — gerar o diálogo de atualização (SM30) de uma tabela Z sem GUI

**Validado por POC: S4H release 758, mandante 250, 2026-08-29.** Objetos `YJBV_POC_TSM30` (tabela),
`YJBV_POC_FGSM30` (FUGR), drivers `YJBV_POC_CL_*` / `Y_SM30_YJBV_POC_TSM30`, todos `$TMP`. Item 17 da fila
(ideia I29). Na lib: `sm30.mjs` — `deployTableMaintenance(conexao, { table, group, pkg, authGroup })`.

## O caminho que funciona (medido, E2E pela lib)

1. **FUGR pela lib** (`deploy functionGroup`) — é isso que dá a TADIR no pacote certo: o gerador cria o pool por
   `FUNCTION_POOL_CREATE` **sem TADIR**, e um FUGR sem TADIR nem sai pelo ADT depois (`deleteObject` → 403
   "Termination in correction system"; só `RS_FUNCTION_POOL_DELETE` local o remove). Com o FUGR já lá, o
   gerador responde `pool=E` (existe) e gera dentro dele.
2. **Driver classrun** (`buildSm30GeneratorSource`): (a) `OBJ_GENERATE` tipo `S`, modo `I`, `iv_devclass` — cria
   OBJH/OBJS **e a TADIR TOBJ `<tabela>S`** sem popup (`iv_no_correction` vazio); (b) `PERFORM init_const_tabs
   IN PROGRAM sapmsvim` carrega o module pool, `ASSIGN ('(SAPMSVIM)TVDIR')`/`DEVCLASS`/`TDDAT` preenchem os
   globais que o gerador lê por fora dos parâmetros; (c) `MODIFY tddat` (grupo de autorização — na SE54 é o
   `submit_generation` que grava, não o gerador; re-medido 2026-08-29 18:19 em ciclo completo: `TDDAT subrc=0` e
   readTable TDDAT `CCLASS=&NC&`); (d) `PERFORM start_gen_viewmaint_tool IN PROGRAM sapmsvim
   USING ls_tvdir ls_gencb space 0 space` com `ls_tvdir` (TABNAME, AREA, DEVCLASS, TYPE '1', LISTE '0001',
   BASTAB 'X') e `ls_gencb` (VIEWNAME, AREA, CREFFUNC=X, CREPFUNC=X). Saída `GEN_RESULT tvdir=C pool=E
   ffunc=C pfunc=C dynp1=C` (C = criado).
3. **Assert em outra LUW** (readTable): `TVDIR` (AREA, TYPE 1, LISTE 0001, BASTAB X, GENDATE/GENTIME), `TDDAT`,
   `OBJH`/`OBJS`, TADIR `TABL` + `FUGR` + `TOBJ`, `TRDIR` com os 9 includes `L<fg>$01 $02 F00 I00 T00 TOP U01
   U02 UXX` + `SAPL<fg>`, `D020S` dynpro `0001`, `TFDIR` `TABLEFRAME_<fg>` e `TABLEPROC_<fg>`.
4. **Prova de uso — SM30 grava**: BDC por driver (`receita-bdc-classrun.md`): `SAPMSVMA 0100` `VIEWNAME` +
   `=UPD` → `SAPL<fg> 0001` `=NEWL` → `<tabela>-CAMPO(01)` … `=SAVE` → `S SV 018 Data was saved`; `readTable` da
   tabela em outra LUW achou a linha (texto em MAIÚSCULAS: o campo gerado tem conversão para maiúsculas).
5. **Desfazer por API**: driver com `OBJ_GENERATE` modo `D` (OBJH/OBJS/TADIR TOBJ) + `DELETE FROM tvdir/tddat`;
   depois `deleteObject` do FUGR (com TADIR) e da tabela. Tudo confirmado ausente por readTable.

**Gotcha de fonte:** linha ABAP > 255 caracteres no PUT do source dá 400 "The line N exceeds 255 characters" —
o template do driver quebra os `out->write` por isso.

## O que "tabela com SM30" é no banco (anatomia medida)

Lido por `readTable` em dois exemplos custom do s4h — `ZDLPMVW_001` (view) e `ZJFBDLPMT_001` (tabela):

| Peça | Onde | O que carrega |
|---|---|---|
| **objeto de atualização** (R3TR **TOBJ** na TADIR, nome = `<tabela>` + `S`/`V`) | `OBJH` (cabeçalho: OBJECTTYPE `S`=tabela/`V`=view, CLIDEP, OBJCATEG `APPL`, IMPORTABLE `3`), `OBJS` (tabelas do objeto: TABNAME, DDIC=X, PRIM_TABLE=X), `OBJT` (texto) | a "definição de objeto de transporte" — é só o cabeçalho; **não** é o diálogo |
| **diálogo gerado** | `TVDIR` (TABNAME, AREA=FUGR, DEVCLASS, TYPE `1`/`2`, LISTE `0001`, DETAIL, BASTAB `X` para tabela, GENDATE/GENTIME), `TDDAT` (grupo de autorização, S_TABU_DIS) | o registro do diálogo |
| **function group gerado** (R3TR FUGR, mesmo nome da AREA) | `TLIBG`; includes `L<fg>TOP $01 $02 F00 I00 T00 U01 U02 UXX` na `TRDIR`; dynpro `SAPL<fg> 0001` na `D020S`; FMs `TABLEFRAME_<tab>`/`TABLEPROC_<tab>` na `TFDIR` | o código do SM30 |
| eventos | `TVIMF` | vazio nos exemplos |

⚠️ **A tabela `TOBJ` NÃO é o R3TR TOBJ** — `TOBJ` guarda objetos de autorização (OBJCT/FIEL1…); o objeto de
atualização vive em `OBJH`/`OBJS`/`OBJT` (readTable em `TOBJ WHERE OBJECTNAME` dá OPTION_NOT_VALID).

Os 644 TOBJ custom da moovi (`cobertura-tadir.md`) são a peça 1; o que o cliente chama de "SM30"
é a peça 2+3, que a TADIR só mostra como um FUGR a mais.

## Quem gera — e o que NÃO gera (medido)

- ✅ **ADT não gera.** O discovery do 758 tem `/sap/bc/adt/transportobject/objects` (tipo
  `TOBJ/TOB`, editor "blue" com source JSON no formato `abap-file-formats` `tobj-v1.json`,
  `$schema` legível) — mas é **só leitura**: `POST` com `blues.v1+xml` → **400 "Editing Transport
  Object Definitions is not supported" (SCTS_SOBJ 011)**; com `blues.v2+xml` → 415. Nenhuma coleção
  para TVDIR/diálogo.
- ✅ `VIEW_MAINTENANCE_GENERATE` (SAPLSVGN) **não é API**: é um wrapper que faz `CALL TRANSACTION
  'SE55'` (U), `SE56` (S), `SE57` (D) — diálogo. `VIEW_MAINTENANCE_DELETE` idem, com
  `POPUP_TO_CONFIRM`. Nenhum dos dois é RFC.
- ✅ `OBJ_GENERATE` (SAPL0SOB, não-RFC) cria **só a peça 1** (OBJH/OBJS/OBJT + TADIR TOBJ) —
  params `IV_OBJECTNAME`, `IV_OBJECTTYPE` (`S`/`V`), `IV_MAINT_MODE` (`I`/`U`/`D`),
  `IV_NO_CORRECTION`, `IV_DEVCLASS`. É o que a SE54 chama em `object_list`. Chamável por driver
  classrun; ainda não exercitado isoladamente.
- ✅ O gerador do diálogo (peças 2 e 3) é **FORM de module pool**: `SAPMSVIM` →
  `d0120_pai` (`GENE`) → `permission_check` → `call_corr` (TADIR do FUGR e do TOBJ, `RS_CORR_INSERT`)
  → `submit_generation` → `start_gen_viewmaint_tool` (MSVIMF10) → `gen_viewmaint_tool` (MSVIMF01:
  `FUNCTION_POOL_CREATE`, includes, dynpros, FMs). Depende de dezenas de globais da tela
  (`TVDIR`, `TDDAT`, `GEN_CONTROL`, `VIMDYNFLDS`, `DEVCLASS`, `TASK_*`). **Não há FM nem classe**
  que embrulhe isso (TFDIR `VIM%`/`SVIM%`/`%GENERATE_MAINT%` só devolve o que está acima; os
  reports `RSVIM*` são de correção/unicode).

**Logo: a via sem GUI é BDC da SE54 num driver classrun** (`receita-bdc-classrun.md`).

## BDC da SE54 — telas e campos

Medidos por `RPY_DYNPRO_READ` **dentro de um driver classrun** (campos `NAME`, `INPUT_FLD`, `PUSH_FCODE` de
`RPY_DYFATC`): por SOAP RFC o mesmo FM devolve **500 Internal Server Error**, e `D021S` dá
`TABLE_NOT_AVAILABLE` no RFC_READ_TABLE. A lista de telas vem da `D020S` (essa lê).

| Tela | Campos que importam | OK code |
|---|---|---|
| `SAPMSVIM 0050` (entrada) | `VIMDYNFLDS-VIEWNAME`; radio `VIMDYNFLDS-ELEM_GEN` = `X` ("objetos gerados") | `=CRMO` (criar/alterar) · `=DELE` (apagar) · `=SHOW` |
| `SAPLSPO1 0300` (popup "gerar objetos?") | — | `=YES` |
| `SAPMSVIM 0120` (ambiente de geração) | `TDDAT-CCLASS` (grupo de autorização, ex. `&NC&` — **obrigatório**: vazio = E SV 303 e a geração nem começa), `TVDIR-AREA` (FUGR), radio `VIMDYNFLDS-MTYPE1`=`X` (1 nível) ou `MTYPE2`, `TVDIR-LISTE` (`0001`), `TVDIR-DETAIL` | `=GENE` |
| `SAPLSTRD 0100` (entrada de diretório de objetos, FUGR e depois TOBJ) | `KO007-L_DEVCLASS` (`$TMP`) | `=ADD` — **`=TEMP` ("objeto local") dá A 00 255 "function code cannot be selected"** |
| `SAPMSVIM 0102` (apagar gerados) | checkboxes `VIMDYNFLDS-FUNCT_DEL1/TVDIR_DEL/DYNP1_DEL/OBJECT_DEL/FUGR_DEL…` | `=SALL` (marcar tudo) · `=O.K.` |

Gotchas medidos no caminho:
- `VIMDYNFLDS-CORR_CON_S` (rotina de gravação) **não é campo de entrada** nesta tela para tabela `$TMP` — mandar dá S 00 347 e o BDC para.
- Com o FUGR **inexistente**, a rodada devolveu `subrc=0` e **S TK 233 "The object R3TR FUGR … does not exist"** — e nada foi gerado (TVDIR/TDDAT/TLIBG vazios). Silencioso: o `permission_check` (RS_ACCESS_PERMISSION com lock global no FUGR) falha e o `CHECK` engole. ⏳ Hipótese em teste: criar o FUGR antes pela lib (`deployFunctionGroup`) e deixar a SE54 só gerar dentro dele.

## Por que não o BDC da SE54 (medido e abandonado)

A via BDC atravessa as telas (0050 → SAPLSPO1 0300 → 0120 → SAPLSTRD 0100) mas a geração em si não
acontece: com FUGR ou TOBJ inexistentes o `permission_check` (RS_ACCESS_PERMISSION com lock global) devolve
S TK 233 "does not exist" e o `CHECK` engole; com os dois pré-criados grava `TDDAT` e termina com subrc=0
sem TVDIR, sem log (BAL `SM30/STRUCTURE` vazio). A chamada direta do FORM foi o que revelou a causa — o
gerador levanta `E FL 019` porque lê o `TVDIR` **global** (a BDC preenche pela tela, o PERFORM externo
não) — e é ela que a lib usa. A tabela de telas/campos acima fica como referência para outros diálogos
da SE54 (apagar: `=DELE` → 0102 `=SALL` → `=O.K.`).

## Gotcha de ambiente: sessões stateful órfãs → "400 Session not found"

Medido 2026-08-29 no s4h: cada `deployAndRun`/`sessaoNova()` abria um logon **stateful** (cookie
`sap-contextid`) que **nunca era encerrado** (31 sessões tipo 202 do usuário em `TH_USER_LIST`). Em dois
períodos (~16:45–17:10 e de 17:25 em diante) **toda** requisição stateful seguinte ao `fetchToken` respondeu HTML
`400 Session not found` — o segundo período começou com só 4 sessões minhas, logo **não é a contagem**: o
contexto é criado (cookie devolvido, sessão aparece na TH_USER_LIST) e o ICM não o acha na requisição
seguinte. Causa em aberto (uma instância só, mesmo IP de origem); o primeiro período passou sozinho em ~25 min.
Nesse estado cai até o `/sap/bc/adt/discovery`, enquanto `/sap/public/ping`, SOAP RFC e chamadas
**stateless** (`X-sap-adt-sessiontype` ausente) seguem 200 — o classrun roda stateless (medido); `LOCK`
não: o servidor abre contexto para ele e o PUT seguinte cai no mesmo 400. `GET /sap/public/bc/icf/logoff`
com o cookie também dá 400 nesse estado; `TH_DELETE_USER` encerraria (SM04), mas é ação de sistema.

**Regra (Joris, 2026-08-29): sessão viva por mais de 5 minutos é erro do script.** Quem abre encerra:
`conexao.encerrar()` no `finally` (`GET /sap/public/bc/icf/logoff` com o cookie — medido: é a única das
três vias que derruba a sessão na `TH_USER_LIST`; `DELETE core/http/sessions` dá 405 e uma chamada stateless
na mesma sessão não encerra nada; o logoff responde **500** ao encerrar com sucesso). `runClass` com
`novaSessao` abre sessão **stateless** e a encerra no `finally`; medido: `deployAndRun` + `encerrar()` deixam
a contagem exatamente como estava. E **não sondar "se voltou" abrindo sessão stateful**: cada sonda vira mais uma
órfã (medido: 31 → 35 em 10 min de watcher). Sondar só por SOAP (`TH_USER_LIST` — **com `USRLIST: []` no envelope**: sem a tabela na chamada a resposta
vem vazia e a contagem "0 sessões" é cega; medido 2026-08-30, item 21) ou stateless.

**Desde o item 56 (2026-09-01), a regra está NA LIB, não só no procedimento**: `sessaoNova`/`sessaoStateless`
nascem rastreadas pela `conexao` e **`encerrar()` faz logoff de todas** — quem quer a sessão viva de
propósito pede `{ manter: true }` (e passa a ser o responsável por fechá-la); a sessão herdada do
`connect` (CLI) nunca é encerrada pela conexão, e a `sessaoStateless` de cookie **emprestado** (modo
sem senha) não é rastreada — logoff nela derrubaria a sessão do CLI junto. Medições da POC
(S4H 758:250, 2026-09-01, E2E 14/14):

- **Quem fica órfã é só a stateful**: 3 `sessaoNova` + 2 `sessaoStateless` sem logoff deixaram **3**
  sessões 202 (não 5) — no s4h a sessão de uma requisição stateless morre sozinha ao fim dela.
- **No SXD (816:100) a stateless PERSISTE**: uma sonda de `canais.mjs` das 16:41 seguia viva às 17:05.
  O tempo de vida é configuração do alvo — por isso `probe.mjs` captura o `set-cookie` da sonda e faz
  logoff (`despedirCookie`), e `scripts/cobertura-tadir.mjs` encerra o `conectar` que ele mesmo fez
  (e apaga o `.sessao.json`, senão o cookie morto vira 401 mudo no próximo comando do CLI).
- **Logoff de uma sessão não derruba as outras** (cookies independentes: s2 respondeu 200 após o
  logoff de s1) e sessão já fechada por quem a abriu (ex.: `runClass` no `finally`) é pulada de graça.
- **A contagem enxerga a própria requisição**: `TH_USER_LIST` mostra uma sessão 202 cujo `ZEIT` é o
  instante da chamada — é o request da contagem, não uma órfã. Compare DELTAS, nunca o absoluto.
