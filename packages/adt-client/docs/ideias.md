# Ideias do arsenal

Brainstorm do adt-client — o estágio **antes** da fila. Uma ideia aqui não é compromisso: é
uma hipótese registrada para não se perder, revisada quando houver tempo ou necessidade. Nada
nesta lista foi medido; tudo o que está aqui é plausibilidade, não fato.

Operada pela skill `/todo`: `ideia <texto>` acrescenta, `promover I<n>` move para a
`fila.md` como item de trabalho, `status` mostra a contagem.

Formato: `- [ ] I<n>. Título — hipótese. **Provaria:** o que muda se der certo.
**Medir:** a POC mínima.` Estado em nota `>` sob o item: `> promovida: fila N (data)` ou
`> descartada: <motivo> (data)`. Ideia promovida ou descartada fica aqui, marcada — é histórico.

## Cobertura de objetos (ADT REST)

- [x] I1. Table type (TTYP) como módulo `tipos/tableType.mjs` — o README já aponta a lacuna.
  **Pesquisado 2026-08-28** (`docs/pesquisa-tipos-adt-nao-cobertos.md`): nenhum cliente ADT open
  source cria TTYP; só aparece como `TTYP/DA`/`TTYP/TT` sob o wrapper `/vit/` — pode ser que não
  haja coleção nativa. **Provaria:** tabelas internas tipadas sem passar pelo Eclipse. **Medir:**
  `node scripts/spike-discovery.mjs s4h` (existe coleção `ddic/tabletypes`?) e, se existir,
  `spike-discovery.mjs s4h TTYP/DA STRING_TABLE` para o XML; create + activate no `$TMP`.
  > medido 2026-08-28 (discovery do s4h 758): EXISTE `/sap/bc/adt/ddic/tabletypes` (+ `/validation`). Próximo: `spike-discovery.mjs s4h TTYP/DA STRING_TABLE`.
  > promovida: fila 8 (2026-08-28)
- [x] I2. Outros tipos DDIC de dia a dia — search help (SHLP/DH), lock object (ENQU/DL), view
  clássica (VIEW/DV). **Pesquisado 2026-08-28:** sem coleção nativa em código de cliente; ENQU é
  marcado *unsupported* pelo vscode_abap_remote_fs (só `/vit/`); `ddic/views/{name}` só em doc de
  terceiro, leitura. Hipótese forte de que sejam "só SE11". **Provaria:** um pacote Z inteiro
  criado pela lib. **Medir:** o discovery do s4h decide; só entra no registro o que ativar.
  > medido 2026-08-28 (discovery do s4h 758): EXISTEM `/sap/bc/adt/ddic/lockobjects/sources` (+ lockmodes, tables, adjustment, validation) e `/sap/bc/adt/ddic/views` (+ `$validation`); NÃO existe `ddic/searchhelps` — SHLP fica como "só SE11" até prova em contrário.
  > promovida: fila 12 (2026-08-28)
  > MEDIDO 2026-08-29 (S4H 758) → módulo `tipos/lockObject.mjs` (ENQU/DL cria, altera, ativação gera
  > os FMs). VIEW clássica NÃO: `ddic/views` é a view EXTERNA (HANA) — GET de qualquer view D/C/E
  > dumpa (`ASSERTION_FAILED` em `CL_DDIC_WB_XVIEW_PERSIST`), o POST exige `qualifiedHanaViewName`.
  > SHLP sem coleção. Os dois ficam "só SE11"; detalhe em `pesquisa-tipos-adt-nao-cobertos.md § ENQU e VIEW`.
- [x] I3. Transport request por ADT (`/sap/bc/adt/cts/transportrequests`) — criar TR/task,
  listar as minhas, ler o que está dentro. Hoje `corrNr` é só um parâmetro que o chamador
  precisa saber. **Provaria:** entrega fora do `$TMP` sem abrir a SE09. **Medir:** listar TRs
  do usuário no s4h; depois criar uma e usar o número num `deploySource`.
  > promovida: fila 24 (2026-08-29)

- [x] I14. DCLS — access control (`DCLS/DL`) como `tipos/accessControl.mjs`. **Pesquisado
  2026-08-28:** criável por POST em `acm/dcl/sources` (abap-adt-api L447-454; sapcli
  `objects.py` L1564), source-based, Accept `dclSource+xml`, guia SAP ≥ 7.40 SP10. É o único
  pedaço RAP que falta (CDS sem DCL exige `@AccessControl.authorizationCheck: #NOT_REQUIRED`).
  **Provaria:** superfície RAP com autorização, 100% pela lib. **Medir:** discovery do s4h →
  GET de uma DCL padrão → create no `$TMP` com `define role … grant select on … where …`.
  > medido 2026-08-28 (discovery do s4h 758): EXISTE `/sap/bc/adt/acm/dcl/sources`.
  > promovida: fila 9 (2026-08-28)
- [x] I15. DEVC — pacote (`DEVC/K`) como `tipos/package.mjs`. **Pesquisado 2026-08-28:** criável
  por POST em `packages` (abap-adt-api L473-481, sapcli `package.py`), XML-body `pak:package`
  com superPackage/softwareComponent/transportLayer, validação em `packages/validation`; sapcli
  cria só pacotes não-transportáveis. Fecha a linha "pacote Z transportável (SE21): manual" da
  skill. **Provaria:** nome definitivo nascendo no pacote certo (a regra `$TMP` do projeto existe
  porque o ADT não move). **Medir:** create de `$Y…` local no s4h; depois um transportável com
  `corrNr`, e conferir `pak:recordChanges`.
  > medido 2026-08-28 (discovery do s4h 758): EXISTEM `/sap/bc/adt/packages`, `/packages/validation`, `/packages/settings`.
  > promovida: fila 10 (2026-08-28) → módulo `tipos/package.mjs`, medido no s4h 758 em 2026-08-28.
  > Hipótese confirmada (POST em `packages`, `pak:package`, validação existe) com dois desvios: o
  > create exige `packages.v2+xml` (o v1 dá 415) e `adtcore:responsible` MAIÚSCULO; e o transportável
  > cria SEM `corrNr` — o SAP gera a TR sozinho.
- [x] I16. FUGR/I — include de grupo de funções, no módulo `functionModule` existente (mesmo
  contêiner, `path` aninhado `groups/<fg>/includes/<inc>`). **Pesquisado 2026-08-28:** criável
  (abap-adt-api L428-436, `maxLen: 3`; sapcli `function.py` L429), source-based. **Provaria:**
  FUGR completo pela lib (TOP include, includes de forms). **Medir:** create `L<FG>TOP`-like no
  `$TMP`; conferir se o nome é só o sufixo de 3 chars.
  > medido 2026-08-28 (discovery do s4h 758): EXISTE `/sap/bc/adt/functions/groups` (o include é sub-recurso; a coleção `…/<fg>/includes` não aparece no discovery — é por typestructure/nodestructure).
  > promovida: fila 11 (2026-08-28)
  > MEDIDO 2026-08-29 (S4H 758) → módulo `tipos/functionGroupInclude.mjs`. A hipótese do sub-recurso
  > estava certa; o `maxLen: 3` do abap-adt-api NÃO: o nome é COMPLETO (L<GRUPO><SUFIXO>), o create é
  > `fincludes.v2+xml`, e o pool `SAPL<GRUPO>` precisa ativar junto (a linha INCLUDE fica na versão
  > inativa). Ver item 11 da fila.
- [x] I17. AUTH + SUSO — campo e objeto de autorização (`aps/iam/auth`, `aps/iam/suso`).
  **Pesquisado 2026-08-28:** criáveis por POST (abap-adt-api L501-518), XML-body, `maxLen: 10`;
  sapcli não altera AUTH. Release mínimo desconhecido (`aps/iam/*` não está na tabela 7.57 do
  guia SAP). **Provaria:** AUTHORITY-CHECK em código entregue com objeto criado pela lib.
  **Medir:** existe `aps/iam/*` no discovery do s4h (758)? e do SXD (816)? Depois create no `$TMP`.
  > medido 2026-08-28 (discovery do s4h 758): EXISTEM `/sap/bc/adt/aps/iam/auth` e `/aps/iam/suso` (com validation e value helps) — release 758 tem `aps/iam/*`.
  > promovida: fila 13 (2026-08-28)
  > MEDIDO 2026-08-29 (S4H 758) → módulos `tipos/authorizationField.mjs` e `tipos/authorizationObject.mjs`.
  > Criam e **alteram** (o `sapcli` diz que AUTH não altera — desmentido). O `maxLen: 10` do
  > abap-adt-api não é do create do AUTH (AUTHX é CHAR 30, o create aceita 11) e sim da TOBJ-FIEL*.
  > O "Provaria" da ideia — AUTHORITY-CHECK — NÃO serve de prova sozinho: sem perfil, objeto criado e
  > objeto inexistente dão os dois subrc=12. A prova pelo efeito saiu com usuário de referência
  > descartável + perfil manual (0 autorizado / 4 fora). Ver item 13 da fila.
- [x] I18. TRAN/T — transação por `POST /sap/bc/adt/aps/iam/tran` (**desmente** a skill
  `adt-objetos`, que diz "impossível por ADT REST, só `/vit/`"). **Pesquisado 2026-08-28:**
  sapcli `transaction.py` L164-329 cria com `blue:blueSource` + JSON base64 em
  `additionalCreationProperties` (`transactionType`, `reportName`, `programName`, `className`,
  `methodName`, `updateMode`); fixture aparenta tráfego real, **release não informado**.
  **Provaria:** a linha "SE93 manual" sai da tabela do que o ADT não faz. **Medir:** discovery do
  s4h tem `aps/iam/tran`? GET de uma transação padrão (`SE93`?) com Accept `blues.v2+xml`;
  create de `YJBV_POC_T` report transaction no `$TMP`. Só depois corrigir a skill.
  > medido 2026-08-28 (discovery do s4h 758): NÃO EXISTE `/sap/bc/adt/aps/iam/tran` no s4h 758 — a via do sapcli é de release mais novo; a afirmação da skill ("impossível por ADT REST") CONTINUA VALENDO para 758. Medir de novo no SXD 816.
  > TADIR s4h 2026-08-29: **1.254** TRAN custom (fora do `$TMP`) — o 4º tipo não coberto. Ver `docs/cobertura-tadir.md`.
  > promovida: fila 18 (2026-08-29)
- [x] I19. XSLT/VT (simple transformation) e ENHO/ENHS (enhancement) — **só leitura/PUT**
  encontrados (pesquisa 2026-08-28): XSLT via `sourceUri` do nodestructure, ENHO por PUT de
  propriedades (`enh.enhoxhb.v4+xml`), nenhum create em cliente algum. **Provaria:** alterar
  BAdI implementation / ST existente pela lib. **Medir:** discovery + GET de um objeto padrão;
  create fica como hipótese fraca.
  > medido 2026-08-28 (discovery do s4h 758): EXISTEM `/sap/bc/adt/xslt/transformations` e `/sap/bc/adt/enhancements/{enhoxh,enhoxhb,enhoxhh,enhsxs,enhsxsb}` (+ validation, `enhsxsb/search`).
  > TADIR s4h 2026-08-29: ENHO 113 · XSLT 9 · ENHS 6 · ENHC 1 custom. Ver `docs/cobertura-tadir.md`.
  > promovida: fila 20 (2026-08-29)
  > MEDIDO 2026-08-30 (S4H 758). A "hipótese fraca" de create se dividiu: **XSLT cria pelo ADT** (POST em
  > `xslt/transformations`, os dois subtipos — a pesquisa estava errada) → `tipos/transformation.mjs`; **ENHO não
  > cria pelo ADT** (400 `I::000` + órfã só-TADIR, três variantes de XML) mas lê, altera por PUT e apaga — o
  > create é pela API `cl_enh_factory` em driver → `enho.mjs`. ENHS/hook/CLASENH seguem só leitura. O "Provaria"
  > (alterar BAdI implementation / ST existente pela lib) saiu inteiro. Ver item 20 e `docs/receita-xslt-enho.md`.
- [x] I20. Segunda sonda no `spike-discovery.mjs`: `POST /sap/bc/adt/repository/typestructure`
  (abap-adt-api L234-248) devolve `SEU_ADT_OBJECT_TYPE_DESCRIPTOR` com `CAPABILITIES`,
  `URI_TEMPLATE`, `OBJNAME_MAXLENGTH` — diz o que é criável e o limite de nome por tipo, sem
  adivinhar. **Provaria:** `nomeacao.max` medido para todos os tipos de uma vez. **Medir:** o
  formato do body do POST (ler o código do abap-adt-api); rodar no s4h.

  > promovida: fila 26 (2026-08-29)
  > MEDIDO 2026-08-31 (S4H 758) → modo `--tipos` do spike-discovery. O body é VAZIO (mais simples que a
  > hipótese). O "Provaria" saiu (6 correções de nomeacao.max nos módulos), mas o "diz o que é criável"
  > NÃO: CAPABILITIES é capacidade do workbench clássico, nem necessária nem suficiente para o ADT REST.
  > Ver item 26.
- [x] I21. BRF+ — aplicação, função, ruleset, decision table, pela **anatomia da change request**
  (I23), não por create ADT. Hipótese: não há coleção ADT (o repositório FDT é API ABAP,
  `cl_fdt_factory`; a workbench é Web Dynpro) — mas um objeto BRF+ **existente** que já esteja
  numa TR revela suas peças: entradas de objeto e, se o transporte for por chave, as linhas das
  tabelas `FDT*`. **Provaria:** reprodução de regra de negócio entre sistemas sem workbench e
  sem depender de create ADT — e, antes disso, a resposta a "o que exatamente compõe uma
  aplicação BRF+". **Medir:** (1) achar no s4h uma TR (ou objeto em TADIR) com BRF+ — código de
  tipo **a confirmar**; (2) I23 sobre ela: o que vai na request, objeto inteiro ou chaves?
  (3) ler as tabelas apontadas por readTable; (4) só então decidir a escrita — driver classrun
  pela API FDT, ou nada (fica como leitura/diff).
  > TADIR s4h 2026-08-29: FDT0 306 / BRF0 42 na TADIR inteira, **zero** no recorte Z/Y — o nome é GUID; medir por `DEVCLASS`/`AUTHOR`. Ver `docs/cobertura-tadir.md`.
  > promovida: fila 23 (2026-08-29)
  > MEDIDO 2026-08-30 (S4H 758) → `docs/receita-brfplus.md`. Dois palpites caíram: o nome do FDT0 é o NOME
  > da aplicação (não GUID; a ponte nome→GUID é a `FDT_APPL_TADIR`), e o custom do s4h não está "escondido
  > na TADIR" — está FORA dela (via customizing `TDAT FDT0000`, mandante-dependente; 26 apps de MV*/YCANO
  > só na `FDT_ADMN_0000`). O "Provaria" saiu: composição medida (app com 76 objetos) e chaves fatiadas
  > completas pelo item 21. Escrita: fora — virou I33. Ver item 23.
- [x] I22. Adobe Forms — form e interface (SFP), mesma via: **o que a TR carrega** de um form
  existente. Hipótese: create por ADT REST é improvável (o layout é XFA/XDP do LiveCycle,
  editado fora do ABAP); a TR é o caminho para saber onde o form mora de fato. **Duas provas
  independentes, nenhuma exige criar:** (a) anatomia pela TR + leitura das tabelas → diff do
  mesmo form entre dois sistemas; (b) **renderização como assert** — `FP_FUNCTION_MODULE_NAME`
  devolve a FM gerada e `FP_JOB_OPEN` → FM → `FP_JOB_CLOSE` num driver classrun rende o PDF como
  xstring (assert em `%PDF`, tamanho, e texto se der). **Provaria:** "o formulário entregue
  renderiza e traz os campos certos?" sem abrir a SFP nem imprimir. **Medir:** códigos de tipo
  (`SFPF`/`SFPI`) **a confirmar** em TADIR; um form padrão do s4h para o ciclo FP_JOB_*; e I23
  sobre uma TR que contenha form. Mesma pergunta vale para Smart Forms (SSFO), com
  `SSF_FUNCTION_MODULE_NAME`.
  > TADIR s4h 2026-08-29: SSFO 67 · SFPF 46 · SFPI 38 · SSST 37 custom — os códigos "a confirmar" estão confirmados. Ver `docs/cobertura-tadir.md`.
  > promovida: fila 19 (2026-08-29)
  > MEDIDO 2026-08-30 (S4H 758) → módulo `forms.mjs`. A prova (b) saiu inteira para Smart Form (SF_EXAMPLE_01 →
  > PDF `%PDF-1.3` de 13.235 bytes + texto por CONVERT_OTF ASCII, sem ADS) e até o ADS para Adobe (interface
  > legível em FPINTERFACE, FP_JOB_OPEN ok, o ADS do s4h não responde). A prova (a) ficou pela metade: os códigos
  > SSFO/SFPF/SFPI confirmados e as tabelas mapeadas, mas o s4h não tem TR de desenvolvimento com form Z — só a
  > `SAPKCCD758` (cópia de cliente). Ver item 19 da fila e `docs/receita-forms.md`.
