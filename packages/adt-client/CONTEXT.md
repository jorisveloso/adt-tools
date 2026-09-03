# CONTEXT — vocabulário do adt-client

Modelo de domínio do projeto. Cada termo aqui foi discutido e fixado; o que ainda está em aberto
fica marcado como tal. Fonte de cada afirmação entre parênteses.

## Termos

### Tipo de objeto
O tipo de um objeto ABAP — `TABL`, `CLAS`, `DDLS`… — como aparece na TADIR e na request de
transporte. **Não** é "tipo de documento": em SAP, *documento* é coisa de negócio (documento de
venda, fatura), e as receitas de BDC/BAPI usam a palavra nesse sentido. (fixado 2026-08-28)

Um tipo de objeto tem três identificadores; o **canônico na lib é o `libKey`** (é a identidade do
módulo e o nome do arquivo). O código TADIR é o canônico de **saída** para pessoas (pasta no
checkout, `.meta.json`, mensagens). (fixado 2026-08-28)

| Identificador | Exemplo | Papel |
|---|---|---|
| `libKey` | `table`, `structure` | identidade do módulo de tipo; chave de `TYPES`/`MODULOS` |
| código TADIR (4 letras) | `TABL` | campo do módulo; nome de pasta e `.meta.json`; chave de `TIPOS` |
| `adtType` (tipo + subtipo ADT) | `TABL/DT`, `TABL/DS` | campo do módulo; o que o RIS devolve e o shell de create declara; único |

Um código TADIR pode ter **mais de um módulo**: `PROG` → `prog` (report) e `include`; `TABL` →
`table` e `structure`; `FUGR` → `functionGroup`, `functionModule` e `functionGroupInclude`. Entrada pelo código resolve
para todos; sinônimo específico (`report`, `estrutura`, `fm`) recorta um.

### Módulo de tipo
Um arquivo `tipos/<libKey>.mjs` que reúne **tudo** o que a lib sabe daquele tipo, num **esquema
único** (`tipos/_esquema.mjs`). Adicionar um tipo = adicionar um arquivo (e o teste irmão).
(fixado 2026-08-28; [ADR 0001](docs/adr/0001-modulo-por-tipo-descoberto-por-pasta.md))

O esquema tem quatro famílias de campos (2026-08-28):
- **identidade e ADT** — `libKey`, `codigo`, `adtType`, `descricao`, sinônimos, `coll`, `ct`,
  `accept`, `source`, `forma`, `container`, `zyPeloContainer`, `nomeacao`;
- **conhecimento medido** — `oQueFaz`, `comoTrata`, `spike`, `releases`, `guardRails`, `canais`,
  `origem`, `dependencias`, `exemplo`, `testes`, `erros`, `desmentidos`;
- **ganchos** — `prova`, `validar`, `createBody`, `body`, `path`, `deploy`, `antesDeApagar`.

Princípio: **o módulo fornece peças; a lib executa o fluxo.** Os guard-rails transversais (só
Z/Y, unlock em `finally`, activate depois do unlock) ficam em `adt-client.mjs`, fora do alcance do
módulo, que só acrescenta os seus (`guardRails` declarativo + `validar(opts)` + `nomeacao`, todos
antes de qualquer rede). Um módulo nunca importa `adt-client.mjs`.

**A interface do módulo é o esquema.** Em runtime, `validarModulo` recusa no carregamento o que
não o cumpre; no editor, o `@typedef ModuloDeTipo` (mesmo arquivo) dá autocompletar e checagem —
cada módulo anota `/** @type {import('./_esquema.mjs').ModuloDeTipo} */`. Não há `interface` nem
`class`: JavaScript não tem a primeira, e a segunda traria herança sem estado para herdar.
(fixado 2026-08-28)

