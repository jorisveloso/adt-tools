---
name: adt-objetos
description: Receitas validadas e gotchas para CRIAR e ALTERAR objetos ABAP via ADT REST — tabela, estrutura, domínio, data element, CDS, BDEF, SRVD, SRVB, DDLX, classe com teste, interface, MSAG, programa/include, function module — mais o que o ADT REST NÃO faz, e o consumo do OData V4 gerado (draft, CSRF, etag). Use quando for criar, alterar, ativar ou publicar objeto ABAP pela lib `lib/adt-client.mjs`, quando um create/activate/publish falhar com 400/403/405/406/415/428/500, quando o objeto "foi criado mas sumiu na leitura", quando um serviço RAP não responder, ou quando for validar um tipo novo por spike.
---

# Objetos ABAP via ADT REST — receitas e gotchas

O que se sabe sobre **escrever** no SAP pelo ADT, tipo por tipo. Cada linha aqui foi paga com uma
tentativa que falhou. A lib que implementa isto é `lib/adt-client.mjs`; o transporte (sessão, cookie,
token CSRF) é `lib/sap-connection.mjs`.

> **O CLI está em fase SÓ LEITURA.** As funções de escrita existem na lib e **nenhum comando as
> chama**. Nada aqui autoriza rodar `deploy*`, `activate*` ou `deleteObject` por conta própria — isso
> é a fase 2. Esta skill é o que você precisa saber **quando** for escrever, não a permissão para
> escrever.