- [x] I23. **Anatomia de objeto pela change request** — ler o que uma TR registra e usar como
  mapa de reprodução. É a sonda que I21, I22 e qualquer tipo sem coleção ADT consomem. Hipótese
  (não medida): o cabeçalho e as entradas de objeto da TR (`E070`/`E071`: PGMID/OBJECT/OBJ_NAME)
  dizem *quais* objetos, e as entradas de chave (`E071K`) dizem *quais linhas de quais tabelas* —
  para tipos que transportam por chave (customizing, e possivelmente BRF+), isso é a receita
  completa do objeto. **Provaria:** um caminho de reprodução que não depende de o ADT expor o
  tipo — e um diff "o que está na TR" × "o que está no sistema-alvo". **Medir:** (1) escolher no
  s4h uma TR com objetos conhecidos (uma das nossas, do item 10) e ler `E070`/`E071`/`E071K` por
  readTable — os canais já existem; (2) conferir se as chaves batem com as tabelas que sabemos
  que o objeto usa; (3) repetir com um objeto de tipo não coberto pela lib; (4) avaliar se vale
  ir ao **datafile/cofile** (`/usr/sap/trans/data`, R3trans) — conteúdo exportado de verdade,
  mas exige acesso ao filesystem do servidor: decisão à parte, não entra sem o Joris mandar.
  Conversa com I3 (criar/ler TR por `cts/transportrequests`), que continua aberta.
  > promovida: fila 14 (2026-08-29) — fechada no mesmo dia: `cts.mjs` + `docs/receita-change-request.md`.
  > A leitura por `cts/transportrequests` foi medida junto e entrou na lib; a ESCRITA (criar TR,
  > incluir objeto pelo corrNr, apagar/desmanchar) fechou na fila 24 (2026-08-31) — liberar segue fora.

- [x] I24. **Priorizar a cobertura pela TADIR** — parar de escolher o próximo tipo por palpite e
  perguntar ao sistema quais tipos existem em maior número, cruzando com o que a lib já cobre.
  Ressalva de leitura: a TADIR mede **quantos objetos daquele tipo existem**, não uso em runtime —
  é proxy de "o que se cria por aqui", não de "o que se executa". Vale mais no **sistema de
  cliente** (SXD 816) que no laboratório: é lá que a distribuição é real. **Provaria:** a ordem da
  fila deixa de ser opinião — e uma lacuna que ninguém notou pode aparecer no topo. **Medir:**
  driver classrun com `SELECT object, COUNT(*) FROM tadir GROUP BY object ORDER BY 2 DESCENDING`
  (readTable não agrega), em três recortes: (a) tudo; (b) só custom — `obj_name LIKE 'Z%' OR 'Y%'`,
  `devclass <> '$TMP'`, `genflag` fora; (c) por `devclass`/`author`, para separar o que o cliente
  escreveu do que veio de fábrica. Agrupar por PGMID + OBJECT (R3TR e LIMU contam histórias
  diferentes) e, se der, juntar a descrição legível do tipo — `KO100` (**a confirmar**) — para a
  lista sair com nome, não só sigla. **A saída é uma tabela**: código · descrição · quantos ·
  coberto? (módulo do catálogo / ideia aberta / NADA). **A terceira coluna é o ponto**: o que cai
  em NADA é tipo de objeto que o arsenal nem sabia que precisava — cada um vira ideia nova aqui,
  já ordenada por quanto o sistema realmente tem dele. Rodar no s4h e no SXD, comparando com os
  19 tipos do catálogo (`docs/tipos.md`); a lista do cliente é a que manda.
  > promovida: fila 15 (2026-08-29)
  > MEDIDO 2026-08-29 (S4H 758) → `scripts/cobertura-tadir.mjs` + `docs/cobertura-tadir.md`. Sem driver:
  > o `dataPreview` AGREGA. 85.304 objetos custom em 121 tipos; o catálogo (23 módulos, 19 códigos) cobre
  > 76%. `KO100` é estrutura — a descrição vem de `EUOBJALL`. O que apareceu no topo sem ideia: a família
  > SEGW/Gateway V2 (16%) → I28, e o TOBJ (gerador SM30) → I29. SXD pendente (sem VPN nesta sessão).

- [x] I25. **Engenharia reversa de solução SAP real** — pegar uma solução que existe e funciona
  (monitor de notas fiscais, um app Fiori padrão do s4h) e listar de que tipos de objeto ela é
  feita. Complementa I24 por outro eixo: a TADIR global dá **frequência** (quantos existem), o
  pacote de uma solução dá **composição** (o que precisa coexistir para a coisa funcionar) — e é
  a composição que diz se a lib entrega uma solução inteira ou só peças soltas. **Provaria:** o
  que falta no arsenal para reproduzir algo do tamanho de um app de verdade — e a ordem em que
  falta. **Medir:** (1) escolher os alvos: monitor de NF-e (transação/pacote `J_1B*` — nome
  **a confirmar**) e um app Fiori padrão; (2) do objeto conhecido (a transação, a CDS raiz do
  app) chegar ao pacote: TADIR por OBJ_NAME → DEVCLASS; (3) TDEVC para os sub-pacotes;
  (4) TADIR por DEVCLASS agrupada por OBJECT → a composição, com contagem; (5) cruzar com os 19
  módulos do catálogo → a lista do que falta, agora justificada por uma solução real. Conversa
  com I23 (a TR de uma nota SAP dá a mesma lista por outro caminho) e I24 (a mesma consulta, sem
  o recorte de pacote).
  > promovida: fila 25 (2026-08-29)
  > MEDIDO 2026-08-31 (S4H 758, só leitura) → `docs/composicao-solucoes.md` + `--pacote` no script da
  > cobertura. Os dois palpites da ideia confirmados com desvios: o monitor NF-e é `J1BNFE` (pacote
  > próprio, mas pendurado na raiz APPL — a árvore TDEVC não delimita solução clássica; o prefixo J1B*
  > delimita) e o app Fiori se resolve por TSTCP (transação de parâmetro → UIAD), não por TSTC. O
  > "Provaria" saiu: a lacuna nº 1 é o lado UI do Fiori (LRCC/WAPA/UIAD — 0% de caminho), o backend RAP
  > está 94% coberto descontado o gerado. Ver item 25.

Fora de alcance por ADT (pesquisa 2026-08-28, não viram ideia): WAPA/app UI5 (deploy é OData
`UI5/ABAP_REPOSITORY_SRV` — canal diferente, cabe no `jbv-adt-client` só como cliente OData);
NROB, PARA, SMIM, append de tabela, SUSH — sem coleção em fonte alguma; DDLS `extend view` — é o
mesmo `DDLS/DF`, só spike diz se o fluxo atual já serve.

- [ ] I36. **Deploy de app UI5 — OData `/UI5/ABAP_REPOSITORY_SRV`** — o item 25 mediu que 100% do lado
  UI de um app Fiori (WAPA + LRCC + UIAD + SICF) está sem caminho na lib: a lacuna nº 1 do arsenal
  (`composicao-solucoes.md`). A nota "fora de alcance por ADT" acima (2026-08-28) já apontava o canal —
  o serviço OData `/UI5/ABAP_REPOSITORY_SRV` (pesquisa § 3 do cookbook; `/UI5/REPO_LOAD_FROM_ZIP*` como
  alternativa por FM, a carimbar no item 38). Hipótese: a lib como cliente OData sobe um app UI5 mínimo
  (zip com manifest + index) e o registro WAPA/SICF nasce sozinho. **Provaria:** um app Fiori inteiro
  pela lib — do CDS/RAP (que ela já cria) ao app servido. **Medir (s4h, `$TMP`):** `$metadata` do
  serviço; POST de um app mínimo; TADIR WAPA + nó SICF; GET do app servido pelo ICM; delete e TADIR
  limpa. LRCC/UIAD (descriptor/FLP) ficam como ponto aberto — sem eles o app roda por URL direta, sem
  ladrilho no launchpad.

- [x] I26. **Fatiar o `TABKEY` pelo layout da tabela** — o item 14 mediu que `E071K.TABKEY` é a
  chave concatenada e posicional da linha transportada (`300D1411Z0`), mas ela chega como um
  string opaco. Hipótese: `DD03L` (campo, posição, tamanho, e a marca de chave) permite cortar o
  `TABKEY` em campos nomeados — e aí a entrada de chave vira um registro legível, que é o que
  I21/I22 precisam para reproduzir customizing e BRF+. **Provaria:** `300D1411Z0` →
  `{ MANDT: '300', SPRAS: 'D', KSCHL: '1411Z0' }`, e o diff "TR × sistema" passa a comparar
  linhas, não strings. **Medir:** readTable `DD03L` de `T460T` (e de uma tabela com chave de
  vários campos e tipos), cortar por offset acumulado, e conferir a linha resultante lendo a
  própria tabela com esse WHERE — se a linha existe, o corte está certo. Cuidado medido: o `*`
  final é curinga, não dado; tabela sem MANDT não começa pelo mandante.
  > promovida: fila 21 (2026-08-29)
  > MEDIDO 2026-08-30 (S4H 758) → `cts.mjs`: `layoutChave` (DDIF_FIELDINFO_GET, não DD03L crua), `fatiarTabkey`,
  > `whereDaChave`, `fatiarChaves`, `lerLinhaDaChave`, `{ fatiar: true }` em `lerRequestPorTabelas`/`anatomia`.
  > Hipótese confirmada com um desvio: o corte é por LENG em CARACTERES (o "offset" da ideia, em bytes,
  > erraria por 2×). O "Provaria" saiu: `000E000310` → `{ MANDT, SPRAS, WERKS, SOBSL }` e a releitura acha
  > a linha; curinga `*` medido em 3 formas. Sem amostra de chave RAW/DATS/INT no s4h. Ver item 21.
- [x] I27. **Diff "TR × sistema"** — o que a TR diz que carrega × o que existe hoje no alvo.
  Hipótese: com `cts.anatomia` de um lado e `search`/`getSource`/`readTable` do outro, dá para
  responder "esta TR ainda corresponde ao que está no sistema?" antes de transportar.
  **Provaria:** transporte que chega quebrado por objeto alterado depois da inclusão na ordem.
  **Medir:** uma TR liberada do s4h, comparar cada entrada `R3TR` com a existência e a data de
  alteração do objeto (TADIR + `adtcore:changedAt`); decidir o que fazer com `LIMU` (parte de
  objeto não tem existência própria). Depende de I26 para as entradas de chave.
  > promovida: fila 22 (2026-08-29)
  > MEDIDO 2026-08-30 (S4H 758) → `cts.diff`. A hipótese mudou de fonte: `search`/`getSource` não entram —
  > quem responde "alterado depois" é a **VRSD** (versão numerada por parte, com a TR que a gerou), a **E071
  > da família** (em edição / noutra TR) e o `changedAt` do ADT (só com o fuso da TTZCU). `LIMU` decidido: a
  > VRSD já é por parte. O "Provaria" saiu: S4HK911417 tem 8 partes alteradas depois e 3 em edição hoje. Ver item 22.
- [x] I28. **Família SEGW / Gateway V2 por efeito** — IWMO, IWSV, IWVB, IWSG, IWOM, IWPR (+ o nó SICF
  gerado) são **16% do custom do s4h** (13.632 objetos, medido 2026-08-29 em `docs/cobertura-tadir.md`)
  e a lib não toca em nenhum. Hipótese: não há coleção ADT para o projeto SEGW (IWPR — a SEGW é GUI),
  mas o caminho RAP já produz parte da família sem pedir: o publish do `serviceBinding` **V4** cria o
  G4BA de mesmo nome em `$TMP` (medido: `YJBV_POC_WDI5_SB`), e o registro V2 (IWSG/IWOM) mora em `$TMP`
  aos milhares (3.010/3.007) — sinal de que é gerado por API, não escrito. **Provaria:** um SRVB V2
  publicado pela lib deixa IWSG + IWOM + SICF na TADIR, fechando a família para o caminho RAP; para o
  legado SEGW resta a anatomia por CTS (I23), não o create. **Medir:** (1) discovery do s4h por
  coleções `iwfnd`/`iwbep`/`odata`; (2) SRVB `bindingType` V2 sobre a SRVD `YJBV_POC_WDI5_SD` (a
  superfície do item 6 ficou no s4h) → publish → TADIR por `obj_name LIKE 'YJBV%'` e `/IWFND/I_MED_SRH`;
  (3) o contrafactual: unpublish → as entradas somem?
  > promovida: fila 16 (2026-08-29)
  > MEDIDO 2026-08-29 (S4H 758, 15/15 PASS pela lib): hipótese confirmada e ampliada — o SRVB V2 gera
  > IWMO/IWSV/IWVB já no ACTIVATE (a ideia previa só no publish) e IWSG/IWOM/OA2S no publish; unpublish e
  > delete desfazem tudo. Não nasce IWPR (SEGW) nem nó SICF (os 434 nós Z do s4h são do registro SEGW em
  > `/sap/opu/odata/sap/`). Bug corrigido no caminho: o job V2 lê os parâmetros na URL do job. Ver item 16.