Termos rejeitados: *plugin* (sugere carga dinâmica de fora do pacote e contrato público
versionado, que ninguém pediu); *classe*/*iObjeto* no sentido OO (não há estado por tipo — é um
objeto; e "objeto" aqui é o objeto ABAP, não o módulo).

### Forma
Como a lib despacha o deploy de um tipo — o campo `forma` do módulo (medido no código, 2026-08-28):

| Forma | Módulos | Fluxo |
|---|---|---|
| `source` | table, structure, cds, interface, prog, include, behaviorDefinition, serviceDefinition, metadataExtension | create shell → lock → PUT /source/main → unlock → activate (`deploySource`) |
| `xml` | dataElement, domain, tableType, authorizationField, authorizationObject, lockObject | a definição É o body: create(body) → lock → PUT(body) sempre → unlock → activate (`deployBody`) |
| `custom` | msag, class, serviceBinding, functionGroup, functionModule, functionGroupInclude, package | `deploy(ctx, conexao, opts)` do módulo, só com primitivas do `ctx` |
| `json` | applicationLogObject, numberRangeObject, applicationJobCatalog | create shell → lock → PUT /source/main em `application/json` SEMPRE → unlock → ativa por `ativacaoJson` do módulo (`deployJson`) |

A `json` é a família "blue"/AFF (I56, fila 60): o content-type do PUT (`application/json`) se repetiu
nos três tipos medidos — a ativação NÃO (`ativacaoJson`: `nenhuma` no APLO, `mesmaSessao` no NROB,
`sessaoNova` no SAJC) — por isso é campo do módulo, nunca decidida no genérico.

Entrada única: `deploy(conexao, '<libKey>', opts)`; os nomes antigos são atalhos. Um erro em
qualquer fluxo sai com a **dica** do módulo anexada (`→ causa provável / → correção`), vinda dos
`erros` do tipo e dos `ERROS_TRANSVERSAIS` — `dicaDeErro`, puro.

### Unidade de ativação
Objetos que só ativam **juntos**, numa única requisição de ativação — `deployMany(conexao, [...])`:
grava cada um pelo fluxo do seu tipo **sem ativar**, na ordem de dependência, e faz um
`activateMany` no fim. Casos medidos: BDEF + behavior pool; include + programa; DE de chave +
tabela dependente. A dependência tem duas fontes e dois lugares (2026-08-28):

| Nível | Onde | Exemplo | Quem sabe |
|---|---|---|---|
| entre **tipos** | módulo, `dependencias[].tipo` | "BDEF depende de classe (pool)" | o módulo |
| entre **objetos** | opts do deploy, `dependeDe: ['libKey:NOME']` | "`YJBV_POC_BO_ROOT` depende de `class:YBP_JBV_POC_BO_ROOT`" | quem chama |

`ordenarUnidade` (puro) combina as duas; ciclo lança; dependência que aponta para fora da unidade
é ignorada (já está no sistema). Não há resolvedor de grafo além disso — três pares medidos não
pedem mais. `deps.mjs` pode *sugerir* `dependeDe` a partir do fonte, mas é heurístico: sugestão,
não verdade.

### Registro
O que a lib **carrega**: `tipos/index.mjs` lê `tipos/*.mjs` uma vez por processo (descoberta por
pasta), valida cada módulo contra o esquema e deriva `MODULOS`, `TYPES`, `TIPOS`, sinônimos e as
funções de resolução. Vive em memória; **nunca é gravado**. Módulo inválido ou duplicado derruba o
import da lib, com a mensagem dizendo o arquivo — falha alta, de propósito. (fixado 2026-08-28)

### Catálogo
A lista **legível** do que a lib trata — `docs/tipos.md`, gerado por `npm run catalogo` a partir
dos módulos, para o agente e para pessoas: por tipo, o que faz, como trata, exemplo de uso pronto,
prova por `readTable`, **como testar no ABAP** (com o driver/teste), quando falhar. Registro ≠
catálogo: um é código, o outro é saída. É gerado por quem adiciona um tipo, nunca pela lib em
runtime; `catalogo.test.mjs` falha se estiver para trás. Substitui o ledger de tipos mantido à mão
na skill `adt-objetos`. (fixado 2026-08-28)

Rejeitado: a lib escanear na primeira execução e gravar um índice — ver ADR 0001.

### Exemplo
As opções **reais** de um `deploy` daquele tipo (`exemplo.opts`), com o nome `$TMP` do spike
quando houve. O teste irmão roda a parte pura sobre ele (`validar`, `nomeacao`, `createBody`/
`body`/`path`); o catálogo o imprime pronto para copiar. Exemplo em arquivo separado foi
rejeitado: `examples/` já mostrou o destino (importa função que não existe, caminho que nunca
existiu) — exemplo que ninguém executa apodrece. (fixado 2026-08-28)

### Teste do tipo
Como **provar no lado ABAP** que o objeto funciona — campo `testes` do módulo: um ou mais por
tipo, cada um com `canal` (`aunit` | `classrun` | `soapRfc` | `odata` | `wdi5` | `readTable`), o
ABAP quando houver (driver classrun, classe de teste), o `assert` (saída do console, `readTable`
em outra LUW, HTTP) e `medido` (onde rodou; vazio = escrito, não provado). Tipos sem teste isolado
(SRVD, DDLX, BDEF) provam-se **pelo consumidor** (OData, app, EML). É o insumo do script de
re-validação (item 7 da fila). (fixado 2026-08-28)

Não confundir com o **teste irmão** `tipos/<libKey>.test.mjs` (vitest, sem SAP): contrato comum
+ snapshot do XML provado. Todo módulo tem um; sem ele `npm test` falha.

### Prova
Como verificar por `readTable` (outra LUW) que o objeto existe/está ativo — gancho `prova(name)`
→ `{ tabela, campos, where, espera, medido }`. Só `TFDIR` (FM, `FMODE = 'R'`) e o conteúdo da
própria tabela do ciclo foram medidos; as demais tabelas (DD02L, DD01L, DD04L, SEOCLASS, TRDIR,
T100A, TADIR) vêm de documentação e estão marcadas `medido: false`. (fixado 2026-08-28)

### Desmentido
Uma crença que **parece certa** e foi desmentida por medição — campo `desmentidos` do módulo
(`{ crenca, fato, medido }`) e `DESMENTIDOS_TRANSVERSAIS` no esquema. É a terceira espécie de
"erro a evitar", distinta das outras duas: `guardRails` diz o que fazer *antes*, `erros` diz como
ler a falha *depois*, `desmentidos` diz **o que não acreditar** ao raciocinar. Sem medição não
entra (seria folclore ao contrário). Regra de desduplicação: **cada fato mora num campo só**; os
outros campos apontam ("ver desmentidos"). Fonte inicial: a tabela "Divergências resolvidas" da
skill `adt-objetos`. (fixado 2026-08-28)

### Sessão rastreada
Toda sessão de logon próprio que uma `conexao` abre (`sessaoNova`, `sessaoStateless` com senha)
nasce **rastreada**, e `conexao.encerrar()` faz logoff de todas — a regra "quem abre fecha" mora
na lib, não só no procedimento (item 56, 2026-09-01). `{ manter: true }` tira a sessão do rastreio
e devolve a responsabilidade a quem pediu. Ficam fora por natureza: a sessão herdada do `connect`
(é do CLI) e a `sessaoStateless` de cookie **emprestado** (logoff nela derrubaria a do CLI).
Medido (s4h 758): só a stateful fica órfã; no SXD 816 a stateless também persiste — o tempo de
vida é configuração do alvo, e por isso o `probe` faz logoff da própria sonda.

### Spike / medido
Um tipo (ou receita) só entra quando foi **provado** contra um sistema SAP real — create, PUT,
activate no `$TMP`. O módulo registra isso em `spike` (data, sistema, release, revalidações) e em
`releases.medidos`, que só pode conter releases presentes no `spike` — não se inventa release. Os
testes do repositório são puros (sem SAP): provam que a migração preservou os XML byte a byte, não
que o SAP aceita. Por sistema, `tiposDisponiveis(cfg)` (probe) mede quais tipos o discovery
oferece — é o que `releases.minimo` não sabe. (regra pré-existente, formalizada 2026-08-28)

## Governança do esquema (fixado 2026-08-28)

O esquema está **congelado** em 32 campos. Medição no dia do congelamento (16 módulos): todos os
obrigatórios de identidade/ADT preenchidos; `dependencias` em 12/16, `erros` em 14/16,
`desmentidos` em 2/16 (só entram com medição); `releases.medidos` vazio em 9/16; dos 25 `testes`,
10 medidos e 15 escritos sem prova; `prova.medido` só no FM; 7 exemplos reconstituídos. Esses
números são o **histórico zero** — a próxima leitura diz se o esquema está certo.

Regras para mudar o esquema:
- **Campo novo só com consumidor em código** (lib, teste, probe, script) — não só o catálogo. E só
  quando **três módulos** precisarem dele (regra de três). Candidato sem os dois entra em
  `docs/ideias.md`, não no esquema.
- **Campo que ficar vazio em ≥ 12 dos 16 módulos** em duas leituras seguidas (uma por ciclo da
  fila) é candidato a sair — ou a virar transversal (`*_TRANSVERSAIS` no esquema).
- **O que não é campo**: autor/versão/status (o git responde), links de ajuda, qualquer coisa que
  ninguém lê. Conteúdo repetido em dois campos é bug: cada fato mora num campo só.
- Leitura: `node --input-type=module -e` sobre `MODULOS` contando preenchidos por campo (o script
  da medição acima); registrar a data e os números aqui a cada ciclo.

**Leitura 2 (2026-08-28, após o item 7 da fila — re-validação no s4h 758):** `testes` 26, **23
medidos** (eram 10), 3 sem prova (prog/aunit, ddlx/wdi5, ddlx/odata); `prova.medido` em 9/16
(era 1); `releases.medidos` vazio só em `metadataExtension` (era 9); `desmentidos` 2/16;
`erros` vazio em domain e metadataExtension. Nenhum campo novo se mostrou necessário; nenhum
ficou vazio em ≥ 12/16. A leitura confirmou o esquema e converteu escrito em medido.

## Em aberto
- Autorização: a prova de um objeto SUSO **pelo efeito** precisa de um usuário com perfil que
  contenha a autorização — `AUTHORITY-CHECK` sem perfil devolve 12 tanto para objeto existente
  quanto para nome que nunca existiu (medido 2026-08-29, S4H 758). No spike do item 13 isso foi
  feito com usuário de referência descartável + perfil manual (`SUSR_INTERFACE_PROF`), com
  autorização do Joris, e tudo foi removido ao final. A lib **não** automatiza isso: criar
  usuário/perfil é decisão humana, não passo de deploy.
- `adtType` sem subtipo existe: o RIS do s4h 758 devolve `AUTH` NU para campo de autorização (e
  `SUSO/B` para o objeto). O validador do registro aceitava só `TIPO/SUB` e foi afrouxado
  (`tipos/_registro.mjs`, medido 2026-08-29).
- Autorização, DELETE: a primeira tentativa de apagar `YJBV_POC_O`/`YJBV_POC_F` na MESMA sessão que
  acabara de apagar o perfil devolveu 400; a mesma chamada em sessão nova devolveu 200. O corpo do
  400 não foi lido — causa **não isolada**, e por isso não virou `erros` de módulo.
- MSAG: idioma — nasce com `T100A.MASTERLANG` e `T100.SPRSL` vazios; `MESSAGE … INTO` devolve a
  forma técnica (medido 2026-08-28, S4H 758). Causa não determinada; ver `tipos/msag.mjs`.
- ~~Report: `SUBMIT` no classrun dá 500 e a ST22 não foi lida~~ — **causa medida pelo item 28
  (2026-08-31)**: o `SUBMIT` dumpa `DYNPRO_SEND_IN_BACKGROUND` em `SAPLKKBL`, linha 457 (o report
  tenta mandar dynpro e não há GUI). A conclusão não muda — teste de report fica em aunit/SA38 —
  mas o 500 mudo do classrun agora tem causa legível: `semDump` anexa o dump ao erro.
- Dump (item 28, medido 2026-08-31 no s4h, `dumps.mjs`): o dump **não chega ao chamador**. No
  classrun vem como HTTP 500 + a página "Application Server Error" do ICM, que não diz nem o erro
  nem o programa; em trabalho assíncrono (`STARTING NEW TASK`) o canal devolve **200 com a saída
  normal** e o E2E fica verde com dump no sistema. A fonte do assert é a **SNAP** (imediata: dump
  visto 491 ms depois do act); o feed `/runtime/dumps` do ADT **perde dumps** — SNAP 14 × feed 7 no
  mesmo dia, com dumps ausentes por mais de 7 min e um mais antigo ausente enquanto um mais novo é
  listado (**causa não isolada**). A janela vem da própria SNAP (`MAX(DATUM||UZEIT)`), nunca de
  relógio: o `datetime` do ADT sai 5 h errado porque a TTZCU diz `CET` e o SO do s4h roda em BRT —
  o mesmo fuso torto do item 22. Não medido: dump em **update task** e em job de background.
- `metadataExtension` é o único tipo sem re-validação medida (não entrou no ciclo do item 7).
- Tipos ainda não cobertos: pesquisa em `docs/pesquisa-tipos-adt-nao-cobertos.md` + discovery do
  s4h 758 medido (ideias I1, I2, I15–I20): **existem** `ddic/tabletypes` (spikado 2026-08-28 →
  módulo `tableType`), `acm/dcl/sources` (spikado 2026-08-28 → módulo `accessControl`),
  `packages` (spikado 2026-08-28 → módulo `package`), `aps/iam/auth|suso` (spikados 2026-08-29 →
  módulos `authorizationField` e `authorizationObject`), `ddic/lockobjects/sources` (spikado
  2026-08-29 → módulo `lockObject`), `xslt/transformations`, `enhancements/*`; **não existem**
  `aps/iam/tran` (a via do sapcli para transação — a skill continua certa para 758) nem
  `ddic/searchhelps`. E `ddic/views` existe mas **não é a view clássica**: é o recurso de view
  EXTERNA (HANA) — GET de qualquer view D/C/E dumpa (`ASSERTION_FAILED` em
  `CL_DDIC_WB_XVIEW_PERSIST`), o POST exige `view:qualifiedHanaViewName` (medido 2026-08-29). View
  clássica e search help ficam "só SE11". Os candidatos
  viraram os itens 9–13 da fila (9, 10, 11, 12 e 13 fechados); o caminho de cada um é `spike-discovery.mjs s4h <adtType>
  <objeto padrão>` e depois create no `$TMP`.
- ~~Pacote transportável é irreversível pelo REST~~ — **desmentido pelo item 24 (2026-08-31)**: o
  ciclo inteiro tem via medida. `cts.criarRequest` cria a ordem (POST `tm:root newrequest`), o
  `corrNr` é honrado (a tarefa nasce na ordem informada; sem corrNr é que o SAP gera TR própria),
  e o desfazer fecha com `destravarRequest` (TRINT_UNLOCK_COMM) + `removerTadirOrfa` das linhas
  TADIR `DELFLAG='X'` (o delete transportável marca, não remove — e o TR_TADIR_INTERFACE só aceita
  depois do unlock) + `desmancharRequest` (TR_DELETE_COMM, o delete da SE09). Liberar segue fora.
  **Pendência do item 10: a TR `S4HK912769` (tarefa 770) segue no s4h** — a via para limpá-la agora
  existe (`desmancharRequest` + `removerTadirOrfa` do DEVC), mas executar é decisão do Joris.
- ~~Formulário SAP só nasce desenhando na SMARTFORMS~~ — **desmentido pelos itens 42 e 46**: desde
  2026-09-01 um **Markdown vira Smart Form imprimível** pela lib (`markdown.mjs` → `publicarMarkdown`,
  E2E 15/15 com o PDF olhado). O desenho que importa é a **AST no meio** — o emissor XFA do item 43
  pendura nela em vez de recomeçar. O vocabulário NÃO é inventável: sai dos parágrafos do Smart Style
  (`STXSPARA`/`STXSCHAR`), e o `SF_STYLE_01` já tinha ênfase inline e lista numerada — por isso não foi
  preciso criar SSST ("só GUI"). Dois silêncios medidos, os dois pegos pelo PDF OLHADO e não pelo
  `contemTexto`: o device é **Latin-1** (acima de U+00FF sai `#`) e o parágrafo `UL` tem entrelinha de
  meia linha e **sobrepõe** a linha anterior. Recuo de bullet, níveis de título e quebra de página
  seguem fora. **Item 48 (2026-09-01): o documento deixou de ser estático** — `{{VARIAVEL}}` vira
  `&VAR&` no texto e parâmetro de import na `<INTERFACE>` (`acrescentarInterfaceSmartForm`), e
  `imprimirMarkdown` troca os valores sem republicar o form (E2E 23/23, dois PDFs olhados do MESMO
  form). Terceiro engano do `contemTexto` no mesmo caminho, agora ao contrário: **o canal ASCII do
  `CONVERT_OTF` escapa o `&` como `&amp;`** e reprovava documento certo — o assert desescapa.
  **Item 49 (2026-09-01): a TABELA saiu da lista de recusas** — `| a | b |` vira nó `SE` construído
  (`xmlTabelaSmartForm`), não cópia. O risco que o item nomeou não se realizou: **a tabela estática
  existe**, porque o loop mora em campos OPCIONAIS (`DATATYPE`/`TABNAME`) e `SECTTYPE` é quem decide
  o papel do nó (`C` tabela · `R` linha · `E` célula · `L` loop; a coluna é a ORDEM da célula). Dois
  silêncios novos, os dois só visíveis no PDF: sem `<OTABTYPE>` o form GERA e o **runtime** recusa
  ("Definição de tabela X não conhecida"), e sem `<OTABHEADER>` **o cabeçalho não sai** sem erro
  nenhum; a borda de TOPO da 1ª linha invade o parágrafo anterior (daí `borda: 'baixo'`). Alinhamento
  à direita é **erro duro medido**: nenhum parágrafo do `SF_STYLE_01` tem `TDPJUSTIFY = RIGHT`. O
  emissor passou a devolver BLOCOS (`emitirBlocosSmartForm`) — texto contíguo é um nó, cada tabela é
  outro. E2E 21/21, quatro PDFs olhados.
  **Item 50 (2026-09-01): o documento passou a ter PÁGINAS — e o item descobriu que nunca as tivera.**
  Todo documento publicado até aqui quebrava se passasse de uma página: `subrc 2, "Nenhuma página
  seguinte definida"`, zero PDF, porque a poda leva a página `NEXT` embora e a `FIRST` fica apontando
  para o vazio. Enquanto o texto coube, ninguém viu. `apontarProximaPagina` faz a página apontar para
  SI MESMA e o texto transborda quantas precisar (9 páginas de um nó de texto só) — sem construir
  página nenhuma. Cabeçalho e rodapé são janelas CONSTRUÍDAS (`xmlJanelaSmartForm`) que a página
  repete a cada quebra; `{{PAGINA}}`/`{{PAGINAS}}`/`{{DATA}}` viram campo de SISTEMA (`&SFSY-PAGE&`)
  e **não pedem parâmetro de interface**. O front-matter (`---` no topo) dá a identidade: título,
  cabeçalho, rodapé, papel, orientação e margem — e a ambiguidade com a régua horizontal se resolve
  por três testes (1ª linha, bloco FECHADO, forma `chave: valor`), não só por posição. Achado que só
  o PDF olhado dá: **a tabela atravessa a quebra e o SAP repete o cabeçalho DELA** na página seguinte,
  de graça. E2E 24/24, quatro PDFs olhados. ⚠️ mudança de comportamento: a janela MAIN saiu dos 10 cm
  do molde de carta e ocupa a área útil — os PDFs dos degraus anteriores mudam de aparência.
  **Item 51 (2026-09-01): a IMAGEM saiu da lista de recusas, e nas duas pontas.** `![logo](ZLOGO)` vira
  nó `GR` CONSTRUÍDO (`xmlGraficoSmartForm`) — o nó existia no molde desde o começo (o logo mySAP.com)
  e nunca tinha sido feito do zero —, e a imagem NOVA entra no sistema sem GUI (`subirGrafico`): o FM da
  SE78 é dynpro, mas o fonte por trás dela (`LSTXBITMAPSF05`) dá a receita inteira —
  `SAPSCRIPT_CONVERT_BITMAP_BDS` + `cl_bds_document_set->create_with_table` + `INSERT stxbitmaps`, com o
  `GUI_UPLOAD` trocado por base64 no driver. **Só BMP e TIFF entram** (PNG e JPG param no FM do SAP, com
  mensagem), e **o tamanho impresso vem do DPI do arquivo** — o nó não tem `sf:OUTATTR`, então não há
  como pedir "5 cm" no documento: o mesmo BMP sai 4,27 cm a 100 dpi e 1,42 cm a 300. Dois erros MUDOS
  medidos: gráfico inexistente só reclama no render (`subrc 1`, "A saída de gráfico não é possível",
  sem dizer o nome — daí `graficoInfo` conferir antes de o form nascer), e **o `GR` não avança a linha**,
  subindo sobre a última linha do parágrafo anterior até o emissor fechar o texto com um `TDFORMAT /`.
  E2E 26/26, PDFs olhados.
  **Item 52 (2026-09-01): o vocabulário deixou de ser refém do molde — o SSST saiu do "só GUI".** Os
  cinco degraus anteriores esbarravam na mesma frase ("o emissor só pode usar o que o estilo do form
  já tem"); agora a lib CRIA o Smart Style: `TR_TADIR_INTERFACE` → `SSF_SAVE_STYLE` →
  `SSF_ACTIVATE_STYLE`, tudo em driver (`publicarSmartStyle`, `ESTILO_MARKDOWN`). `SSF_CREATE_STYLE`
  e `SSF_CHANGE_STYLE` **não servem** — são o Style Builder (`perform style_builder`). Três
  armadilhas medidas, todas mudas: (1) `SSF_ACTIVATE_STYLE` exige `redirect_error_msg = 'X'`, senão
  o `SSF_CHECK_STYLE` por baixo faz `CALL SCREEN` e o driver dumpa; (2) a **TADIR tem de existir
  antes** do save, senão o `RS_CORR_INSERT` de dentro dele abre a dynpro do `SAPLSTRD`
  (`DYNPRO_SEND_IN_BACKGROUND`, e o classrun só devolve HTTP 500); (3) a versão do estilo vem do
  HEADER, não do banco (`ADD 1 TO iadm-version`) — sem ler a STXSADM antes, republicar regravaria a
  versão 1 para sempre. Com o estilo próprio (`ESTILO_JBV`) o documento ganhou **níveis de título**
  (H1/H2/H3 = 18/14/12 pt, medidos no papel), **bullet pendurado** (marcador em 2,90 cm, continuação
  em 3,30), **parágrafo de código e de citação**, e o **alinhamento à direita** que a tabela do item
  49 tinha de recusar. A citação mudou de lado: `>` deixou de ser recusa do PARSER e virou bloco da
  AST — quem recusa é o EMISSOR, quando o estilo não tem `QU`. Dois achados com causa isolada: o
  `TDNUMBERIN` **sozinho não numera** (é preciso `TDLFIRSTPA` + `TDLDEPTH`, e a lista saía sem "1."
  sem erro nenhum), e **`TDHEIGHT` fora da `TFO02` não é recusado** — o SAP imprime no tamanho que
  achar (`COURIER 090` saiu 8,5 pt), daí `publicarSmartStyle` conferir a família e o tamanho antes de
  gravar. Quarto erro mudo do caminho: **estilo inexistente no `<STDSTYLE>` imprime tudo com o
  parágrafo default, calado** — `publicarMarkdown` confere na STXSADM antes de criar o form.
  E2E 16/16, PDFs olhados em coordenadas.
  **Itens 53 e 54 (2026-09-01): o Adobe Form deixou de ser território desconhecido — a própria SAP
  escreve o dicionário.** A "importação SAPscript da SFP" não existe no 758; o que existe são duas
  migrações que COMPÕEM e rodam sem GUI em driver: `FB_MIGRATE_FORM` (SAPscript→SF) e
  `cl_ssf_migration=>migrate( )` (SF→XFA). O item 54 usou a segunda como TRADUTOR: os quatro degraus
  da escada MD→SF (texto · campo · tabela · imagem) foram migrados e lidos do outro lado, dando um
  corpus alinhado por construção. **O XFA migrado não é prancheta burra** — é fluxo (`layout="tb"`/
  `"lr-tb"`), com `proto`+`use`, `break overflowLeader` e `bind ref="$record.…"`. O mapa está em
  `receita-forms.md § Pedra de Roseta`, e o essencial é: nó `TI` → **um** `<draw>` com
  `exData contentType="text/html"`, **uma linha de `TDLINE` = um `<div style>`**, e o parágrafo do
  Smart Style vira **CSS inline** (`TDHEIGHT 180` → `font-size: 18pt`, `TDPLEFT 0,80` →
  `margin-left: 8.01mm`). Três silêncios medidos: `TABLE` desligada (o default!) **achata** a tabela
  em draws de 16 cm sem borda; sem `TEXT_BINDING` o `&VAR&` vira o texto `{VAR}` (e a 2ª ocorrência,
  um `xfa:embed` órfão); e o que a lib CONSTRÓI é monolíngue — migrado em outro idioma o documento
  mantém a estrutura inteira e perde todo o texto, sem erro (→ I77). O que NÃO viaja: `TDPENTRY`
  (pendurado), numeração automática (vira "1" literal) e `&SFSY-PAGE&` NO CORPO (vira `{SFSY-PAGE}`)
  — em JANELA construída com `text_binding` a migração **faz** a ponte (correção do item 58: campos
  `SFSY` hidden + `xfa.layout.page(this)`).
  **Item 55 (2026-09-01): a migração virou OPERAÇÃO da lib** — `migrarSmartFormParaAdobe`
  (`forms.mjs`, E2E 30/30 no s4h): TADIR de SFPI+SFPF → `set_default_migrating_options( )` com
  `table`/`text_binding`/`header_footer`/`output_option` LIGADOS por cima → `migrate( )` → o XDP lido
  da `FPLAYOUTT` no idioma pedido. O default da SAP fica de fora **por medição, não por gosto**: no
  mesmo documento, com as opções desligadas, `layout="table"` cai de 3 para 0, `xfa:embed` de 4 para
  0 (`{CLIENTE}` vira texto) e o XDP encolhe de 10.224 para 7.856 bytes — com a migração dizendo
  `ok` das duas vezes. Por isso a função devolve `anatomia` (a contagem que serve de contra-prova) e
  `avisos` (XDP sem texto = idioma errado; opção desligada = documento diferente). Os 22 campos de
  `SSFMEXPROPERTIES` foram medidos por RTTI: `OUTPUT_OPTION` nasce **vazio** no default da SAP —
  ligá-lo é o que faz a borda de célula viajar (item 62, abaixo).
  O par nasce INATIVO e a lib não tenta ativar — ativação é ADS, e o render segue na fila 43.
  **Item 58 (2026-09-01): o emissor da AST — o Smart Form saiu do meio do caminho.** `astParaXfa`
  (`xfa.mjs`) traduz a MESMA AST do `markdown.mjs` direto para XDP pela família `CL_SXFT_*` (a API
  que o item 57 mediu — a mesma que o migrador usa), num driver gerado por documento com o XHTML em
  base64 dentro do fonte. **O assert foi a própria migração**: o mesmo documento pelas duas vias deu
  contagem IGUAL (28 subform · 13 draw · 4 field · 1 image · 3 table · 3 embed · 29 div) e CSS
  **byte a byte** — a regra escondida é que a SAP converte as medidas para **twips inteiros** antes
  dos mm (0,80 cm → `8.01mm`). `gravarEm` põe o XDP num SFPF real (via item 57) com sha1 conferido
  em outra LUW. Dois achados: em janela construída `&SFSY-PAGE&` **vira campo XFA com script**
  (corrige a Pedra de Roseta, que só via o corpo); e `append_child( as_ref )` com o pai fora da
  árvore é **engolido em silêncio** — o `use=` some do render sem erro (teste de regressão na lib).
  O que o emissor faz diferente por decisão: largura de célula real (migração escreve `w="0"`), sem
  transliteração Latin-1 (exData é UTF-8), e o texto vive no XDP — o documento emitido não herda o
  nó monolíngue da I77. Render em PDF segue sendo a fila 43 (ADS).
  **Item 59 (2026-09-01): substituir o layout de um Adobe Form EXISTENTE, o passo manual da nota
  SAP 3751960 ("SFP → form → substituir o layout pelo XDP anexo → salvar").** `substituirLayoutAdobe`
  (`forms.mjs`) fecha o que o item 41 tinha deixado em aberto sobre `i_mode`: os valores aceitos são
  `READ`/`WRITE`/`TOGGLE` (`IF_FP_WB_OBJECT=>C_MODE_*`) — `'SHOW'` cru é o `CX_FP_API_USAGE` que o
  41 mediu, e **`load` em READ (o default) + `set` + `save` também é recusado** com a mesma exceção;
  o modo de escrita é WRITE. Com `i_set_xliff_ids = abap_false` (default da lib, não da SAP) o XDP
  grava **byte a byte** na FPLAYOUTT, inclusive um XDP nascido fora (anexo de nota, escrito à mão) —
  sem validar nada contra a interface/contexto do form; o default do SAP (`abap_true`) re-serializa
  e injeta ids de tradução (666 → 871 bytes no mesmo documento). O `save` não valida o conteúdo — o
  guard-rail é local, antes da rede. Layout entra INATIVO; ativar segue exigindo ADS (item 53).
  **Item 61 (2026-09-01): a I77 (nó monolíngue) apontava para o lugar errado.** Não é
  `xmlTextoSmartForm` faltando `<T_TEXT>` — é o `MASTERLANG` MENTIROSO que a escada deixava passar.
  O `copiarSmartForm`/`subirSmartFormXml` fazem `enqueue( master_language = sy-langu )`, mas isso não
  gruda: quem decide o `STXFADM-MASTERLANG` final é o `<HEADER>` do DOM que vai para o `xml_upload`,
  e a escada (baixa → poda/troca de texto → reenvia) nunca toca esse campo — o upload final persistia
  o MASTERLANG da ORIGEM (`D`, do `SF_EXAMPLE_01`), não o da sessão que escreveu o texto. Isso importa
  porque o PRINT segue a mesma regra da migração: sem `control_parameters-langu` explícito, o SAP
  tenta o `sy-langu` de quem imprime e cai para o `MASTERLANG` quando falta tradução — nunca para o
  `<TEXT>` cru. Com o MASTERLANG errado, um documento publicado em P e impresso por sessão EN saía
  com o nó do molde (que tem `<T_TEXT>` em D/E/P) e **em branco** tudo que a lib construiu. Fix de uma
  linha (`lo_res->header-masterlang = sy-langu.` entre o `xml_upload` e o `store`, no `BLOCO_UPLOAD`):
  com o MASTERLANG certo, o fallback nativo do SAP resolve sozinho — nenhuma mudança em
  `xmlTextoSmartForm`/`renderSmartForm` foi necessária. Medido byte a byte: EN e PT do mesmo
  documento, que antes divergiam (2204 × 2869 bytes de PDF), ficaram idênticos depois do fix.
  **Item 62 (2026-09-01): a I79 (borda de tabela some no XFA) não era o Smart Style — era
  `OUTPUT_OPTION`.** Seis configurações testadas (dois estilos, `bordaTabela` baixo/caixa,
  remigração do mesmo Smart Form, documento maior, réplica byte a byte do corpus do item 54) deram
  **zero `<edge>` em todas**, com o lado do Smart Form (`STXSDINF`/`BORDERS`) sempre correto — a
  perda é sempre da migração. A pista veio de disco: os três `driver.abap` que o item 54 salvou no
  scratchpad (sobrevivem entre sessões) mostraram que só a medição de 48 `<edge>` ligava
  `OUTPUT_OPTION`; as outras duas (uma com as MESMAS opções que a lib liga hoje) já tinham zero.
  Confirmado por reprodução positiva: `output_option: true` isolado reproduz 48 `<edge>` (12 células
  × 4) num documento novo e 24 (6 × 4) noutro documento/estilo. `OPCOES_MIGRACAO_PADRAO` ganhou a
  quarta opção — a lib migra com borda por padrão desde aqui.
  **Item 63 (2026-09-01, I84): acabamento de tabela — o primeiro palpite (`SHADING`) estava errado.**
  O campo isolado de `CELLS`/`DYNLINES` não pinta nada (medido: 020 a 100, zero efeito no PDF); quem
  pinta é `BORDERS/item` `INTENSITY` + `FILLCOLOR` — e pinta a célula INTEIRA mesmo com a borda só de
  BAIXO, sem precisar da caixa fechada (não reabre o bug do item 49). `INTENSITY 100` com preto
  imprime a célula **toda preta e apaga o texto, em silêncio**. Mesclagem não tem campo próprio: sai
  de um `T_LINETYPE` com uma coluna a menos e a largura somada — `xmlTabelaSmartForm` gera esse tipo
  sozinho (`colspan` na célula) e reaproveita entre linhas com o mesmo desenho. E `EVTYPE F` (rodapé)
  **não repete por página** — só o `EVTYPE H` (cabeçalho, `OTABHEADER='A'`) repete; o rodapé
  (`OTABFOOTER='E'`) sai uma vez, no fim real da tabela (medido forçando 2 páginas com 45 linhas de
  enchimento) — o comportamento certo para uma linha de totais. Os três (`colspan`/`sombreado`/
  `rodape`) entraram só no CHAMADOR (`xmlTabelaSmartForm`): não há sintaxe de Markdown para nenhum
  dos três, mesma régua do item 49. Sem eles, a tabela gera o XML de sempre, byte a byte — 621/621
  testes, os 48 do degrau 2 sem alteração.
- ~~A SE09 sabe criar TR de um jeito que a API não sabe~~ — **desmentido pelo item 39 (2026-09-01)**:
  a SE09 só tem a tela (`TRINT_POPUP_TO_CREATE_REQUEST` = `CALL SCREEN 200`). Quem cria é sempre
  `TR_INSERT_REQUEST_WITH_TASKS`, o MESMO FM que a API REST do CTS chama — a diferença entre as
  portas é o que cada uma preenche. `cts.criarRequestComTarefas` (driver) dá a paridade inteira:
  tarefa por usuário (inclusive de outro), atributos, alvo, simulação. Por SOAP PURO, sem sessão e
  sem driver: `criarRequestPorRfc`, `apagarRequestPorRfc` (`CTS_WBO_DELETE_REQUEST` é RFC — apaga
  ordem+tarefas+entradas sem o driver do `desmancharRequest`), `gravarAtributo`/`removerAtributo` e
  a família de projeto CTS (`criarProjeto`/`lerProjeto`/`listarProjetos`/`apagarProjeto`). O projeto
  NÃO mora na `E070C-REPOID`: é o atributo `SAP_CTS_PROJECT` da E070A, com o TRKORR do projeto.
  ⚠ **`SAPCORR` imuniza a TR** (não edita, não apaga, o atributo não sai) — guard-rail na lib; a
  `S4HK912799`, criada antes dele, ficou presa no s4h.
- Cobertura pela TADIR (item 15, medido 2026-08-29 no s4h, só leitura): o catálogo cobre 76% dos
  85.304 objetos custom; a lacuna maior era a família SEGW/Gateway V2 (16%) — **fechada pelo item 16 no
  mesmo dia**: o `serviceBinding` V2 gera IWMO/IWSV/IWVB (activate) e IWSG/IWOM/OA2S (publish) por
  efeito, ~90% coberto. Fora: IWPR (projeto SEGW) e nó SICF por serviço (registro SEGW). O job V2 do
  módulo estava errado (parâmetros na uri em vez da URL do job — publicava com ERROR e não
  despublicava); corrigido com `jobRequest` + teste. Lacunas seguintes fechadas no mesmo dia: TOBJ do gerador SM30
  (item 17, `sm30.mjs`) e TRAN (item 18, `tran.mjs` — `RPY_TRANSACTION_INSERT` por driver classrun; ADT não cria);
  VIEW clássica em 2026-09-01 (item 45, `view.mjs` — `DDIF_VIEW_PUT` + `TR_TADIR_INTERFACE` +
  `DDIF_VIEW_ACTIVATE` por driver; delete por `RPY_VIEW_DELETE` em SOAP puro; o `RPY_VIEW_INSERT` que a
  ideia apostava **dumpa em todo canal sem GUI**). **A lista do SXD 816 (KART) segue pendente** — sem VPN nesta sessão; é ela que
  manda. `scripts/cobertura-tadir.mjs` + `docs/cobertura-tadir.md`. Gotchas medidos: o freestyle do
  `dataPreview` corta a instrução em ~72 colunas; `EUOBJALL` é a tabela de texto dos tipos; `KO100` é
  estrutura e `TR_OBJECT_TABLE` não é RFC.
- ATC (item 27, medido 2026-08-31 no s4h, `atc.mjs`): o gate roda por REST em três chamadas
  (`worklists` → `runs` → leitura), mas **200 com zero findings tem três causas distintas** — limpo,
  variante inexistente e objeto inexistente — e a REST não separa nenhuma por status. O SAP aceita
  `checkVariant=NAO_EXISTE_XYZ` com 200 e devolve verde; quem confere é a lib (SCICHKV_HD, porque
  `GET /atc/variants` devolve `totalItemCount 0`). O distinguidor do objeto é `checados`: objeto
  limpo APARECE na worklist com findings vazios, objeto não verificado não aparece — daí `verificar`
  lançar, como o `executed === 0` do ABAP Unit. Ponto aberto: a `systemCheckVariant` do s4h aponta
  para `ZATC_PROXY_MIGRATION`, que não pega nada — **o gate default deste sistema está mudo**, e
  isso é fato do sistema, não da lib. Não medido: isenções, quickfix, `checkruns`, criar variante,
  e quantos objetos de um pacote grande entram de fato na worklist (J1BNFE tem 2.538 e apareceram
  18). Ver `docs/receita-atc.md`.
- Anatomia por CTS, o que ficou não medido (item 14): fatiar o `E071K.TABKEY` pelo layout de campos
  da tabela (DD03L, offset por campo) — é o que transforma `300D1411Z0` em campos nomeados; e o
  diff "TR × sistema". Ver `docs/receita-change-request.md`.
- Application Job (item 47, medido 2026-09-01 no s4h, `tipos/applicationJobCatalog.mjs` + `job.mjs`):
  a família AFF publica DUAS coleções no discovery e só UMA cria — o SAJT responde 500 "referência
  NULL" no POST e sai por `CL_APJ_DT_CREATE_CONTENT` em driver. Não medido: job **periódico**
  (`is_scheduling_info`/`is_end_info` — granularidade, dias da semana, calendário, nº de execuções),
  job em nome de OUTRO usuário (`iv_username`, montado e não exercitado), os **exits** do catálogo
  (check/valueHelp/notification), SAJC transportável (só `$TMP`), e `COPY_JOB`/`FIND_JOBS_WITH_JCE`/
  `GET_STEPLIST_OF_JOB`/`CAN_SCHEDULE_JOB` da `CL_APJ_RT_API`. O job CLÁSSICO (SM36/SM37,
  `JOB_OPEN`/`JOB_SUBMIT`/`JOB_CLOSE`) é outro mecanismo e ficou fora por decisão da fila.
  Ver `docs/receita-application-job.md`.
- Diff entre dois sistemas (item 35, medido 2026-09-01, s4h 758 × sxd 816, `diff.mjs`, **só leitura**):
  a pergunta "o QA é o DEV?" se responde por conteúdo, e **só por conteúdo**. O `changedAt` do ADT sai
  no fuso de cada servidor e o deslocamento **varia com a data gravada** (3 h em `IF_OO_ADT_CLASSRUN`
  e `DTEL BUKRS`, 4 h em `TADIR` e `DOMA BUKRS`, no mesmo par de sistemas) — não dá nem para corrigir
  por offset fixo, então carimbo é aviso, nunca veredito. O XML do objeto também não é comparável cru:
  além do carimbo, a lista de `<atom:link>` cresce com o release (4 links no 758 × 5–6 no 816);
  limpados os dois, DTEL/DOMA padrão ficam idênticos byte a byte. E o `getSource` sozinho **mente três
  vezes, sempre com cara de "igual"**: tipo de forma `xml` não tem `/source/main` (404 com o mesmo
  texto nos dois), parte de classe ausente idem, e o `main` da classe **não traz os includes** — mesmo
  `main` com classes de teste diferentes passa por igual. O guard-rail é comparar só o que veio 200 dos
  dois lados. Normalizar caixa/espaço é opcional e declarado: em `CL_SALV_TABLE` tirou 62% do "difere"
  (pretty-print), nos outros cinco objetos do corpus não mudou nada — e nunca toca literal nem
  comentário (ABAP é case-insensitive no código e case-sensitive no texto). Não medido: escopo por
  pacote/TR (I80) e o recurso `versions` do ADT (I81). Ver `docs/receita-diff-entre-sistemas.md`.
- Re-vendorizar a lib no CLI `abapgit` (`C:\repositorio\jorisveloso\abapgit\lib`, cópia já 2 tipos
  atrasada) e apontar o ledger da skill `adt-objetos` para o catálogo.
- `$TMP` deixou de ser obrigatório: com o módulo `package`, um objeto nasce com nome definitivo no
  pacote certo (medido 2026-08-28). O que ainda não existe é MOVER objeto de pacote — o ADT não faz.
- `examples/`: seis arquivos mortos (importam `createObject`, que não existe; caminhos
  `node_modules/jbv-adt-client` que nunca existiram). Decisão do Joris: apagar ou virar dois
  exemplos de fluxo vivos.