**Índice** — [Contrato](#contrato-desta-skill) · [O que o ADT não faz](#o-que-o-adt-rest-não-faz) ·
[As três formas](#as-três-formas-de-objeto) · [Ledger](#ledger-de-tipos) ·
[Gotchas transversais](#gotchas-transversais) · [Receitas por tipo](#receitas-por-tipo) ·
[RAP: cadeia e draft](#rap--a-cadeia-inteira) · [Consumir o OData gerado](#consumir-o-odata-v4-gerado) ·
[Verificação](#verificação-e-diagnóstico) · [Divergências](#divergências-resolvidas) ·
[Pontos abertos](#pontos-abertos) · [Validar tipo novo](#validar-um-tipo-novo) ·
[Manutenção](#manutenção--como-esta-skill-cresce)

## Contrato desta skill

**Toda vez que um erro de ADT custar mais de uma tentativa, esta skill ganha uma entrada.** Não é
opcional e não é "depois": é o passo final do trabalho, junto com o código. A seção
[Manutenção](#manutenção--como-esta-skill-cresce) diz como. Um aprendizado que fica só no comentário
do `.mjs` some — foi por isso que ele virou skill.

**Spike-first.** Tipo novo não entra na lib nem aqui por leitura de documentação. Entra depois de
criar, ler, ativar e apagar um objeto descartável em `$TMP`. Ver [Validar um tipo novo](#validar-um-tipo-novo).

---

## O que o ADT REST não faz

Saber a fronteira antes economiza mais que qualquer receita: evita prometer o que não dá, e evita
horas sondando um endpoint que não existe.

| Não dá pelo ADT REST | Caminho real |
|---|---|
| **Transação (`TRAN/T`)** | `TRAN/T` existe sob `/sap/bc/adt/vit/wb/object_type/trant/object_name/<NOME>`, mas esse `/vit/` é o wrapper **SAPGUI-integrado**: serve só `application/vnd.sap.adt.basic.object.properties+xml` (nome/tipo/pacote/descrição) e **delega a edição à SE93**. O discovery **não tem coleção POST-ável** de transação. → **SE93 manual**, ou gerar um report que chame a FM `RPY_TRANSACTION_INSERT` (existe em ECC 6.0 e S/4; par `RPY_TRANSACTION_READ`), deployar o report pelo ADT e **um humano executa uma vez** (SA38). |
| **Mover objeto de `$TMP` para pacote** | O objeto **não expõe link de move/package**; PUT de metadata com `packageRef` dá **500 `EU537`** ("versão de idioma ABAP não permitida no componente de software"). → **deletar e recriar** no pacote certo. Ver [a regra de nome POC](#tmp-e-nomes-poc). |
| **Criar versão** | Não há coleção no discovery. Versão nasce na **liberação do transporte** ou pela utilidade do workbench. Ler versão funciona (ver [Versões](#versões-o-modelo-do-sap-e-o-do-adt-não-coincidem)). |
| **Gravar tradução** | O PUT escreve sempre a camada **master**. → SE63/SE91, manual. |
| **Executar report ou FM** | Não há run-report no conector. → SA38 manual. **Exceção útil:** ABAP Unit **é** harness e roda pelo ADT — uma classe de teste que faz `CALL FUNCTION` local prova ativação, chamada e parâmetros sem efeito colateral. |
| **Dynpro (SE51), status/título GUI (SE41), gerador de manutenção SM30 (SE54), pacote Z transportável (SE21)** | Manual, SAP GUI. ⚠️ Um report que referencia dynpro inexistente **ativa normalmente e só dumpa em runtime** — a ativação não protege. |

**Consequência de projeto:** ao decompor trabalho, marque cada passo `[agente]` ou `[manual]` por esta
tabela, e **prefira a técnica do lado automatizável**. Equivalências que já resolveram o problema sem
tela manual:

| Em vez de… | Use… |
|---|---|
| Dynpro para entrada de parâmetros | **selection-screen** (`SELECTION-SCREEN PUSHBUTTON`, ícones via FM `ICON_CREATE`) |
| Dynpro/`POPUP_GET_VALUES` para POPUP de entrada | **`SELECTION-SCREEN BEGIN OF SCREEN nnnn TITLE tit AS WINDOW`** + `CALL SELECTION-SCREEN nnnn STARTING AT x y` (`sy-subrc` 0=confirmou, ≠0=cancelou). Campos dinâmicos por `MODIF ID` + `AT SELECTION-SCREEN OUTPUT` **com guarda `sy-dynnr`** (o evento dispara para TODAS as telas de seleção do report). `PARAMETERS TYPE <tab>-<campo CURR>` ativa e converte moeda nativamente — a vantagem sobre `POPUP_GET_VALUES`, que devolve char formatado e a conversão de volta é frágil. `tit` é declarado implicitamente (como o FRAME TITLE); labels via `%_p_x_%_app_%-text` em `INITIALIZATION`. Medido 2026-08-25, POC em `$TMP`. |
| Dynpro para monitor/drill read-only | **lista clássica** — `WRITE` + `HIDE` + `AT LINE-SELECTION` |
| Transação de parâmetro sobre SM30 | **report** que chama `VIEW_MAINTENANCE_CALL` (só o SE93 fica manual) |
| Container gráfico (`CL_GUI_HTML_VIEWER`) em report puro | não funciona de forma confiável — o docking some atrás da lista; exige Dynpro |

---

## As três formas de objeto

Quase todo erro de fluxo é ter aplicado a forma errada.

| Forma | Quem é | Fluxo |
|---|---|---|
| **source-based** | tabela, estrutura, CDS, classe, interface, BDEF, SRVD, programa, include, DDLX | `create shell` → `lock` → `PUT /source/main` → `unlock` → `activate` |
| **XML puro** (sem `/source/main`) | data element, domínio, MSAG | `create shell` → `lock` → `PUT (body)` → `unlock` → `activate` |
| **config + publish** | service binding | `create (body)` → `activate` → **`publish`** (ação à parte) |

`TYPES` em `lib/adt-client.mjs` é o registro autoritativo: `coll` (coleção), `ct` (Content-Type do
create), `accept` (só quando o GET difere do create) e `source`. **Esta skill e o `TYPES` andam
juntos** — mudou um, muda o outro.

## Ledger de tipos

| Código | Tipo | `TYPES` | Estado |
|---|---|---|---|
| `TABL/DT` | tabela | `table` | validado |
| `TABL/DS` | estrutura | `structure` | validado · 2026-07-27 |
| `DOMA/DD` | domínio | `domain` | validado · 2026-07-27 |
| `DTEL/DE` | data element | `dataElement` | validado |
| `DDLS/DF` | CDS view | `cds` | validado |
| `BDEF/BDO` | behavior definition | `behaviorDefinition` | validado · 2026-07-27 |
| `SRVD/SRV` | service definition | `serviceDefinition` | validado · 2026-07-27 |
| `SRVB/SVB` | service binding + publish | `serviceBinding` | validado · 2026-07-27 · **corrigido 2026-08-05** |
| `DDLX/EX` | metadata extension | `metadataExtension` | validado · 2026-08-05 |
| `CLAS/OC` | classe (+ include de teste) | `class` | validado |
| `INTF/OI` | interface | `interface` | validado |
| `MSAG/N` | classe de mensagens | `msag` | validado · [ponto aberto](#pontos-abertos) |
| `PROG/P` · `PROG/I` | programa · include | `prog` · `include` | validado |
| `FUGR/F` · `FUGR/FF` | grupo de funções · function module (RFC) | `functionGroup` · `functionModule` | validado · 2026-08-26 (`deployFunctionModule`) |
| `TTYP` | table type | — | **lacuna** — nunca spikado |
| `TRAN/T` | transação | — | **impossível** por ADT REST |

Fora desta tabela: **não validado**. Não invente o media type — leia o `/sap/bc/adt/discovery`.

---

## Gotchas transversais

Valem para qualquer tipo. São os que mais custam porque o sintoma aponta para o lugar errado.

### `activationExecuted="true"` NÃO significa sucesso
O atributo convive com mensagens `type="E"` ("Aktivierung wurde abgebrochen"). Ler o flag e ignorar as
mensagens deixa passar objeto inativo como ativado. **Sempre checar `type=E` em `chkl:messages`** —
`activateMany` faz isso via `hasError`; era um bug real antes.

### `activationExecuted="false"` sem mensagem = você ativou o objeto errado
Não é "já estava ativo". É no-op silencioso por ter referenciado o objeto **pai** em vez de onde a
versão inativa está. Dois casos confirmados: ativar o **programa** em vez do **include**, e ativar o
**FUGR** em vez do **function module**. Ative a URI de quem recebeu o PUT.

### Um `POST` que devolve ERRO pode ter GRAVADO
Um `POST /cts/transportrequests` devolveu **406** (Accept errado) e **criou a transport request assim
mesmo** — o header `Location` entregou. "Deu erro" faz supor que nada aconteceu, e sobra objeto órfão.
**Depois de um POST que falhou, verificar se o objeto existe antes de repetir.**

### Os códigos HTTP não são intercambiáveis — cada um aponta para outra coisa
- **404** o recurso não existe · **406** existe, o **Accept** está errado · **415** existe, o
  **Content-Type** está errado · **405** existe, o **método** está errado (a medição de cobertura é
  `POST`; o `GET` dá 405 e parece "inacessível") · **428** o recurso exige requisição **condicional**
  (`If-Match`).
- Ler 406 como 404 é o erro clássico: faz procurar objeto que está lá.

### A mensagem do 400 pode apontar para o lugar errado
`ExceptionResourceAlreadyExists` num PUT de estrutura **não** era objeto duplicado: a mensagem real,
mais abaixo no corpo, era *"Kein Sichern wegen Fehler in Quelle"* — **erro de sintaxe no fonte**.
**Leia o corpo inteiro do erro**, não o tipo da exceção. Com `--debug` o corpo vem completo.

### Descrição acima de 60 caracteres derruba o create com 400
`adtcore:description` tem limite de 60. Vale para qualquer tipo.

### Lock: um Accept serve para todos os tipos
`POST …?_action=LOCK&accessMode=MODIFY` com `Accept: application/*` funciona para **classe** e devolve
**406 em tabela e DE**. O canônico, que serve para todos:
```
application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.Result
```

### `unlock` sempre em `try/finally`
Sessão stateful que morre sem `unlock` deixa **lock órfão**: o objeto fica travado até o timeout do
servidor, e nem alterar nem apagar funciona. `EU510` ("Usuário … já está processando …") é esse
sintoma — esperar o timeout ou limpar na SM12.

### `activate` roda na MESMA sessão — o que morde é o lock
**Medido 2026-08-05** (S/4, mandante 100, POC em `$TMP`): ativar na sessão cacheada (só cookie, sem
senha) devolveu HTTP 200, `activationExecuted="true"`, zero mensagens, e o objeto ficou
`version: active`. O **403 "currently editing"** só aparece enquanto o objeto está **travado** — e
todo `deploy*` faz `unlock` no `finally` antes de ativar.
⚠️ Isto **substitui** a regra anterior ("`activate` exige sessão nova"), que virou folclore. Ver
[Divergências resolvidas](#divergências-resolvidas). **Exceção conhecida:** o create de MSAG, que
prende ENQUEUE sem unlock possível — ver [Pontos abertos](#pontos-abertos).

### O `POST` de create grava só a parte TÉCNICA — texto exige `PUT`
No **data element**, o POST grava tipo e tamanho mas **descarta em silêncio** o
`adtcore:description` e os 4 `<dtel:*FieldLabel>`. Mesma coisa na **MSAG** (ignora os `<mc:messages>`
inline). O POST devolve **201**, o objeto **ativa**, e um teste que confira só tipo/tamanho fica
**verde**. Já contaminou 16 DEs de uma vez — e label de DE é cabeçalho de coluna no ALV, ou seja,
dano funcional.
**Sempre `lock → PUT → unlock → activate` depois do create.** `deployDataElement` e
`deployMessageClass` fazem isso.

### `deploySource` sobrescreve sem avisar — script antigo REVERTE o objeto
Rodar um script de deploy com **DDL embutido desatualizado** reverte o objeto DDIC para a versão
antiga e **derruba todas as classes que dependem dele** (sintoma: *"does not have component"* em
cascata). Cada objeto DDIC tem **uma** fonte de verdade — o script mais recente que o estende. Os
antigos com o mesmo DDL viram armadilha.
**Como aplicar:** antes de executar, rodar em dry-run e conferir o DDL contra o objeto real, ou
confirmar qual script é a fonte de verdade. Um script autoritativo por objeto; marque os obsoletos com
guard explícito. Recuperação: rodar o autoritativo (pode exigir limpar lock de ativação na SM12) e
reativar as classes dependentes.

### O idioma da SESSÃO define o `masterLanguage` — o atributo do XML é ignorado
`adtcore:masterLanguage` no body **não tem efeito**. Quem decide é o `sap-language` da requisição do
**token**. Sem informar, cai no default do sistema (normalmente **EN**) e o objeto nasce master EN com
texto em português. Vale também para alteração: um PUT em sessão de outro idioma **troca o master** de
um objeto que estava certo.
Depois de criado, **não muda por PUT** — o conserto é manual (SE03 → alterar entradas do diretório de
objetos, permite em massa por pacote). Acertar o idioma **antes** é a única saída barata. Já
contaminou 29 objetos de uma vez.

### Um objeto por vez, nunca em lote
Um lote de 7 tabelas "reportou sucesso" e o defeito de uma só apareceu depois, no teste, misturado às
outras. Ciclo completo por objeto antes do próximo.
**Exceção:** objetos que se referenciam mutuamente têm que ativar **na mesma requisição**
(`activateMany`), senão cada metade reclama que falta a outra. Ativação em lote ≠ criação em lote.
Ver [unidades de ativação](#unidades-de-ativação).

### Endpoint desconhecido: mande body VAZIO e leia o erro
O SAP responde `System expected the element '{namespace}elemento'`. Foi assim que se descobriu, em
**uma** tentativa, que `/activation/runs` usa o mesmo `adtcore:objectReferences` do activate normal.
Vale antes de qualquer tentativa de montar payload por adivinhação.

### Quando o `discovery` não tem, procure implementação de terceiro
A recipe de cobertura de ABAP Unit não está no `discovery` — veio de uma coleção Postman de CI
(`pacroy/abap-ci-postman`). A documentação oficial descreve a Coverage API em nível conceitual, sem os
endpoints REST. Procurar cliente open source / coleção Postman **antes** de sondar rota por rota.

### O schema de um objeto se descobre lendo um objeto PADRÃO que já funciona
`processingType="rfc"` veio de ler o metadata de `RFC_PING`. O shell do DDLX veio do GET de uma DDLX
ativa. A linha `<class:include>` que faltava veio de comparar o XML de uma classe **com** include
(criada no Eclipse) contra uma **sem**. **Diff contra objeto padrão bate adivinhação sempre.**

### Diagnóstico de rede: distinga "SAP fora" de "SAP lento"
`undici` **não é importável como pacote bare** no Node 24 (`ERR_MODULE_NOT_FOUND` — é interno, não
exposto como specifier), então **não dá para elevar o `headersTimeout` do `fetch`** num script
zero-dep. `AbortController` só aborta, não estende.
- discovery **aborta ~90s sem resposta** → servidor indisponível (VPN, ICM fora): reagendar.
- `UND_ERR_HEADERS_TIMEOUT` → servidor lento a mandar headers: outra coisa.

### `$TMP` e nomes POC
**Nunca valide em `$TMP` com o nome definitivo.** O objeto fica **preso em `$TMP`** — o deploy "real"
seguinte vê `exists=true` e não recria no pacote certo, e o ADT [não move](#o-que-o-adt-rest-não-faz).
Use nome com marcador POC descartável; o nome real nasce **direto no pacote/request de destino**.
Recuperação, se já aconteceu: `deleteObject` (Z/Y + `confirm:true`) e recriar.

---

## Receitas por tipo

### `TABL/DT` — tabela
`/sap/bc/adt/ddic/tables` · `application/vnd.sap.adt.tables.v2+xml` · source-based.
Shell `<blue:blueSource … adtcore:type="TABL/DT">`. O DDL define tudo: delivery class, chaves, data
elements ou tipos built-in.

- ⚠️ **Nome ≤ 16 caracteres incluindo namespace** — e **só a tabela transparente** tem esse teto (é o
  nome físico no banco). Estourou: **422 `ExceptionUnprocessableEntity`** / `AD(102)` "Selecionar um
  nome mais reduzido". **Estrutura, data element, domínio, classe, interface, FM e report aceitam nomes
  longos**, e é isso que faz o erro parecer incoerente: no mesmo deploy, uma estrutura de 21 caracteres
  passa e a tabela de 19 é recusada. Encurte o descritor, nunca o namespace — e feche o nome da tabela
  **no desenho**, porque renomear depois cascateia em script, documento e código.
- **Palavra reservada em nome de campo falha a ativação** com `DT(205)`. Confirmados por deploy:
  `IS`, `DATA`, `DATE`, `MESSAGE`. Prováveis: `TABLE`, `TYPE`, `VALUE`, `LINE`, `KEY`, `TIME`.
  ⚠️ **O "conserto" também pode ser reservado** — `DATA` virou `DATE`, que também é. Valide por deploy;
  design no papel não pega isto.
- Campos `CURR`/`QUAN` exigem campo de referência (`WAERS`/`MEINS`) declarado e
  `@Semantics.amount.currencyCode`. `DEC(n,2)` não exige nada.
- A **ordem das chaves** importa para a composition RAP que vier depois.
- Regra de comportamento (upsert por chave, sequência = max+1) **não é da tabela** — é do BDEF. O passo
  da tabela é puramente estrutural.

### `TABL/DS` — estrutura
`/sap/bc/adt/ddic/structures` · `application/vnd.sap.adt.structures.v2+xml` · source-based.
Shell `<blue:blueSource … adtcore:type="TABL/DS">` + `define structure { campo : tipo; }`.
Sem delivery class, sem chave.

⚠️ **`@AbapCatalog.enhancement.category` é OBRIGATÓRIA.** Sem ela o PUT devolve **400** com tipo
`ExceptionResourceAlreadyExists` — que é **enganoso**: a mensagem real, no corpo, é *"Kein Sichern
wegen Fehler in Quelle"* (erro de sintaxe no fonte). Descoberto comparando com o template que o
próprio create gera.

### `DOMA/DD` — domínio
`/sap/bc/adt/ddic/domains` · `application/vnd.sap.adt.domains.v2+xml` · **XML puro**.
Root `<doma:domain>` (ns `http://www.sap.com/dictionary/domain`). Tipo, tamanho, decimais e a lista de
valores fixos vão no body (`<doma:fixValues>` com `position`/`low`/`high`/`text`). Mesmo formato do
data element. Comprimentos são strings zero-padded (6 dígitos; `position` com 4).

### `DTEL/DE` — data element
`/sap/bc/adt/ddic/dataelements` · `application/vnd.sap.adt.dataelements.v2+xml` · **XML puro**.
Root `<blue:wbobj>` com `<dtel:dataElement>` dentro. `typeKind` = `predefinedAbapType` ou `domain`.

- ⚠️ O POST descarta descrição e os 4 labels — ver [gotcha transversal](#o-post-de-create-grava-só-a-parte-técnica--texto-exige-put).
- **Alterar DE usado como campo-CHAVE de tabela ATIVA exige conversão de tabela.** Campo não-chave
  (ex.: 60→150) ativa normal; campo-chave falha com `EU(899)` + `EU(886)` "Dependent table … must be
  converted". **Ativação em massa não resolve; ativação em background também não.** Só o quickfix
  *"Activate and adjust dependent objects"* (Eclipse/SE14), que passa por
  `POST /sap/bc/adt/refactorings` — e esse **exige o parâmetro `step`** (protocolo multi-etapas
  precheck/preview/execute); sem ele: `Parameter step could not be found`.
  **Como evitar:** fechar tipo e tamanho dos DEs **antes** de criar as tabelas que os usam, e checar
  quem usa o DE como chave antes de mexer.

### `DDLS/DF` — CDS view
`/sap/bc/adt/ddic/ddl/sources` · `application/vnd.sap.adt.ddlSource+xml` · source-based.
⚠️ `application/vnd.sap.adt.ddlSource.v1+xml` dá **415** — o media type é sem versão.
`define view entity` **não leva `sqlViewName`** (isso é da sintaxe antiga `define view`).

- **Projeção transacional exige Business Object.** Um `as projection on` solto falha com
  *"Transactional projection view must be part of a Business Object"*. **Criar o BDEF primeiro**,
  depois as projections.
- **Read-only não usa projection.** Para um serviço só de consulta, exponha a **interface view entity
  direto** na SRVD. Projection é para o caso de escrita.
- Projeção raiz precisa de `provider contract transactional_query` + `@Metadata.allowExtensions: true`;
  se a interface for `root view entity`, a projeção também tem que ser `define root view entity`
  (senão *"ROOT keyword missing"*).
- Filhos: `_Items : redirected to composition child <CP_filho>` na raiz e
  `_Header : redirected to parent <CP_raiz>` no filho.
- **`DISTINCT` e `GROUP BY` funcionam em view entity.** `select distinct from <view entity>` ativa
  normal, e `group by` + `max(...)` também. (Foi afirmado o contrário por excesso de confiança; o
  spike corrigiu — **não afirme suporte de feature CDS de cabeça.**)
- **Conversion exit quebra a exposição OData V4 (A2X).** Campo cujo data element tem exit
  (`J_1BCFOP`→`CFOBR`, `MATNR`→`MATN1`, `BELNR_D`→`ALPHA`) dumpa a geração do modelo
  (`CX_SADL_GW_V4_MODEL_EXCEPTION`, "Do not use conversion exit … for property …").
  Correção: `cast( campo as abap.char(n) ) as campo` **na interface view**.
  ⚠️ **Só cast para CHAR** — `UNIT`/`QUAN`/`CURR` não podem ("Ausgangstyp UNIT ist nicht unterstützt").
- Interface, projeção, behavior e ABAP são camadas distintas — não empurre conversão para a projeção
  só para compilar.

### `BDEF/BDO` — behavior definition
`/sap/bc/adt/bo/behaviordefinitions` · `application/vnd.sap.adt.blues.v1+xml` · source-based.
Shell `<blue:blueSource … adtcore:type="BDEF/BDO">`.
⚠️ Media type é o genérico **"blues"** (mesma família da estrutura). Qualquer
`vnd.sap.adt.behaviordefinitions.*` dá **415**.

- ⚠️ **O nome do BDEF É o nome da root view entity** — os dois objetos coexistem com o mesmo nome
  (`DDLS/DF` e `BDEF/BDO`). É por aí que o RAP amarra os dois. BDEF com nome próprio ativa com
  *"There is no behavior definition for `<entity>`"* + *"Type `<bdef>` is unknown"*.
- **Ativa junto da behavior pool class** (`CLASS … FOR BEHAVIOR OF <root>`), na mesma requisição:
  BDEF sozinho não ativa (falta a pool), pool sozinha não ativa (falta o BDEF).
  `managed` **não-estrito** ativa com pool **vazia** (a ativação avisa "should be strict"; é aviso,
  não erro).
- **`strict ( 2 )` exige `authorization master` em toda entidade**, e isso exige
  `GET_*_AUTHORIZATIONS` num handler local no include **CCIMP** (`implementations`) da pool.
  ⚠️ **Método vazio não basta em `authorization master ( global )`** — dumpa `UNCAUGHT_EXCEPTION` na
  leitura. Tem que **conceder**: `result-%create/%update/%delete = if_abap_behv=>auth-allowed`.
  Com `authorization master ( instance )`, um `get_instance_authorizations` vazio basta — é o caminho
  mais simples quando a feature não pede checagem global.
- **Raiz sem tabela por trás** (singleton derivado) usa `with unmanaged save`; o filho é
  `persistent table` e quem grava é o framework.
- **BDEF de projeção:** dentro de `use association _Items { … }` escreve-se `create;`, **não**
  `use create;` — o segundo é erro de sintaxe.
- **Chave gravável no create** precisa de `field ( readonly : update )`. Com `field ( readonly )` puro
  o create **ignora a chave** e grava `0`.
- **`etag master <campo>`** no BDEF faz o OData exigir `If-Match` em PATCH/DELETE — ver
  [Consumir o OData](#consumir-o-odata-v4-gerado).
- `activate ≠ publish` — publish é do service binding, não do BDEF.

### `SRVD/SRV` — service definition
`/sap/bc/adt/ddic/srvd/sources` · `application/vnd.sap.adt.ddic.srvd.v1+xml` · source-based.

- **`srvd:srvdSourceType="S"` é OBRIGATÓRIO** no shell (`S` = Definition, `X` = Extension). Sem ele:
  **400** `Service-Definitionstyp "" ist nicht vorhanden`.
- O atributo é **`srvd:srvdSourceType`**, não `sourceType` — confirmado lendo o metadata de uma SRVD
  existente.
- **Write (CRUD):** expõe as **projections**. **Read-only (query):** expõe a **interface view entity**
  direto (`expose <CE> as <Alias>;`) — sem projection, sem BDEF.

### `SRVB/SVB` — service binding + publish
`/sap/bc/adt/businessservices/bindings` ·
`application/vnd.sap.adt.businessservices.servicebinding.v2+xml` · **não é source-based**.

- **`adtcore:description` é obrigatória** no create — sem ela: **400** `Falta a descrição para <SB>`.
- **`activate ≠ publish`.** Ativar cria o binding (`allowedAction=PUBLISH`); **publicar** é
  `POST /sap/bc/adt/businessservices/odatav4/publishjobs` com **`Accept: application/vnd.sap.as+xml`**
  (outro Accept dá 406) → `published=true`, `allowedAction=UNPUBLISH`. A resposta traz `<SEVERITY>` —
  `OK` é o que confirma.
- **Escape o `&`** na uri do `objectReference` do publish como `&amp;` — `&` cru dá 400 "Fim de
  elemento esperado" (XML inválido).
- **Categoria decide tudo o que vem depois:** `0` = OData V4 **UI**, `1` = OData V4 **Web API**.
  Consumidor externo (microserviço) usa **`1`** — um binding UI (`0`) **dumpa** com
  `UNCAUGHT_EXCEPTION` no service document porque espera anotações `@UI`.
- ⚠️ **A URL de runtime depende da categoria**, e errar dá 403 "Serviço … repositório … não atribuído
  a grupo …":
  - `category 1` (Web API) → `/sap/opu/odata4/sap/<binding>/srvd_a2x/sap/<srvd>/0001/`
  - `category 0` (UI) → `/sap/opu/odata4/sap/<binding>/srvd/sap/<srvd>/0001/`
  A lib fixava `srvd_a2x` (veio de um spike onde a categoria era 1) e **quebrava calada** para UI.
  Corrigido em **2026-08-05**. Se não tiver certeza da categoria, **sonde as duas** e use a que
  responder 200 — é o que o spike faz.
- **Read-only vs escrita é o mesmo objeto de binding** — a diferença está no que a entidade exposta
  tem atrás: BO com BDEF → CRUD; view entity pura → query. O binding read-only **recusa escrita em
  runtime** (`POST → 405` "Creating operations are disabled", e o `$metadata` traz
  `Insertable/Updatable/Deletable = false`).
- **Um binding PUBLICADO não pode ser apagado.** `unpublishServiceBinding` primeiro:
  `POST /sap/bc/adt/businessservices/odatav4/unpublishjobs` (mesmo body e Accept do publish).
  Sem isso, limpar um spike de RAP só pelo Eclipse.
- **Lock órfão `EU510`** — a sequência unpublish → delete → create pode deixar ENQUEUE no nome do
  binding. Esperar ou limpar na SM12.
- Dump `CL_SADL_GW_V4_MODEL_PROPERTY` no `$metadata` = a geração do modelo engasgou numa
  propriedade/associação. Pegue o campo exato na ST22 (`GET /sap/bc/adt/runtime/dumps`, Accept
  `application/atom+xml;type=feed`; o detalhe fica sob o href `adt://<sys>/sap/bc/adt/runtime/dump/<id>`)
  **antes** de sair podando a projeção.
- Publicar/testar também pela `/IWFND/V4_ADMIN` → Publish Service Groups.

### `DDLX/EX` — metadata extension
`/sap/bc/adt/ddic/ddlx/sources` · `application/vnd.sap.adt.ddic.ddlx.v1+xml` · source-based.
Shell `<ddlx:ddlxSource … adtcore:type="DDLX/EX">` (ns `.../adt/ddic/ddlxsources`). Coleção e media
type vieram do `/sap/bc/adt/discovery` do próprio sistema (2026-08-05), não de memória. O
`annotate entity` vai no `/source/main`.

É ela que dá cara de SM30 a um app Fiori — ver [App de manutenção](#app-de-manutenção-tipo-sm30).

### `CLAS/OC` — classe (e o include de teste)
`/sap/bc/adt/oo/classes` · `application/vnd.sap.adt.oo.classes.v4+xml` · source-based.
Shell `<class:abapClass … class:category="generalObjectType">`.

⚠️ **O include `testclasses` (CCAU) é um objeto próprio (`CINC`) e só nasce JUNTO com a classe.**
A classe nasce com `definitions`, `implementations` e `macros`, mas `…/includes/testclasses` dá **404**.
Declarar no **body do POST de create**:
```xml
<class:include class:includeType="testclasses" abapsource:sourceUri="includes/testclasses"
               adtcore:name="" adtcore:type="CLAS/I"/>
```
(exige `xmlns:abapsource="http://www.sap.com/adt/abapsource"` na raiz). Depois,
`PUT …/includes/testclasses?lockHandle=<h>` com lock **na classe** e
`Content-Type: text/plain; charset=utf-8` grava o código, e **uma** ativação cobre classe + teste.
Implementado em `deployClassWithTests()`.

**O erro que despista:** tentar criar o include numa classe **já existente** devolve sempre
**500 `ExceptionResourceSaveFailure` — "Não existem versões inativas para <CLASSE>…CCAU"**. Parece
problema de ativação ou de encoding; está dizendo **que o objeto não existe** — o PUT só atualiza.
**Limitação conhecida:** classe que já existe sem o include não tem caminho REST para ganhá-lo.

**ABAP que só falha na ATIVAÇÃO** (morde ao gerar classe por script — cada um custou uma iteração):
- `RETURNING` **não aceita tipo de tabela genérico** — declare tipo concreto
  (`TYPES ty TYPE STANDARD TABLE OF x WITH EMPTY KEY`).
- Parâmetro `CHANGING` **não aceita resultado de método** — guarde em variável antes
  (`lt = build( ). call( CHANGING p = lt )`).
- **Constante `CHAR` de tamanho diferente do parâmetro formal dá erro de tipo na ativação**
  (`C3` passada para um `C4`; `char`→`string` também). A passagem de parâmetro é estrita: use **um tipo
  char único** para todos os valores do mesmo parâmetro.
- **Chamada de método dentro de Open SQL** (`UPDATE … SET campo = get_x( )`) exige sintaxe 7.40+ e
  falha com *"The elements in the SET list must be separated using commas"* onde o modo estrito não
  vale. Pré-calcule numa variável. (Se o alvo for ECC clássico 7.00–7.31, isso é regra geral: nada de
  `NEW`, `VALUE #()`, `COND`/`SWITCH`, `CORRESPONDING`/`CONV`/`CAST`, `line_exists`, `|…|`, `@` no Open
  SQL, nem method chaining — e `SELECT campos INTO TABLE lt` sobre estrutura cheia preenche **por
  posição**: use `INTO CORRESPONDING FIELDS OF TABLE`.)

### `INTF/OI` — interface
`/sap/bc/adt/oo/interfaces` · create com `application/vnd.sap.adt.oo.interfaces.v2+xml`,
**GET com `application/*`** · source-based. Shell `<intf:abapInterface … intf:modeled="false">`.

⚠️ **O media type do create não serve para o GET** — com `interfaces.v2+xml` a leitura dá **406**
(exige `v5` ou `application/*`). O objeto é criado, ativa, e **some na leitura**: parece que não foi
criado. Por isso o `TYPES` guarda `accept` separado de `ct`.
**Regra geral: ao validar um tipo novo, testar create E leitura.** Create OK não prova nada sobre o GET.

Interface não tem includes — `…/interfaces/{nome}/includes/...` dá 404. Crie a interface **antes** da
classe que a implementa.

### `MSAG/N` — classe de mensagens
`/sap/bc/adt/messageclass` · create `application/xml`, GET `application/*` · **XML puro**.
As mensagens são elementos inline `<mc:messages mc:msgno mc:msgtext mc:selfexplainatory …/>` no body.

- ⚠️ **O create prende o objeto em ENQUEUE e não existe unlock para um create.** O `lock` seguinte
  volta **403 `EU510`** "Usuário X já está processando Y". A lib tenta contornar com sessão stateless;
  **o spike mediu que não basta** — ver [Pontos abertos](#pontos-abertos).
- **Nasce ativa** — não precisa de `activate`.
- O POST **ignora** as `<mc:messages>` inline; é o PUT que grava (mesmo caso do data element).

### `PROG/P` e `PROG/I` — programa e include
`/sap/bc/adt/programs/programs` · `/sap/bc/adt/programs/includes` · source-based.

⚠️ **Alterar include de programa exige dois query params que o `setSource` genérico não manda:**
- **`context=`** — URI do programa mestre (`/sap/bc/adt/programs/programs/<report>`).
  Sem ele: `400 ExceptionParameterNotFound`.
- **`corrNr=`** — a transport request. Sem ele: `400 "Parameter corrNr wurde nicht gefunden"`.

E a **ativação tem que referenciar o INCLUDE** — é nele que fica a versão inativa depois do PUT.
Ativar só o report devolve `activationExecuted="false"` **sem mensagem nenhuma**. Ativar o par
`[include, programa]` na mesma requisição resolve.

⚠️ **`SELECTION-SCREEN … WITH FRAME TITLE <var>` já DECLARA `<var>`.** Um `DATA: <var>(80) TYPE c.`
antes do bloco aborta a ativação com `[E] "<VAR>" was already declared.` — e o report fica **criado e
inativo**. Despista porque a variável não é `text-xxx`, então parece que alguém tem que declará-la (era
assim no material antigo). **Só atribua o texto em `INITIALIZATION`.** É o caminho para tela de seleção
em português **sem text element** (que o ADT não grava): título do bloco pela variável implícita e label
de campo por `%_s_campo_%_app_%-text = '…'` no mesmo `INITIALIZATION`. Medido 2026-08-17, POC em `$TMP`.

`runUnitTests({ type:'prog', name:'<REPORT>' })` roda os testes do report inteiro — as classes de teste
ficam num include do próprio report e são executadas pelo programa. Os screens saem em
`GET …/programs/<prog>/objectstructure` (`PROG/PS <nnnn>` por dynpro).

### `FUGR/FF` — function module (RFC) — PORTADO (`deployFunctionModule`, 2026-08-26)
`/sap/bc/adt/functions/groups/<fg>/fmodules/<fm>`. A lib cria FUGR + FM RFC e ativa por
`deployFunctionModule(conexao, { group, name, source, rfc:true })`; `buildBdcWrapperSource(name)`
gera o source de um wrapper de BDC pronto (`CALL TRANSACTION`). Chamada por SOAP RFC
(`rfc-soap.callFunction`) — é o canal de **escrita para sistemas sem classrun**. Receita completa:
`jbv-adt-client/docs/receita-fm-rfc-wrapper.md`. Quatro gotchas, todos de falha silenciosa:

1. **`processingType="rfc"` do create shell é DESCARTADO** — o FM nasce `"normal"` (FMODE vazio na
   `TFDIR`) e a chamada SOAP dá `500 "kernel rc=9"` (o mesmo erro de FM não-RFC). **Só um PUT do
   METADATA com lock, antes do PUT do source, persiste o RFC.** `deployFunctionModule` já faz.
   (No create, `processingType` inválido como `"remoteEnabled"` dá `400 ExceptionInvalidData`.)
2. **A assinatura não leva ponto depois do nome:** `FUNCTION nome` **(sem ponto)** seguido de
   `IMPORTING … EXPORTING … TABLES … .` — o ponto vem só depois do **último parâmetro**. Com
   `FUNCTION nome.` os params não registram (quebra só em runtime: `CX_SY_DYN_CALL_PARAM_NOT_FOUND`).
   ⚠️ Parâmetro **TABLES declara-se com `LIKE <estrut>`**, não `STRUCTURE` — `STRUCTURE bdcdata` dá
   `400 "deklariert keinen Typen"`.
3. **Ativar pela URI do FM**, não do FUGR. Referenciando o FUGR: `activationExecuted="false"`, no-op
   silencioso. `deployFunctionModule` já ativa o FM.
4. **Lock preso após create que morreu** (403 "já está processando") libera-se por classrun com
   `ENQUEUE_READ` + `ENQUE_DELETE` **locais** — `ENQUE_DELETE` não é RFC-enabled (mesmo kernel rc=9).

**Validar sem executar:** uma classe de teste que faz `CALL FUNCTION` local roda por `runUnitTests` e
prova ativação + chamada + parâmetros, sem efeito colateral.

**Antes de chamar uma FM padrão, confira a interface na `FUPARAREF`** — é sonda read-only, cabe no
`dataPreview`:
```sql
SELECT parameter, paramtype, optional, defaultval, structure FROM fupararef WHERE funcname = '<FM>'
```
`PARAMTYPE` = `I`/`E`/`C`/`T`/`X` (⚠️ `I` no FM = **EXPORTING** na chamada).
**Obrigatório = `OPTIONAL` em branco E `DEFAULTVAL` em branco.** Faltar um deles dumpa em runtime com
`CALL_FUNCTION_PARM_MISSING` — não na ativação, e **não no ABAP Unit** se a chamada estiver atrás de um
seam dublado.

---

## RAP — a cadeia inteira

Aqui não existe "objeto simples": os elos só fazem sentido juntos, e nesta ordem.

```
domínio → data element → tabela → CDS interface (root + filhos)
        → BDEF + behavior pool (JUNTOS)  →  CDS projections  →  SRVD  →  SRVB → publish
        → DDLX (anotações de UI, quando for app Fiori)
```

### Unidades de ativação
O que se referencia mutuamente **ativa na mesma requisição**, senão cada metade reclama que falta a
outra:
- **BDEF + behavior pool** — sempre.
- **Root interface + filhos** que se referenciam por composition/association.
- **Include + programa mestre.**
- **DE + tabela** quando o DE é campo-chave (e mesmo assim [pode não bastar](#dtelde--data-element)).

### BO de composição (cabeçalho–itens)
- **Interfaces:** raiz `define root view entity … composition [0..*] of <Filho> as _Items`; filho
  `define view entity … association to parent <Raiz> as _Header on $projection.<chave> = _Header.<chave>`.
  Exponha `_Header`/`_Items` na lista de campos. Ativam todas juntas.
- **BDEF base:** `managed implementation in class <zbp> unique; strict ( 2 );` raiz com `lock master`
  + `authorization master ( global )` e `association _Items { create; }`; filhos com
  `lock dependent by _Header` e `authorization dependent by _Header`; `mapping for <tabela> corresponding;`.

### App de manutenção tipo SM30
Padrão validado 2026-08-05 (14 objetos, construído inteiro por ADT REST, sem Eclipse):

- **Por que singleton:** uma object page precisa de **uma** instância raiz para ancorar a lista
  editável. A tabela de manutenção não tem raiz natural — inventa-se uma: `key 1 as SingletonID` sobre
  `I_Language` (que sempre devolve linha), com a tabela pendurada por `left outer join … on 0 = 0` só
  para o `max( last_changed_at )` do etag total. O filho é uma **composition**, e é a lista que o
  usuário edita com create/update/delete inline. É isso que dá o comportamento de SM30.
- **Campos de administração não são enfeite:** o draft exige `local_last_changed_at` (etag da
  instância) e `last_changed_at` (etag total). **Sem eles o BDEF não ativa.**
- **Draft tables** espelham a entidade + o include `sych_bdl_draft_admin_inc`. ⚠️ Os nomes de campo vão
  **sem underscore**: seguem o nome do **elemento do CDS**, não o da tabela base.
- **`with unmanaged save`** no singleton, porque ele não tem tabela por trás.
- **`@UI.lineItem`** define as colunas da lista editável — é a "tela" da SM30.
- ⚠️ **`@UI.facet` do tipo `LINEITEM_REFERENCE`** é o que embute a lista do filho na object page do
  singleton. **Sem ele o app abre num registro raiz vazio** e a manutenção não aparece — sintoma que
  parece erro de dados e é de anotação.

**Alternativa sem RAP:** SM30 clássica é `CALL FUNCTION 'VIEW_MAINTENANCE_CALL'` (`ACTION`/`VIEW_NAME`,
os únicos obrigatórios — confira no FUPARAREF antes) dentro de um report, com a transação apontando
para ele na SE93. O ADT entrega o report; o SE93 e o gerador SE54 são manuais.

---

## Consumir o OData V4 gerado

Ativar e publicar **não prova que o serviço responde**. Estes são os gotchas de runtime — todos
medidos batendo no serviço, não deduzidos.

### ⚠️ O runtime OData ROTACIONA o cookie de sessão a cada resposta
Quem guardar o cookie antigo leva **400 "Session Timed Out or Not Found"** na chamada seguinte.
**Não é** o header stateful — esse diagnóstico errado custou três tentativas. Consequências práticas:
- **Um pote de cookie só por processo.** Se o cliente OData e o `call()` do ADT coexistirem com potes
  separados, o segundo fica velho na primeira chamada e todo o resto morre.
- O cookie do `.sessao.json` **fica velho assim que a primeira chamada OData sai** — grave o novo de
  volta a cada resposta, ou mantenha a bateria toda dentro de um único processo.

### Token CSRF é DO SERVIÇO — o do ADT não vale
`/sap/opu/` exige o próprio: `GET` na raiz do serviço com `X-CSRF-Token: Fetch`, ler o header
`x-csrf-token` + cookies, mandar os dois em POST/PATCH/DELETE. Sem isso: **403 "CSRF token validation
failed"**.

### `$metadata` é XML
Com `Accept: application/json` o serviço devolve **406** — numa sonda de URL isso vira **falso
negativo** ("o serviço não existe" quando ele está lá).

### O ciclo de draft
RAP `with draft` **não aceita POST/PATCH/DELETE na instância ativa**. Tudo passa por rascunho:
```
Edit (ativa → rascunho) → altera o rascunho → Activate (rascunho → ativa)
```
- A **chave carrega o estado**: `(Codigo='X',IsActiveEntity=false)` é o rascunho, `true` é o ativo.
- As ações vêm no namespace **`SAP__self`** (alias publicado no `$metadata`); o nome completo é
  `com.sap.gateway.srvd.<srvd>.v0001.<Ação>`, e aparece no corpo do GET do singleton.
- ⚠️ **`Edit` tem parâmetro OBRIGATÓRIO `PreserveChanges`** — sem ele, **400** "Kein Wert für
  obligatorischen Parameter". `false` descarta rascunho pendente de outra sessão.
- ⚠️ **PATCH/DELETE exigem `If-Match`** (senão **428** "a requisição tem que ser condicional") quando o
  BDEF declara `etag master <campo>`. `*` serve num teste; num cliente real vai o etag lido no GET.

### Outros
- **Nomes de propriedade EDM = os nomes dos elementos do CDS, como estão** (minúsculo se o CDS estiver
  minúsculo).
- **`Edm.Decimal` tem que ser número JSON**, não string: `"cbs": 11.11`, nunca `"11.11"`.
- Round-trip completo já provado: CREATE 201 · READ 200 · PATCH 200 · DELETE 204.

---

## Verificação e diagnóstico

### ABAP Unit — o bloco `<options>` é obrigatório
`POST /sap/bc/adt/abapunit/testruns`, CT `…abapunit.testruns.config.v4+xml`,
**Accept `…abapunit.testruns.result.v2+xml`** (outro Accept: 406).

⚠️ **Sem o bloco `<options>` o servidor devolve 200 com `<aunit:runResult/>` vazio** — nenhum teste
executado, nenhum erro. Parece "0 testes encontrados"; é o filtro default excluindo tudo. É o pior modo
de falha possível: **verde por não-execução.**
```xml
<options>
  <uriType value="semantic"/>
  <testDeterminationStrategy sameProgram="true" assignedTests="false" appendAssignedTestsPreview="true"/>
  <testRiskLevels harmless="true" dangerous="true" critical="true"/>
  <testDurations short="true" medium="true" long="true"/>
</options>
```
O `objectSet` aponta para a **classe** (`/sap/bc/adt/oo/classes/<nome>`); apontar para o include
`testclasses` também devolve vazio.
**`executed === 0` nunca é sucesso** — afirme a contagem de testes, não só a ausência de falha.

Ler o resultado: `<testMethod>` sem `<alerts>` passou; com `<alert kind="failedAssertion">` falhou, e o
alerta traz título, `Previsto [x], real [y]` e um `<stackEntry>` com arquivo e linha.
⚠️ Ao fazer parse: use regex **lazy**. Com `[^>]*` guloso, um `<testMethod/>` auto-fechado (método que
passou) engole o `/` e funde com o `</testMethod>` seguinte — **subcontando** os testes.

⚠️ **Teste verde num seam dublado NÃO valida a chamada externa.** Um método que embrulha
`CALL FUNCTION` costuma ser redefinido no teste justamente para não chamar o FM real — então 7/7 podem
passar com a chamada errada, e o defeito só aparece na execução real. O conector **não executa** FM nem
report, então essa metade fica de fora por desenho.
**O que fecha a lacuna:** conferência estática da interface na [`FUPARAREF`](#fugrff--function-module-rfc--portado-deployfunctionmodule-2026-08-26),
ou execução real por um humano. Não confie só no ABAP Unit para o que está atrás de um seam.

### Cobertura — lê-se com POST
Rodar com `<coverage active="true"/>` no `runConfiguration` devolve
`<coverage adtcore:uri="/sap/bc/adt/runtime/traces/coverage/measurements/<id>"/>`.
**Essa URI responde a `POST`** (com `<cov:query>`, ns `http://www.sap.com/adt/cov`, informando o
`objectSets` do alvo); o **`GET` dá 405** — e é isso que despista, porque 405 lido como "recurso
inacessível" custa várias tentativas.
Resposta: `<cov:result>` com `<node>` por objeto e `<coverage type="statement|branch|procedure"
total= executed=/>`; o percentual é `executed/total`. Links úteis: `…/results/<id>/statements` (linha a
linha) e `…/measurements/<id>/coveredobjects`.
⚠️ **Não está no `discovery`.** O grafo de compatibilidade (`GET /sap/bc/adt/compatibility/graph`)
confirma a capacidade `COM.SAP.ADT.COVERAGE`, mas lista capacidades, não URIs.

### ATC
```
POST /sap/bc/adt/atc/worklists?checkVariant=DEFAULT   → worklistId em text/plain (body vazio)
POST /sap/bc/adt/atc/runs?worklistId=<id>             → body <atc:run> com adtcore:objectSets
GET  /sap/bc/adt/atc/worklists/<id>                   → Accept: application/atc.worklist.v1+xml
```
A variante padrão vem de `GET /sap/bc/adt/atc/customizing` (`systemCheckVariant`).
⚠️ `GET /sap/bc/adt/atc/variants` devolve **lista vazia** mesmo havendo variantes — não usar como fonte.
Cada `<atcfinding:finding>` traz `priority` (1 grave … 3 brando), `checkTitle`, `messageTitle` e
`location`.
Objeto **novo**: resolver todos os findings. Objeto **alterado**: rodar antes (baseline) e depois,
corrigir só o que a mudança introduziu.

### Ler dados sem criar objeto
`POST /sap/bc/adt/datapreview/freestyle?rowNumber=<n>` com o SELECT em `text/plain`, **Accept
`application/vnd.sap.adt.datapreview.table.v1+xml`** (com `application/xml` dá 406). Resposta
column-oriented: `<dataPreview:metadata name="COL"/>` + N `<dataPreview:data>`. Serve para conferir se
uma tabela/CDS tem dado para um filtro **sem criar nada**.
`dataPreview()` recusa qualquer coisa que não seja `SELECT`/`WITH`.

Em `SELECT … FROM (cds)` com FROM dinâmico o WHERE **não é checado na ativação** (o nome só resolve em
runtime) e a CDS expõe o **elemento** (`IdRelatorio`), não a coluna base (`id_relatorio`) — filtrar
pela coluna base dá dump "campo desconhecido" em runtime.

### Objetos inativos e ativação em background
`GET /sap/bc/adt/activation/inactiveobjects` lista tudo que está inativo no sistema — usar depois de um
lote; vazio significa nada pendente.
`POST /sap/bc/adt/activation/runs` é ativação em **background** (201 + `Location`; o GET dá
`status="finished"` e link para `/activation/results/<id>`). Mesma semântica da síncrona: **não** faz
"adjust dependent objects".

### Versões: o modelo do SAP e o do ADT não coincidem
**Ler** funciona: `GET …/includes/{parte}/versions` com `Accept: application/atom+xml;type=feed`
(com `application/*` dá 406 — e 406 ≠ 404).
**Criar** versão não é exposto pelo ADT.
⚠️ O SAP versiona a classe **por seção** (`CPUB`/`CPRO`/`CPRI`) + includes (`CINC`); o ADT expõe
`source/main` (as três juntas) + `includes/*`. Uma versão gerada na área pública **não aparece em
nenhum `…/versions`** — todos respondem 200 com feed vazio mesmo havendo versão na SE80.
**Feed vazio não prova ausência de versão.** A URI de versão de interface não foi mapeada.

### Dumps
`GET /sap/bc/adt/runtime/dumps`, `Accept: application/atom+xml;type=feed`; o detalhe fica sob o href
`adt://<sys>/sap/bc/adt/runtime/dump/<id>`. É por aí que se pega o campo exato que fez a geração do
modelo OData estourar — antes de sair podando projeção no escuro.

---

## Divergências resolvidas

Registro do que já foi afirmado como fato e depois **medido ao contrário**. Existe para não voltar.

| O que se dizia | O que foi medido | Quando |
|---|---|---|
| `activate` exige sessão NOVA, senão "currently editing" | Não exige. A mesma sessão cacheada ativa (200, `executed=true`, `version: active`). O que morde é o **lock**, e o `unlock` no `finally` já resolve. Vale para todos os tipos **menos o create de MSAG**. | 2026-08-05 |
| URL de runtime OData V4 é sempre `srvd_a2x` | Depende da **categoria**: `1`→`srvd_a2x`, `0`→`srvd`. O valor fixo vinha de um spike com categoria 1 e quebrava calado para UI (403). | 2026-08-05 |
| O "400 Session Timed Out" do OData é o header stateful | É o **cookie rotacionado a cada resposta**. Três tentativas perdidas no diagnóstico errado. | 2026-08-05 |
| O 500 no include `testclasses` é problema de `charset` / de ordem de ativação | Ambas erradas, custaram 7 tentativas. A causa é o `<class:include>` faltando **no create** — a classe já existia sem ele. | — |
| CDS view entity não aceita `DISTINCT` | Aceita. `select distinct` e `group by`/`max()` ativam normal. Erro por excesso de confiança; o spike corrigiu. | 2026-07-28 |
| `parseUnitResult` contava certo | Regex gulosa fundia `<testMethod/>` auto-fechado com o `</testMethod>` seguinte, **subcontando** testes que passaram. Corrigido para lazy. | — |
| Domínio, estrutura e table type não dão para criar por ADT | Domínio e estrutura foram validados e estão no `TYPES`. **Table type (`TTYP`) segue sem spike** — a lacuna é só essa. | 2026-07-27 |

**A lição comum:** a afirmação antiga sempre tinha uma explicação plausível. Só a medição derrubou.
Quando esta skill contradisser um comentário do código, **a medição mais recente ganha** — e o
comentário tem que ser corrigido junto.

---

## Pontos abertos

Coisas que a fonte não resolve. **Não afirme nenhuma delas como fato.**

### MSAG: stateless resolve o ENQUEUE do create?
- `lib/adt-client.mjs` afirma que **sim** — `deployMessageClass` cria numa sessão 100% stateless
  justamente para o servidor não prender o objeto em edição.
- `spike-adt.mjs` mediu que **não**: com a sessão do `connect` (só cookie), o `createShell` do MSAG
  prende ENQUEUE, não existe unlock para um create, e o `lock` seguinte volta **403 `EU510`**.
  `sessaoStateless()` não salva porque clonar o cookie mantém a **mesma sessão SAP**, que é stateful.
  Só um **logon novo** (ou seja, senha em mãos) resolveu.

**Provável:** stateless funciona quando a conexão tem senha e pode abrir logon próprio, e falha quando
só há o cookie do `connect`. **Não confirmado.** Quem for mexer em MSAG: meça primeiro, e resolva esta
entrada.

### `TTYP` (table type) nunca foi spikado
É a única lacuna de DDIC. O caminho: read-probe de um standard (`BAPIRET2_T`) para descobrir coleção,
media type e schema, POC em `$TMP`, portar.

---

## Validar um tipo novo

Ordem fixa, sem pular etapa:

1. **`GET /sap/bc/adt/discovery`** e ache o `<app:collection>` do tipo. Os `<app:accept>` dele são a
   fonte autoritativa do media type. Não vá de memória nem de blog.
2. **Leia um objeto PADRÃO do mesmo tipo** que já funciona, e use o XML dele como molde. Diff contra
   objeto real bate adivinhação sempre.
3. **Spike em `$TMP`**, com **nome POC descartável** — nunca o nome definitivo
   ([por quê](#tmp-e-nomes-poc)) — num script `spike-*.mjs` separado.
4. **Create, leitura, ativação e delete**, os quatro. Create OK não prova o GET (ver `INTF`), e
   ativação OK não prova a leitura.
5. **Acrescente o `TYPE` em `lib/adt-client.mjs`** com um comentário `SPIKE <data>` e o que foi medido.
6. **Escreva a receita aqui**, com os gotchas que apareceram — inclusive os que você resolveu rápido.
7. **Entre no ledger** como validado, com a data.

Se um passo falhar e você não souber por quê: repita com `--debug` e leia o **status HTTP** e o **corpo
inteiro** antes de formular hipótese. 403, 406, 415 e 404 são indistinguíveis pela mensagem, e o tipo
da exceção no 400 [pode mentir](#a-mensagem-do-400-pode-apontar-para-o-lugar-errado).

---

## Manutenção — como esta skill cresce

**Esta seção é a razão de a skill existir.** Conhecimento de ADT que fica em comentário de código não é
encontrável por quem não está lendo aquela função — foi assim que a regra errada do `activate`
sobreviveu meses.

### Quando registrar
Registre quando **qualquer** destes acontecer:
- um create/activate/publish custou **mais de uma tentativa** para funcionar;
- o erro apontava para um lugar e a causa era outra (é o caso mais valioso);
- algo **falhou em silêncio** — 200 vazio, `executed=true` com erro, POST que ignora campo,
  `activationExecuted="false"` sem mensagem;
- você mediu algo que **contradiz** o que esta skill ou um comentário do código afirma;
- um tipo novo passou pelo spike;
- você descobriu que o ADT **não** faz algo (vai para [a fronteira](#o-que-o-adt-rest-não-faz) — vale
  tanto quanto uma receita).

### Onde vai cada coisa

| O aprendizado é… | Vai para |
|---|---|
| específico de um tipo de objeto | a receita daquele tipo, em [Receitas por tipo](#receitas-por-tipo) |
| válido para qualquer tipo | [Gotchas transversais](#gotchas-transversais) |
| sobre o que o ADT não consegue fazer | [O que o ADT REST não faz](#o-que-o-adt-rest-não-faz) |
| sobre o serviço já publicado respondendo | [Consumir o OData](#consumir-o-odata-v4-gerado) |
| a correção de algo que esta skill afirmava | [Divergências resolvidas](#divergências-resolvidas) **e** a correção no lugar original |
| contradição não resolvida entre duas fontes | [Pontos abertos](#pontos-abertos) — nunca escolha um lado sem medir |
| um tipo novo validado | [Ledger](#ledger-de-tipos) + receita + `TYPES` na lib |
| sobre sessão, cookie, token, 401 | `lib/sap-connection.mjs` — não é desta skill |
| sobre usar o CLI (`connect`/`list`/`checkout`) | a skill `abapgit`, não esta |
| executar/provar comportamento (classrun, SOAP RFC, ciclo arrange→act→assert, BDC) | a skill `sap-testes` + receitas em `jbv-adt-client/docs/` |
| design ABAP, padrão OO, técnica de UI | não é desta skill |

### Como escrever a entrada
Quatro coisas, nesta ordem — e o formato não é enfeite, cada parte responde a uma pergunta que você vai
ter às 18h de uma sexta:

1. **Título afirmativo** — o fato, não o sintoma. "O create de MSAG prende ENQUEUE", não "problema com
   MSAG".
2. **O que acontece** — o erro exato: código HTTP, código de mensagem SAP (`DT(205)`, `EU(886)`,
   `EU510`), texto literal. É por isso que se acha depois, com `grep`.
3. **Por que despista** — para que erro isso *parece* apontar. Esta linha é a que economiza tempo;
   sem ela a entrada é só documentação.
4. **O que fazer** — a correção, e onde ela está implementada na lib.

Com a **data da medição** e o **contexto** (release, mandante, POC em `$TMP`) quando for medição nova.
**Sem nome de objeto, sistema ou cliente real** — este repositório tem remote público. POC descartável
em `$TMP` com nome genérico é suficiente e não vaza nada.

### Manter em sincronia
Alteração aqui que mude comportamento **tem que mudar o código junto** — `TYPES`, o `deploy*`
correspondente, ou o comentário que ficou errado. Skill e lib divergindo é como a regra do `activate`
sobreviveu: o código já fazia certo, a documentação continuava mandando errado.