- [x] I29. **TOBJ — gerador de atualização de tabela (SM30)** — 644 objetos custom no s4h que a fila
  não previa (medido 2026-08-29): nome = tabela + `S` (tabela) ou `V` (visão), em 8 de 8 exemplos lidos
  (`ZTB002    S`, `ZATAT_AVALFS`). Hipótese: o ADT não gera diálogo de atualização (é SE54/SE11 "gerar
  atualização"); o que existe é a API ABAP do gerador — FM **a confirmar** — chamável por driver classrun.
  **Provaria:** tabela Z entregue pela lib já com SM30, sem GUI. **Medir:** (1) ler `TOBJ`/`TVDIR`/
  `TVIMF` de um exemplo por readTable — que linhas o gerador escreve; (2) achar o FM/classe que a SE54
  chama (`OBJ_GENERATE`? ler o fonte de `SAPLSVIM`); (3) driver sobre uma `YJBV_POC_*` em `$TMP`;
  (4) assert: `TVDIR` + FUGR gerado + BDC de SM30 exibindo a tabela (receita-bdc-classrun).

  > promovida: fila 17 (2026-08-29)

- [x] I55. **NROB (number range object) como módulo de tipo, por ADT REST** — achado do item 38 (2026-08-31):
  o 758 TEM a coleção `/sap/bc/adt/numberranges/objects` (accept `blues.v1+xml`, categoria `nrobnro`,
  templateLinks com `corrNr`/`lockHandle`/`version` e `/source/main`), e a leitura já está provada: metadados
  em XML e **`GET .../source/main` com `application/json` devolve o `nrob-v1.json` do AFF**. A pesquisa dava
  NROB como "driver classrun + intervalo por SOAP RFC" — e a sonda mostrou que **nenhum `NUMBER_RANGE_*` é
  RFC**, então a via antiga era pior do que se pensava e a nova é ADT puro. 46 NROB custom no s4h, 49 na
  cobertura. **Provaria:** que o fluxo "blue"/AFF que a fila 29 abriu com o `APLO/TYP`
  (`applicationLogObject`: create em `blues.v1+xml`, PUT do fonte em `application/json`, sem ativação)
  vale para um SEGUNDO tipo — e um objeto de numeração entregue sem GUI. **Medir (s4h, `$TMP`):** create + `source/main` com o JSON mínimo (`interval.numberLengthDomain`,
  `subType`) → activate → `readTable TNRO`; alteração do ATIVO pelo mesmo deploy; intervalo `01` por driver
  (`NUMBER_RANGE_INTERVAL_UPDATE`, não-RFC) e `NUMBER_GET_NEXT` como efeito; delete e ausência na TNRO.
  > promovida: fila 44 (2026-09-01) — e fechada no mesmo dia. Ver `docs/receita-nrob.md`.

- [x] I56. **Forma `json` na lib — a família AFF que o ADT já serve** — achado do item 38: **27 coleções do
  discovery do 758 declaram `$schema`** e devolvem o schema do `SAP/abap-file-formats` pelo próprio sistema
  (`$configuration` traz até o layout do editor). A lib já roda esse fluxo em UM tipo — o `APLO/TYP` da fila 29
  (`applicationLogObject`), que ficou na forma `custom` por causa dos três desvios (create `blues.v1+xml`
  PLURAL, PUT em `application/json`, não ativa). A pergunta é se esses desvios são do APLO ou **da família**:
  se forem da família, viram a quarta forma (`json`) em vez de `custom` repetido 27 vezes, e um único fluxo
  abre (application job, application log, changedocuments,
  customfields, destruction/archiving objects, feature toggles, `transportobject/objects`…). **Provaria:**
  um fluxo, N tipos — e o schema vindo do sistema-alvo em vez de decorado na lib. **Medir:** depois do I55
  (NROB é a cobaia), repetir o GET metadados + `source/main` em 3 coleções de famílias diferentes e ver se
  o par (accept, JSON) se repete; se sim, `deployJson` genérico + validação contra o `$schema` que o
  próprio sistema serve.
  > 2026-09-01 (fila 44, a 2ª cobaia): a resposta é **metade**. O que se repetiu APLO → NROB: create em
  > `blues.v1+xml` (plural) e PUT do `/source/main` em `application/json`. O que MUDOU de um para o outro:
  > o `adtcore:version` do shell (o APLO quer `active`, o NROB quer `inactive` — com `active` dá 400 `NR 870`
  > **e cria assim mesmo**) e a ATIVAÇÃO (o APLO não ativa; o NROB ativa, e é o activate que grava a TNRO).
  > Ou seja: a forma `json` genérica cobre o TRANSPORTE (media types), não o CICLO — esses dois pontos
  > continuam custando spike por tipo. Medir numa 3ª coleção antes de decidir se vira forma ou fica `custom`.
  > 2026-09-01 (fila 47, a 3ª cobaia, SAJC): o transporte confirma de novo (PUT sempre `application/json`),
  > mas com uma variação nova no create — `blues.v2+xml`, não `v1` (o v1 dá 415). E a ativação diverge pela
  > TERCEIRA vez: nem "não ativa" (APLO) nem "ativa na mesma sessão" (NROB) — ativar na sessão do PUT falha
  > ("Report ou classe inválida", nome vazio); só em sessão NOVA funciona.
  > ✅ **fila 60 (2026-09-01): decidido com as 3 cobaias já medidas, sem SAP novo.** A resposta final: o
  > transporte É genérico (PUT sempre `application/json`) — isso virou a forma `json` de verdade,
  > `deployJson` em `adt-client.mjs`. O ciclo NÃO é — nem o media type do create (v1 × v2) nem a ativação
  > (nenhuma × mesma sessão × sessão nova) se decoram da família; por isso `ativacaoJson` é campo do módulo,
  > nunca inferido. Os três tipos (APLO, NROB, SAJC) migraram de `custom` para `json`, perdendo ~15 linhas de
  > `deploy` cada um; qualquer `json` futuro (customfields, changedocuments, destruction/archiving, feature
  > toggles, transportobject/objects…) só precisa medir o PAR (media type do create, estratégia de ativação)
  > e declarar — não reescrever o fluxo. `docs/fila.md` item 60, `tipos/_esquema.mjs § FORMAS.json`.
- [x] I57. **View clássica por `RPY_VIEW_INSERT` — SOAP RFC puro, sem driver** — o item 12 fechou "VIEW é só
  SE11" pela via ADT, e a pesquisa apostava em driver com `DDIF_VIEW_PUT`. O item 38 mediu: **`RPY_VIEW_INSERT`
  é `FMODE='R'`** (o espelho dizia que não) e `RPY_VIEW_READ` também — e respondeu por SOAP nesta sonda. É a
  via mais barata da pesquisa inteira: sem driver, sem classe descartável, uma chamada. 179 VIEW custom.
  **Provaria:** o tipo que a lib declarou impossível nascendo por um canal que ela já tem. **Medir (s4h,
  `$TMP`):** `RPY_VIEW_READ` de `V_T001` para o formato (`RPY_VIHD`/`VIFD_U`/`VISC`/`VITB`) → `RPY_VIEW_INSERT`
  de uma view de banco sobre 2 tabelas Z → `DDIF_VIEW_ACTIVATE` (driver, não é RFC) → `readTable DD25L` +
  SELECT na view; delete por `RS_DD_DELETE_OBJ 'V'`. Se der, cruza com o item 17 (view de manutenção → SM30).
  > promovida: fila 45 (2026-09-01)
  > resultado (fila 45, 2026-09-01): **a hipótese caiu pela metade**. O tipo nasce — mas NÃO pelo
  > `RPY_VIEW_INSERT`, que dumpa em TODO canal sem GUI (chama `RS_CORR_INSERT` sem `suppress_dialog`/
  > `activation_call`/`genflag` → `TRINT_TADIR_POPUP` → `DYNPRO_SEND_IN_BACKGROUND`; medido por SOAP e por
  > classrun). A via é a que a pesquisa apostava: `DDIF_VIEW_PUT` + `TR_TADIR_INTERFACE` + `DDIF_VIEW_ACTIVATE`
  > num driver. O `RPY_VIEW_DELETE`, esse sim, roda por SOAP puro. `docs/receita-view-classica.md`.

- [ ] I62. **O status de manutenção de uma view (`DD25L-GLOBALFLAG`) sem GUI** — achado do item 45
  (2026-09-01): a view de manutenção nasce e ativa pela lib, e o `deployTableMaintenance` da fila 17 gera o
  diálogo em cima dela (TVDIR/TDDAT/pool/FMs, `GEN_RESULT` todo C) — mas a **SM30 recusa manter**: `E SV 792`
  *"can only be displayed and maintained with restrictions"*. Descartado por medição que fosse a tabela base
  (com `dataMaintenance : #ALLOWED`, `DD02L-MAINFLAG='X'`, a mensagem é a mesma). A única diferença que sobra
  contra uma view mantível de verdade (`V_T001`) é o **`GLOBALFLAG='X'`**, e o `DDIF_VIEW_PUT` **descarta esse
  campo em silêncio** (passa `'X'`, ativa limpo, a DD25L volta vazia). É a última peça do par SE11 → SE54 →
  SM30 sem GUI. **Provaria:** que o par fecha inteiro — view de manutenção criada pela lib sendo MANTIDA por
  BDC da SM30, com a linha aparecendo por readTable em outra LUW (o assert que a fila 17 já usa).
  **Medir (s4h, `$TMP`):** achar quem emite `SV 792` (não está no `MSVMAF01` — procurar no grupo `SVIM`/
  `SVIMA` e nos includes do pool gerado) e o que exatamente ele lê; depois, das três hipóteses, medir uma a
  uma — (a) o `GLOBALFLAG` sai por outro parâmetro do `DD_VIEW_PUT` (`CTRL_VIEW_PUT` tem flags por seção:
  `vihd`/`vifd`/`vibt`/`visc`/`vish`), (b) sai por uma FM da família `DD_*`/`DDIF_*` própria do header, ou
  (c) é derivado da tabela base/`TVDIR` e não se grava na view. Se nenhuma pegar, o campo é da SE11 e a
  resposta honesta é "view de manutenção sai pela lib, mantida só pela SE11" — e isso vale registrar como
  limite medido, não como pendência aberta.

- [ ] I58. **SUSH — alterar default values de autorização por ADT** — o item 38 provou a LEITURA:
  `GET aps/iam/sush/<nome>` com `blues.v1+xml` → 200 (`sush:sush`), nome **posicional** (30 + `TYPE`), e a
  coleção tem 14 sub-recursos (`su22authobject/values`, `sush/synchronize`, `validation`). `CL_SU22_ADT_OBJECT`
  existe no 758 como reserva. 569 SUSH custom. **Provaria:** SU22 sem GUI — o valor default de um serviço/
  transação Z ajustado pela lib. **Medir (s4h):** PUT com um objeto de autorização a mais num SUSH de objeto
  Z nosso (não em standard), `readTable USOBT_C/USOBX_C` em outra LUW como assert, e desfazer.

- [ ] I83. **`SHIP` — o 2º maior tipo custom do SXD (817 objetos, 12%), e ninguém sabe o que é** — achado
  da pendência do item 15 (2026-09-01, SXD 816:100, só leitura): o recorte custom do cliente tem **817
  objetos `R3TR SHIP`**, atrás só de CLAS (991) — e o tipo não tem descrição em EUOBJALL, WBOBJECTTYPES_T
  nem no RIS do próprio SXD. No s4h eram 4, na cauda "NADA". Um tipo que é 12% do custom do cliente não
  pode ficar sem resposta: ou a lib deveria alcançá-lo, ou ele é gerado (e se cobre por efeito ou se
  ignora com motivo medido). **Provaria:** o que o 2º tipo mais frequente do sistema do cliente É — e se
  entra no catálogo, se é coberto por efeito, ou se sai da conta com causa registrada. **Medir (SXD, só
  leitura, `dataPreview`):** (1) exemplos — `SELECT obj_name, devclass, author, genflag, srcsystem FROM
  tadir WHERE object = 'SHIP'` (quem escreve, onde mora, se nasce de gerador); (2) o dono — os pacotes
  concentram numa solução? (o topo do SXD é `YS_KB_SOLOTUONS_CORE` e a família `ZLS_*`); (3) a definição
  do tipo — RIS `objecttypes` por código exato, `OBJH`/`TOBJ` e o fonte de quem o registra; (4) com o
  "o que é" respondido, decidir o destino e registrar aqui.

- [ ] I87. **Eventos RAP por ADT — EVTB, EVTO, EEEC (e o contrato AsyncAPI)** — da listagem externa de
  tipos (pesquisa do Joris, 2026-09-02): a perna ASSÍNCRONA do RAP — event binding (EVTB, 8 custom no
  s4h), RAP event object (EVTO) e event consumption model (EEEC, 3 custom) — está toda em "NADA" na
  cobertura, e a lib entrega a superfície RAP síncrona inteira (CDS→BDEF→SRVD→SRVB) sem a saída de
  evento. **Provaria:** um BO da lib emitindo evento (e um consumption model consumindo) sem GUI — a
  cadeia RAP fecha também no eixo event-driven. **Medir (s4h, discovery primeiro, `$TMP`):** (1) que
  coleções de evento o discovery do 758/816 declara (`bo/event*`? família AFF com `$schema`?); (2) GET
  de um objeto padrão de cada tipo; (3) se houver coleção criável, o par (media type do create,
  ativação) da forma `json` (I56) e um create de POC amarrado a um BDEF da lib; (4) AsyncAPI é
  contrato publicado, não objeto — só entra se algum recurso o servir (irmão do `$metadata` V4).

- [ ] I88. **HTTP service (HTTP) e ABAP SQL service (SQL1) por ADT** — listagem externa 2026-09-02: os
  dois são tipos de repositório da linha cloud (handler HTTP Z sem SICF à mão; exposição SQL de CDS
  por ODBC) e o s4h tem 1 HTTP custom; nenhum tem caminho nem ideia. **Provaria:** endpoint REST Z
  criado pela lib de ponta a ponta (classe handler + serviço), o canal de ENTRADA que falta ao
  arsenal — hoje a lib só cria o lado OData. **Medir (s4h/SXD, discovery primeiro):** coleções no
  758/816 (o 758 pode não ter — a linha é cloud); GET de um objeto padrão; create de POC em `$TMP`
  com handler mínimo e o assert por GET na URL servida (o irmão do assert do item 16).

- [ ] I89. **Communication management (SCO1/SCO3) e Service Consumption Model (SRVC)** — listagem
  externa 2026-09-02: o trio cloud de integração — cenário de comunicação (SCO1), outbound service
  (SCO3) e o consumption model (SRVC, o proxy tipado de um EDMX/OpenAPI externo) — não tem caminho na
  lib (SCO2 é gerado). Zero custom nos dois sistemas medidos, mas é o padrão SAP atual para consumo
  outbound — aparece em toda nota/tutorial recente. **Provaria:** a lib consumindo um serviço EXTERNO
  pela via oficial (proxy gerado + destino), em vez de fetch cru. **Medir (s4h, discovery primeiro):**
  coleções `aps/*`/`businessservices/*` no 758/816; GET de exemplos standard; se criável, POC de SRVC
  sobre o `$metadata` de um SRVB da própria lib (o sistema consumindo a si mesmo — sem dependência
  externa).

- [ ] I90. **G4BS nasce por efeito do publish V4?** — o item 16 provou a família V2 por efeito e o G4BA
  por efeito do publish V4; o G4BS (OData V4 Backend Service, 7 custom no s4h) ficou sem medição —
  a listagem externa (2026-09-02) o trouxe de volta. Hipótese: o mesmo publish V4 do `serviceBinding`
  grava G4BS junto do G4BA, e o tipo sai da coluna NADA sem uma linha de código. **Provaria:** mais
  um "coberto por efeito" documentado — e o inventário V4 completo do que um publish deixa na TADIR.
  **Medir (s4h, `$TMP`):** o E2E do item 16 adaptado ao V4 — TADIR (`OBJECT = 'G4BS'` e vizinhos
  `G4B*`) antes/depois de activate, publish e unpublish de um SRVB V4 de POC; contrafactual: delete e
  a TADIR limpa.

- [ ] I91. **CHDO — change document object pela família AFF (`changedocuments`)** — listagem externa
  2026-09-02 cruzada com o item 38: a coleção `changedocuments` está entre as 27 com `$schema` (I56),
  e CHDO tem 10 custom no s4h + 1 no SXD, hoje "NADA". Seria a 4ª cobaia da forma `json` — e a I56
  já provou que só falta medir o PAR (media type do create, estratégia de ativação), não o fluxo.
  **Provaria:** objeto de change document (SCDO) sem GUI — o rastro de auditoria que tabela Z de
  cliente pede — e mais um ponto na curva "a forma `json` escala". **Medir (s4h, `$TMP`):** GET
  metadados + `source/main` de um CHDO padrão; create de POC (o par create/ativação); assert por
  `readTable TCDOB`/`TCDRP` em outra LUW; o gerado (include/FM `*_WRITE_DOCUMENT`) existe?

- [ ] I92. **Varredura da cauda da listagem externa × discovery — um carimbo por código** — a listagem
  (2026-09-02) traz códigos de repositório sem caminho, sem ideia e com pouco volume: DRAS, DRTY,
  DSFD/DSFI, DTEB, DTIX, SKTD, APIS, CHKO/CHKV, SUCO, IDOC, PDWS/PDTS, FORM/STYL (create SAPscript).
  Em vez de N spikes, uma passada SÓ DE LEITURA que carimbe cada um: existe coleção no discovery?
  o typestructure o declara? criável ou só-leitura? **Provaria:** a listagem externa inteira
  respondida com fonte — cada código com veredito (vira ideia própria · só-leitura · NADA com
  motivo), sem sobrar "não sei". **Medir (s4h 758 + SXD 816, só leitura):** discovery completo +
  `--tipos` (item 26) filtrados pelos códigos; GET de um exemplo standard onde houver coleção;
  saída = tabela código → veredito apensada em `pesquisa-tipos-adt-nao-cobertos.md`, e só o que
  merecer vira I<n> aqui.

- [ ] I93. **Conteúdo do Fiori Launchpad — UIAD, UIPG/UIST/UIPC** — o item 25 mediu que o lado UI é a
  lacuna nº 1 do arsenal e o item 38 FECHOU a via pesquisada para UIAD (`CL_SUI_UIAD_DB_ACCESS` não
  existe no 758); a listagem externa (2026-09-02) recoloca a pergunta: descriptor, page e space são o
  que liga app a usuário — app deployado sem tile não chega a ninguém (cruza com I36, o deploy do
  app, e I52, o wdi5 no FLP). **Provaria:** um app subido pela lib aparecendo como tile num space,
  sem Launchpad Designer. **Medir (s4h, só leitura primeiro):** que via EXISTE — discovery por
  `ui2`/`uiad`; o OData do FLP/pages (`/sap/opu/odata/UI2/*`); as tabelas de um UIAD real por
  readTable (`/UI2/*`?) — e só com a via nomeada decidir se há escrita ou se o veredito honesto é
  "manual, com motivo medido".

## Qualidade e diagnóstico

- [x] I4. ATC por ADT REST — disparar uma verificação ATC numa classe e ler os findings
  (prioridade, check, linha). **Provaria:** o mesmo gate de qualidade que o Eclipse aplica,
  no pipeline. **Medir:** `POST /sap/bc/adt/atc/runs` com a variante padrão no s4h, parse do
  resultado.
  > promovida: fila 27 (2026-08-29)
- [x] I5. Assert "não dumpou" — ler ST22 do mandante depois do act, filtrando por usuário e
  janela de tempo. **Provaria:** um E2E que falha quando o código dumpa em vez de "passar em
  silêncio". **Medir:** `RFC_READ_TABLE` na SNAP (ou FM de ST22) por SOAP RFC, antes e depois
  de um driver que dumpa de propósito.
  > promovida: fila 28 (2026-08-29)
- [x] I6. Assert por application log (SLG1) — ler mensagens BAL do objeto/subobjeto que a classe
  entregue grava. **Provaria:** assert no que o código *disse*, não só no que gravou.
  **Medir:** `BAL_DB_READ` por SOAP RFC ou driver classrun que serializa o log em JSON.
  > promovida: fila 29 (2026-08-29)
- [x] I7. Trace de runtime por ADT (`/sap/bc/adt/runtime/traces`) — medir tempo de um driver
  classrun com o profiler do ADT. **Provaria:** regressão de performance detectada no mesmo
  ciclo do teste. **Medir:** criar um trace request, rodar a classe, ler o resumo.

  > promovida: fila 30 (2026-08-29)

- [ ] I37. **ATC do pacote como gate de entrega** — o item 27 mediu que `{ pacote: … }` é alvo válido
  de `verificar` e roda: `$TMP` → 35 objetos / 222 findings em 91 s; `J1BNFE` → 18 objetos / 11
  findings em 116 s. Só que o J1BNFE tem **2.538 objetos** e apareceram 18 — não foi isolado se a
  worklist lista só um recorte, se o objectSet de pacote não é recursivo, ou se o resto simplesmente
  não tem finding. Sem isso, "o pacote passou no ATC" é afirmação sem lastro. **Provaria:** o gate
  de uma entrega inteira (o pacote do cliente) em vez de objeto a objeto. **Medir (s4h, só leitura):**
  contar a TADIR do pacote (o `cobertura-tadir.mjs --pacote` já dá o número) × `checados` da worklist;
  repetir num pacote pequeno de contagem conhecida; testar `objectSet` com o pacote e com a lista
  explícita dos mesmos objetos e comparar; medir o tempo por objeto para saber se cabe em pipeline.
- [ ] I38. **Isenção de finding ATC por REST (`atc/exemptions`)** — o discovery do s4h tem
  `atc/exemptions/apply{?markerId}`, `atc/checkexemptionsview` e `atc/apprNotifi/subscriptions`, e o
  `customizing` devolve os motivos (`FPOS` mensagem positiva incorreta, `OTHR` outro) e as validades
  (U/S/D). Nada disso foi medido — hoje `verificar({ incluirIsentos })` só muda o filtro da leitura.
  **Provaria:** o ciclo completo do gate: o que o time decidiu tolerar fica registrado no SAP, não num
  arquivo à parte da lib. **Medir (s4h, `$TMP`):** classe suja do item 27 → pedir isenção de UM finding
  pelo `markerId`/`quickfixInfo`, ler `checkexemptionsview` antes e depois, rodar de novo com
  `includeExemptedFindings=false` e ver o finding sumir (e voltar com `true`) — contrafactual é o
  finding vizinho, que deve continuar. Atenção: isenção é **escrita** e pode precisar de aprovação.
- [ ] I39. **Quickfix ATC por REST (`quickfixes/evaluation`)** — todo finding do item 27 veio com
  `atcfinding:quickfixInfo` (`atc:<itemid>,<index>`) e o discovery tem
  `/sap/bc/adt/quickfixes/evaluation` (accept `…quickfixes.evaluation+xml;version=1.0.0`). Se o ADT
  souber propor a correção, o gate deixa de só reprovar e passa a sugerir o patch. **Provaria:**
  correção automática de finding ATC sem Eclipse — o passo que falta entre "reprovou" e "corrigido".
  **Medir (s4h, `$TMP`):** POST em `quickfixes/evaluation` com o `quickfixInfo` de um finding conhecido
  (o `LS_T100` sem `@` da cobaia do item 27, que tem correção óbvia); ler o que volta (delta de fonte?
  proposta?); contrafactual: `quickfixInfo` de um finding sem correção possível (o P3 de ambiente).
- [ ] I40. **`/sap/bc/adt/checkruns` — o syntax check do Eclipse** — recurso separado do ATC, visto no
  discovery do s4h junto com `checkruns/reporters` (template `checkruns{?reporters}`). É o que o
  Eclipse roda ao salvar, antes de ativar: erro de sintaxe e warning por objeto, provavelmente mais
  barato que o ATC (que leva 5–10 s por classe). **Provaria:** um gate rápido no ciclo de deploy —
  hoje a lib só descobre erro de sintaxe quando a ATIVAÇÃO falha, e a mensagem da ativação nem sempre
  diz onde (ver o "Programa SAPL<GRUPO> contém erros de sintaxe" do item 11). **Medir (s4h):** `GET
  checkruns/reporters` (que reporters existem), `POST checkruns?reporters=<r>` sobre a cobaia suja e
  sobre uma com erro de sintaxe de verdade; comparar tempo e mensagem com o que a ativação devolve.
- [ ] I41. **Por que o feed `/runtime/dumps` perde dumps** — o item 28 mediu, no mesmo dia e mandante,
  SNAP **14** × feed **7**: sete dumps meus ausentes, dois deles por mais de 7 minutos, e um mais
  ANTIGO ausente enquanto um mais novo era listado (o `self` do feed declarava `from=…111631` e
  ignorava tudo depois). Não é só latência, e a causa não foi isolada. Enquanto isso o assert é pela
  SNAP — mas o feed é o que o Eclipse mostra, e um dev que "olhou a ST22 no Eclipse" pode ter olhado
  para uma lista incompleta. **Provaria:** se o feed do ADT é confiável para QUALQUER uso (inclusive
  humano) neste release, ou se a lib deve marcá-lo como amostra. **Medir (s4h, só leitura):**
  `getSource` da classe do feed (`CL_ADT_RES_RUNTIME_DUMPS`/`…FEED…`, achar pelo RIS) para ver o
  critério de seleção no código; cruzar as ausências com campos da SNAP que ainda não olhei (`XHOLD`,
  `MODNO`, tipo de work process); e conferir se o `RSSNAPDL`/reorganização ou algum parâmetro de
  perfil (`rdisp/max_snapshots`?) corta a lista.
- [ ] I42. **Assert de update task falhada (SM13)** — o item 28 mediu o dump assíncrono por
  `STARTING NEW TASK`; a via que o código de cliente REALMENTE usa é `CALL FUNCTION … IN UPDATE TASK`
  + `COMMIT WORK`. Aí, além do dump, existe uma segunda evidência que a SNAP não dá: o registro de
  update cancelado (VBHDR/VBMOD/VBERROR — a SM13), que é o que explica "o número saiu e o documento
  não existe". **Provaria:** um assert de posting FI/MM que hoje passa em silêncio quando a V1 morre
  (o gotcha da `receita-e2e-classe-entregue.md`: `COMMIT WORK` sem `AND WAIT` → BKPF vazia). **Medir
  (s4h, `$TMP`):** FM próprio marcado como update module (TFDIR `UTASK`? — conferir se o ADT persiste
  isso como persistiu o `FMODE='R'`) que dumpa de propósito; driver com `IN UPDATE TASK` +
  `COMMIT WORK`; assert em VBHDR/VBERROR + SNAP; contrafactual com FM que não dumpa.
- [ ] I43. **`semDump` embutido nos canais da lib** — hoje o assert de dump é uma chamada a mais que
  quem escreve o teste precisa lembrar de fazer; o item 28 mostrou que justamente o caso perigoso (o
  200 feliz) é o que ninguém desconfia. Hipótese: `runClass`/`deployAndRun`/`runUnitTests` poderiam
  levantar a marca d'água e conferir a janela por default (`semDump: true`), ao custo de 2 consultas
  por execução. **Provaria:** o gate deixa de depender de disciplina. **Medir:** decisão de design
  antes de código — quanto custa (ms por act, medido) e se o default certo é ligado ou desligado;
  cuidado com a regressão de ergonomia (todo `runClass` passa a poder lançar por causa de dump de
  OUTRO processo do mesmo usuário — o filtro por `programa` resolve? medir com dois drivers em
  paralelo).

- [ ] I44. **Os outros tipos "blue"/AFF por ADT REST** — o item 29 mediu que `APLO/TYP` (objeto de log)
  se cria por `application/vnd.sap.adt.blues.v1+xml` com fonte **JSON** validado por um `$schema` que o
  próprio sistema serve (`aplo-v1.json`, o formato github.com/SAP/abap-file-formats). O mesmo desenho
  aparece no discovery do s4h em `applicationjob/templates` e `applicationjob/catalogs` (cada um com
  `$schema`, `$configuration`, `validation` e `source/formatter`) — e o `blues.v1+xml` já era o media
  type do AUTH e do SUSO (item 13), o que sugere uma FAMÍLIA inteira acessível por um caminho só.
  **Provaria:** um fluxo genérico "tipo AFF" na lib — descobrir a coleção, ler o `$schema`, montar o
  JSON, PUT — cobrindo N tipos com um módulo em vez de um por tipo. **Medir (s4h):** listar no
  discovery todas as coleções com sub-recurso `$schema`; para cada uma, GET de um objeto padrão
  (fonte JSON?) e um create de POC em `$TMP`; ver se o `$schema` basta para gerar o body (validação
  local antes da rede) e se algum deles exige ativação — o APLO não exige.
- [ ] I45. **O `dataPreview` satura a sessão (`GENERATE_SUBPOOL_DIR_FULL`)** — medido no E2E do item
  29: depois de algumas dezenas de consultas freestyle na MESMA sessão, o servidor dumpa
  `GENERATE_SUBPOOL_DIR_FULL` em `CL_ADT_DP_OPEN_SQL_HANDLER` e toda consulta seguinte volta HTTP 500
  com a página do ICM (diagnosticado pelo `dumps.mjs` — sem ele, pareceria "o SAP caiu"). Cada
  consulta gera um subprograma e o diretório de subpools da sessão enche. Hoje a saída é manual:
  abrir conexão nova no trecho final do E2E. **Provaria:** E2E longo deixa de morrer perto do fim,
  onde estão justamente os asserts de limpeza. **Medir (s4h, só leitura):** quantas consultas cabem
  numa sessão (contar até o 500, repetir 3×; varia com o tamanho do SELECT?); se `dataPreview` em
  sessão STATELESS tem o mesmo teto; e decidir o desenho — a lib renova a sessão sozinha ao ver o
  500, ou expõe `renovarSessao()` e o chamador decide? (cuidado: renovar por conta própria esconde
  erro real de sessão.)

- [ ] I46. **ST05 (SQL trace) por ADT REST** — achado no discovery durante a fila 30: existem
  `/sap/bc/adt/st05/trace/state` e `/sap/bc/adt/st05/trace/directory`, e o `state` já LÊ (medido
  2026-08-31, s4h): devolve `ts:traceStateInstanceTable` com instância/host, quem ligou por último, e os
  oito interruptores (`sqlOn`, `bufOn`, `enqOn`, `rfcOn`, `httpOn`, `apcOn`, `amcOn`, `authOn`) mais o
  filtro (usuário, transação, programa, RFC, URL, wpId) — no s4h estão todos desligados. O ABAP por trás
  é `RSTR_ACTIVATE_USER_TRACE` (o mesmo que o `CL_ATRADT_INSTANT_TRACING` chama quando a variante pede SQL
  trace). Diferente do profiler da fila 30, o ST05 conta ACESSO A BANCO por instrução — é o que responde
  "essa carga faz SELECT dentro do LOOP?" com número, e complementa o finding estático do ATC
  (`PERFORMANCE_DB`, item 27). **Provaria:** assert de "quantos SELECTs este act disparou" e "qual tabela
  ele leu", sem SAT e sem GUI. **Medir (s4h):** `PUT`/`POST` no `st05/trace/state` (ou
  `RSTR_ACTIVATE_USER_TRACE` por driver — conferir se é RFC) ligando só `sqlOn` com filtro no MEU usuário;
  rodar um classrun com `SELECT` dentro de `LOOP`; ler o `trace/directory` e o detalhe; desligar no
  `finally`. ⚠ ligar trace de sistema afeta o servidor inteiro se o filtro escapar — filtro por usuário é
  obrigatório, e o desligamento entra no `finally` como o unlock.

- [ ] I47. **Cobertura LINHA A LINHA — abrir o recurso `statements`** — o item 31 entregou a cobertura por
  MÉTODO (é o que o `cov:result` dá de graça), mas o SAP anuncia dois links de statements que não
  consegui abrir (medido 2026-08-31, s4h): o do nó
  (`…/coverage/results/<id>/statements/<ROOT>/<PROGRAMA>/<NÓ>`) dá **404** em toda variante (com e sem
  o `%3d` do `===CP`, com `?type=`), e o `bulkstatements` da raiz só aceita **POST** de
  `<cov:statementsBulkRequest/>` **vazio** com Accept `application/xml` — qualquer filho dá 400 "Fim de
  elemento esperado", `application/xml+scov` dá 406 — e responde **200 com
  `<cov:statementsBulkResponse/>` vazio**. É o que o Eclipse usa para PINTAR as linhas do editor, então
  o protocolo existe e está a um detalhe de distância. **Provaria:** relatório com as linhas exatas que
  nenhum teste executou — o pulo de "método 66%" para "a linha 17 nunca rodou", que é o que faz alguém
  escrever o teste. **Medir (s4h, só leitura):** ler o handler ABAP (`if_scv_stmnt_results_builder` e a
  classe `CL_SCV_ADT_*` que o serve — o `get_statement_results` monta `ty_statements`) para descobrir o
  filho que o `statementsBulkRequest` espera e como o nó é endereçado; conferir contra uma medição real
  da mesma cobaia do item 31 (3 métodos, 2 exercitados), onde as linhas certas são conhecidas.

- [ ] I48. **Adobe Form ALÉM da cópia: criar do zero e trazer de outro sistema** — o item 41 mediu que
  `cl_fp_wb_form=>copy` / `cl_fp_wb_interface=>copy` criam SFPF+SFPI sem GUI, e a mesma classe expõe duas
  portas que não foram abertas: (a) **`cl_fp_wb_form=>create( i_form = <IF_FP_FORM> )`** e
  `cl_fp_wb_interface=>create( i_interface = <IF_FP_INTERFACE> )` — form montado a partir do OBJETO, não de
  um molde, que é o que o item 43 vai precisar para escrever o XFA da prancheta; e (b)
  **`cl_fp_wb_helper=>form_create_from_version( i_destination = <RFCDEST> i_name i_version )`** — criar o
  form a partir de uma VERSÃO, com destino RFC, ou seja **copiar form de OUTRO sistema**. Some-se o ponto
  aberto medido: o clone mantém `FPCONTEXT-INTERFACE` da origem, e trocar essa referência é um terceiro
  passo desconhecido. **Provaria:** (a) tira a última dependência de molde do conversor Adobe; (b) dá
  "trazer o form do DEV para o QA" sem transporte, e é o irmão Adobe do item 35 (diff entre sistemas).
  **Medir (SXD, `$TMP` — a cópia de form exige ADS, e o SXD é o que tem):** montar um `IF_FP_FORM` mínimo
  (de onde? `cl_fp_wb_form=>load` do original devolve `IF_FP_WB_FORM`; achar o getter do modelo — o
  `get_form( )` que tentei é privado) e passar ao `create`; depois `form_create_from_version` com
  `i_destination` apontando para o s4h; e procurar o setter da interface no `IF_FP_WB_FORM` (ou em
  FPCONTEXT) para redirecionar o clone.

- [x] I76. **O logoff da lib está gerando dump a cada sessão encerrada** — observado no item 53 (2026-09-01,
  s4h): a ST22 tem uma linha `TEXTENV_UNICODE_LANGU_INVALID (CX_SY_LOCALIZATION_ERROR) em
  CL_HTTP_EXT_LOGOFF============CP, CM001:11` para **cada** script da sessão, com o meu usuário, no minuto de
  cada `conexao.encerrar()`. A atribuição é por coincidência de horário, não por contraprova — mas se
  confirmar, a lib está deixando um rastro de dumps em todo sistema onde roda, inclusive de cliente, e a
  regra "sessão viva > 5 min é erro" fez esse rastro crescer. **Provaria:** que dá para encerrar sem sujar a
  ST22 — e, de quebra, explica dumps que aparecerão numa auditoria de cliente com o nosso nome.
  **Medir (s4h, marca d'água da `dumps.mjs` antes e depois):** (1) um script que só abre e encerra, com
  `cfg.lang = 'PT'` — conta os dumps; (2) o mesmo com `'EN'` e com o idioma omitido, para ver se o culpado é
  o `sap-language` que o logoff herda (o texto do erro é sobre idioma inválido no ambiente de texto);
  (3) contra-prova: encerrar sem o GET do `/logoff` (deixar a sessão morrer) — se o dump some, é o logoff.
  Se for o idioma, a correção é do lado da lib e cabe em uma linha.
  > promovida: fila 64 (2026-09-01)

## Canais e alcance

- [x] I8. GUI Scripting (COM) — fallback para dynpro que o BDC não alcança (popups modais,
  controles ALV/GUI que não aceitam batch input). Está na visão do arsenal desde o início; sem
  código. **Provaria:** cobertura das telas que restam. **Medir:** `winax`/PowerShell COM
  contra o SAP GUI local, uma VA03 com `sapgui/user_scripting` ligado.
  > promovida: fila 34 (2026-08-29)
  > MEDIDO 2026-08-31 (s4h 758 + SAP GUI 8.00, E2E 12/12) → módulo `gui.mjs` + `receita-gui-scripting.md`.
  > A hipótese se confirmou (popup modal, ALV Grid e table control alcançados; escrita provada por USR05 em
  > outra LUW), com um desvio que muda a via: o **PowerShell devolve engine MUDO sem erro** — o canal é VBS
  > por `cscript`, não `winax`/PS.
- [x] I9. wdi5 contra app Fiori custom deployado — a receita atual prova o preview `feap`
  (app gerado). A mecânica de auth e harness deveria ser a mesma para um app deployado no
  sistema. **Provaria:** teste de UI do que o cliente realmente usa. **Medir:** um app UI5
  qualquer publicado no s4h, mesmo harness de `examples/wdi5`, só a URL muda.
  > promovida: fila 33 (2026-08-29)
  > MEDIDO 2026-08-31 (S4H 758, só leitura) → módulo `ui5.mjs` + `examples/wdi5-app/` +
  > `receita-wdi5-fiori.md § 7`. A hipótese ("a mecânica é a mesma, só a URL muda") se confirmou, com três
  > desvios: os SELETORES mudam (o app do cliente é FE **V2** — SmartFilterBar, e o tipo de tabela sai do
  > manifest), o GESTO de navegar muda com a família da tabela (ResponsiveTable: `press` do wdi5 no item;
  > GridTable: só o chevron `RowActionItem type=Navigation` — 5 de 7 formas não fazem nada), e o par
  > Chrome × ChromeDriver derruba o harness (o Chrome-for-Testing do wdio pendura o `injectUI5`). 4/4 PASS
  > em dois apps do cliente. Ver item 33.
- [x] I10. Auth BTP/SAML no wdi5 — a receita só mediu on-premise Basic → cookie. **Provaria:**
  o canal wdi5 em cenário cloud. **Medir:** depende de um tenant BTP com Fiori acessível; sem
  isso, fica aqui.

  > promovida: fila 36 (2026-08-29)
- [ ] I51. **Timeout nas sondas do `probe`** — achado no item 32: nenhum `fetch` do probe (nem o
  `sondarAdt`, nem o `ping` SOAP) passa `signal`, então o tempo de falha é o que o SO der. Com DNS
  inexistente falha em ~0,8 s (medido 2026-08-31 contra `sapdev01.exemplo.local`), mas host que aceita
  o TCP e não responde — firewall com DROP, VPN meio-caída, ICM travado — pendura sem teto, e o script
  de landscape sonda N sistemas em série. **Provaria:** que "sistema inalcançável" é uma resposta rápida
  e não uma sessão pendurada — e fixa o custo do mapa do landscape em N × timeout. **Medir:** sonda
  contra IP com porta filtrada (o SXD sem VPN serve quando cair de novo), cronometrando com e sem
  `AbortSignal.timeout(ms)`; conferir que o motivo do abort chega em `{ ok:false, motivo }` legível
  (hoje viria "This operation was aborted") e escolher o teto por medição, não por palpite.

- [ ] I52. **wdi5 dentro do Fiori Launchpad (FLP)** — o item 33 dirigiu o app custom pela URL DIRETA
  (`/sap/bc/ui5_ui5/sap/<app>/index.html`), que é como o dev abre, não como o usuário: no FLP o app roda
  dentro do shell (`sap.ushell`), com tile, catálogo, papel, navegação cross-app e `sap-iapp-state` de
  verdade — e é lá que aparecem os defeitos que a URL direta esconde (dependência de serviço do ushell,
  parâmetro semântico, autorização por papel). Achado de graça no caminho: o launchpad do 758 responde em
  **`/sap/bc/ui5_ui5/ui2/ushell/shells/abap/FioriLaunchpad.html`** (200, 27 KB; o caminho sem `ui2` é 404)
  e o Launchpad Designer em `/sap/bc/ui5_ui5/sap/arsrvc_upb_admn/main.html`. **Provaria:** teste de UI no
  ambiente REAL do usuário — e o caminho para automatizar o smoke test de um papel inteiro ("as 12 tiles
  do perfil abrem?"). **Medir (s4h, só leitura):** abrir o FLP com o cookie injetado (a auth do item 33
  vale?); achar a tile do `ZBSP_VENDAS` no shell (que controle? `sap.ushell.ui.launchpad.Tile`?) e clicar;
  conferir que o app sobe DENTRO do shell (`sap.ushell.Container` presente) e que o hash vira
  `#Semantic-action`; e medir o custo (o FLP carrega bem mais que o app). Cuidado: sem papel/catálogo a
  tile não existe para o meu usuário — se for esse o caso, medir por navegação direta ao hash semântico
  (`FioriLaunchpad.html#Objeto-acao`) antes de pedir customizing a alguém.

- [ ] I53. **Evidência visual de teste por `HardCopy` do SAP GUI** — achado no item 34: a sessão do GUI
  Scripting expõe `GuiSession.HardCopy`/`GuiFrameWindow.HardCopy`, que grava a tela em arquivo. Hoje a
  evidência de um teste dirigido pela lib é texto (statusbar + readTable); um PNG da tela no momento do erro
  é o que a pessoa do outro lado do ticket entende. **Provaria:** anexar a tela ao work item do DevOps (a
  skill `devops` já anexa arquivo) sem ninguém repetir o passo à mão. **Medir (s4h):** `HardCopy` numa tela
  de erro conhecido (VA03 com documento inexistente) — o arquivo sai em que formato e onde (pasta do
  SAPWORKDIR?), qual o custo em ms, e se funciona com a janela minimizada ou coberta por outra (é captura da
  janela ou da tela?). Se for da tela visível, o canal ganha um limite novo para a receita.
- [ ] I54. **Gerar os passos a partir da GRAVAÇÃO do próprio SAP GUI** — achado no item 34: o s4h tem
  `sapgui/user_scripting_disable_recording=FALSE`, ou seja, o recorder do SAP GUI está liberado. Escrever
  os passos à mão custa achar o id de cada controle (foi metade do tempo da POC). **Provaria:** o caminho
  "alguém clica uma vez, a lib repete para sempre" — o mesmo salto que o BDC teve com a SHDB.
  **Medir:** gravar uma VA03 pelo recorder do GUI (script `.vbs` em disco), e escrever o PURO que traduz
  esse VBS gravado para a lista de passos do `gui.mjs` (`{ acao, id, valor }`) — quantas das linhas gravadas
  caem nas 18 ações que já existem, e quais sobram sem tradução.

- [ ] I59. **Catálogo OData público como assert de publicação** — o item 38 mediu: `GET /sap/opu/odata/IWFND/
  CATALOGSERVICE;v=2/ServiceCollection/$count` → **200 com 4.885** serviços, com Basic Auth simples e sem
  sessão. Hoje a lib prova "o serviço está publicado" por `readTable /IWFND/I_MED_SRH` (item 16), que exige
  SOAP RFC e conhecimento de tabela interna. **Provaria:** assert de publicação por via pública, documentada
  pela SAP e barata — e a diferença entre "registrado no hub" e "no catálogo do usuário". **Medir (s4h, só
  leitura):** publicar/despublicar um binding V2 de POC (o fluxo do item 16) e ver se o serviço aparece e
  some do `ServiceCollection` na mesma janela; comparar a contagem com `/IWFND/I_MED_SRH`; medir o custo dos
  dois. Se bater, vira o assert padrão do `serviceBinding` na skill `sap-testes`.
- [ ] I60. **SPRV — SOAP provider model pelo ADT** — o item 38 achou a coleção `/sap/bc/adt/businessservices/
  servprovs` ("SOAP Provider Model", `blues.v2+xml`, com `$new/schema`, `$new/configuration`, `$new/content`)
  **no 758**, desmentindo o "não provado on-prem" da pesquisa. O s4h tem **zero** objetos SPRV, então não há
  molde para copiar — o schema tem de vir do próprio `$new/schema`. Cruza com a § 5 (WEBI): se o SPRV for a
  via moderna do serviço SOAP, a definição clássica por `CL_WS_MD_FACTORY` deixa de ser o caminho. **Provaria:**
  serviço SOAP provider criado sem GUI — e, se o endpoint vier junto, a lacuna do SOAMANAGER (sem API pública)
  encolhe. **Medir (s4h, `$TMP`):** `GET servprovs/$new/schema` e `$new/content` → POST mínimo sobre uma classe/
  FM RFC Z já existente → `readTable TADIR (SPRV)`/`VEPHEADER` → tentar consumir o WSDL; delete no fim.

- [x] I78. **O gráfico da SE78 tem URL — `/sap/bc/fp/graphics/…` é um canal HTTP de leitura** — achado do
  item 54 (2026-09-01): o XFA migrado referencia o bitmap da `STXBITMAPS` por
  `href="/sap/bc/fp/graphics/public/graphics/bmap/bcol/<nome>.bmp"`, ou seja, existe um nó ICF que serve o
  conteúdo do BDS por HTTP — hoje a lib só lê gráfico por driver classrun (`graficoInfo`). **Provaria:** que
  conferir/baixar um gráfico de cliente custa um `GET` (e que o `subirGrafico` pode ser verificado byte a
  byte contra o arquivo de origem, o que hoje não é feito). **Medir (s4h, só leitura):** (1) subir um BMP
  conhecido e fazer `GET` nessa URL com a sessão da lib — comparar o corpo com o arquivo local, byte a byte;
  (2) variar `bcol`/`bmon` e um nome inexistente (o que volta: 404, 200 vazio, HTML de logon?); (3) conferir
  se o nó exige autenticação (o caminho diz `public`) — se não exigir, é dado de cliente exposto e vira
  achado de segurança, não conveniência. **Fica fora:** subir gráfico por HTTP (a escrita é do BDS).
  > promovida: fila 65 (2026-09-02)

## Ergonomia da lib

- [x] I11. Lembrar o `probe` por sistema — gravar o mapa de canais no `sistemas.json` (ou ao
  lado dele), com data, e só re-sondar quando pedido ou quando um canal falhar. **Provaria:**
  menos dois GETs por sessão, e o mapa de todos os sistemas do landscape visível de uma vez.
  **Medir:** não precisa de SAP — é decisão de design; a pergunta é se o cache envelhece mal.
  > promovida: fila 32 (2026-08-29)
  > respondida no item 32 (2026-08-31): **envelhece mal** — o cache da decisão foi descartado (150 ms de
  > ganho, zero chamadores, e disponibilidade que muda em minutos: ADT do s4h caiu em 30/08, SXD voltou em
  > 31/08). Ficou o segundo ganho: registro datado + mapa do landscape (`canais.mjs` + `scripts/canais.mjs`).
- [x] I12. Diff de objeto entre dois sistemas — `getSource` do mesmo objeto em DEV e QA, diff
  textual. **Provaria:** "o que está no QA é o que está no DEV?" sem transporte de comparação.
  **Medir:** dois SIDs no landscape, um objeto Z presente nos dois; avaliar se cabe aqui ou no
  `jbv-abapgit`, que já versiona objetos em disco.
  > promovida: fila 35 (2026-08-29)
- [x] I13. Relatório de cobertura legível — o `runUnitTestsWithCoverage` devolve números; um
  HTML (ou markdown) por classe com linhas cobertas/não cobertas daria o que o Eclipse mostra
  colorido. **Provaria:** cobertura como artefato anexável no ticket. **Medir:** ver se o XML
  de cobertura do ADT traz linhas ou só percentuais por método.
  > promovida: fila 31 (2026-08-29)
- [x] I33. **BRF+ criado por driver classrun (`cl_fdt_factory`)** — a leitura/anatomia fechou no item 23
  (`receita-brfplus.md`); escrever nas `FDT_*` à mão está descartado (versionamento + vínculos por GUID).
  Hipótese: um driver classrun (via do `enho.mjs`) com `cl_fdt_factory` cria aplicação LOCAL + data
  objects + decision table + função, ativa (`if_fdt_transaction`) e executa (`cl_fdt_function_process`)
  — tudo em `$TMP`/local, sem TR. **Provaria:** regra de negócio BRF+ criada e executada de fora, ponta a
  ponta — o único dos 121 tipos custom sem caminho de escrita que teria um. **Medir (s4h):** driver
  `YJBV_POC_BRF` cria app local `YJBV_POC_APP` + DT 2 linhas + função; `cl_fdt_function_process=>execute`
  devolve o resultado esperado para as duas entradas; `FDT_ADMN_0000` mostra as peças; delete pela mesma
  API (`if_fdt_admin_data~delete_object` ou marca DELETED) e contagem volta ao zero. **Gatilho:** cliente
  com BRF+ de verdade — até lá é registro.
  > promovida: fila 37 (2026-08-30, pedido do Joris — o gatilho é o marco, não um cliente)
  > MEDIDO 2026-08-30 (S4H 758) → `brf.mjs`, E2E 6/6. O "Provaria" saiu inteiro e mais: executar por NOME
  > também entrou (if_fdt_query + get_name). Desvios da hipótese: delete é LÓGICO (del_or_mark) e a
  > cobaia decisiva não foi doc — foram os demos FDT_DEMO_% do próprio sistema. Ver item 37.

- [ ] I30. **Driver classrun descartável genérico (`executarDriver`)** — `tran.mjs` (`deployTransaction`/
  `deleteTransaction`, drivers `Y_TRAN_*`/`Y_TRAND_*`, `keepDriver`) e `sm30.mjs` (`deployTableMaintenance`,
  driver `Y_SM30_*`, sem opção de apagar) já compartilham o `deployAndRun` do `classrun.mjs`; o que cada
  um repete por conta própria é o resto do trio — nome padrão do driver, parse da saída, `deleteObject`
  no fim e a decisão de manter. Hipótese: `executarDriver(conexao, { nome, fonte, parse, keep })` absorve
  isso e os dois módulos viram só o gerador de fonte ABAP + o assert. **Provaria:** a terceira receita
  por driver nasce sem copiar o esqueleto, e `keep`/limpeza passam a ter UM comportamento (hoje o
  `sm30` nem oferece). **Medir:** não precisa de SAP — é refatoração; `tran.test.mjs` e `sm30.test.mjs`
  continuam PASS e o E2E do s4h (itens 17 e 18 da fila) repete o resultado medido. **Gatilho:** regra
  de três do `CLAUDE.md` — só quando a terceira receita (NROB, SHLP, ENHO ou o que
  `docs/pesquisa-apis-sap-cookbook.md` trouxer) repetir a fricção. Até lá, registrado, não implementado.
  > gatilho atingido 2026-08-30: `forms.mjs` (item 19) é a TERCEIRA receita a repetir o trio — `driverDe()` +
  > `deployAndRun` + parse + `deleteObject` em `finally`. Não foi extraído dentro do item 19 (escopo); o
  > `finally` do forms é o comportamento que o `executarDriver` deve herdar (cobre também a I32).
- [ ] I31. **Verificação pós-escrita como passo do ciclo** — `receita-ciclo-escrita-verificacao.md` manda
  ler de volta em OUTRA LUW depois de escrever, mas hoje isso depende de o script lembrar. Hipótese:
  `deploy`/`deployMany` ganham `{ verificar: true }` que, ao final, faz o GET do fonte (forma `source`) ou
  o `prova(name)` do módulo por readTable/dataPreview na TADIR (o gancho já existe no contrato do tipo)
  e falha o deploy se a leitura não bater. **Provaria:** a prova de persistência sai do script de
  exemplo e vira garantia da lib — "criou" passa a significar "está lá". **Medir:** um `deploy` de
  classe no `$TMP` do s4h com `verificar: true`; depois um caso que a verificação PEGA (activate que
  passou mas o fonte lido é o inativo/vazio) — sem um caso negativo medido, a opção é só custo. Decidir se
  `deployMany` verifica por objeto ou só o lote, e se `dataPreview` na TADIR basta para forma `xml`.
- [ ] I32. **Higiene de drivers órfãos** — `keepDriver: false` no `tran.mjs` apaga a classe só no caminho
  feliz (e com `.catch(() => {})`); se o classrun falhar no meio, `Y_TRAN_*`/`Y_TRAND_*` ficam no
  `$TMP`, e o `sm30.mjs` deixa `Y_SM30_*` sempre. Hipótese: uma varredura por `dataPreview` na TADIR
  (`object = 'CLAS'`, `obj_name LIKE 'Y_TRAN%' OR LIKE 'Y_SM30%'`, `devclass = '$TMP'`) com
  `deleteObject` de cada um — mesma família da regra "sessão viva > 5 min é erro": resíduo de execução
  é erro, não estado. **Provaria:** o `$TMP` do s4h volta ao zero de drivers depois de qualquer sessão,
  inclusive a que quebrou. **Medir:** contar hoje (o s4h deve ter sobras dos itens 17/18); rodar a
  varredura; contar de novo. Cuidado a decidir: driver que ALGUÉM pediu para manter (`keepDriver: true`
  do item 18 para inspeção) cai na mesma regra — a varredura precisa de uma janela (só mais velhos que
  N min, `changedAt` da TADIR) ou de um sufixo que a exclua. Se I30 sair, a limpeza mora lá.

## Forms sem GUI (prancheta HTML)

- [x] I35. **Forms pela prancheta HTML — criar sem GUI, provar por PDF** — desdobramento da sabatina de
  2026-08-31 (a I22 rendeu render/anatomia; esta CRIA). Hipótese em quatro peças: (1) **cópia sem GUI** —
  Smart Form por `CL_SSF_FB_SMART_FORM` (`XML_DOWNLOAD` → `ENQUEUE`/`XML_UPLOAD`/`STORE`), Adobe por
  `CL_FP_HELPER=>CONVERT_XSTRING_TO_FORM` + `CL_FP_WB_FORM/INTERFACE=>CREATE` (fonte: abapGit,
  `pesquisa-apis-sap-cookbook.md § 9` — não medido); (2) **escada da mutilação** — partir do form copiado
  que sabemos renderizar, mutilar o layout até UM título, renderizar, olhar o PDF, subir um elemento por
  vez, construindo a tabela `elemento HTML ↔ nó do form ↔ PDF visto`; (3) **prancheta HTML com vocabulário
  FECHADO** — o design nasce em HTML só com as peças que a conversão prova entregar (folha de estilo fixa
  espelhada no template do form); peça fora do vocabulário = erro duro, nunca "melhor esforço" —
  fidelidade browser→papel por construção, não por promessa; (4) **interface adiada** — degraus estáticos
  (`<draw>`) primeiro; campo com dado usa a interface do form copiado; gerar SFPI do zero é degrau tardio.
  **Gate:** o ADS do s4h/moovi 250 (único sistema alcançável) está morto (SOAP 100.101, 2026-08-30) —
  logo a escada NASCE no Smart Form (render OTF→PDF sem ADS, medido) e o Adobe fica em cópia (assert por
  tabela) até o ADS viver. **Provaria:** "desenhar em HTML e virar formulário SAP provado por PDF" —
  criação de form sem abrir SMARTFORMS/SFP, com aprovação visual que corresponde ao impresso.
  **Medir:** fatiado nos itens 40–43 da fila (gate ADS · cópia Adobe · escada Smart Form · conversor Adobe).
  > promovida: fila 40–43 (2026-08-31)

- [ ] I49. **Smart Form do ZERO por `FB_CREATE_FORM`** — achado no item 42 ao procurar o gerador: ao lado do
  `FB_GENERATE_FORM` mora `FB_CREATE_FORM( i_formname i_formtype i_template i_global_data i_import_parameters
  i_tables i_exceptions i_with_dialog )` — cria um form NOVO, com `i_template` (partir de outro) e
  `i_with_dialog` (o default é `'X'`, isto é, GUI; o `' '` é o que interessa). Hoje a escada só sabe PODAR
  uma cópia; com isto a prancheta poderia nascer de um form vazio, com a interface montada por parâmetro em
  vez de herdada. **Provaria:** que a construção não depende de existir um form parecido para copiar — e que
  a `<INTERFACE>` pode ser DECLARADA (o degrau "campo com dado" que ficou de fora do item 42).
  **Medir (s4h, `$TMP`):** `FB_CREATE_FORM i_with_dialog = ' '` num driver → STXFADM/TADIR; depois
  `subirSmartFormXml` de um XML montado sobre esse esqueleto → `FB_GENERATE_FORM` → render → PDF olhado.
  Contraprova: com `i_with_dialog = 'X'` no classrun deve dar o "Envio da tela … impossível" do item 41.

- [ ] I50. **Assert VISUAL de PDF na lib (não só `%PDF` e texto)** — o item 42 só fechou porque o PDF veio
  para o disco (`salvarPdfEm`) e virou PNG por PyMuPDF, que já estava na máquina: foi olhando a página que se
  viu o texto truncado em 132 e a re-quebra da janela movida — coisas que `contemTexto` não pega. Hipótese: um
  degrau de assert entre "tem `%PDF`" e "um humano olhou" — número de páginas, caixa de cada bloco de texto,
  e **diff de imagem contra um PDF de referência** (o degrau anterior da escada). **Provaria:** regressão
  visual de form detectada sem ninguém abrir o arquivo. **Medir:** rodar o mesmo form duas vezes e comparar
  os PNGs (idêntico); mudar 1 cm na janela e ver o diff acusar; decidir se a rasterização entra na lib
  (dependência nova, contra a regra de zero-dep) ou fica como receita da skill `sap-testes`.

- [x] I66. **Campo FORMATADO no Markdown — `&VAR(10CR)&`, e o tipo por trás dele** — achado do item 48
  (2026-09-01): o degrau 1 entrega campo com dado, mas com **um só tipo, `STRING`**, e sem opção de
  formatação; o `SF_EXAMPLE_01`, lido no mesmo item, usa `&WA_BOOKING-FORCURAM(10CR)&` — parênteses com
  **largura + opções** (`C` = comprimir espaços, `R` = alinhar à direita; a família tem `.N` casas, `T`
  sem separador de milhar, `Z` sem zeros). Hoje quem quer valor numérico alinhado passa a string já
  formatada em JS, e o form não sabe que aquilo é número. **Provaria:** que o mesmo Markdown imprime uma
  coluna de valores ALINHADA e um total com separador do país — o que separa "documento com campo" de
  "documento de negócio", e o que a tabela do item 49 vai exigir na primeira coluna de dinheiro.
  **Medir (s4h, `$TMP`, `Y_SF_MD66*`):** (1) sintaxe no Markdown — algo como `{{TOTAL:10CR}}` ou
  `{{TOTAL|moeda}}` (decidir ANTES: o vocabulário é fechado, e a forma escolhida vira contrato); (2) emitir
  `&TOTAL(10CR)&` e medir o PDF com `TYPENAME` numérico de verdade (`WERTV8`/`CURR`, `DATS`, `QUAN`) no
  lugar de `STRING` — o `prepararVariaveis` já aceita `tipo`, mas nunca foi medido fora de `STRING`, e o
  literal ABAP `'12345'` para um campo CURR pode não converter; (3) contra-prova: largura menor que o valor
  (o SAPscript trunca? preenche com `*`?) e opção inexistente; (4) medir se a **moeda/decimal** segue o
  mandante (TCURX/USR01) ou o `docparams` — é o tipo de diferença que só aparece no papel do cliente.
  > promovida: fila 66 (2026-09-02)

- [x] I84. **Acabamento de tabela que o Markdown não sabe pedir — `SHADING`, mesclagem e rodapé** — achado
  do item 49 (2026-09-01): a construção do nó `SE` mediu três coisas que o SSFO tem e o `|` do Markdown
  não expressa — `SHADING` por célula (fundo cinza, hoje sempre `000`), célula que ocupa mais de uma
  coluna, e o evento `EVTYPE=F` (rodapé de tabela, que no molde carrega a linha de totais). Hoje
  `xmlTabelaSmartForm` emite cabeçalho e corpo, com filete e nada mais. **Provaria:** que uma fatura de
  verdade — cabeçalho sombreado, coluna de total mesclada no rodapé — sai sem GUI, e que a fronteira entre
  "o que o autor escreve" e "o que o chamador configura" está no lugar certo. **Medir (s4h, `$TMP`,
  `Y_SF_I84*`):** (1) `SHADING` com valor diferente de `000` na `CELLS` e o PDF olhado (o campo é
  intensidade? cor?); (2) uma célula com `CWIDTH` somando duas colunas e o que acontece com as vizinhas;
  (3) evento `F` com uma linha de totais, e se ele repete por página quando a tabela quebra (é o cruzamento
  com o item 50); (4) decidir a superfície: opção de `xmlTabelaSmartForm` (o chamador configura) ou
  extensão de sintaxe (o autor escreve) — **a segunda contraria o vocabulário fechado, e é isso que a
  medição tem de informar**.
  > renumerada I67 → I84 em 2026-09-01: o número colidia com a I67 das sessões órfãs (achado do item 50),
  > que é a referenciada pela fila (itens 50/51 e pendência do 15). Nenhuma referência externa apontava
  > para esta.
  > promovida: fila 63 (2026-09-01)

- [ ] I68. **A sessão do `connect` não tem senha, e o classrun mente sobre isso** — achado do item 49
  (2026-09-01): `conexaoAtual()` devolve `cfg.pass = ''` (quem sustenta a sessão é o cookie), e o
  `deployAndRun` só roda em **sessão nova** quando há senha — sem ela cai no retry na MESMA sessão, onde a
  classe recém-ativada responde `Error: Class does not implement if_oo_adt_classrun~main method!`. A
  mensagem é do load antigo, mas parece erro de código: custou três rodadas até o `deploySource` mostrar
  `created: true, activated: true, hasError: false`. **Provaria:** que o gotcha mais caro do canal classrun
  para de se disfarçar de bug do usuário. **Medir (s4h, `$TMP`):** (1) reproduzir com sessão cacheada e
  confirmar que 5/5 tentativas falham (é determinístico, ou o load vira sozinho depois de N segundos?);
  (2) se for determinístico, `deployAndRun` deve **recusar antes da rede** quando `!cfg.pass` e a classe
  foi criada/alterada agora, com a mensagem certa ("classrun exige senha no cfg: em sessão só-cookie a
  classe recém-ativada roda o load antigo"); (3) medir se `sessaoStateless()` (que herda o cookie) escapa
  do load antigo — se escapar, é a saída sem senha, e vale mais que a mensagem.

- [ ] I69. **O BDS como canal de ARQUIVO — e ele é RFC** — achado do item 51 (2026-09-01): caçando a via da
  SE78 apareceu a família `BDS_BUSINESSDOCUMENT_*`, e **oito delas têm `FMODE='R'`** (`CREA_TAB`,
  `GET_TAB`, `GET_FILES`, `GET_INFO`, `GET_URL`, `DELETE`, `CONFIRM`, `CRE_NV_F`) — ou seja, subir e baixar
  arquivo do SAP **por SOAP puro, sem sessão ADT e sem driver classrun**. O item 51 usou a API OO
  (`cl_bds_document_set`) porque estava dentro de um driver de qualquer jeito; a via RFC não foi tocada.
  **Provaria:** que a lib ganha um canal de arquivo que sobrevive ao ADT fora do ar (o que aconteceu em três
  sessões deste mês) — anexo de documento, planilha de entrada, PDF gerado que precisa voltar para o SAP.
  **Medir (s4h, classe de documento de teste):** (1) `BDS_BUSINESSDOCUMENT_CREA_TAB` com um binário pequeno
  e o `GET_TAB` de volta, comparando **hash** byte a byte; (2) qual `classname`/`classtype` aceita conteúdo
  livre (a `BDS_LOCL` lista as classes; a do gráfico é `DEVC_STXD_BITMAP`/`OT`) e se dá para criar uma nossa;
  (3) o TETO de tamanho por SOAP (o `RFC_READ_TABLE` já mostrou que o canal tem limites) e o comportamento
  em binário grande; (4) `GET_URL` — se devolve URL de ICF servível, é canal de download sem base64.
  **Risco a medir:** o BDS é repositório de conteúdo do cliente; guard-rail provável é recusar classe que
  não seja de teste, e nunca apagar documento que a lib não criou.

- [x] I70. **Timbre: gráfico dentro da janela de cabeçalho** — achado do item 51: o nó `GR` foi medido na
  janela MAIN (flui com o texto) e numa janela `WTYPE=G` própria, mas **não** dentro da janela `T` de
  cabeçalho que o degrau 3 constrói. É o caso real do formulário de cliente — timbre no alto de toda página
  —, e hoje o front-matter só aceita uma LINHA DE TEXTO como `cabecalho`. **Provaria:** que "parecer do
  cliente" (a frase que abriu o item 51) se resolve inteira pelo documento, sem escrever XML à mão.
  **Medir (s4h, `$TMP`, `Y_SF_I70`):** (1) pendurar um `GR` no `sf:PROC_CTRL/RC` da janela de cabeçalho,
  ao lado do `TI`, e ver o PDF nas DUAS páginas (a janela é repetida pela página que aponta para si mesma);
  (2) a altura fixa de 1,2 cm do `LAYOUT_PADRAO` corta o gráfico? — a hipótese é que sim, e que a altura
  passe a sair do tamanho do gráfico (`graficoInfo` já devolve em cm); (3) a sintaxe: `logo: ZLOGO_ACME` no
  front-matter, com `alinhamento` — e se `cabecalho` + `logo` convivem na mesma janela.
  > promovida: fila 67 (2026-09-02)

- [x] I74. **A API ABAP que CONSTRÓI XFA — a família `CL_SXFT_*` / `IF_SXFT_*`** — achado do item 53: o
  migrador Smart Form → Adobe não escreve XML; ele monta uma árvore de objetos (`CL_SXFT_TEMPLATE`,
  `IF_SXFT_FACTORY`, `IF_SXFT_SUBFORM`, `IF_SXFT_FIELD`, `IF_SXFT_DRAW`, `IF_SXFT_PAGEAREA`,
  `IF_SXFT_CONTENT_TEXT`, `IF_SXFT_MEASUREMENT`, …) e chama `render( ostream )` no fim. São ~87 objetos, com
  `CL_SXFT_API_DEMO` ("Example Class for API Usage", 23 KB) mostrando o uso. **Provaria:** que o emissor XFA
  da fila 43 pode nascer PENDURADO NUMA API DO SAP em vez de montar XDP como string — o mesmo salto que o
  `xmlTabelaSmartForm` deu quando parou de concatenar tags. **Medir (s4h, `$TMP`, driver classrun):** (1) ler
  o `CL_SXFT_API_DEMO` e reproduzir o menor template possível (uma pageArea A4 + um `draw` com texto) até o
  `render` devolver xstring; (2) gravar esse xstring num SFPF de POC (`FPLAYOUTT`, pela `set_layout_data`) e
  conferir que a estrutura bate byte a byte com o que a migração produz para o mesmo conteúdo; (3) medir o
  custo: quantas chamadas por bloco de Markdown, contra a alternativa de emitir a string. **Fica fora:** o
  render por ADS (item 43, SXD).
  > promovida: fila 57 (2026-09-01)

- [x] I75. **`migrarSmartFormParaAdobe` como operação da lib** — achado do item 53: a via está medida e cabe
  em três chamadas (`TR_TADIR_INTERFACE` × 2 → `cl_ssf_migration=>migrate` → `SELECT` na `FPLAYOUTT`), e a
  escada MD→SF (itens 46, 48–52) já produz o Smart Form de entrada. **Provaria:** que "Markdown → PDF Adobe"
  sai de graça, sem escrever emissor XFA nenhum — o caminho barato para o mesmo destino da fila 43.
  **Medir (s4h):** migrar cada degrau da escada (texto · campo · tabela · páginas · imagem · estilo) e
  registrar, degrau a degrau, o que sobrevive no XDP e o que se perde — a tabela, por exemplo, está DESLIGADA
  no `set_default_migrating_options( )` e precisa de `options-table = 'X'`. O produto é a tabela de perdas,
  que é o que decide se essa via substitui ou só complementa o emissor próprio. **Depende de:** para VER o
  PDF é preciso ADS (SXD); a medição do XDP é no s4h.
  > **o "Medir" desta ideia JÁ FOI FEITO pelo item 54 (2026-09-01)**: os quatro degraus foram migrados e a
  > tabela de perdas está em `receita-forms.md § Pedra de Roseta`. O que sobra aqui é **implementação** —
  > `migrarSmartFormParaAdobe` com `table`/`header_footer`/`text_binding` ligados por padrão (o default do
  > SAP achata a tabela e perde o campo, calado).
  > ✅ **FEITA pelo item 55 (2026-09-01)**: `migrarSmartFormParaAdobe` está em `forms.mjs` (E2E 30/30 no s4h),
  > com as três opções ligadas por padrão, `anatomiaXfa` como contra-prova e aviso quando o XDP vem sem texto.
  > `receita-forms.md § A migração como OPERAÇÃO da lib`.

- [x] I77. **O nó de texto que a lib CONSTRÓI é monolíngue — e o silêncio é total** — achado do item 54
  (2026-09-01, medido nos dois sentidos): `xmlTextoSmartForm` emite só `<TEXT>`, sem `<T_TEXT>` por idioma
  (decisão do item 42, "o texto saiu no PDF sem ele" — saiu porque a impressão era na MESMA sessão). Medido
  agora: o mesmo documento migrado numa sessão de outro idioma mantém a **estrutura inteira** (14 `<draw>`,
  tabela, cabeçalho, bordas) e perde **todo** o texto construído — só o nó herdado do molde, que tem
  `<T_TEXT>` em D, sobrevive. Sem erro, sem aviso. **Provaria:** que um documento da lib impresso por um
  usuário de outro idioma de logon não sai em branco — o cenário é banal em cliente (usuário EN num sistema
  com texto gravado em PT). **Medir (s4h):** (1) publicar um documento em P e renderizar por
  `SSF_FUNCTION_MODULE_NAME` numa sessão EN — a hipótese é PDF com a forma e sem palavras; (2) fazer
  `xmlTextoSmartForm` emitir `<T_TEXT>` no idioma da sessão (`cfg.lang`, que a `conexao` já sabe) e repetir;
  (3) decidir o contrato: um idioma, uma lista de idiomas, ou avisar no `publicarMarkdown` quando o idioma
  da sessão ≠ `MASTERLANG` do molde. **Risco:** `trocarTextoSmartForm` já reescreve o `T_TEXT` dos idiomas
  que EXISTEM no nó do molde — o comportamento dos dois tem de convergir, não divergir mais.
  > avanço pelo item 58 (2026-09-01): o caminho `astParaXfa` NÃO herda o problema — o texto vive no
  > próprio XDP, não em tabela por idioma. O que a ideia mede continua valendo para o caminho MD→SF
  > (impressão Smart Form e migração), que segue monolíngue.
  > promovida: fila 61 (2026-09-01)

- [x] I79. **As bordas da tabela não viajaram — e a diferença está no Smart Style, não na opção** — observado no
  item 55 (2026-09-01, sem causa isolada): o mesmo documento com tabela, migrado com `options-table = 'X'`, saiu
  com **3 `layout="table"` e ZERO `<edge>`** usando o `SF_STYLE_01` (`ESTILO_PADRAO`), enquanto o corpus do item
  54 (Smart Style próprio `Y_SF_MD`) tinha **48 `<edge>`**. A opção da lib é a mesma nos dois (`bordaTabela:
  'baixo'`), então o que muda é o estilo — ou o parágrafo de célula (`AS`/`TB` × `TB`/`TH`), ou algo que o SSST
  próprio grava e o do molde não. **Provaria:** que a borda do papel chega ao XFA — sem isso a tabela migrada sai
  sem filete, e é a diferença mais visível entre o PDF do Smart Form e o do Adobe. **Medir (s4h, `$TMP`, só
  migração + leitura):** (1) o MESMO markdown publicado duas vezes, uma com `ESTILO_PADRAO` e outra com
  `ESTILO_JBV`, migrados com as mesmas opções — contar `<edge>` nos dois XDP; (2) se a diferença for o estilo,
  isolar o campo do `STXSPARA`/nó `SE` responsável comparando os dois XML de Smart Form; (3) se não for,
  contrapor com uma tabela de borda `todas` para ver se a borda viaja em ALGUMA configuração.
  > dado novo do item 58 (2026-09-01): o gabarito saiu com **zero `<edge>`** MESMO com o `Y_SF_MD`
  > (recém-publicado pela sessão, `publicarSmartStyle` na hora) — o corpus do item 54 tinha 48 com o
  > mesmo estilo e as mesmas opções. A hipótese "é o Smart Style" enfraqueceu: algo mais decide
  > (ordem de criação? o nó SE do documento? versão do estilo no momento da migração?). O passo (2)
  > da medição ganhou um candidato: diffar o XML de Smart Form do item 54 contra o do item 58.
  > promovida: fila 62 (2026-09-01)

- [x] I82. **Substituir o layout de um Adobe Form EXISTENTE por um XDP de arquivo — o passo manual de nota
  SAP** — demanda real do projeto sap-note (2026-09-01, nota 3751960): o passo manual é "SFP → form
  `EDOC_BR_DACTE_OP` → substituir o layout pelo XML anexo (XDP) → salvar e ativar". A lib hoje NÃO faz:
  para Adobe, `forms.mjs` copia, apaga, renderiza, lê o XDP e migra — o upload de XML só existe para
  Smart Form (`subirSmartFormXml`, formato SF-XML ≠ XDP). A porta é conhecida e a persistência já foi
  medida pela leitura: o XDP mora na **`FPLAYOUTT` por idioma** (itens 53/54), persistência de
  `if_fp_layout~get_layout_data`/`set_layout_data` — a MESMA porta que a fila 43 planeja
  (`GET_LAYOUT( )->SET_LAYOUT_DATA` sobre o clone do 41) e que a I74(2) usa como assert. O que nunca foi
  medido é a ESCRITA com XDP arbitrário vindo de arquivo, num form existente (lock/save/versão I).
  ⚠️ O "e ativar" tem gate próprio, já medido: ativar exige ADS (`form_activate` → `CX_FP_API_INTERNAL`
  no s4h, item 53); ADS do s4h morto (2026-08-30), SXD vivo com pendência Java (item 40). A operação
  entregaria o layout gravado INATIVO — como `migrarSmartFormParaAdobe` já faz — e a ativação fica
  condicionada a sistema com ADS. **Provaria:** que o passo "substituir layout na SFP" de nota SAP sai
  sem GUI — a metade que falta para nota de Adobe Form ser 100% agente. **Medir (s4h, `$TMP`, sobre um
  clone do item 41 — nunca sobre form standard):** (1) `cl_fp_wb_form=>load` → `get_layout( )` →
  `set_layout_data` com XDP lido de arquivo → save; (2) contra-prova por `SELECT` na `FPLAYOUTT`
  (bytes/idioma/STATE — o gotcha "XDP por idioma" do item 53 vale aqui) e `anatomiaXfa` do que voltou;
  (3) o caso da nota: um XDP nascido FORA (anexo, outro sistema) — o save aceita ou valida contra a
  interface/contexto?
  > avanço pelo item 57 (2026-09-01): a ESCRITA com XDP arbitrário está medida pela metade — sobre o
  > wb devolvido pelo `migrate` (sem `load`), `set_layout_data( i_set_xliff_ids = abap_false )` +
  > `save` gravou na FPLAYOUTT **byte a byte** um XDP sem relação com a interface/contexto, sem
  > validação nenhuma (a resposta do (3) é: aceita). O que segue não medido é o (1) como a nota pede:
  > `load` de um form EXISTENTE (o wb do migrate não passa por ele) e o efeito do
  > `i_set_xliff_ids = abap_true` (default). Receita: `receita-forms.md § A API que CONSTRÓI XFA`.
  > promovida: fila 59 (2026-09-01)

- [x] I85. **O emissor XFA da AST pendurado na `CL_SXFT_*` — Markdown → Adobe Form sem migração** —
  achado do item 57 (2026-09-01), que fechou a I74: a API constrói XDP com a mesma assinatura da
  migração, o exData/XHTML entra por `set_content_as_dom`, o custo é ruído (100 blocos = 34 ms) e o
  xstring gravado num SFPF persiste byte a byte. Hoje o caminho MD→Adobe é MD→SF (`markdown.mjs`) →
  `migrarSmartFormParaAdobe` — dois objetos intermediários (SSFO + estilo) e as perdas da Pedra de
  Roseta (recuo pendurado, numeração vira texto, `&SFSY-PAGE&`). Um emissor `astParaXfa` sobre a
  `CL_SXFT_*` traduziria a MESMA AST do `markdown.mjs` direto para XDP, com o dicionário do item 54
  como contrato (draw+exData/XHTML por bloco, subform `layout="tb"/"table"/"row"`, field+bind para
  `{{VAR}}`, proto+use para cabeçalho/rodapé) — e resolveria no XFA o que a migração perde (ex.:
  `$layout.page( )` para numerar página). **Provaria:** que a fila 43 não precisa de emissor
  string NEM do Smart Form intermediário — a prancheta vira Adobe Form nativo, pronto para o ADS.
  **Medir (s4h, `$TMP`, driver classrun):** (1) traduzir os degraus da escada (texto · campo ·
  tabela · imagem) da AST para chamadas `CL_SXFT_*` e comparar `anatomiaXfa` contra o corpus
  migrado do item 54 — mesma contagem de subform/draw/field/edge é o assert; (2) gravar no SFPF de
  POC pela via do item 57 e conferir a FPLAYOUTT; (3) o PDF fica para o ADS (fila 43/SXD) — até lá
  o teto é o mesmo do item 54: estrutura conferida no XDP. **Risco:** o driver é GERADO por
  documento (a AST vive no Node) — ou a lib emite o driver ABAP por documento, como
  `publicarMarkdown` faz com o SF-XML, ou nasce um driver genérico que recebe a AST serializada.
  > promovida: fila 58 (2026-09-01)

## Jobs e agendamento

- [x] I71. **Job CLÁSSICO (SM36/SM37) — a outra metade do agendamento** — achado do item 47 (2026-09-01),
  que o próprio item mandou virar ideia se aparecesse. O Application Job é a camada nova (catálogo +
  template + classe); por baixo dela o SAP monta um job de background comum — a POC leu a linha do job
  na **TBTCO** (`JOBNAME` GUID de 32, `JOBCOUNT`, `STATUS='A'`, `SDLUNAME`) e o log dele por
  `BP_JOBLOG_READ`. O que a lib NÃO tem é criar um job clássico: `JOB_OPEN` → `SUBMIT … VIA JOB` →
  `JOB_CLOSE`, que é como roda 99% do batch de cliente (report Z com variante, periodicidade, step
  múltiplo). **Provaria:** que a lib agenda o que já existe no cliente — report + variante — sem
  depender de alguém ter escrito uma classe com `IF_APJ_RT_EXEC_OBJECT`. **Medir (s4h, `$TMP`):**
  (1) report Z que escreve numa tabela `$TMP`; (2) `JOB_OPEN`/`SUBMIT VIA JOB`/`JOB_CLOSE` num driver
  classrun — atenção ao carimbo do item 7: **`SUBMIT` de dentro do classrun deu HTTP 500**, e é
  exatamente isso que precisa ser re-medido com `VIA JOB` (que não roda em linha, agenda);
  (3) assert por TBTCO/TBTCP + a linha da tabela em outra LUW; (4) variante (`RS_VARIANT_CREATE`) e
  periodicidade; (5) desfazer por `BP_JOB_DELETE`.
  > promovida: fila 68 (2026-09-02)

- [x] I72. **Job PERIÓDICO de aplicação — o que `is_scheduling_info` faz de verdade** — ficou fora do
  item 47 por recorte: a POC mediu só `start_immediately`. `CL_APJ_RT_API=>SCHEDULE_JOB` aceita
  `is_scheduling_info` (granularidade, valor, timezone, dias da semana, dia do mês, calendário de
  exceção) e `is_end_info` (fim por data ou por número de execuções), e o template guarda
  `JOB_PERIODIC_GRANULARITY`/`JOB_PERIODIC_VALUE` na `APJ_W_JT_ROOT` — campos que a lib preenche com
  zero hoje. **Provaria:** que a lib entrega o caso REAL do cliente (o job que roda toda madrugada),
  não só o disparo único. **Medir (s4h, `$TMP`):** (1) agendar de minuto em minuto com fim em 2
  execuções; (2) esperar as duas e conferir DUAS linhas na tabela do executor, com timestamps
  diferentes; (3) ver o que a TBTCP (o job periódico "pai") e a `APJ_D_JOB_EXE` mostram; (4) cancelar a
  série e provar que a terceira não veio; (5) medir o efeito do `timezone` (o s4h tem fuso torto — ver
  `dumps.mjs`).
  > promovida: fila 69 (2026-09-02)

- [x] I73. **Inventário de jobs de aplicação de um sistema de cliente (só leitura)** — achado do item 47
  > promovida: fila 70 (2026-09-02)
  ao mapear onde o SAJC/SAJT moram: existem DUAS camadas, e ninguém as vê juntas. Repositório
  (`APJ_W_JCE_ROOT`/`APJ_W_JT_ROOT`, sem mandante, o que o dev cria) e **dado de mandante**
  (`APJ_X_JT_ROOT`, os templates que os USUÁRIOS criam pela app Fiori — o s4h tem um com nome GUID,
  `LAYER_C='4'`, feito por um usuário de negócio) mais a execução (`APJ_D_JOB_EXE`, com
  `JOB_CATALOG_ENTRY`, `JOB_TEMPLATE_NAME`, `SCHEDULING_TIMEZONE` e o `JOB_TEXT` que a pessoa digitou).
  **Provaria:** "o que está agendado neste sistema, por quem, com que parâmetros e quando rodou pela
  última vez" — em uma passada só de leitura, do jeito que o `cobertura-tadir.mjs` faz com a TADIR.
  **Medir (s4h, `dataPreview` agregando, sem driver):** (1) contagem por catálogo e por criador; (2)
  cruzar `APJ_D_JOB_EXE` × TBTCO para status e último início; (3) conferir que a leitura roda inteira
  por `dataPreview`/`readTable` (sem classrun), que é o que a torna segura em sistema de cliente.

## Engenharia reversa do standard

- [ ] I34. **Engenharia reversa do standard, por método — transação, app Fiori e RAP** — o aprendizado
  decisivo do item 37 veio de ler o código da própria SAP (demos `FDT_DEMO_%`), não de documentação.
  Hipótese: um MÉTODO repetível de dissecação rende receita nova a custo previsível, em três alvos:
  **transação clássica** (TSTC → programa → includes/classes via `deps.mjs` → FMs que fazem o trabalho),
  **app Fiori standard** (catálogo → component/manifest → OData/CDS por trás → o que o app chama de verdade)
  e **objeto RAP standard** (SRVB → SRVD → BDEF → CDS → behavior implementation — como a SAP estrutura o
  que a lib já cria em Z). "Escrever objeto tipo X" passa a começar por "dissecar o standard que faz X" —
  os "tutoriais" que o Joris quer prontos quando formos escrever programas/objetos. Primo do item 25
  (lá: composição de UMA solução real; aqui: o standard como professor, método antes de catálogo — sem
  virar enciclopédia de transações). **Provaria:** que engenharia reversa sob demanda rende receitas/gotchas
  novos por alvo dissecado — e quantos, a que custo. **Medir (piloto, s4h, só leitura):** 1 transação
  pequena e representativa (ideal: uma que a moovi use) + 1 app Fiori standard + 1 objeto RAP standard;
  para cada um, o mapa completo (entrada → peças → o que a SAP faz que não sabíamos) e a contagem
  receitas novas × tempo. Se render, vira procedimento (seção "cobaia standard primeiro" na skill
  sap-testes/investigacao) e os alvos seguintes entram sob demanda; se não render, morreu barato.

- [ ] I61. **`$configuration` como validador de REFERÊNCIA, antes da rede** — achado do item 44 (2026-09-01):
  além do `$schema` (que valida forma: tipo, tamanho, enum, faixa), cada coleção AFF serve um
  `…/$configuration` que declara **o tipo de repositório de cada campo** — no NROB, `numberLengthDomain` é
  `DOMA/DD` e `subType` é `DTEL/DE`. Hoje a lib valida forma na mão (o `validar` de cada módulo repete o que o
  schema já diz) e **não valida referência nenhuma**: `dominio: 'NAO_EXISTE'` passa por todos os guard-rails e
  só falha na ativação, com a mensagem do SAP. **Provaria:** que o sistema-alvo sabe dizer, sem spike, quais
  campos de um fonte AFF são ponteiros para objetos — e que dá para conferir a existência de cada um por um
  `GET` barato antes de gravar. **Medir (s4h, só leitura):** baixar o `$configuration` das 27 coleções com
  `$schema` e contar quantas declaram `sap.adt.types`; para o NROB e mais duas, montar `validarReferencias`
  (campo → tipo ADT → `getObject`) e medir o custo (ms por referência) e o acerto (referência inventada →
  recusa antes da rede; referência real → passa). Se o `$configuration` cobrir pouco, morreu barato — o
  fallback é declarar as referências no módulo de tipo, o que já é o que `dependencias` faz pela metade.

- [x] I63. **A OUTRA API REST do CTS (`if_cts_rest_api`)** — achado do item 39 (2026-09-01): quem chama
  `TR_INSERT_REQUEST_WITH_TASKS` com `it_users`/`it_attributes` preenchidos é `CL_CTS_REST_API_IMPL`, uma
  implementação REST do CTS que **não é a do ADT** (o `tm:root` do `cts/transportrequests` só manda
  descrição/tipo/alvo/projeto, e por isso a TR nasce sem tarefa). A interface tem `create_request`,
  `create_request_from_package`, `delete`, e o item leu só o fonte. **Provaria:** que existe um endpoint HTTP
  para criar TR COM tarefas sem driver classrun — hoje a paridade custa um deploy de classe. **Medir (s4h, só
  leitura primeiro):** achar o handler ICF que expõe `if_cts_rest_api` (SICF sob `/sap/bc/cts*`, ou o CTS
  Deploy Web Service), ler o contrato pelo `$metadata`/WSDL, e só então um POST de criação em `$TMP`
  comparando E070/E070A com o que o driver do item 39 produz. Se existir, `criarRequestComTarefas` perde o
  driver; se não existir, a lib fica como está e o custo foi um GET.
  > promovida: fila 72 (2026-09-02)

## Comparação entre sistemas

- [x] I80. **O ESCOPO do diff — "o transporte chegou inteiro?"** — achado do item 35 (2026-09-01): o
  `compararObjetos` responde por objeto, mas a lista de objetos vem à mão, e a pergunta real do cliente
  nunca é sobre um objeto: é "a TR `S4HK9xxxxx` chegou inteira no QA?" ou "o pacote `ZFI` é o mesmo nos
  dois?". Os dois insumos já existem e nenhum está ligado ao diff: `cts.lerRequest` devolve os objetos de
  uma TR (`R3TR`/`LIMU`, item 14) e `search.buscar` varre por padrão de nome. **Provaria:** que a lib
  responde a pergunta operacional inteira — e, no caso da TR, que ela distingue os três desfechos que hoje
  se confundem num "não sei": objeto ausente no destino (não importou), presente e diferente (importou
  versão velha, ou alguém alterou lá) e presente e igual. **Medir (s4h × sxd, só leitura):** (1) mapear
  `E071 PGMID/OBJECT/OBJ_NAME` → `{tipo, nome}` do registro da lib e contar quantos tipos de uma TR real o
  diff alcança (o `LIMU METH` é PARTE de classe — cai no `main`?); (2) rodar sobre um pacote Z de 20–50
  objetos e medir custo por objeto (o diff faz 1 GET do XML + 1 por parte: a classe custa 6); (3) decidir
  se o veredito de conjunto vale a pena (`inteiro` × `parcial` × `divergente`).
  > descartada: não há paisagem de transporte entre os ambientes disponíveis — s4h e SXD são sistemas
  > independentes, nenhuma TR viaja de um para o outro, então "a TR chegou inteira no destino?" não tem
  > onde ser medido nem respondido; a criação das TRs já foi validada pelo Joris. Se um dia houver um
  > landscape real (DEV→QA do mesmo trilho), a ideia pode renascer — o desenho (cts.lerRequest +
  > compararObjetos) continua válido. (Joris, 2026-09-01)

- [ ] I81. **O histórico de versões pelo ADT (`versions`)** — achado do item 35 (2026-09-01): todo objeto
  lido traz um `<atom:link href="versions" rel="http://www.sap.com/adt/relations/versions" title="Historic
  versions"/>`, e a lib nunca chamou esse recurso — toda comparação dela é da versão ATIVA. **Provaria:**
  que dá para responder "quando isso mudou, e para quê?" sem SE80/versões no Eclipse — e, junto com o item
  35, que dá para comparar a versão do QA com a versão ANTERIOR do DEV (o caso "importou versão velha").
  **Medir (s4h, só leitura):** `GET <objeto>/versions` numa classe Z com histórico e num objeto padrão;
  ver o que vem (número de versão, TR, data, usuário?), se dá para BAIXAR o fonte de uma versão antiga, e
  se o carimbo de lá sofre do mesmo fuso torto do `changedAt` (medido no item 35: 3 h e 4 h no mesmo par de
  sistemas). Se o fonte antigo vier, `compararObjetos` ganha `versao: 'anterior'` de graça.

- [x] I64. **Inserir objeto na TR sem deploy (`TR_EXT_INSERT_IN_REQUEST`, FMODE='R')** — achado do item 39:
  > promovida: fila 75 (2026-09-02)
  o FM existe, é RFC e recebe `IT_OBJECTS TYPE TREXREQOB`. Hoje a única via da lib para pôr objeto numa TR é
  o deploy com `corrNr` — o que exige mexer no objeto. **Provaria:** montar uma TR de entrega a partir de uma
  LISTA (o que a SE01 faz na mão, e o que um pipeline precisa quando o objeto já está pronto e ativo).
  **Medir (s4h, `$TMP` não serve — objeto local não entra em TR):** criar um objeto transportável descartável
  em pacote Z, inseri-lo por RFC numa TR nova, conferir E071 + `LOCKFLAG='X'` e ler pelo `cts.anatomia`;
  contra-prova com objeto inexistente e com objeto já travado noutra ordem; desfazer com `destravarRequest` +
  `apagarRequestPorRfc`. **Risco a medir junto:** travar objeto tem efeito sobre terceiros — o guard-rail
  provável é recusar objeto que não seja Z/Y nosso.

- [x] I65. **Leitura do CTS por SOAP puro (`TR_EXT_GET_REQUESTS`, `TR_READ_COMM`)** — achado do item 39: os
  dois são RFC. Hoje `lerRequest`/`listarRequests` precisam de sessão ADT (mesmo stateless), e foi
  justamente o ADT que caiu em três sessões deste mês. **Provaria:** que a leitura da TR sobrevive ao ADT
  fora do ar — o que já aconteceu e custou uma sessão inteira. **Medir (s4h, só leitura):** rodar as duas
  vias contra as mesmas TRs (uma modificável, uma liberada, uma com chaves) e diffar campo a campo contra o
  `parseRequest` do ADT; medir o que a via RFC NÃO traz (`wbtype`, `obj_info`, `status_text` são
  enriquecimento do ADT — a hipótese é que sumam). Se cobrir, vira o fallback do `lerRequest`.
  > promovida: fila 71 (2026-09-02)

- [x] I67. **A `conexao` encerrar as sessões que ela mesma abriu** — achado do item 50 (2026-09-01): duas
  sessões 202 minhas ficaram vivas no s4h ao fim da sessão, e a causa é conhecida — o script de sonda chamou
  `cx.sessaoStateless()` e só encerrou `cx.encerrar()`, que por contrato **fecha apenas a sessão de trabalho**;
  `sessaoNova`/`sessaoStateless` devolvem logon PRÓPRIO e o logoff é do chamador. A regra do Joris ("sessão
  viva > 5 min é ERRO do script") transforma isso numa classe de erro que reaparece a cada POC nova, e que
  custou 14 órfãs no item 39. **Provaria:** que a lib pode fechar essa classe sem tirar poder de quem quer
  isolamento — a `conexao` guarda as sessões que abriu (um `Set`) e `encerrar()` faz logoff de todas, com
  `{ manter: true }` para quem quiser a sessão viva de propósito. **Medir (s4h):** contar por
  `TH_USER_LIST` antes/depois de um script que abre 3 `sessaoNova` + 2 `sessaoStateless` e chama só
  `encerrar()` — hoje sobram 5, a hipótese é 0; contra-prova com `{ manter: true }` (sobra 1) e conferir que
  o logoff de uma sessão não derruba o cookie das outras (cada uma tem o seu, mas isso não está medido).
  **Risco:** `deployAndRun` e o classrun abrem sessão por dentro — medir que nenhum deles passa a fechar
  sessão que ainda vai usar.
  > 2026-09-01 (pendência do 15): o defeito alcançou **sistema de cliente** — `canais.mjs` e
  > `cobertura-tadir.mjs` deixaram 2 sessões 202 no **SXD** (medido por `TH_USER_LIST` na mesma sessão,
  > sem abrir sessão nova). Mais um peso para promover.
  > promovida: fila 56 (2026-09-01)

- [x] I86. **Achar o handler HTTP real de `/sap/bc/fp/graphics/bmap/<btype>/<nome>`** — achado do item 65
  (2026-09-02): a URL documentada do gráfico da SE78 dá 404 em TODA variação, em s4h **e** SXD (que
  tem ADS) — resultado idêntico nos dois, o que desmente a hipótese de dependência de ADS/AS Java. O
  nó ICF existe e está ativo até `…/bmap/bcol` (200 vazio), mas nenhum nome de gráfico resolve, e a
  busca ADT só acha o modelo de nó da INTERFACE (`CL_FP_GRAPHIC_URL`/`_CONTENT`/`_`), não o serviço
  ICF de verdade. **Provaria:** qual classe atende de fato esse handler (e se ela exige algo que o
  ADT REST não alcança — parâmetro SICF por GUID, feature flag, nó filho não documentado).
  **Medir:** decompilar a árvore SICF por outro caminho (não só `ICFPARGUID`/`ICFHANDLER`, ex.
  `SICF` completo por GUI Scripting como o item 34 já faz) ou rastrear a chamada por SAT (`gui.mjs`
  do item 30) enquanto o ADS renderiza um form com gráfico. **Fica fora:** subir gráfico por HTTP (a
  escrita é do BDS, item 65 já resolveu por driver).
  > promovida: fila 73 (2026-09-02)
  > FECHADA na fila 73 (2026-09-02): handler = `CL_HTTP_EXT_WEBDAV_SKWF` no nó `/sap/bc/fp`, que lê
  > o MIME Repository (não o BDS). O 404 do item 65 era MIME vazio + cache negativo de 24h — não caixa
  > nem ADS. A lib ganhou `publicarGraficoHttp` (BDS→MIME).

- [x] I94. **Liberar TR pelo ADT (`tm:useraction` de release)** — achado do item 72 (2026-09-02): o fonte
  de `CL_CTS_ADT_TM_RES_COLL_CONT` e a ST `ST_CTS_ADT_TM_MAIN` mostram um `user_action` com `name`,
  `releasetimestamp` e `releaseobjlock` — o Eclipse LIBERA a ordem por esse recurso, e "liberar segue
  fora" da lib desde a I3 (nota da I17). A lib cria, lê, trava, desmancha e apaga TR; liberar é o único
  verbo do ciclo que falta — e é o que um pipeline de entrega precisa no fim. **Provaria:** o ciclo
  completo da TR sem GUI: criar com tarefas (fila 72) → objeto dentro (I64 ou corrNr) → release →
  `TRSTATUS='R'` visto pela listagem RFC da fila 71. **Medir (s4h, TR de POC descartável):** capturar o
  PUT/POST que o release dispara (fonte do handler + tentativa direta com `tm:useraction="release"` ou
  o valor que o fonte usar), medir tarefa vazia × tarefa com objeto, release da tarefa × release da
  ordem, e o erro de quem não é o dono; contra-prova: TR liberada não aceita segundo release. ⚠ TR
  liberada NÃO se apaga (`apagarRequestPorRfc` recusa?) — medir o custo de limpeza ANTES de liberar em
  massa: a POC pode deixar lixo liberado permanente no s4h (decisão consciente, TR nomeada "POC").
  > promovida: fila 74 (2026-09-02)

- [x] I95. **O resto do vocabulário de `useraction` do CTS ADT** — achado do item 74 (2026-09-02): o
  dispatcher `CL_CTS_ADT_TM_REST_RES_CONT->post` (lido no fonte) aceita, além do release, as ações
  `tasks` (criar tarefa avulsa numa TR existente), `reassigntask` (tarefa para outro usuário),
  `moveobjects` (mover entradas entre TR/tarefa — o que a SE01 faz e a lib não tem; par natural da
  I64), `mergerequests`, `sortandcompress`, `lockobjects`, `consistencychecks` e `preparerelease` —
  tudo `POST …/transportrequests/<nr>/<ação>`, algumas com corpo `tm:root`. **Provaria:** a gestão
  completa da TR sem GUI (hoje a lib cria, lê, trava, desmancha, apaga e libera — mas não move objeto,
  não cria tarefa avulsa nem reatribui). **Medir (s4h, TRs de POC):** uma ação por vez, com o corpo
  que o fonte pedir, E070/E071 antes/depois em outra LUW; começar por `moveobjects` e `tasks`, que são
  as lacunas reais. ⚠ O padrão do item 74 vale aqui: HTTP 200 não decide nada — o veredito é o corpo
  (`chkrun`/`tm:`) + tabela.
  > promovida: fila 76 (2026-09-02)

- [x] I96. **O que sobrou do dispatcher do CTS: `lockobject`, `preparerelease` e os resumes de
  release** — achado do item 76 (2026-09-02): das useractions de `CL_CTS_ADT_TM_REST_RES_CONT`,
  ficaram sem medir `lockobject` (POST com corpo de objetos — chama `lock_object` por entrada, o
  que gravaria o LOCKFLAG que o `inserirObjetosNaRequest` deixa vazio), `preparerelease` e os
  resumes (`relwithignlock`, `relobjigchkatc`, `relobjchkobs`, `relwithignwarning` — levam
  `tm:root` com o `user_action` da resposta anterior: o "continuar mesmo assim" do Eclipse).
  **Provaria:** o ciclo de release com interrupção/retomada sem GUI (ATC findings, locks e warnings
  ignorados por decisão explícita) e o travamento de entrada avulsa. **Medir (s4h, TRs de POC):**
  `lockobject` primeiro (LOCKFLAG na E071 antes/depois, outra LUW); depois um release que gere
  check pendente e o resume correspondente com o `user_action` devolvido — ⚠ resume LIBERA de
  verdade: TR nomeada "POC", lixo liberado permanente é decisão consciente, como no item 74.
  > promovida: fila 77 (2026-09-02)

- [x] I97. **O vocabulário do EDITOR de TR — o outro handler do CTS ADT** — achado do item 77
  > promovida: fila 78 (2026-09-02)
  (2026-09-02): a `IF_CTS_ADT_TM_CONSTANTS` declara um vocabulário inteiro que o dispatcher medido
  (`CL_CTS_ADT_TM_REST_RES_CONT`) NÃO roteia (o switch do `post` só tem as 9 ações dos itens
  74–77): `addobject`, `addobjectfromrequest`, `addobjectsfrompackage`, `removeobject`, `editdesc`,
  `changeattributes` (`addattribute`/`removeattribute`/`modifyattribute`), `changetarget`,
  `changeproject`, `changetasktype`, `protect`/`unprotect`, `setstatusmodifiable`,
  `transportchecks`, `transportlogs`, `actionlogs`, `checkruns`, `objectkeys` — cada um com título
  e atom rel próprios, ou seja, um recurso REST do "Transport Request EDITOR" servido por OUTRO
  handler. Entre eles estão lacunas reais da lib: remover entrada (o item 24 mediu que "não existe
  ação de remover no 758" — talvez exista, neste outro recurso), mudar texto/alvo/projeto/tipo de
  tarefa, proteger, e `setstatusmodifiable` (reabrir?). **Provaria:** a EDIÇÃO da TR sem GUI —
  hoje a lib só cria/move/trava/libera; editar mesmo (texto, alvo, entradas uma a uma) é manual.
  **Medir (s4h, TRs de POC):** achar o handler (discovery do ADT + SICF sob `/sap/bc/adt/cts`, ou
  o atom link `modify` que o GET da TR devolve), depois uma ação por vez com E070/E07T/E071
  antes/depois em outra LUW; começar por `removeobject` e `editdesc`, as lacunas mais doídas.

- [x] I98. **O Object Key Editor do CTS ADT (`objectkeys`)** — achado do item 78 (2026-09-02): o
  registro de rotas (`CL_CTS_ADT_RES_APP`) publica `…/<nr>/objectkeys` e `…/objectkeys/checkruns`
  servidos por `CL_CTS_ADT_TM_OBJECT_KEY_RES` — o editor de ENTRADAS DE CHAVE (E071K), que hoje a
  lib só LÊ (`lerRequestPorTabelas`). O GET cru devolveu 400 "I::000" (SCTS_ADT_MSG 009) — deve
  exigir query/corpo que a sonda não deu. **Provaria:** escrever entrada de chave numa TR de
  customizing sem GUI — a metade que falta do TABKEY do item 21 (fatiar já existe; montar não).
  **Medir (s4h, TR W de POC):** ler o fonte de `CL_CTS_ADT_TM_OBJECT_KEY_RES` (o contrato do GET/
  PUT e o que destrava o 400), depois uma entrada de chave real na E071K antes/depois em outra LUW.
  > promovida: fila 79 (2026-09-02)

- [x] I99. **`deleteObject` confere ausência — o DELETE que respondeu ok sem apagar** — achado do
  item 78 (2026-09-02): com o ADT stateful do s4h caído (400 HTML "Service nicht erreichbar"), o
  `deleteObject` de um pacote com `corrNr` retornou SEM lançar e não efetivou nada (TDEVC/TADIR
  intactos, nenhuma entrada de exclusão na E071) — o teardown só percebeu porque confere tabelas.
  Hoje `deleteObject` (adt-client.mjs) confia no status HTTP. **Provaria:** que nenhum caller da
  lib declara "apagado" sem prova — a regra do módulo cts (conferir E070/E071 depois de escrever)
  aplicada ao delete genérico. **Medir (s4h):** reproduzir o delete no estado stateful-caído
  (status/corpo exatos da resposta "ok" mentirosa), decidir onde mora a conferência (no
  `deleteObject` via TADIR por tipo? só nos tipos com `espera` declarado?) e o custo por delete.
  > promovida: fila 80 (2026-09-02)

- [x] I100. **Chave STRING no objectkeys (E071K_STR, `isStringTable=true`)** — achado do item 79
  (2026-09-02): o handler `CL_CTS_ADT_TM_OBJECT_KEY_RES` tem o caminho inteiro para tabela de
  chave string (`check_request_keys_str`, `e071k_str` com `key_lens`), mas a POC só mediu o
  convencional — a lib declara `isStringTable=false` e recusa chave > 120 chars (TABKEY_MAX).
  **Provaria:** transportar entrada de chave que não cabe no TABKEY de 120 (tabela com chave
  string/longa), fechando o único ramo não medido do editor. **Medir (s4h, TR W de POC):** achar
  uma tabela com `is_string_tab='X'` (`get_nametab` via `if_cts_rest_api`, ou DD02L/DDIF), GET
  para ver `tk:isStringTable="true"` e o formato, PUT com `tk:length` (key_lens) e assert na
  E071K_STR em outra LUW.
  > promovida: fila 81 (2026-09-02)

- [ ] I101. **O `TR_EXT_INSERT_IN_REQUEST` recusa MUDO conforme o tipo da TR** — achado do item 81
  (2026-09-02): entrada `R3TR TABU` de tabela de classe de entrega **A** (`DEMO_CLOB_TABLE`,
  `STWD_BO_TOPIC`) foi recusada em ordem **W** com `EV_EXCEPTION = CALL_FUNCTION_ERROR` e `ES_MSG`
  **VAZIO** — e a MESMA chamada passou em ordem **K** (medido nas duas tabelas, nas duas
  direções). Quem paga é o `inserirObjetosNaRequest` (item 75) e o insert automático do
  `gravarChavesNaRequest`: hoje a lib repassa "CALL_FUNCTION_ERROR" sem dizer o que fazer, e o
  usuário não tem como saber que a ordem é do tipo errado. **Provaria:** que a regra é
  `contflag`×`trfunction` (customizing vai em W, classe A/S vai em K) e não outra coisa —
  transformando um erro mudo num guard-rail com a frase certa ("a tabela X é classe A: use ordem
  K"). **Medir (s4h, TRs de POC descartáveis):** matriz pequena — 3 tabelas de classes diferentes
  (A, C, E) × TR K e TR W, olhando `EV_EXCEPTION`/`ES_MSG` de cada célula; conferir se o FM tem
  a checagem no fonte (`TR_EXT_INSERT_IN_REQUEST` → `TR_OBJECT_CHECK`/`CTO_*`) e se existe
  mensagem T100 que a lib possa citar em vez do genérico.

- [ ] I102. **BOPF Business Object (`BOBF`) — o antecessor do RAP, 291 custom no s4h** — varredura da
  lista externa de tipos (2026-09-02): `cobertura-tadir.md` marca BOBF como "NADA — BOPF (antecessor
  do RAP)" sem ideia nem fila; abapGit não suporta (#165). A pergunta é se vale tratar: BOPF é a
  geração anterior ao RAP e pode não compensar nascer como módulo novo (igual ao RAP BO, que a lib
  cobre por composição de DDLS+DCLS+BDEF+SRVD+SRVB). **Provaria:** que BOBF tem (ou não) alguma via
  de leitura/criação por ADT ou driver que justifique a cobertura, ou que o veredito é "ficar fora
  (legado, coberto pelo RAP)". **Medir (s4h, só leitura antes de criar):** discovery por BOBF; se
  houver coleção, GET de um exemplo standard; registrar veredito em
  `pesquisa-tipos-adt-nao-cobertos.md`.
- [ ] I103. **Enterprise Services / proxy (`SPRX`) — 154.783 objetos no s4h, quase tudo auto-gerado**
  — varredura da lista externa (2026-09-02): `cobertura-tadir.md` marca SPRX como "NADA" sem ideia.
  É o volume gigante de proxies de serviço (WS/proxy classes). **Provaria:** que SPRX é quase todo
  auto-gerado pelo WSADMIN/SE80 e não pede módulo de criação SCK; o útil seria só o carimbo do
  tipo na cobertura. **Medir (s4h, só leitura):** discovery por SPRX; amostra dos gerenciados
  (SPRX/D, SPRX/I) para confirmar o veredito; registrar em
  `pesquisa-tipos-adt-nao-cobertos.md` e na `cobertura-tadir.md`.
- [ ] I104. **Search Help (`SHLP`) — a segunda via por driver classrun** — a I2 (2026-08-28) fechou
  SHLP como "só SE11" porque `ddic/searchhelps` não existe no 758; o item 38 (2026-08-31) mediu
  depois que as `DDIF_SHLP_*` existem e que **nenhuma é RFC** (`FMODE` vazio; `F4IF_GET_SHLP_DESCR`
  por SOAP devolve SOAP Fault) — a via candidata é **driver classrun puro**: `DDIF_SHLP_GET` (formato
  do H_T001) → PUT → `DDIF_SHLP_ACTIVATE` → `DD30L`, com delete por `RS_DD_DELETE_OBJ objtype 'H'`.
  A cobertura segue "só SE11", mas a pesquisa de APIs (cookbook § 6) já deixou o desenho pronto.
  **Provaria:** SHLP saindo do "só SE11" por driver, criando uma search help elementar sobre tabela Z
  no `$TMP`. **Medir (s4h):** `TFDIR` das 3 FMs (o `FMODE='R'` esperado se descarta — já medido
  vazio), `DDIF_SHLP_GET(H_T001)` para o formato → PUT + activate → `readTable DD30L
  (AS4LOCAL='A')`; opcional `F4IF_GET_SHLP_DESCR` como assert.
