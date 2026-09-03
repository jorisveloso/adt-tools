# Fila do arsenal

Fila de trabalho do jbv-adt-client, executada **um item por sessão limpa** pela skill `/todo`
(formato e procedimento definidos lá). Estado em voo mora aqui, em notas `>` sob o item — não em
memória, não em handoff avulso.

**A ordem aqui é a de execução, não a numérica.** O número é identidade — commits e ideias apontam
para "fila N" e ele nunca muda; quem diz o que vem primeiro é a POSIÇÃO. **Decisão do Joris em
2026-08-29: todas as ideias abertas promovidas de uma vez** (itens 17–36), na ordem da lista da moovi (`docs/cobertura-tadir.md`) e depois por custo; bloqueados só os que dependem do que não
existe hoje (tenant BTP). **Próximo: 34** (GUI Scripting por COM contra o SAP GUI local). O 32 fechou em
2026-08-31 **descartando o cache** e entregando registro+mapa (`canais.mjs`); no caminho mediu que **o SXD
voltou a responder** — o 35 saiu de bloqueado e a pendência de SXD do 15 também. O 33 fechou em 2026-08-31
(wdi5 em app do cliente, 4/4 em dois apps, módulo `ui5.mjs`). O 34 fechou em 2026-08-31 (GUI Scripting por VBS/
`cscript`, 12/12, módulo `gui.mjs`) — **próximo alvo: 35** (diff de objeto entre dois sistemas; sondar o SXD
antes, o alcance é do momento). O 40, o 41 e o 42 fecharam
em 2026-08-31 — a I35 chegou ao fim do que dá para
provar sem ADS; o 43 segue bloqueado pelo destino `FP_ICF_DATA_SXD` no Java (infra). O 30 (trace) foi
ADIADO para o fim da fila pelo Joris em 2026-08-31 — volta depois, com a nota `> em andamento:` intacta.
`ideias.md` volta a receber pelo `ideia <texto>`.
**2026-08-31, fim do dia:** o **35** foi tentado e parou na sonda — o SXD não respondeu (VPN fora), e o item
precisa de dois sistemas; a nota está sob ele. No lugar rodou o **38** (carimbo da pesquisa de APIs, só
leitura no s4h), que **reordenou a pesquisa por fato** e abriu I55–I60. **Próximo: 35 se o SXD estiver de pé
(sondar primeiro); senão, a 1ª prioridade nova é NROB por ADT REST (I55)**, que ainda precisa ser promovida.
**2026-09-01:** o SXD **de novo não respondeu** (sonda no início da sessão), então rodou a **I55 → fila 44**
(NROB por ADT REST + intervalos por driver): fechada, 26 tipos no catálogo, módulo `nrob.mjs` novo.
**Decisão do Joris (2026-09-01): tudo que depende do SXD vai para o FIM da fila** — o 35 (diff entre dois
sistemas) e o 43 (conversor Adobe, que mede no SXD por causa do ADS) saíram da posição e estão no rodapé,
com as notas intactas; voltam quando a VPN da KART estiver de pé. Com isso a fila ficou sem item aberto
executável (o 5 e o 36 seguem bloqueados — sistema sem SOAP RFC; tenant BTP — e o 39 e o 30 estão no fim por
decisão anterior), então **a I57 foi promovida no mesmo dia: é o item 45, e é o PRÓXIMO** — view clássica por
`RPY_VIEW_INSERT` (SOAP puro, sem driver), o tipo que o item 12 declarou impossível por ADT. Mede no s4h.
A I56 (forma `json`/AFF, que a fila 44 respondeu pela metade) fica como a candidata seguinte.
**2026-09-01 (2ª sessão do dia):** o **45 fechou** — a view clássica saiu de "só SE11", mas **não** pela via da
I57: o `RPY_VIEW_INSERT` dumpa em todo canal sem GUI, e quem cria é `DDIF_VIEW_PUT` num driver (`view.mjs`,
21/21 E2E). O par com o 17 ficou pela metade (a SM30 recusa a view: `GLOBALFLAG` não é gravável) → **I62**.
Com o 5 e o 36 bloqueados e o 35/43 no rodapé pelo SXD, **o próximo executável é o 39** (engenharia reversa da
SE09) — a menos que o Joris prefira promover a **I56** ou a **I62**, que são as candidatas com fato recente. ⚠ O ADT **stateful** do s4h caiu no fim da sessão (400 `Service nicht erreichbar` a
tudo, stateless 200) — 4 sessões 202 órfãs minhas; SM04 é do Joris.
**2026-09-01 (3ª sessão do dia):** o **39 fechou** — a SE09 não cria nada (é só `CALL SCREEN 200`); quem cria é
`TR_INSERT_REQUEST_WITH_TASKS`, o mesmo FM da API REST do CTS, e a paridade inteira (tarefa para outro usuário,
atributos, projeto) entrou no `cts.mjs`. De brinde, três operações que **não precisam de sessão ADT nenhuma**:
criar TR, apagar TR e o projeto CTS, tudo por SOAP puro. **O ADT stateful do s4h caiu de novo no meio da
sessão e NÃO voltou** — o E2E fechou 20/20 no que é SOAP/stateless e ficou faltando exercitar
`criarRequestComTarefas` pela lib (o comportamento está medido por driver direto). Ficaram **14 sessões 202
órfãs** e a **TR `S4HK912799`, indeletável pelo atributo SAPCORR** — as duas coisas são SM04/decisão do Joris.
Com o 5 e o 36 bloqueados, o 35/43 no rodapé pelo SXD e o 30 adiado, **a fila ficou sem item aberto
executável**: o próximo alvo tem de ser uma promoção — as candidatas com fato recente são a **I56** (forma
`json`/AFF), a **I62** (`GLOBALFLAG` da view) e as novas **I63–I65** (a outra API REST do CTS, inserir objeto
na TR por RFC, leitura do CTS por SOAP puro).
⚠ **CORREÇÃO no mesmo dia (Joris): o SXD fica no ar das 09h às 20h de São Paulo** — e TODAS as sondas que
motivaram o adiamento do 35 e do 43 rodaram por volta das **06h**, fora da janela. O "VPN da KART fora" é
diagnóstico **não confirmado**: só vale sonda feita entre 09 e 20 (hora pelo PowerShell — no Git Bash o
`TZ=America/Sao_Paulo` devolve UTC). **Sessão que rodar dentro da janela deve sondar o SXD ANTES de escolher
o alvo**: se ele responder, o 35 (diff entre dois sistemas) volta a ser o próximo, e com ele a pendência de
SXD do item 15 e a re-validação que a lib não tem — dos 26 tipos do catálogo, só 4 foram medidos em dois
sistemas.
⚠ **ATUALIZAÇÃO da janela (2026-09-03, Joris): o SXD agora fica no ar das 09h às 24h de São Paulo** (não
mais 09–20). Vale a mesma régua de sempre: só confia em sonda feita DENTRO da janela (09–24 SP), hora pelo
PowerShell — no Git Bash o `TZ=America/Sao_Paulo` devolve UTC — e, dentro da janela, sondar o SXD antes de
escolher o alvo. **Registro canônico dos sistemas (janelas, VPN, papel): `docs/landscape.md`.**
**Direção do Joris, 2026-09-01 (mesma conversa): dois itens novos, e a fila volta a ter alvo no s4h.**
O **46** (Markdown → Smart Form) é o **próximo** — pedido explícito, e deliberadamente ANTES do item 43:
o conversor tem de nascer com uma AST intermediária, para o emissor XFA do Adobe pendurar na mesma árvore
em vez de recomeçar. O **47** (Application Job: SAJC + SAJT, criar + agendar + provar que rodou) vem
depois. Os dois medem no s4h e não dependem do SXD — o 35 segue sendo a re-validação a fazer assim que o
SXD estiver dentro da janela.
**2026-09-01 (4ª sessão): o ADT stateful VOLTOU** (07:05, depois de ~1h fora) e a sessão fechou três
coisas: o **E2E do 39 completo (29/29)**, que tinha ficado pela metade; e o **46 (15/15)** — Markdown vira
Smart Form imprimível, com a AST pronta para o emissor XFA do 43. O 46 confirmou o que o item temia e
resolveu a favor: o `SF_STYLE_01` já tinha ênfase inline e lista numerada, então **não foi preciso mexer
em SSST**. Sobre a `S4HK912799` (imunizada por SAPCORR): **decisão do Joris 2026-09-01 — ele apaga direto
no SAP; sai da lista de pendências da lib e ninguém mais tenta por driver.**
**Direção do Joris, 2026-09-01: o MD→SF cresce em DEGRAUS, um item por nível de complexidade** (48–52),
cada um uma sessão limpa. O 46 entregou o documento de TEXTO; a partir daqui cada item acrescenta uma
capacidade ao Markdown e mede o PDF: **48** campo com dado · **49** tabela · **50** páginas/cabeçalho/
rodapé · **51** imagem · **52** Smart Style próprio (o SSST, que destrava o acabamento dos anteriores).
**2026-09-01 (5ª sessão): o 48 fechou** (23/23; `{{VAR}}` → `&VAR&` + parâmetro na INTERFACE, dois PDFs
olhados do mesmo form) — o próximo degrau era o **49** (tabela). Na mesma sessão o Joris acrescentou os
itens **53–55** (importação SAPscript da SFP → Pedra de Roseta SSFO × XFA → migração sem GUI), que
alimentam o item 43, e avisou que **o SXD está no ar: sondado às 08:26 e respondeu** (adt+soap+classrun
✅, release 816, mandante 100) — **antes das 09h**, ou seja, a janela nominal 09–20 é do Joris, não uma
trava do sistema. Com isso o **35** (diff entre dois sistemas) e a pendência de SXD do **15** saem do
rodapé quando o Joris quiser; o **43** segue bloqueado por infra (destino `FP_ICF_DATA_SXD` no Java).
**2026-09-01 (6ª sessão): o 49 fechou** (21/21; a tabela ESTÁTICA existe — o loop é opcional no nó, e
`SECTTYPE` decide o papel). O emissor do Markdown passou a devolver **blocos**, um nó por bloco, que é o
que destrava os degraus seguintes.
**2026-09-01 (7ª sessão): o 50 fechou** (24/24) — e achou, de quebra, que **nenhum documento da lib passava
de uma página**: a poda deixava a `FIRST` apontando para a `NEXT` que ela mesma removia, e o render devolvia
`subrc 2` sem PDF. Uma linha (`apontarProximaPagina`) corrigiu para todos. Cabeçalho e rodapé viraram
janelas construídas, `{{PAGINA}}` vira campo de sistema, e o front-matter dá identidade ao documento.
Achado de ambiente → **I67**. **Próximo: o 51** (imagem — o nó `GR`, primeiro por referência a um gráfico
que já existe, depois upload sem GUI se der).
**2026-09-01 (8ª sessão): o 51 fechou** (26/26) — e os DOIS níveis saíram, inclusive o caro: a imagem NOVA
entra no sistema sem GUI, porque o fonte por trás da dynpro da SE78 (`LSTXBITMAPSF05`) dá a receita inteira
e ela roda em driver. Só BMP e TIFF; **o tamanho impresso vem do DPI do arquivo** (o nó `GR` não posiciona
nem redimensiona). Dois erros mudos medidos e fechados por guard-rail: gráfico ausente só reclama no render
sem dizer o nome, e o `GR` não avança a linha (subia sobre o texto). Achados → **I69** (BDS como canal de
arquivo, oito FMs RFC) e **I70** (timbre no cabeçalho).
**2026-09-01 (9ª sessão): o 52 fechou** (16/16) — e com ele a ESCADA INTEIRA do MD→SF (46, 48–52). O
`SSST` saiu do "só GUI" da cobertura: `TR_TADIR_INTERFACE` → `SSF_SAVE_STYLE` → `SSF_ACTIVATE_STYLE` em
driver, com três armadilhas mudas medidas (sem `redirect_error_msg='X'` o check faz `CALL SCREEN`; sem
TADIR prévia o `RS_CORR_INSERT` abre a dynpro do `SAPLSTRD` e o driver dumpa; a versão vem do header, não
do banco). O vocabulário ganhou níveis de título, bullet pendurado, código, citação e alinhamento à
direita — tudo conferido no PDF em COORDENADAS. Dois achados novos com causa isolada: `TDNUMBERIN`
sozinho não numera (falta `TDLFIRSTPA`+`TDLDEPTH`) e `TDHEIGHT` fora da `TFO02` imprime em outro tamanho,
calado. **Próximo: o 47** (Application Job, SAJC + SAJT); os itens 53–55 (importação SAPscript da SFP →
Pedra de Roseta → migração sem GUI) vêm depois, e o 35/43 seguem no rodapé esperando a decisão do Joris
sobre o SXD. ⚠ O ADT **stateful** do s4h caiu de novo no fim da sessão (400 `Service nicht erreichbar` a
tudo; SOAP e stateless em 200), deixando **3 sessões 202 órfãs** — SM04 é do Joris.
**2026-09-01 (10ª sessão): o 47 fechou** (24/24) — Application Job inteiro sem GUI, e com uma assimetria
que a fila não previa: dos DOIS tipos que o discovery publica, só o **SAJC** cria por ADT REST (virou o
27º tipo do catálogo, o 1º em `blues.v2+xml`); o **SAJT dá 500 "referência NULL"** e sai por
`CL_APJ_DT_CREATE_CONTENT` em driver — módulo `job.mjs` novo, com o runtime (agendar/esperar/cancelar/
joblog) junto. O activate do SAJC **só passa em sessão nova**, e os parâmetros do job vêm da CLASSE, não
do fonte. Achados → **I71** (job clássico SM36/SM37, que o item mandou virar ideia), **I72** (periódico)
e **I73** (inventário de jobs num sistema de cliente). O ADT stateful caiu **e voltou** no meio da sessão
(~35 min fora, com ZERO sessões minhas no sistema — de novo sem relação com contagem); nada ficou órfão.
**Próximo: os itens 53–55** (importação SAPscript da SFP → Pedra de Roseta SSFO × XFA → migração sem GUI),
que alimentam o 43; o 35/43 seguem no rodapé esperando a decisão do Joris sobre o SXD, e o 30 no fim.
**2026-09-01 (11ª sessão): o 53 fechou, e mudou o desenho do 54 e do 55.** A "importação SAPscript da SFP"
não existe no 758; o que existe são DUAS migrações que **compõem** e rodam **sem GUI** em driver classrun —
`FB_MIGRATE_FORM` (SAPscript→Smart Form) e `cl_ssf_migration=>migrate` (Smart Form→XFA). O layout **vem**, e
vem estruturado (`proto`+`use`, `layout="tb"`, `bind ref="$record.…"`, texto como XHTML em `exData`), o que
derruba o risco que o 54 nomeava. Duas correções que valem para toda leitura de Adobe Form: **o XDP mora na
`FPLAYOUTT`, por idioma** (a `FPLAYOUT` guarda só metadados), e **migrar fora do masterlang devolve layout
sem texto, calado**. Desmentido do item 41: no s4h **criar** SFPF funciona — o que exige ADS é **ativar**.
Com isso o **54 está desbloqueado e roda inteiro no s4h**, e a pergunta do **55 já está respondida** (sobra
implementação → I75). Achados → **I74** (`CL_SXFT_*`, a API ABAP que constrói XFA), **I75** e **I76** (dump
no logoff). **Próximo: o 54** — ou a decisão do Joris de promover a I74/I75 antes.
**2026-09-01 (12ª sessão): o 54 fechou** (45/45) — a Pedra de Roseta está escrita, e o corpus não veio de
form SAPscript padrão: veio da NOSSA escada MD→SF, migrada pelo caminho do 53. O XFA migrado **não é
burro**, e o dicionário chegou ao grão do CSS (o parágrafo do Smart Style vira estilo inline no XHTML).
Três silêncios medidos por contra-prova: o default da migração **achata** a tabela, sem `TEXT_BINDING` o
campo vira texto, e **o nó que a lib constrói é monolíngue** (→ I77). Achados → **I77** e **I78** (o
gráfico da SE78 tem URL ICF). **Próximo: o 55** — cuja PERGUNTA já está respondida desde o 53 (a migração
é chamável sem GUI): o que sobra é escrever `migrarSmartFormParaAdobe` na lib (a **I75**, que perdeu o
"Medir" para o 54 e ficou só implementação), com `table`/`header_footer`/`text_binding` ligados por
padrão. A decisão do Joris — fechar o 55 apontando para a I75, ou executá-lo como o item que escreve o
código — segue de pé; o 35/43 continuam no rodapé esperando a decisão sobre o SXD, e o 30 no fim.
**2026-09-01 (13ª sessão): o 55 fechou pelo caminho do CÓDIGO** (30/30) — `migrarSmartFormParaAdobe` está na
lib, com o default da SAP recusado por medição (mesmo documento: `layout="table"` 3→0, `xfa:embed` 4→0,
10.224→7.856 bytes, `ok` nas duas) e a I75 fechada junto. Com isso **a escada MD→SF chega ao XFA sem escrever
emissor nenhum** — o que a fila 43 ainda deve é o RENDER, que é ADS. **A fila ficou sem item aberto executável
de novo**: o 5 e o 36 seguem bloqueados, o 35/43 no rodapé pelo SXD (que **respondeu** em 2026-09-01 às 08:26 —
falta só a decisão do Joris de trazer o 35 do rodapé) e o 30 adiado. O próximo alvo é uma decisão: **trazer o
35** (diff entre dois sistemas, o único que re-valida a lib num sistema de cliente) ou promover uma ideia — as
candidatas com fato recente são **I74** (a API `CL_SXFT_*` que constrói XFA), **I56** (forma `json`/AFF),
**I62** (`GLOBALFLAG` da view), **I77** (o nó monolíngue) e as novas **I79** (a borda que não viajou) e
**I63–I65** (CTS).
**2026-09-01 (14ª sessão): o 35 fechou** — a sessão rodou **dentro da janela** (14:56 São Paulo), sondou o
SXD ANTES de escolher o alvo (como a correção acima manda), ele respondeu, e o item saiu do rodapé por
regra e não por palpite. `diff.mjs` responde "o QA é o DEV?" por conteúdo — e mediu que **as três vias
óbvias mentem**: `getSource` diz "igual" para tipo sem fonte, para parte ausente e para classe cujo
`main` é igual mas a classe de teste não; o `changedAt` sai em fuso de servidor com deslocamento que
varia com a data (3 h e 4 h no mesmo par); e o XML cru difere sempre pelos `atom:link` do release.
Achados → **I80** e **I81**. **Com o SXD de pé, o que sobrou dele na fila é a pendência do item 15**
(rodar a cobertura da TADIR no SXD, só leitura) e o **43**, que segue bloqueado por INFRA (destino
`FP_ICF_DATA_SXD` no Java), não por rede. Com o 5 e o 36 bloqueados e o 30 adiado, **o próximo alvo é
decisão do Joris**: a pendência do 15, ou uma promoção — as candidatas com fato recente são **I80**
(escopo do diff: "a TR chegou inteira?", que se apoia no `cts.mjs` que já existe), **I74**, **I56**,
**I62**, **I77**, **I79** e **I63–I65**.
**2026-09-01 (15ª sessão): a pendência do 15 fechou** — sonda do SXD ✅ às 16:41 (dentro da janela) e
`cobertura-tadir.mjs sxd --tudo` rodou, só leitura: **7.067 custom em 86 tipos, 62% no catálogo, ~78% com
efeito e drivers**; a lista do cliente confirmou o catálogo (8 dos 10 tipos mais frequentes são módulo, e
todos os recém-cobertos existem lá) e expôs UM furo — **SHIP, 817 objetos, 2º maior tipo, sem descrição em
EUOBJALL/WBOBJECTTYPES_T/RIS → I83** (investigar por leitura antes de qualquer afirmação). Resultado em
`docs/cobertura-tadir.md § Resultado — SXD (KART)`. ⚠ Ficaram **2 sessões 202 minhas no SXD** (16:41 e
16:46 — `canais.mjs` e `cobertura-tadir.mjs` não encerram a sessão que abrem; é o defeito que a **I67** já
descreve, e agora ele alcança sistema de CLIENTE — mais um peso para promovê-la). **Com isso o SXD não deve
mais nada à fila além do 43 (infra Java) — e a fila segue sem item aberto executável**: o próximo alvo
continua sendo decisão do Joris entre as candidatas da 14ª sessão, agora com a **I83** e a **I67** somadas
a elas.
**2026-09-01 (16ª sessão): o Joris promoveu a I67 → fila 56, e o 56 fechou no mesmo dia** (14/14 no s4h +
leitura no SXD) — `encerrar()` agora fecha TODAS as sessões que a conexão abriu, o probe se despede da
própria sonda e o `cobertura-tadir.mjs` encerra o `conectar` que fez. Dois desmentidos de medição: no s4h
só a STATEFUL fica órfã (a stateless morre sozinha — a hipótese dos "5" eram 3), e a contagem por
`TH_USER_LIST` enxerga a própria requisição (deltas, nunca absoluto). No caminho a colisão de numeração
das duas I67 foi desfeita (a de acabamento de tabela virou **I84**). Sobra para o Joris: **1 sessão 202
no SXD** (TID 8, 16:41, anterior ao fix — SM04 ou timeout). **A fila volta a ficar sem item aberto
executável**: candidatas com fato recente são **I80** (escopo do diff), **I74** (`CL_SXFT_*`), **I56**
(forma `json`/AFF), **I62**, **I77**, **I79**, **I83** (SHIP) e **I63–I65** (CTS).
**2026-09-01 (17ª sessão): o Joris promoveu a I74 → fila 57, e o 57 fechou no mesmo dia** — a API
`CL_SXFT_*` constrói XDP com a MESMA assinatura da migração, o xstring gravado num SFPF persiste
byte a byte (e o `save` não valida: meio caminho da I82), e o custo é ruído (100 blocos = 34 ms).
Dois achados de armadilha: o `SET_CONTENT_AS_XSTRING` do exData é stub `TODO` da SAP (o caminho é
`set_content_as_dom`), e exceção não declarada escapando de `RAISING` vira 500 mudo do classrun sem
dump do driver. Achado → **I85** (o emissor `astParaXfa`: Markdown → Adobe sem o Smart Form no
meio), a candidata natural da linha forms. **A fila segue sem item aberto executável** (5 e 36
bloqueados, 43 por infra Java, 30 adiado): o próximo alvo é decisão do Joris — **I85** e as
candidatas anteriores (**I56**, **I62**, **I77**, **I79**, **I83**, **I63–I65**), menos a I80
(descartada) e a I74 (fechada aqui).
**2026-09-01 (18ª sessão): o Joris promoveu a I85 → fila 58, e o 58 fechou no mesmo dia** — módulo
`xfa.mjs`: a AST vira XDP pela `CL_SXFT_*` sem o Smart Form no meio, com o GABARITO gerado na
própria sessão (mesmo documento pelas duas vias) e contagem IGUAL nas 10 chaves da anatomia + CSS
byte a byte (a regra é twips inteiros). `gravarEm` prova a gravação no SFPF por sha1 em outra LUW.
Dois achados de armadilha: `&SFSY-PAGE&` em janela construída VIRA campo XFA (corrige a Pedra de
Roseta) e `append_child( as_ref )` fora da árvore é engolido em silêncio. Dado novo na **I79**
(zero `<edge>` até com `Y_SF_MD`). **A fila volta a ficar sem item aberto executável** (5 e 36
bloqueados, 43 por infra Java — onde o RENDER deste emissor espera o ADS —, 30 adiado): candidatas
com fato recente são **I56**, **I62**, **I77** (agora só para o caminho MD→SF), **I79** (com o
candidato novo de medição), **I82** (meio caminho já medido), **I83** e **I63–I65**.
**2026-09-01 (19ª sessão): o 59 fechou** — `substituirLayoutAdobe` (`forms.mjs`) fecha a I82 e o
que o item 41 tinha deixado em aberto sobre `i_mode`: os valores aceitos são `READ`/`WRITE`/
`TOGGLE`, e **`load` em READ (o default) + `set` + `save` também é recusado** com o mesmo
`CX_FP_API_USAGE` do 41 — o modo de escrita é WRITE. Byte a byte na FPLAYOUTT com
`i_set_xliff_ids = abap_false` (default da lib), inclusive um XDP nascido fora; o default da SAP
(`abap_true`) re-serializa e muda os bytes. **A fila volta a ficar sem item aberto executável** (5
e 36 bloqueados, 43 por infra Java, 30 adiado): candidatas com fato recente seguem **I56**, **I62**,
**I77**, **I79**, **I83** e **I63–I65** — a I82 fechou aqui.
**2026-09-01 (20ª sessão): decisão do Joris — promover a I56 (forma `json`) — e o 60 fechou no mesmo dia,
sem tocar o SAP.** As 3 cobaias da família já mediam o bastante (APLO/29, NROB/44, SAJC/47): o transporte
é genérico (PUT sempre `application/json`) e virou `deployJson`; o ciclo não é (media type do create e
estratégia de ativação variam por tipo — `ativacaoJson`), e por isso não vira decoração automática. Os
três módulos saíram de `custom` (deploy bespoke) para `json` (gancho `body` de poucas linhas). 615/615
testes, catálogo com os mesmos 27 tipos. **A fila volta a ficar sem item aberto executável** (5 e 36
bloqueados, 43 por infra Java, 30 adiado): candidatas com fato recente são **I62**, **I77**, **I79**,
**I83** e **I63–I65** — a I56 fechou aqui.
**2026-09-01 (21ª sessão): decisão do Joris — promover I77 e I79, os dois achados de qualidade da escada
MD→SF.** Viraram **fila 61** (texto monolíngue no caminho Smart Form) e **fila 62** (bordas de tabela que
somem na migração para XFA) — os dois medem no s4h com `$TMP`, sem dependência de SXD, e nascem abertos.
**2026-09-01 (22ª sessão): o 61 fechou** — a causa raiz não era a que a I77 apontava (ver a nota sob o
item): não é `xmlTextoSmartForm` faltando `<T_TEXT>`, é o `MASTERLANG` mentiroso que a escada
download→edita→reupload deixava passar (herdado da ORIGEM, não da sessão que escreveu o texto), somado ao
fallback nativo do SAP (`sy-langu` → `MASTERLANG` quando falta tradução). Fix de uma linha no
`BLOCO_UPLOAD`. **Próximo: o 62** — mesma família (I79), ainda aberto.
**2026-09-01 (23ª sessão): o 62 fechou** — não era o Smart Style (seis configurações testadas, zero
`<edge>` em todas), era `OUTPUT_OPTION` desligada na migração — achada nos `driver.abap` que o item 54
salvou no scratchpad (sobrevivem entre sessões) e confirmada por reprodução positiva (48 e 24 `<edge>`
em dois documentos/estilos diferentes, sem mais nenhuma variável mudando). `OPCOES_MIGRACAO_PADRAO`
ganhou a quarta opção. Com isso **a escada MD→SF/XFA (itens 46, 48–62) fica sem pendência de qualidade
aberta**. A fila volta a ficar sem item executável (5 e 36 bloqueados, 43 por infra Java, 30 adiado): o
próximo alvo é decisão do Joris entre promover uma ideia — candidatas com fato recente são **I83** (SHIP,
817 objetos sem descrição no SXD), **I84** (acabamento de tabela: SHADING, mesclagem, rodapé — mesma
família da escada que acabou de fechar), **I78** (URL HTTP do gráfico da SE78), **I76** (dump no logoff),
**I66** (campo formatado `&VAR(10CR)&`), **I70** (timbre no cabeçalho), **I71–I73** (job clássico,
periódico, inventário), **I63–I65** (CTS: API REST alternativa, inserir objeto por RFC, leitura por SOAP
puro) e **I81** (histórico de versões pelo ADT).
**2026-09-01 (24ª sessão): decisão do Joris — promover a I84 (acabamento de tabela).** Virou **fila 63**
(SHADING, mesclagem de coluna e evento `F` de rodapé no `xmlTabelaSmartForm`) — continuação natural da
escada que acabou de fechar, mede no s4h com `$TMP`, sem dependência de SXD, e nasce aberta. **E o 63
fechou na mesma sessão** — o palpite do próprio nome do item (`SHADING`) era falso: quem pinta é
`BORDERS/INTENSITY`+`FILLCOLOR`; mesclagem sai de um `T_LINETYPE` próprio (sem campo colspan na
anatomia); e o rodapé (`OTABFOOTER='E'`) não repete por página como o cabeçalho (`OTABHEADER='A'`) —
os três acabamentos entraram em `xmlTabelaSmartForm` só pelo chamador (`colspan`/`sombreado`/`rodape`),
sem mexer no Markdown. 621/621 testes. **A fila volta a ficar sem item aberto executável** (5 e 36
bloqueados, 43 por infra Java, 30 adiado): o próximo alvo é decisão do Joris entre promover uma ideia —
candidatas com fato recente são **I78** (URL do gráfico da SE78), **I76** (dump no logoff), **I66**
(campo formatado `&VAR(10CR)&`), **I70** (timbre no cabeçalho), **I71–I73** (job clássico, periódico,
inventário), **I63–I65** (CTS) e **I81** (histórico de versões pelo ADT).
**2026-09-01 (25ª sessão): decisão do Joris — promover a I76 (dump no logoff) — e o 64 fechou no mesmo
dia.** A hipótese estava certa E tinha causa exata: logon sem `sap-language` faz o LOGOFF dumpar
(`TEXTENV_UNICODE_LANGU_INVALID`, HTTP 500); com PT/EN, logoff limpo (HTTP 200, zero dump). Fix de
uma linha em `fetchToken` (default `'PT'`) — e de brinde, um desmentido do próprio comentário do
código (`encerrarSessao` dizia "500 é normal"; não é, é este bug). 623/623 testes. **A fila volta a
ficar sem item aberto executável** (5 e 36 bloqueados, 43 por infra Java, 30 adiado): candidatas com
fato recente são **I78** (URL do gráfico da SE78), **I66** (campo formatado), **I70** (timbre no
cabeçalho), **I71–I73** (job clássico, periódico, inventário), **I63–I65** (CTS) e **I81** (histórico
de versões pelo ADT).
**2026-09-02 (26ª sessão): decisão do Joris — retomar o 30 (trace, em andamento) em vez de promover
ideia — e o 30 fechou, mas não pela via original.** `TH_GET_PARAMETER` (campo certo: `PARAMETER_NAME`)
descartou a hipótese de parâmetro de perfil faltando; a contraprova decisiva veio do SAT por GUI
Scripting — a mesma classe de trabalho mediu 4.192 linhas de hitlist com tempos reais, contra o vazio
persistente do `runtime/traces` do ADT e da API `cl_atrapi_main_service` chamados de dentro do
classrun. **A causa não é o sistema, é o canal**: SAT mede na mesma sessão de diálogo do alvo, o
classrun é uma requisição HTTP à parte. `medirComSat` entrou em `gui.mjs`, com um bug real do módulo
corrigido no caminho (`GuiRadioButton.Text` é readonly; `rodarGui` não limpava `Err` entre passos e
atribuía o erro ao passo errado). 624/624 testes. Doc: `receita-runtime-analysis-sat.md`. Achado de
ambiente: o `SecurityLevel` do SAP GUI Scripting nesta máquina está em `1` (notifica a cada conexão
nova) e o usuário não tem admin local para baixá-lo a `0` — cada `abrirSapGui` novo pede confirmação
manual; sessões reaproveitadas (sem reabrir) não pedem de novo. **A fila volta a ficar sem item aberto
executável** (5 e 36 bloqueados, 43 por infra Java): candidatas com fato recente seguem **I78**, **I66**,
**I70**, **I71–I73**, **I63–I65** e **I81**.
**2026-09-02 (27ª sessão): decisão do Joris — promover a I78 (URL do gráfico da SE78) — virou fila 65,
e ficou EM ANDAMENTO.** A URL documentada (`/sap/bc/fp/graphics/public/graphics/bmap/<btype>/<nome>.bmp`)
**não resolveu no s4h**: 404 em toda variação testada (autenticado/anônimo, maiúsculo/minúsculo, com/sem
extensão, nome existente/inexistente) — a pergunta de autenticação ficou indecidível porque o recurso
nunca resolve. Isolado por profundidade de path até `…/bmap/bcol` (nó SICF real, ativo, 200 vazio); um
segmento a mais sempre dá 404, e a classe handler HTTP de fato não foi achada (as 3 candidatas do ADT
são o modelo de nó da INTERFACE, não o serviço ICF). Hipótese de pé: mesma dependência de ADS/AS Java
dos itens 40/43. Nota completa sob o item — **próximo passo do 65 é repetir a bateria no `sxd` dentro da
janela 09–20 São Paulo** (fora da janela nesta sessão, 00h56). Com isso a fila tem um item aberto de
novo, mas não executável agora: candidatas alternativas seguem **I66**, **I70**, **I71–I73**, **I63–I65**
e **I81**.
**2026-09-02 (28ª sessão): decisão do Joris — promover a I66 (campo formatado) — virou fila 66, e o 66
fechou na mesma sessão.** O 65 segue em andamento e fora de alcance (01h37 São Paulo, fora da janela
do SXD); os itens 5, 36 e 43 seguem bloqueados por dependência externa. `{{NOME:FMT}}` no Markdown vira
`&NOME(FMT)&` no TDLINE (`variavelDeInline`/`formatoDeVariavel`, retrocompatível — sem `:` o nó é
idêntico ao de antes); a hipótese se confirmou: CURR (`WERTV8`) imprime com separador de milhar/decimal
de verdade, DATS imprime a data no formato do usuário, QUAN imprime as casas decimais pedidas, e largura
menor que o valor NÃO trunca calado — o SAP marca overflow com `*` à esquerda, mantendo as casas
decimais (medido: valor 123456.78 em largura 5 → `*6,78`, exatos 5 caracteres). Achado lateral: o
separador decimal do PDF não veio de USR01-DCPFM do usuário (estava vazio) — é o default do kernel/
mandante, não override pessoal; se vem de T005 ou é fixo ficou em aberto (não bloqueia o item). 626/626
testes (2 novos). Doc: `docs/receita-forms.md § Campo FORMATADO`. **A fila volta a ficar sem item aberto
executável** (5 e 36 bloqueados, 43 por infra Java, 65 fora da janela do SXD): o próximo alvo é decisão
do Joris — candidatas com fato recente seguem **I70**, **I71–I73**, **I63–I65** e **I81**.
**2026-09-02 (29ª sessão): sondado 02h45 São Paulo (fora da janela 09–20 do SXD) — 5, 36 e 43 seguem
bloqueados e o 65 não tem passo executável fora da janela. Decisão do Joris: promover a I70** (timbre —
gráfico dentro da janela de cabeçalho do MD→SF) → **fila 67**, que nasce aberta e roda no s4h (`$TMP`),
sem dependência de SXD. **Próximo: o 67.**
**2026-09-02 (30ª sessão): o 67 fechou** — a hipótese central (a altura fixa de 1,2cm corta o gráfico)
saiu **desmentida**: a `WHEIGHT` da janela não recorta nada, o gráfico imprime no tamanho real do DPI
e invade a janela seguinte se ela não for reposicionada — o que resolve não é a altura da janela do
cabeçalho, é a `geometriaDoDocumento` empurrar a MAIN pela altura real do logo (`graficoInfo`). `logo`
novo no front-matter (nome + alinhamento opcional), retrocompatível (sem `logo` o cabeçalho continua
com a 1,2cm fixa do item 50). Prova de ponta a ponta pela lib (`publicarMarkdown`, sem XML à mão):
timbre sozinho e texto+logo+rodapé paginado, duas páginas, sem sobreposição. 631/631 testes (5 novos).
**A fila volta a ficar sem item aberto executável** (5 e 36 bloqueados, 43 por infra Java, 65 fora da
janela do SXD): o próximo alvo é decisão do Joris — candidatas com fato recente são **I71–I73** (job
clássico SM36/SM37, periódico, inventário de jobs), **I63–I65** (CTS: API REST alternativa, inserir
objeto por RFC, leitura por SOAP puro) e **I81** (histórico de versões pelo ADT).
**2026-09-02 (31ª sessão): decisão do Joris — promover a I71 (job clássico) — e o 68 fechou no mesmo
dia.** `SUBMIT … VIA JOB … AND RETURN` funciona dentro do classrun (o 500 do item 7 era só do SUBMIT
síncrono) — `JOB_OPEN`/`SUBMIT VIA JOB`/`JOB_CLOSE` com os três subrc=0, job terminado, linha lida em
outra LUW. Quatro desmentidos: `RS_VARIANT_CREATE` não existe no S4H 758 (o certo é
`RS_CREATE_VARIANT`); `TBTCP-VARIANT` grava um nome interno `&<contador>`, não a variante usada;
periodicidade não tem flag própria (`PRDDAYS`/etc > 0 basta); `BP_JOB_DELETE` mentiu o `subrc` numa
das rodadas (apagou com subrc=1). Achado de armadilha: `DATA(x) = sy-datum + 1` no driver dumpa mudo
(`CALL_FUNCTION_CONFLICT_TYPE`) — data/hora entram prontas do chamador. `job.mjs` ganhou
`criarVarianteJob`/`agendarJobClassico`/`apagarJobClassico`. 641/641 testes (10 novos). Docs:
`docs/receita-application-job.md § Job CLÁSSICO`. **A fila volta a ficar sem item aberto executável**
(5 e 36 bloqueados, 43 por infra Java, 65 fora da janela do SXD): candidatas com fato recente seguem
**I72** (job periódico do Application Job — `is_scheduling_info`), **I73** (inventário de jobs),
**I63–I65** (CTS) e **I81** (histórico de versões pelo ADT).
**2026-09-02 (32ª sessão): sondado 07h13 São Paulo — fora da janela 09–20 do SXD, então o 65 segue sem
passo executável; 5, 36 e 43 seguem bloqueados/adiados. Decisão do Joris: promover a I72** (job
periódico do Application Job) → **fila 69**, que nasce aberta e roda no s4h (`$TMP`), sem dependência
de SXD.
**2026-09-02 (33ª sessão): o 69 NÃO fechou — ficou `> em andamento` (nota sob o item).** `job.mjs`
ganhou `periodicidade`/`fim` (código + 33 testes puros) e a chamada `schedule_job` foi confirmada
aceitando e gravando `PERIODIC`/`PRDMINS` certos na TBTCO — mas o disparo real do job periódico não
foi confirmado: três agendamentos comparados (cru, compensado -2h, sem periodicidade) ficaram
travados em status `S` por 4 minutos cada, e o achado no caminho (`timestamp` grava +2h na
TBTCO — mesmo fuso torto do `dumps.mjs`) não explica sozinho o não-disparo. Objetos `YJBV_JOB69_*`
apagados, ausência confirmada; zero sessões órfãs. Com o 69 aberto e sem passo executável imediato
(precisa de horas reais de espera ou investigação do dispatcher), **o próximo alvo é decisão do
Joris**: retomar o 69 mais tarde (esperando o disparo de verdade), ou promover uma ideia —
candidatas com fato recente são **I73** (inventário de jobs), **I63–I65** (CTS) e **I81** (histórico
de versões pelo ADT); o 65 segue esperando a janela do SXD, e o 5/36/43 seguem bloqueados/adiados.
**2026-09-02 (34ª sessão): decisão do Joris — trocar de abordagem no 69 (investigar o dispatcher em
vez de esperar) — e o 69 fechou.** Só leitura por SOAP RFC (`TH_GET_PARAMETER`, `readTable` em
TBTCO/TBTCS/BTCOMSET/BTCOMSDL), sem driver: nos últimos 4 dias o s4h só disparou jobs entre
`00h–01h30` (zero fora disso), não por falta de work process BTC (`rdisp/wp_no_btc = 6`, lido fora
da janela) nem por RZ04 (sets de modo de operação vazios). Comparado com o SXD a pedido do Joris
("dá pra medir isso noutro ambiente?"): lá os jobs disparam o dia inteiro (`08h`–`19h`,
`rdisp/wp_no_btc = 18`) — **isola a causa como peculiaridade só da bancada s4h (moovi)**, não do
tipo de sistema nem de appliance de treinamento em geral. Mecanismo exato (provável script de infra
do provedor) não identificável por ABAP puro. Doc: `docs/receita-application-job.md § Causa
investigada`. **A fila volta a ficar sem item aberto executável** (5 e 36 bloqueados, 43 por infra
Java, 65 fora da janela do SXD): o próximo alvo é decisão do Joris — candidatas com fato recente são
**I73** (inventário de jobs), **I63–I65** (CTS: API REST alternativa, inserir objeto por RFC,
leitura por SOAP puro) e **I81** (histórico de versões pelo ADT).
**2026-09-02 (35ª sessão): o item em andamento tinha prioridade — sondado 10h43 São Paulo (dentro da
janela 09–20 do SXD), e o 65 fechou.** A bateria do 65 rodou de novo no SXD (que TEM ADS) e deu o
MESMO resultado do s4h: 404 em toda URL com nome de gráfico, 200 vazio sem nome, mesmo sem
credencial. Isso **desmente** a hipótese que o item carregava (dependência de ADS/AS Java) — a causa
real (qual classe atende o handler ICF) segue sem identificar, e virou **I86**. Doc:
`docs/receita-forms.md § Gráfico por URL HTTP`. **A fila volta a ficar sem item aberto executável**
(5 e 36 bloqueados, 43 por infra Java): candidatas com fato recente são **I86** (o handler HTTP do
gráfico, achado desta sessão), **I73** (inventário de jobs), **I63–I65** (CTS) e **I81** (histórico
de versões pelo ADT).
**2026-09-02 (36ª sessão): decisão do Joris — promover a I73 (inventário de jobs de aplicação) — e o
70 fechou no mesmo dia.** `scripts/inventario-jobs.mjs`, script novo, responde a pergunta inteira por
`dataPreview` (sem classrun, sem driver). Achado principal: `APJ_D_JOB_EXE` é log durável e sobrevive
ao catálogo/template apagado (as 12 linhas de POC do item 47 seguem lá); `TBTCO` sozinha subestima
"quando rodou pela última vez" (3 de 4 execuções reais de cliente já não tinham mais linha lá). Dois
achados de canal: `dataPreview` não aceita alias de tabela nem JOIN neste sistema (erro genérico
enganoso) e uma sequência de chamadas pode devolver 500 do ICM sem exceção ADT depois de ~14
chamadas (retry único resolve). 646/646 testes. Doc:
`docs/receita-application-job.md § Inventário de jobs de aplicação, só leitura`. **A fila volta a
ficar sem item aberto executável** (5 e 36 bloqueados, 43 por infra Java): candidatas com fato
recente são **I86** (handler HTTP do gráfico da SE78), **I63–I65** (CTS: API REST alternativa,
inserir objeto por RFC, leitura por SOAP puro) e **I81** (histórico de versões pelo ADT).
**2026-09-02 (37ª sessão): decisão do Joris — promover a I65 (leitura do CTS por SOAP puro) → fila 71 —
e o 71 fechou no mesmo dia** (E2E 48/48, só leitura, zero órfã). `lerRequestPorRfc`/`listarRequestsPorRfc`
no `cts.mjs`: a TERCEIRA via de leitura, sem sessão ADT — e com `'R'` a ÚNICA listagem de TR liberada da
lib (a árvore ADT devolve vazio). Dois achados de CANAL com contra-prova: parâmetro TABLES fora do
envelope SOAP volta VAZIO sem erro (toda chamada agora manda `TABELA: []`), e o ICF escapa entidade XML
nos valores (`&`→`&#38;`) — bug latente que alcançava o `readTable` desde sempre, corrigido nos parsers
do `rfc-soap.mjs`. A hipótese da I65 confirmou (wbtype/obj_info/status_text são do ADT): via própria, não
fallback silencioso. **A fila volta a ficar sem item aberto executável** (5 e 36 bloqueados, 43 por infra
Java): candidatas com fato recente são **I86** (handler HTTP do gráfico), **I63–I64** (CTS: API REST
alternativa, inserir objeto na TR por RFC — a I65 fechou aqui) e **I81** (histórico de versões pelo ADT).
**2026-09-02 (38ª sessão): decisão do Joris — promover a I63 (a outra API REST do CTS,
`if_cts_rest_api`) → fila 72 — e o 72 fechou no mesmo dia** (POC 10/10 + E2E 11/11, zero órfã, TRs
de POC apagadas com ausência confirmada). A resposta é melhor que a hipótese: **não existe "outro"
endpoint — o próprio `POST cts/transportrequests` que a lib já usava aceita `<tm:task tm:owner>`**
(o handler `CL_CTS_ADT_TM_RES_COLL_CONT` passa os owners como `it_users` ao mesmo
`TR_INSERT_REQUEST_WITH_TASKS`); a TR do item 24 nascia sem tarefa porque a lib não mandava o
pedaço do XML. `criarRequest` ganhou `usuarios`, e **`criarRequestComTarefas` perdeu o driver no
caso comum** (roteia por HTTP; driver só para dono alheio/atributos/simulação — `via` no retorno
diz a rota). Limites medidos: `tm:attributes` no corpo é ignorado, dono é sempre o logado, owner
duplicado deduplica, owner inexistente é 400 limpo SEM ordem órfã (ao contrário do FM cru do 39).
651/651 testes. Achado → **I94** (release de TR pelo `tm:useraction` — o único verbo do ciclo que
falta; nasceu como "I87", renumerada em 2026-09-02 por colidir com a I87 de eventos RAP, que entrou
antes na fila 70). **A fila volta a ficar sem item aberto executável** (5 e 36 bloqueados, 43 por
infra Java): candidatas com fato recente são **I94**, **I86** (handler HTTP do gráfico), **I64**
(inserir objeto na TR por RFC) e **I81** (histórico de versões pelo ADT).
**2026-09-02 (39ª sessão): decisão do Joris — promover a I86 (handler HTTP do gráfico da SE78) →
fila 73 — e o 73 fechou no mesmo dia** (POC + E2E 10/10, S4H 758, zero órfã). A via HTTP EXISTE — o
veredito do item 65 caiu: quem atende é `CL_HTTP_EXT_WEBDAV_SKWF` no nó `/sap/bc/fp`, lendo o **MIME
Repository** (não o BDS). O 404 do 65 era MIME vazio (falta o passo BDS→MIME que o
`RSXFT_MIGRATE_BDS_GRAPHICS` faz) **somado a cache negativo de 24h** (`sap-cache-control:+86400`, que
envenenava cada re-sonda) — não caixa nem ADS. `forms.mjs` ganhou `publicarGraficoHttp`/
`despublicarGraficoHttp`/`urlGraficoHttp`, o que alimenta o item 43 (o ADS busca o gráfico nessa
URL). 653/653 testes. Antes disso, a colisão das duas I87 foi desfeita (a "Liberar TR" virou **I94**;
a I87 de eventos RAP, que entrou antes na fila 70, manteve o número). **A fila volta a ficar sem item
aberto executável** (5 e 36 bloqueados, 43 por infra Java): candidatas com fato recente são **I94**
(liberar TR pelo ADT), **I64** (inserir objeto na TR por RFC) e **I81** (histórico de versões pelo
ADT).
**2026-09-02 (40ª sessão): decisão do Joris — promover a I94 (liberar TR pelo ADT) → fila 74 — e o
74 fechou no mesmo dia** (E2E 12/12, zero órfã). `liberarRequest` no `cts.mjs`: o ciclo da TR fecha
inteiro sem GUI. A ação é `POST …/<nr>/newreleasejobs` sem corpo; cinco armadilhas medidas — HTTP 200
sempre (o veredito é o chkrun), liberação assíncrona ('O'→'R', poll na E070),
**`release_simulation=true` LIBERA em vez de simular** (só 'X' simula — e na simulação o corpo mente
`released`; a E070 é a única prova), **o SAP não recusa dono alheio** (liberou a ordem de ME00083;
o guard-rail é da lib) e liberada é PERMANENTE (nenhuma via apaga). Achado → **I95** (o resto do
vocabulário do dispatcher: `moveobjects`, `tasks`, `reassigntask`…). Ficam no s4h 6 TRs liberadas
nomeadas POC74 (decisão consciente do item). **A fila volta a ficar sem item aberto executável**
(5 e 36 bloqueados, 43 por infra Java): candidatas com fato recente são **I95** (achado desta
sessão), **I64** (inserir objeto na TR por RFC — par natural do 74: com ele o pipeline monta a TR
a partir de lista E a libera) e **I81** (histórico de versões pelo ADT).
**2026-09-02 (41ª sessão): decisão do Joris — promover a I64 (inserir objeto na TR por RFC) →
fila 75 — e o 75 fechou no mesmo dia** (POC + E2E 10/10, zero órfã, tudo apagado com ausência
confirmada). `inserirObjetosNaRequest` no `cts.mjs`: a TR de entrega se monta a partir de LISTA
por SOAP puro, sem sessão ADT — com o 74, o pipeline inteiro (criar → inserir → liberar) roda sem
GUI e sem deploy. O desenho da I64 mudou na medição: **o FM não trava o objeto** (LOCKFLAG vazio;
quem trava é o deploy com `corrNr`), a entrada cai na E071 da ORDEM sem criar tarefa, duplicado
deduplica em silêncio, inexistente é recusado limpo, e **dono alheio o servidor aceita** — a
recusa (dono, tarefa, liberada, objeto não-Z/Y) é da lib. 658/658 testes. **A fila volta a ficar
sem item aberto executável** (5 e 36 bloqueados, 43 por infra Java): candidatas com fato recente
são **I95** (vocabulário do dispatcher: `moveobjects`, `tasks`, `reassigntask`…) e **I81**
(histórico de versões pelo ADT) — a I64 fechou aqui.
**2026-09-02 (42ª sessão): decisão do Joris — promover a I95 (vocabulário useraction do CTS ADT) →
fila 76 — e o 76 fechou no mesmo dia** (E2E 14/14, zero órfã, tudo apagado). A gestão da TR fechou
INTEIRA sem GUI: sete funções novas no `cts.mjs` (tarefa avulsa — inclusive de outro usuário —,
mover objeto entre ordens, tarefa que muda de mãe, troca de dono, fusão, sort/compress e o check de
consistência da SE01). Desmentido que custou uma rodada: **três nomes de ação da hipótese estavam
errados** — os valores reais são `reassign`/`merge`/`lockobject` (`IF_CTS_ADT_TM_CONSTANTS`), e o
chute do switch respondeu "Benutzeraktion nicht unterstützt". Armadilhas medidas: `moveobjects` é só
ordem→ordem, `merge` APAGA a origem, `changeowner` (PUT com segmento próprio) aceita TR alheia no
servidor — guard da lib. 662/662 testes. As sobras (`lockobject`, `preparerelease`, resumes de
release) viraram **I96**. **A fila volta a ficar sem item aberto executável** (5 e 36 bloqueados,
43 por infra Java): candidatas com fato recente são **I96** e **I81** (histórico de versões pelo
ADT).
**2026-09-02 (43ª sessão): decisão do Joris — promover a I96 → fila 77 — e o 77 fechou no mesmo
dia** (POC 4 fases + E2E 12/12, zero órfã, tudo apagado). O dispatcher do CTS está COMPLETO: o
lock do `lockobject` mora na **TLOCK** (não no E071.LOCKFLAG — a hipótese da I96 caiu), trava até
objeto sem entrada (lock fantasma → guard da lib), e o ciclo release→interrupção→retomada fecha
sem GUI (`liberarRequest` devolve `retomar`; `retomarLiberacao` reenvia — `relObjigchkatc` é
camelCase e o `releasetimestamp` é lock otimista). A simulação vale para interrupção E retomada
(ensaio sem liberar). Dois fixes no caminho: o unlock dos drivers agora inclui a PRÓPRIA ordem
(TLOCK de ordem sem tarefa ficava presa) e o teardown mediu que TADIR de objeto que viajou em TR
liberada só sai quando a exclusão VIAJA também (TR 024). 667/667 testes. Ficam S4HK912911/912912
liberadas (POC77). Achado → **I97** (o vocabulário do EDITOR de TR — outro handler: addobject,
removeobject, editdesc, changetarget, protect…). **A fila volta a ficar sem item aberto
executável** (5 e 36 bloqueados, 43 por infra Java): candidatas com fato recente são **I97** e
**I81** (histórico de versões pelo ADT).
**2026-09-02 (44ª sessão): decisão do Joris — promover a I97 → fila 78 — e o 78 fechou no mesmo
dia** (POC 4 fases + E2E 19/19). O "outro handler" existe e é o EDITOR do Eclipse: PUT no próprio
recurso da TR, roteado pelo `tm:useraction` do corpo (`CL_CTS_ADT_TM_RES_REQUEST_CONT`); ação
desconhecida cai no `save()` — editar descrição É o save, e o save **apaga o que o corpo não traz**
(alvo e projeto; a lib reenvia). NOVE funções novas no `cts.mjs` — a edição da TR fechou sem GUI,
inclusive a remoção de entrada que o item 24 dava como inexistente (`removeobject`, mudo com
position errada — guard da lib). 671/671 testes. Achados → **I98** (objectkeys, o editor de E071K)
e **I99** (deleteObject 200-mudo com stateful caído). ⚠ O stateful do s4h caiu no teardown e o
pacote `YJBV_POC78_PKG` ficou órfão (sem TR) — a limpeza está descrita no item. **A fila volta a
ficar sem item aberto executável** (5 e 36 bloqueados, 43 por infra Java): candidatas com fato
recente são **I98**, **I99** e **I81** (histórico de versões pelo ADT).
**2026-09-02 (45ª sessão): a pendência do 78 fechou** — o stateful do s4h voltou (probe ✅), o
`poc78-limpeza3.mjs` da sessão anterior rodou e o `YJBV_POC78_PKG` saiu inteiro (TDEVC=0, TADIR=0,
TRs de limpeza apagadas, zero órfã); nota sob o item. Detalhe medido no caminho: a entrada de
exclusão do pacote caiu numa TR aberta pelo SISTEMA, não na corrNr passada. **A fila segue sem item
aberto executável** (5 e 36 bloqueados, 43 por infra Java): o próximo alvo é decisão do Joris —
candidatas com fato recente são **I98** (objectkeys, o editor de E071K), **I99** (deleteObject
200-mudo com stateful caído) e **I81** (histórico de versões pelo ADT).
**2026-09-02 (46ª sessão): decisão do Joris — promover a I98 (objectkeys, o editor de E071K) →
fila 79 — e o 79 fechou no mesmo dia** (POC em 5 fases + E2E 13/13, zero órfã, TRs de POC apagadas
com ausência confirmada). O 400 "I::000" do item 78 tinha causa simples: o GET exige
`objName`+`objType` de objeto que ESTÁ na lista da TR. A escrita fechou — `gravarChavesNaRequest`/
`verificarChavesNaRequest`/`montarTabkey` no `cts.mjs` (o inverso do `fatiarTabkey`: a metade que
faltava do TABKEY do item 21) — com DUAS armadilhas de silêncio medidas por contra-prova: corpo
sem a seção `tk:tables` é **200 mudo que apaga** as chaves do objeto, e o PUT é DOCUMENTO por
objeto (substitui o conjunto; as chaves de OUTROS objetos ficam — medido com T005). Objeto fora
da lista é 400 limpo sem varrer a E071; "system objects" (T000…) o próprio `TR_EXT_INSERT` recusa
— e o insert em LOTE é tudo-ou-nada (um recusado derruba todos, custou uma rodada da POC). Achado
→ **I100** (chave string E071K_STR, o único ramo não medido do editor). 677/677 testes. Docs:
`receita-change-request.md § O Object Key Editor`. **A fila volta a ficar sem item aberto
executável** (5 e 36 bloqueados, 43 por infra Java): candidatas com fato recente são **I99**
(deleteObject 200-mudo), **I100** (achado desta sessão) e **I81** (histórico de versões pelo ADT).
**2026-09-02 (47ª sessão): decisão do Joris — promover a I99 (deleteObject confere ausência) →
fila 80 — e o 80 fechou no mesmo dia** (POC 3 fases + E2E 7/7, zero órfã, tudo apagado com
ausência confirmada). A dúvida do Joris ("já deletamos tanto objeto de POC — como isso está sem
prova?") tinha resposta exata: quem provava era o TEARDOWN das POCs conferindo tabela à mão, não
a lib — e a mentira do item 78 era o GET inicial lendo o 400 do stateful caído como "não existe"
(`deleted:false` com status forjado 404, sem lançar e sem mandar DELETE nenhum). Reproduzida
contra ICM de mentira local (sem derrubar o s4h) e fechada: só 404 explícito é "não existe", e
todo delete confere a ausência por GET stateless (52–66 ms; o transportável com `DELFLAG='X'`
pendente NÃO dá falso alarme — medido). `adt-client.test.mjs` novo (5 testes). 682/682. **A fila
volta a ficar sem item aberto executável** (5 e 36 bloqueados, 43 por infra Java): candidatas com
fato recente são **I100** (chave string E071K_STR) e **I81** (histórico de versões pelo ADT).
**2026-09-02 (48ª sessão): decisão do Joris — promover a I100 (chave string E071K_STR) → fila 81 —
e o 81 fechou no mesmo dia** (POC em 4 rodadas + E2E 13/13, zero órfã, TRs de POC apagadas com
ausência confirmada). O Object Key Editor FECHOU inteiro: "tabela string" é campo-chave SSTR (não
comprimento), o KEY_LENS é números de 5 dígitos por campo, e a chave mora SÓ na E071K_STR (vazia
no s4h até a POC). `ehTabelaString`/`montarTabkeyString` no `cts.mjs`; `gravarChavesNaRequest`
detecta pelo layout sozinha. Armadilha DURA medida: **valor > LENG do dicionário é 500 SEM dump
que derruba a sessão de segurança ADT** — guard da lib antes da rede; PUT sem `tk:length` é 400
com mensagem enganosa (TK318); insert TABU de tabela classe A só entra em TR K (W recusa
genérico). 687/687 testes. **A fila volta a ficar sem item aberto executável** (5 e 36 bloqueados,
43 por infra Java): a candidata com fato recente é **I81** (histórico de versões pelo ADT).

- [x] 1. POC: BAPI de escrita + COMMIT via driver classrun — medido 2026-08-26: duas chamadas
  SOAP separadas NÃO compartilham LUW (commit "ok" sem gravar); BAPI + BAPI_TRANSACTION_COMMIT
  no mesmo driver persiste, assert por readTable. Docs em 0c0d70b
  (receita-ciclo-escrita-verificacao.md, canal-soap-rfc.md).
- [x] 2. Wrapper FM RFC para sistemas sem classrun — medido 2026-08-26: `deployFunctionModule` +
  `buildBdcWrapperSource` criam FUGR/FF RFC por ADT REST e o wrapper de BDC roda por SOAP RFC
  (VA03 + doc inexistente → EV_SUBRC=1001, msg de negócio E V1 302). Gotcha-chave: o
  `processingType="rfc"` do create é descartado (nasce "normal"); só PUT do metadata com lock
  persiste (FMODE='R'). Docs em `receita-fm-rfc-wrapper.md` + `canal-soap-rfc.md`.
- [x] 3. Skill sap-testes — criada 2026-08-26 em `~/.claude/skills/sap-testes/SKILL.md`: procedimento
  ativo sobre as receitas (probe primeiro, matriz de canais, ciclo arrange→act→assert, decisão de
  escrita classrun vs wrapper FM RFC, asserts, regras de laboratório). Receitas seguem canônicas em
  `docs/`; `adt-objetos` ganhou linha de roteamento para ela. Escolhida skill nova (não extensão):
  criar/alterar objetos e executar/provar são preocupações distintas, e a adt-objetos já tem ~800 linhas.
- [x] 4. Re-validação das receitas num sistema de cliente (SXD da KART) — medido 2026-08-26 no
  SXD release 816, mandante 100: probe (ADT+SOAP+classrun ok), readTable T000, callBapi
  GETLIST (91 empresas), ciclo arrange→act→assert completo (tabela+driver $TMP, linha achada
  em outra LUW), wrapper FM RFC (FMODE='R', BDC VA03 → EV_SUBRC=1001, E V1 302). 11/11 PASS,
  zero divergência vs laboratório; objetos $TMP apagados. Notas de re-validação nas 4 receitas.
- [ ] 5. Spike node-rfc — canal de compatibilidade para ECC antigo (até 4.6C).
  > bloqueado: aguardando um sistema-alvo REAL sem SOAP RFC (probe com `soapRfc:false` — ECC
  > pré-Web AS 6.20 ou nó SICF fechado por segurança). Decisão com o Joris 2026-08-26: S4H 758 e
  > SXD 816 têm todos os canais, então o spike não provaria nada que o SOAP já não prova; e o
  > node-rfc custa caro (lib arquivada pela SAP 05/2026, SDK restrito por S-user, DLL nativa).
  > Estado medido: SDK ausente na máquina (sem sapnwrfc.dll, SAPNWRFC_HOME vazio). Quando
  > desbloquear: SDK 7.50 em C:\nwrfcsdk + SAPNWRFC_HOME, npm i node-rfc, ping/readTable contra
  > o sistema-alvo, receita canal-node-rfc.md.
- [x] 6. Spike wdi5 — medido 2026-08-26 no s4h (758): superfície RAP `YJBV_POC_WDI5_*` (CDS
  read-only sobre DD02L + SRVD + SRVB cat 0 publicado) e o preview FE servido pelo próprio ADT
  (`…/odatav4/feap` — formato do `feapParams` lido de `CL_ADT_ODATAV4_FEAP`); wdi5 3.0.11 +
  wdio 9 headless dirigiu o app: FilterBar → Go → linhas do OData V4 (3/3 verdes). Auth de
  browser: **injeção de cookie** (query-logon pendura XHR; BasicAuth do Chrome mata o CSRF do
  `$batch`). Receita: `receita-wdi5-fiori.md`; canal entrou na matriz da skill `sap-testes`;
  gotchas de modelo V4 (chave-só-mandante, CHAR1→Edm.Boolean) na `adt-objetos`. Superfície
  mantida no s4h como app-alvo de testes futuros.
- [x] 7. Re-validação no s4h após a migração para módulos de tipo — medido 2026-08-28, S4H 758,
  mandante 250, três rodadas com objetos `YJBV_POC_R7_*` em `$TMP`, todos apagados ao final. Passou
  pela lib nova: table (DD02L), class com testSource (aunit 1/1, cobertura 50%) + classrun em sessão
  nova + readTable em outra LUW, domain e dataElement por `deployBody` (DD07L valores fixos, DD04T
  labels em 'P'), msag, structure (INTTAB), interface (SEOCLASS + GET), include + report (TRDIR),
  cds root view + driver SELECT, **`deployMany` BDEF + pool numa ativação** (aviso "should be strict")
  + EML create/commit + linha vista em outra LUW, **`deployMany` SRVD + SRVB** → publish →
  `$metadata` 200 → unpublish → delete, FUGR + FM RFC (TFDIR FMODE=R, VA03 BDC por SOAP → EV_SUBRC
  1001 / E V1 302, aunit com CALL FUNCTION local), `dicaDeErro` anexada a um 400 real (descrição >
  60). Achados novos, registrados nos módulos: (1) `SUBMIT` de dentro de driver classrun → HTTP 500,
  duas variantes — teste de report por classrun descartado (prog.guardRails); (2) MSAG nasce com
  `T100A.MASTERLANG` e `T100.SPRSL` VAZIOS e `MESSAGE … INTO` devolve a forma técnica — ponto aberto
  de idioma (msag.guardRails/erros); (3) delete → create do mesmo nome dá 403 "já está processando"
  (ENQUEUE em TRDIR/T100/RSDEO/WBS_ENQUEUE_STRU, persiste entre logons) — virou
  `classrun.liberarLocks` (9 locks liberados, subrc=0) e erro transversal; (4) discovery do s4h
  TEM `ddic/tabletypes`, `ddic/lockobjects/sources`, `ddic/views`, `xslt/transformations`,
  `packages`, `acm/dcl/sources`, `aps/iam/auth|suso`, `enhancements/*` e NÃO tem `aps/iam/tran`
  nem `ddic/searchhelps` (ideias I1/I2/I14–I19 atualizadas). Módulos: `medido`/`prova.medido`/
  `revalidacoes` preenchidos só no que rodou. Re-vendorização do abapgit e ledger da skill:
  ver commit.
- [x] 8. Módulo `tipos/tableType.mjs` (TTYP/DA) — medido 2026-08-28, S4H 758, mandante 250,
  objetos `YJBV_POC_TT*` em `$TMP` (todos apagados, ausência confirmada por readTable). **A coleção
  nativa existe e cria**: `/sap/bc/adt/ddic/tabletypes`, media type `application/vnd.sap.adt.tabletype.v1+xml`
  — SINGULAR (o plural e o v2 dão 406) — XML `ttyp:tableType`, sem `/source/main` (404), forma `xml`
  pelo `deployBody` genérico. 9/9 PASS: create+activate com linha de estrutura; readTable DD40L
  (ROWTYPE, ROWKIND='S', ACCESSMODE='T', KEYDEF='D', KEYKIND='N'); driver classrun (`TT lines=2 first=um`);
  **alteração do objeto ATIVO** standard → sorted+keyComponents pelo mesmo deploy (DD40L ACCESSMODE='S'
  KEYDEF='K' KEYKIND='U', DD42S KEYFDPOS='0001' KEYFIELD='ID') e driver com `READ TABLE … WITH TABLE KEY`
  (subrc=0, ordenação provada); table type de tipo predefinido (STRING → DD40L DATATYPE='STRG',
  ROWTYPE/ROWKIND vazios); delete dos 5 objetos. Desmentido registrado no módulo: "TTYP não é criável
  por ADT REST, só sob /vit/" — é o que os clientes open source mostram, não o que o SAP oferece.
  Lib: módulo + teste irmão (snapshot do XML), catálogo regerado (17 tipos), README/CONTEXT/skill
  `adt-objetos` atualizados (a lacuna do TTYP deixou de existir). 177/177 testes.
- [x] 9. Módulo `tipos/accessControl.mjs` (DCLS/DL) — medido 2026-08-28, S4H 758, mandante 250,
  objetos `YJBV_POC_DCL*`/`YJBV_POC_CL_DCL*` em `$TMP` (todos apagados, ausência confirmada por
  readTable TADIR). A hipótese de I14 se confirmou inteira: coleção `/sap/bc/adt/acm/dcl/sources`
  no discovery (accept `application/vnd.sap.adt.dclSource+xml`, templates de `{object_name}` e
  `/source/main`), XML `dcl:dclSource`, forma `source` pelo `deploySource` genérico — o mesmo fluxo
  da CDS, sem nenhum desvio. Molde lido de I_CADOCUMENTGLITEM e SHSM_DFKKOP. **O assert é a
  diferença**, e ela apareceu: tabela + CDS view entity + 3 linhas (2 com kind=A); o driver lê a
  view três vezes na mesma execução — com a role (`where Kind = 'A'`), com `WITH PRIVILEGED ACCESS`
  e na tabela base → `R dcl=2 privileged=3 base=3`. Alteração da role ATIVA pelo mesmo deploy
  (`Kind = 'B'`) → `dcl=1`. Achados que a pesquisa não previa, registrados no módulo: (1) sem
  `@MappingRole: true` a ATIVAÇÃO FALHA (E ACM_SYNTAX 130 "Zugriffsrollen müssen Annotation
  @MappingRole haben", activationExecuted="false") e a versão ativa anterior continua valendo —
  não é "role que existe e não é aplicada"; (2) **desmentido**: CDS `#CHECK` sem DCL alguma devolve
  TUDO (3 de 3) — ausência de role não é negação; (3) **desmentido**: `#NOT_REQUIRED` na CDS NÃO
  desliga a role — com a mesma DCL ativa continuou filtrando 2 de 3. Condição por literal medida;
  a forma `aspect pfcg_auth` (a dos objetos padrão) fica não medida — exige perfil PFCG. Lib:
  módulo + teste irmão (snapshot do XML), catálogo regerado (18 tipos), README/CONTEXT/pesquisa/
  skill `adt-objetos` atualizados. 183/183 testes.
- [x] 10. Módulo `tipos/package.mjs` (DEVC/K) — medido 2026-08-28, S4H 758, mandante 250, objetos
  `$YJBV_POC_PKG*` + `YJBV_POC_PKGT` + tabelas `YJBV_POC_PKG*_T` (todos apagados, ausência confirmada
  por readTable TDEVC/TADIR). A coleção `/sap/bc/adt/packages` cria — mas por um caminho que a
  pesquisa não previa em três pontos: (1) create só com **`packages.v2+xml`** (o `v1+xml` dá 415);
  (2) o body precisa dos SETE elementos do schema na ordem (`attributes, superPackage,
  applicationComponent, transport, useAccesses, packageInterfaces, subPackages`) — falta um, 400
  "Elem.'…' esperado", um por vez; (3) `adtcore:responsible` é obrigatório e **em MAIÚSCULAS** (400
  PAK 049), daí o módulo usar `conexao.cfg.user`. Forma `custom` porque o pacote **nasce ativo**
  (201 + version="active"; /activation responde `activationExecuted="false"`, no-op). 8/8 PASS pelo
  fluxo da lib: create local, TDEVC (DLVUNIT LOCAL, KORRFLAG vazio), alteração pelo mesmo deploy
  (lock→PUT→unlock), sub-pacote (PARENTCL), **objeto com nome definitivo nascendo no pacote certo**
  (tabela com TADIR-DEVCLASS = o pacote — o ponto da ideia), e os dois guard-rails recusando antes
  da rede. Achados novos: **uma modificação de pacote por SESSÃO** (o unlock não solta o pacote
  dentro da sessão que o modificou: 2º lock devolve o mesmo handle e o PUT dá 400 "já está
  bloqueado"; sessão nova → 200/200) e o `assertZY` transversal passou a aceitar `$Z…/$Y…` (pacote
  local é objeto nosso; `$TMP` segue recusado). Desmentidos registrados: pacote não ativa; o ADT
  REST **cria transportável** (o SAP gera TR + tarefa sozinho, sem `corrNr`); pacote local **não
  tem linha na TADIR** — a prova é a TDEVC. Lib: módulo + teste irmão, catálogo regerado (19 tipos),
  README/CONTEXT/pesquisa/ideias + skill `adt-objetos` (a linha "pacote Z transportável (SE21):
  manual" deixou de existir). 190/190 testes.
  > pendência de limpeza: a TR `S4HK912769` (tarefa `S4HK912770`), gerada pelo create do pacote
  > transportável, ficou no s4h — vazia de objeto real (o pacote foi apagado com o corrNr da ordem
  > PAI, 200), mas a TR recusa DELETE ("contém objetos bloqueados"). Desde o item 24 existe via
  > medida (`cts.desmancharRequest` + `removerTadirOrfa` do DEVC) — executar é decisão do Joris.
- [x] 11. Include de grupo de funções (FUGR/I) — medido 2026-08-29, S4H 758, mandante 250, objetos
  `YJBV_POC_I_FG` / `YJBV_POC_I2_FG` e seus includes em `$TMP` (todos apagados; ausência confirmada
  por readTable TADIR e TRDIR). Virou módulo próprio, `tipos/functionGroupInclude.mjs` — o terceiro
  do código FUGR. A hipótese do sub-recurso se confirmou (`functions/groups/<fg>/includes/<inc>`,
  source-based), mas o resto veio diferente do previsto: (1) o nome NÃO é o sufixo de 3 chars — a URI
  e o create usam o NOME COMPLETO `L<GRUPO><SUFIXO>` (o sufixo é da SE80; a lib aceita as duas formas
  e monta); (2) o create é `fincludes.v2+xml` — o v3 do FM dá 415, e o corpo do 415 informa o media
  type suportado; (3) **o gotcha que custou a POC**: o SAP escreve a linha `INCLUDE <inc>.` no pool
  `SAPL<GRUPO>` sozinho, mas só na versão INATIVA — ativar o include isolado deixa o pool ATIVO sem a
  linha, e o FM que faz PERFORM da FORM falha a ativação com "Programa SAPL<GRUPO> contém erros de
  sintaxe", sem dizer o porquê; o deploy do módulo ativa pool + include na MESMA requisição; (4) o ADT
  NÃO confere se o include pertence ao grupo (`LZOUTROGRUPOF01` aceito dentro de YJBV_POC_I_FG, 200) —
  só exige o `L` inicial (sem ele, 500 "Características para programa … não gravadas"); a convenção
  virou guard-rail nosso, antes da rede. Campo transversal novo no esquema: `zyPeloContainer` — o
  include `LYJBV_…` não começa com Z/Y, então o assertZY roda sobre o GRUPO, que é o dono do namespace
  (`_registro` e `_teste` seguem a mesma regra). E2E pela lib: 6/6 PASS — include num grupo que ainda
  não existia (o deploy cria o FUGR), TRDIR `SUBC='I'`, FM RFC com dois PERFORM (EV_SOMA=42,
  EV_DOBRO=84), alteração do include ATIVO valendo no FM já ativo sem tocar nele (142), e os três
  guard-rails recusando antes da rede. Limpeza precisou de `classrun.liberarLocks` (2 ENQUEUEs de
  TRDIR no SAPL<GRUPO> após o delete do FM). Lib: módulo + teste irmão, catálogo regerado (20 tipos),
  README/CONTEXT atualizados. 198/198 testes.
- [x] 14. Anatomia de objeto pela change request — medido 2026-08-29, S4H 758, mandante 250,
  **somente leitura**: nenhum objeto criado, alterado ou apagado. Cobaias: a TR `S4HK912769`
  (tarefa `S4HK912770`) que o item 10 deixou no sistema, a liberada `S4HK911417` (classes) e a de
  customizing `S4HK910129`/`S4HK910130`. A hipótese se confirmou — E070/E071/E071K descrevem o que
  a TR carrega — mas com uma correção que muda a leitura de toda TR modificável: **antes da
  liberação as entradas moram na TAREFA, e a E071 da ORDEM fica VAZIA** (E071 de S4HK912769 = 0
  linhas; E071 de S4HK912770 = `R3TR DEVC YJBV_POC_PKGT`, `LOCKFLAG='X'`). A liberação consolida e
  acrescenta uma marca `CORR RELE` por tarefa (número/data/hora/usuário no OBJ_NAME), com
  `LOCKFLAG='3'`. Anatomia medida: `PGMID` dá o grão — `R3TR` = objeto inteiro, `LIMU` = parte
  (`METH`/`CPUB`/`CPRI`/`CLSD`/`CPRO`: classe alterada entra decomposta em um método por entrada),
  e o nome do `LIMU METH` é **posicional** (classe em 30 posições fixas + método). As entradas de
  chave: `TABKEY` é a chave concatenada e posicional, começando pelo mandante quando a tabela
  depende dele, com `*` de curinga (`250FSSA`, `300D1411Z0`, `0000AAAB…FFFF*`), e
  `MASTERTYPE`/`MASTERNAME` dizem o dono (`VDAT` + visão de manutenção, ou `TABU` + a tabela).
  Confronto com o ADT (3): `GET cts/transportrequests/<TR>` **consolida** e **enriquece**
  (`wbtype`, texto do tipo no idioma de logon) mas **não mostra chave nenhuma** — para `R3TR VDAT
  V460A` diz "Atualização de visão: dados" e para; as duas vias concordam nos objetos
  (`soNasTabelas` e `soNoAdt` vazios na S4HK910129) e só as tabelas têm as 54 chaves. Achados que
  a hipótese não previa: (1) o XML do ADT tem **TRÊS** lugares com entrada de objeto — filhos
  diretos de `tm:request` (as próprias), `tm:all_objects` (o consolidado, SEM a marca CORR RELE) e
  os de cada `tm:task` — 34 `tm:abap_object` no mesmo documento contando o mesmo objeto até três
  vezes; (2) a árvore do Transport Organizer **falha em silêncio** sem `requestStatus` (HTTP 200
  com `<tm:root/>` vazio; com `&requestStatus=D`, 8 requests) e `requestStatus=R` devolve vazio;
  (3) **`RFC_READ_TABLE` levanta `TABLE_WITHOUT_DATA` quando um CAMPO PEDIDO NÃO EXISTE** — nada a
  ver com tabela vazia (`GENFLAG` × `GENNUM` na E071), virou `dicaDeLeitura` anexada ao erro e
  linha na `sap-testes`. Superfície decidida (4): módulo `cts.mjs` **somente leitura** —
  `lerRequest`, `listarRequests`, `lerRequestPorTabelas` (a única via com as chaves), `anatomia`
  cruzando as duas; export `jbv-adt-client/cts`. E2E pela lib: 6/6 PASS. Lib: `cts.mjs` +
  `cts.test.mjs` (fixtures reais), `docs/receita-change-request.md`, gotcha na
  `canal-soap-rfc.md`, refinamento em `tipos/package.mjs` (a entrada órfã da TR está na TAREFA),
  README/CONTEXT/ideias + skill `sap-testes` (canal CTS na matriz). 207/207 testes. Fora de
  escopo, virou ideia: fatiar o `TABKEY` pelo DD03L (I26) e o diff TR × sistema (I27); datafile/
  cofile segue fora sem decisão do Joris.

- [x] 13. Campo e objeto de autorização (AUTH, SUSO) — medido 2026-08-29, S4H 758, mandante 250,
  objetos `YJBV_POC_F`/`YJBV_POC_AF`/`YJBV_POC_O` + `YJBV_POCF2`/`YJBV_POCO2` e sete classes driver em
  `$TMP` (todos apagados; ausência confirmada por readTable AUTHX, TOBJ e TADIR). Viraram DOIS módulos,
  `tipos/authorizationField.mjs` (AUTH) e `tipos/authorizationObject.mjs` (SUSO/B), os dois forma `xml`
  pelo `deployBody` genérico: media type **`blues.v1+xml`** no create e no GET (o `application/*`
  também passa), sem `/source/main` (404), e **`adtcore:responsible` NÃO é exigido** — por isso, ao
  contrário do pacote, não precisou de forma `custom`. Nascem ativos (`activationExecuted="false"`).
  A hipótese da I17 caiu em três pontos: (1) o `maxLen: 10` do abap-adt-api não é do create do AUTH —
  AUTHX-FIELDNAME é CHAR 30 e o create ACEITA 11; os 10 são de **TOBJ-OBJCT/FIEL\*** (XUFIELD) e só
  mordem no create do SUSO, com um 400 "erro na deserialização em o programa ST SUSO" que não diz qual
  nome estourou (desambiguado: objeto de 10 + campo de 11 também falha); (2) o "AUTH não altera" do
  sapcli está desmentido — lock→PUT→unlock trocou rollName BUKRS→WERKS_D e checkTable T001→T001W num
  campo ATIVO; (3) **a prova da ideia não provava nada**: `AUTHORITY-CHECK` sem perfil devolve
  `sy-subrc=12` tanto para o objeto criado quanto para um nome que nunca existiu, e o check de sintaxe
  do ABAP não valida objeto nem ID contra a TOBJ (as duas variantes ATIVARAM). Decisão do Joris na
  sessão: provar pelo efeito com **usuário de teste descartável**. Feito com `SUSR_INTERFACE_PROF`
  (ptype `'S'` — `'E'` cai em "colective_profile") criando perfil+autorização, `BAPI_USER_CREATE1`
  (tipo `L`, referência) + `BAPI_USER_PROFILES_ASSIGN`; matriz medida por `AUTHORITY-CHECK … FOR USER`:
  autorizado **0**, valor fora **4**, atividade fora **4**, campo omitido **0** (campo não citado não é
  checado), objeto inexistente **12**, usuário sem perfil **12**, ID inexistente **4**. Usuário, perfil
  e autorização removidos ao final (USR02/USR10/USR12/UST04 vazios). Achado que forçou mudança
  transversal: o RIS devolve **`AUTH` SEM subtipo** (e `SUSO/B` com) — o `validarModulo` exigia
  `TIPO/SUB` e foi afrouxado em `tipos/_registro.mjs`. Segunda fonte do elo campo→objeto:
  `GET aps/iam/auth/$authobjects?name=<campo>` lista o objeto que o usa. E2E pela lib LOCAL: **12/12
  PASS** (create dos dois, elo `$authobjects`, alteração dos dois ATIVOS, seis guard-rails recusando
  antes da rede, delete com ausência confirmada). Lib: dois módulos + testes irmãos, catálogo regerado
  (22 tipos), README/CONTEXT/pesquisa/ideias + skills `adt-objetos` (ledger, receita, divergências) e
  `sap-testes` (princípio do contrafactual, assert `FOR USER`, E2E importa o repo local). 223/223 testes.
  > observado sem causa isolada: o primeiro DELETE de `YJBV_POC_O`/`YJBV_POC_F`, na mesma sessão que
  > acabara de apagar o perfil, devolveu 400; a mesma chamada em sessão nova devolveu 200. O corpo do
  > 400 não foi lido — por isso nada foi para `erros` dos módulos.
  > aberto: `aps/iam/*` no SXD 816 segue não medido; a forma `aspect pfcg_auth` e a integração SU24
  > ficam fora.
- [x] 12. Lock object (ENQU/DL) e view clássica (VIEW/DV) — medido 2026-08-29, S4H 758, mandante
  250, objetos `EYJBV_POC_L1`/`EYJBV_POC_L9`/`EYJBV_POC_LK`, tabelas `YJBV_POC_LK_T`/`_T2` e drivers
  `YJBV_POC_CL_*` em `$TMP` (todos apagados; ausência confirmada por readTable TADIR, DD25L e TFDIR).
  **Metade da hipótese: ENQU cria, VIEW não.** Virou UM módulo, `tipos/lockObject.mjs` (forma `xml`
  pelo `deployBody`): coleção `ddic/lockobjects/sources`, media type `lockobjects.v1+xml` no create e
  no GET, XML `enqu:lockobject` (molde de EMMARAE/E_TABLE/EVVBAKE//ACCGO/E_DPQS), sem `/source/main`.
  Nasce inativo; a ATIVAÇÃO gera `ENQUEUE_<n>`/`DEQUEUE_<n>` em `/1BCDWBEN/SAPLTEN0000` (TFDIR,
  `FMODE='R'` com `allowRFC`). Desvios que a pesquisa não previa: (1) o nome **começa por E** — sem
  ele, 409 "objetos de teste em conjuntos de nomes externos"; a lib ganhou `nomeacao.prefixo` e o
  guard-rail Z/Y transversal passou a rodar DEPOIS do prefixo (`assertZYDoTipo`, `semPrefixo`);
  (2) o create **não valida a tabela** (201 com tabela inexistente; a ativação recusa, D0 408);
  (3) **tabela secundária sem chave estrangeira é descartada em silêncio** (PUT 200, ativação limpa,
  DD26S só com a primária) — com FK no DDL (que exige data element no campo, E2 181) persiste;
  (4) `_scope` 1 e 2 da mesma sessão NÃO colidem; a exclusividade só aparece de outro contexto —
  o driver do tipo prova pelo contrafactual `DESTINATION 'NONE'`: mesma chave → FOREIGN_LOCK (1),
  outra chave → 0, após DEQUEUE → 0; (5) lock tomado por `DESTINATION 'NONE'`/`_scope=2` **sobrevive
  ao fim do driver e ao DELETE do lock object** (custou duas rodadas do E2E) e `DEQUEUE_ALL` não é
  RFC (`CALL_FUNCTION_NOT_REMOTE`, dump lido em `/sap/bc/adt/runtime/dumps`) — o driver solta chave
  a chave pelo `DEQUEUE_` gerado e termina com a SM12 limpa. **VIEW clássica: impossível no 758,
  medido** — `ddic/views` é o recurso de view EXTERNA (HANA): o único accept que o 406 nomeia é
  `application/vnd.sap.ddic.view+xml`, e com ele o GET de V_USR_NAME (D), V_TVKO (C) e ENT2180 (E)
  dumpa `ASSERTION_FAILED` em `CL_DDIC_WB_XVIEW_PERSIST`; o POST exige `view:view` (ns
  `adt/ddic/view`) com `qualifiedHanaViewName`. SHLP sem coleção. Os dois ficam "só SE11" (skill
  `adt-objetos`, tabela "não dá pelo ADT REST"). E2E pela lib LOCAL: **12/12 PASS** (create+activate,
  DD25L, TFDIR, driver com contrafactual e SM12 limpa, SOAP `ENQUEUE_`, alteração do ativo com
  secundária na DD26S, GET, três guard-rails, delete com ausência confirmada). Lib: módulo + teste
  irmão, `nomeacao.prefixo` no esquema/registro/testes, catálogo regerado (23 tipos), README/CONTEXT/
  pesquisa/ideias + skills `adt-objetos` (ledger, "não dá", divergências) e `sap-testes` (assert de
  lock por contrafactual). 232/232 testes.
- [x] 15. Cobertura pela TADIR (I24) — medido 2026-08-29, S4H 758, mandante 250, **somente leitura**:
  nenhum objeto criado. Virou `scripts/cobertura-tadir.mjs` (rerodável por sistema, credenciais por env ou
  terminal) + `docs/cobertura-tadir.md`. O caminho foi mais barato que a hipótese: **o `dataPreview`
  agrega** (COUNT/GROUP BY/ORDER BY/JOIN pelo freestyle) — sem driver classrun, o que torna a medição
  segura em sistema de cliente; gotcha: o freestyle corta a instrução em ~72 colunas (`"DESCENDIN" is not
  allowed`), quebrar por cláusula. Descrição do tipo: `EUOBJALL` (264 tipos, PT) + `WBOBJECTTYPES_T` +
  RIS `objecttypes`; `KO100` é ESTRUTURA e `TR_OBJECT_TABLE` não é RFC; `TROBJT` não existe. Recorte
  custom corrigido: `Z%/Y%` esconde o ENQU (`EZ/EY`, 11 achados) e `GENFLAG` esconde 10.408 STOB + 4.470
  VIEW gerados. **Resultado: 85.304 objetos custom em 121 tipos; os 19 códigos do catálogo cobrem 76%**
  e os 7 tipos mais frequentes. A lacuna que ninguém tinha notado: **família SEGW/Gateway V2** (IWMO/
  IWSV/IWVB/IWSG/IWOM/IWPR = 13.632, 16%) + SICF gerado (1.269) → I28; **TOBJ** (644, gerador SM30) →
  I29; G4BA (359) já é coberto POR EFEITO — o publish do `serviceBinding` V4 cria (medido em
  `YJBV_POC_WDI5_SB`). I18/I19/I21/I22 ganharam número (TRAN 1.254; forms 188; enhancements 129; BRF+
  zero no Z/Y — nome GUID). 232/232 testes (nada de código da lib mudou — sem bump). README/CONTEXT/
  ideias + skills `sap-testes` (dataPreview agrega), `adt-objetos` (ponteiro), `arsenal` (CRLF do .env).
  > pendente: rodar no **SXD 816** (`node scripts/cobertura-tadir.mjs sxd --tudo`) — `172.31.28.129` sem
  > resposta nesta sessão (sem VPN). Decisão do Joris 2026-08-29: SXD fora hoje, **a lista da moovi (s4h)
  > é a que vale por ora** — a I28 sai dela; a do SXD entra quando o sistema voltar.
  > 2026-08-31 (item 32): o SXD **voltou** (probe ✅ adt/soap/classrun, release 816, mandante 100) — a
  > pendência deixou de estar bloqueada por rede; falta rodar.
  > 2026-09-01, 14:56 (item 35): sondado de novo, **respondeu** (adt+soap+classrun ✅, release 816,
  > mandante 100). A sessão gastou o tempo no 35; a pendência segue sendo só rodar
  > `node scripts/cobertura-tadir.mjs sxd --tudo` (só leitura) com o SXD de pé.
  > **FECHADA 2026-09-01, 16:41** (15ª sessão, dentro da janela, sonda ✅ antes): o script rodou no SXD
  > 816:100 — **7.067 objetos custom em 86 tipos; catálogo cobre 62% direto, ~78% com efeito e drivers**.
  > O furo que o s4h escondia: **SHIP, 817 objetos (2º tipo, 12%), sem descrição em fonte alguma → I83**.
  > Resultado inteiro em `docs/cobertura-tadir.md § Resultado — SXD (KART)`. O item 15 não deve mais nada.
- [x] 16. Família SEGW / Gateway V2 por efeito (I28) — medido 2026-08-29, S4H 758, mandante 250, objeto
  `YJBV_POC_V2_SB` em `$TMP` (apagado; TADIR `YJBV_POC_V2%` vazia ao final). **Hipótese confirmada e
  ampliada:** um `serviceBinding` OData **V2** (categoria 0, sobre a SRVD `YJBV_POC_WDI5_SD` do item 6)
  gera **IWMO + IWSV + IWVB já no ACTIVATE** (nomes posicionais `<nome>…0001`, `<nome>_VAN…0001`) e
  **IWSG + IWOM + OA2S no PUBLISH** (`<nome>_0001`, `<nome>_0001_BE`), com `/IWFND/I_MED_SRH` ativo e
  `` 200 em `/sap/opu/odata/sap/<binding>/` (sem `_SRV`; antes do publish 403 `/IWFND/MED/170`).
  Contrafactual limpo: unpublish remove IWSG/IWOM/OA2S e o runtime volta a 403; delete remove IWMO/IWSV/
  IWVB. Não nasce IWPR (o projeto SEGW) nem nó SICF — os 434 nós Z do s4h vivem em `/default_host/sap/opu/
  odata/sap/<serviço>` e são do registro SEGW. Resultado na cobertura: 12.286 dos 13.632 da família
  passam a cobertos por efeito (custom ~90%). **Bug da lib achado e corrigido:** o job V2 lê
  `servicename`/`serviceversion` na **URL do job**, não na uri do objectReference — com a forma do V4 o
  publish devolvia 200 + SEVERITY ERROR "Parameter servicename wurde nicht gefunden" **e publicava**, e o
  unpublish devolvia o mesmo ERROR **sem despublicar** (serviço no ar, `published=true`). Agora
  `jobRequest(acao, {name, version})` monta os dois caminhos (puro, testado byte a byte),
  `odataV2RuntimeUrl`, `EFEITO_V2`; delete de binding V2 exige `version: 'V2'` (o `antesDeApagar` usa).
  Discovery: `businessservices/odatav2` existe; `bindings/bindingtypes` lista ODATA V2/V4 × 0/1, INA, SQL.
  Limpeza precisou de `liberarLocks` (`WBS_ENQUEUE_STRU SRVB<nome>` após delete → create). E2E pela lib
  LOCAL: **15/15 PASS**. Lib: módulo + teste, catálogo regerado, README/CONTEXT/ideias/cobertura-tadir +
  skills `adt-objetos` (V2) e `sap-testes` (assert por efeito na TADIR). 233/233 testes.
- [x] 17. TOBJ — gerador de atualização de tabela (SM30) (I29) — medido 2026-08-29, S4H 758, mandante 250,
  objetos `YJBV_POC_TSM30`/`YJBV_POC_FGSM30` em `$TMP` (todos apagados, ausência confirmada por readTable).
  **Hipótese confirmada e corrigida**: o ADT não gera (`transportobject/objects` = TOBJ/TOB é SÓ leitura no 758,
  POST → 400 SCTS_SOBJ 011), `VIEW_MAINTENANCE_GENERATE` só chama SE55, e o gerador NÃO é FM — é FORM do
  SAPMSVIM (`start_gen_viewmaint_tool`) que lê globais do module pool. **Via da lib (`sm30.mjs`,
  `deployTableMaintenance`)**: FUGR pela lib (dá a TADIR) + driver classrun com `OBJ_GENERATE` (OBJH/OBJS/TADIR
  TOBJ `<tab>S`) + `PERFORM init_const_tabs IN PROGRAM sapmsvim` + ASSIGN dos globais TVDIR/DEVCLASS/TDDAT +
  `MODIFY tddat` + `PERFORM start_gen_viewmaint_tool`. Assert: TVDIR, TDDAT, OBJH/OBJS, TADIR TABL+FUGR+TOBJ,
  9 includes, dynpro 0001, `TABLEFRAME_/TABLEPROC_`. **Prova de uso: SM30 por BDC gravou uma linha** (`S SV 018`)
  e o readTable a achou em outra LUW. BDC da SE54 medido e abandonado (TK 233 silencioso; grava TDDAT e para).
  Desfazer por API: `OBJ_GENERATE` modo D + DELETE tvdir/tddat + deleteObject. Receita
  `docs/receita-tobj-sm30.md`; cobertura-tadir e skill `adt-objetos` (SE54 deixou de ser "manual").
  Efeito colateral do dia: **regra das sessões** — `encerrarSessao`/`conexao.encerrar()` (logoff ICF, medido)
  e classrun em sessão nova stateless com `finally`; s4h com "400 Session not found" intermitente (não é a
  contagem — causa em aberto na receita). 235/235 testes. Commits b4368b7 + este.
  > re-medido 2026-08-29 18:19 (junto com o 18), ciclo completo pela lib: tabela → `deployTableMaintenance` →
  > `TDDAT subrc=0`, readTable TDDAT `CCLASS=&NC&`, TVDIR C/pool E; desfeito (OBJ_GENERATE D + DELETE tvdir/tddat
  > + deleteObject) com TADIR/TDDAT/TVDIR vazios e 0 sessões antes e depois.
- [x] 18. TRAN/T — transação sem GUI (I18) — concluído 2026-08-29 (S4H 758). **A "SE93 manual" saiu da tabela.**
  ADT não cria (`aps/iam/tran` 404 em todos os Accepts; `/vit/trant` só lê). Via da lib: **`tran.mjs`** —
  `deployTransaction` roda driver classrun com `RPY_TRANSACTION_INSERT` (SAPLSEUK, não-RFC; assinatura lida na
  FUPARAREF + fonte pelo ADT) e `RPY_TRANSACTION_READ`; tipos medidos `ststc_c_type_*` = D/R/P/V (sem OO);
  parâmetro sobre SM30 grava `TSTCP /*SM30 VIEWNAME=V_T001;UPDATE=X;` — o padrão dos 1.254 da moovi; TADIR TRAN
  por `RS_CORR_INSERT` em `$TMP` sem popup; existente = `ALREADY_EXIST` subrc 2 (sem update → `replace: true`
  = DELETE + INSERT, medido trocando RSPARAM→RSUSR000). **Prova de uso:** `CALL TRANSACTION YJBV_POC_TP` pulou a
  tela inicial e caiu em `SAPL0ORG 0040` (diálogo da V_T001; S 00 344). Assert readTable TSTC/TSTCT/TSTCP/TSTCC/
  TADIR; `deleteTransaction` por `RPY_TRANSACTION_DELETE`, tudo ausente depois. 0 sessões antes/depois de cada
  ciclo. Receita `docs/receita-tran.md`; cobertura-tadir, README, skill `adt-objetos` (3 linhas + §SM30) e
  knowledge do sap-accelerate corrigidos. 240/240 testes. Segunda via (`aps/iam/tran` no SXD 816) fica para
  quando o SXD voltar — não bloqueia nada.
- [x] 19. Adobe Forms e Smart Forms — anatomia + renderização como assert (I22) — concluído 2026-08-30 (S4H 758).
  ADT não cria form (discovery sem coleção). Via da lib: **`forms.mjs`** — `renderSmartForm` roda driver classrun
  com `SSF_FUNCTION_MODULE_NAME` → FM `/1BCDWB/SF000000nn` (`getotf`) → `CONVERT_OTF` PDF + ASCII; medido
  `SF_EXAMPLE_01`: 270 linhas OTF, 1 página, **PDF 13.235 bytes `%PDF-1.3`**, texto com o cliente
  (`contemTexto`) — sem ADS. `renderAdobeForm` lê a interface (`FPCONTEXT` → `FPINTERFACE`, asx-XML da
  `CL_FP_INTERFACE_DATA` → `params`: `TEXTLINES TSFTEXT` obrigatório) e roda `FP_JOB_OPEN` → FM
  `/1BCDWB/SM00000007` → `FP_JOB_CLOSE`; **o ADS do s4h não responde** (`RFCDES ADS` tipo G existe; subrc 2,
  `CSoapExceptionTransport … communication_failure (100.101)`) — a via está inteira, a prova do PDF Adobe fica
  para sistema com ADS. Anatomia: Smart Form em STXFADM/STXFADMI(FMNUMB)/STXFCONT/STXFOBJT/STXFTXT…, Adobe em
  FPLAYOUT(XFA)/FPCONTEXT/FPINTERFACE (xstrings XML; `dataPreview` corta em 255 hex); TR carrega `R3TR
  SSFO|SFPF|SFPI` inteiro — no s4h só a `SAPKCCD758` (cópia de cliente) tem form Z, sem TR de dev para medir
  E071K. E2E pela lib 9/10 (o 1 é o ADS); 0 sessões e 0 drivers antes/depois. `docs/receita-forms.md`,
  `forms.test.mjs`, README, cobertura-tadir (SSFO/SFPF/SFPI → `forms.mjs`; SSST segue só GUI).
- [x] 20. XSLT/VT e ENHO/ENHS (I19) — concluído 2026-08-30 (S4H 758). **XSLT: o ADT cria** — desmente a pesquisa
  (que só via sourceUri): POST `trans:transformation` em `xslt/transformations` (accept/ct `transformations+xml`)
  nos dois subtipos (`XSLTProgram`, `SimpleTransformation`), PUT `/source/main`, ativação genérica, `CALL
  TRANSFORMATION` no driver (`<POC>abc-JBV</POC>` / `<POC>abc</POC>`), DELETE 200. Módulo **`tipos/transformation.mjs`**
  (forma custom: o subtipo sai do fonte pelo prólogo `<?sap.transform simple?>`), entra no `deploy`/`deleteObject`;
  24 tipos no catálogo. **ENHO: o ADT lê, altera e apaga, mas NÃO cria no 758** — POST `enho:objectData` em
  `enhoxhb` dá 400 `I::000` mesmo com o XML copiado de uma impl Z real (e `customizingLock` é CHAR, "false" dá
  erro de desserialização), e **deixa órfã só-TADIR** (GET 404, DELETE ADT 400 "Parâmetro LSM … PCT") — sai por
  `TR_TADIR_INTERFACE` em driver. Quem cria é a **API `cl_enh_factory` + `cl_enh_tool_badi_impl`** (via do abapGit)
  num driver: save + activate → ENHHEADER A, GET ADT active; sobre ele o ADT faz PUT (shortText/active) e DELETE.
  Módulo **`enho.mjs`**: `deployBadiImplementation`, `setEnhancementProperties`, `deleteEnhancement` (ADT → API →
  órfã), `readEnhancement`, `removerTadirOrfa`. E2E pela lib 13/13; 0 sessões e 0 restos antes/depois. Ponto
  aberto: `runtimeBehaviorShorttext` "não será chamada" na POC vs "será chamada" na Z da moovi — não medido o
  porquê. ENHS/hook/CLASENH ficam só leitura. `docs/receita-xslt-enho.md`, `transformation.test.mjs`,
  `enho.test.mjs`, README, cobertura-tadir, pesquisa-tipos (XSLT desmentida).
- [x] 21. Fatiar o `E071K.TABKEY` pelo layout da tabela (I26) — concluído 2026-08-30 (S4H 758, só leitura).
  Na lib (`cts.mjs`): `layoutChave` (DDIF_FIELDINFO_GET, RFC — chave ordenada e com includes expandidos; a
  DD03L crua vem fora de ordem), `fatiarTabkey` (puro), `whereDaChave` (puro, sem CLNT, trim, ≤72 chars),
  `fatiarChaves`, `lerLinhaDaChave`, e a opção `{ fatiar: true }` em `lerRequestPorTabelas`/`anatomia`.
  **Medido:** o corte é por `LENG` em caracteres (não OFFSET/INTLEN, bytes Unicode) — soma dos LENG =
  comprimento do TABKEY em 22 amostras; `000E000310` → `{MANDT:'000',SPRAS:'E',WERKS:'0003',SOBSL:'10'}` e
  a releitura da T460T achou a linha (12/17 amostras SAP existem no 250; as 5 ausentes são do mandante
  000 — o diff do item 22). Curinga: `…_0001         *` = prefixo + resto livre (releitura achou pelo
  prefixo), `000*` = mandante inteiro, `*` = tudo; TABKEY é CHAR 120 e chave ≥120 vem com `*` na posição
  120 (TABDIRDEVC). Sem amostra de chave RAW/DATS/INT/DEC no s4h — não medido. Testes puros com os
  layouts reais (13/13), E2E 4/4 + 2/2. **Ambiente:** às 13:36 a via ADT STATEFUL do s4h passou a responder
  400 "Service nicht erreichbar" (HTML) a tudo — discovery inclusive — com só 15 sessões no sistema; SOAP
  RFC, fetch sem cookie e sessão `stateless: true` seguem 200. O E2E fechou por stateless. Ficaram 4
  sessões 202 minhas órfãs (logoff devolve 400 nesse estado) — TH_DELETE_USER/SM04 é do Joris. A sonda
  `TH_USER_LIST` por SOAP só devolve linhas com `USRLIST: []` no envelope (sem isso a resposta vem vazia e
  a contagem "0 sessões" era cega). `docs/receita-change-request.md § TABKEY fatiado`.
- [x] 22. Diff "TR × sistema" (I27) — **medido 2026-08-30 no s4h 758, só leitura** → `cts.diff(conexao, tr)`:
  por entrada, TADIR (existe / `DELFLAG`), VRSD (versão NUMERADA posterior = alterado; `00000` re-carimbado ou
  transporte de cópias = só "noutra TR"), E071 da FAMÍLIA (parte → objeto inteiro; `LOCKFLAG X` = em edição
  agora) e `changedAt` do ADT convertido pelo fuso da TTZCU (CET; conferido contra REPOSRC); `LIMU` decidido:
  a VRSD já é por parte, existência é a do pai. Chaves: linha existe / `outro-mandante` / E071K noutras TRs.
  Cobaias S4HK911417 (11 LIMU: 8 alterado-depois, 3 em-edicao — S4HK911451 aberta), S4HK911370 (7 R3TR:
  3 alterado, 3 noutra-tr-depois pelo transporte de cópias S4HK911429, batendo com o ADT), S4HK912769
  (pacote marcado para apagar → inexistente), S4HK910129 (18 visões por-chave, 55 chaves: 14 existe, 40
  outro-mandante). Leitura do CTS virou STATELESS (`sessaoDeLeitura`; sessão stateless fica stateless em
  `sap-connection`): o ADT stateful do s4h está em "Session not found" e a leitura stateful da TR volta 200
  sem `<tm:request>`. ⚠ ficaram **3 sessões 202 órfãs** minhas (2 de ontem + 1 de hoje, por `fetch` cru com o
  cookie — logoff 400); SM04/TH_DELETE_USER é do Joris. `reference` do ADT (tm:dummy_uri) não serve.
  `docs/receita-change-request.md § Diff "TR × sistema"`; testes puros em `cts.test.mjs`.
- [x] 23. BRF+ pela anatomia da change request (I21) — **medido 2026-08-30 no s4h 758, só leitura, só SOAP**
  (ADT stateful seguia quebrado). Hipótese confirmada com correções: o catálogo é a `FDT_ADMN_0000`
  (ID GUID, OBJECT_TYPE AP/FU/RS/EX/DO, APPLICATION_ID) — app real medida: 76 objetos (38 DO, 23 EX, 7 FU,
  7 RS). DUAS vias de transporte: workbench (`R3TR FDT0 <NOME>` + `TDAT FDT0001`, chaves nas sombras
  `FDT_*S`, `ID+VERSION[+LANGU*]`) e customizing (`TDAT FDT0000`, tabelas normais, `CLIENT+ID+…`) —
  TODO o custom do s4h (26 apps MV*/YCANO) é da segunda: invisível à TADIR (o "FDT0 zero no custom" da
  cobertura era isso; e o nome do FDT0 é o NOME da app, não GUID — `FDT_APPL_TADIR` é a ponte). O fatiador
  do item 21 corta as chaves completo; nada de código novo — `anatomia { fatiar }` + `readTable` bastam.
  Escrita decidida: FORA (tabela à mão corrompe; API `cl_fdt_factory` virou ideia I33).
  Cobaias SAPKA70208, S4HK900330 (133 IDs), S4HK901218. `docs/receita-brfplus.md`.
- [x] 24. Transport request por ADT (I3) — **medido 2026-08-31, S4H 758, mandante 250, E2E pela lib
  LOCAL 13/13 PASS**, objetos `YJBV_POC_TR24*` e TRs `S4HK912780/81/83/84` todos removidos (E070/E071/
  TADIR/TDEVC vazios, sessões 2→2). `cts.mjs` ganhou o ciclo de vida da TR modificável: `criarRequest`
  (POST `tm:root tm:useraction="newrequest"` em `cts/transportrequests`, ct text/plain → 201 com o
  `tm:request` no corpo; body vazio → 400 sem criar; `tm:target` vazio = default do sistema, VSS),
  `deletarRequest` (DELETE remove ordem/tarefa modificável **vazia**; com entradas → 400 SCTS_ADT_MSG
  009), `destravarRequest` (driver `TRINT_UNLOCK_COMM` por tarefa — mantém a TR) e `desmancharRequest`
  (driver unlock + `TR_DELETE_COMM WI_DIALOG=' '`, o delete da SE09 — ordem+tarefas+entradas somem).
  Medições-chave: (1) **nasce só a ORDEM, sem tarefa — o 1º deploy com `corrNr` cria a tarefa do
  usuário NA ordem informada e nenhuma TR paralela** (o corrNr é honrado; o auto-gerar do item 10 é
  só sem corrNr); (2) **delete transportável MARCA a TADIR (`DELFLAG='X'`)** em vez de remover — é o
  que trava o delete do pacote (PAK 051) — e `TR_TADIR_INTERFACE` só remove a linha DEPOIS do unlock
  (subrc 1 → 0, medido nas duas pontas); (3) o segmento pós-número é "Benutzeraktion" (`removeobject`
  não existe no 758; POST sem ação = 200 no-op); (4) prova do item: `deploySource` de PROG
  transportável com corrNr → entrada `R3TR PROG` na minha tarefa, TADIR no pacote certo. Liberar
  segue FORA (decisão do Joris; `TRINT_RELEASE_REQUEST` não medido). Guard-rails antes da rede:
  descricao obrigatória, só tipo K, forma de TRKORR, ordem minha/modificável/não-tarefa.
  `docs/receita-change-request.md § Ciclo de vida`; testes puros em `cts.test.mjs` (273/273);
  desmentido do "não se desfaz por REST" corrigido em `tipos/package.mjs`, CONTEXT e skill `adt-objetos`.
- [x] 25. Engenharia reversa de solução SAP real (I25) — **medido 2026-08-31, S4H 758 mandante 250, só
  leitura** → `docs/composicao-solucoes.md` + recorte `--pacote P1[,P2…] [--sub]` no
  `scripts/cobertura-tadir.mjs`. Alvos: monitor NF-e (`J1BNFE` → `J_1BNFE_MONITOR` → pacote `J1BNFE`,
  2.538 obj/41 tipos, 53% coberto; núcleo `J1BA` 13.019/67, 52%) e app Fiori Manage Purchase Orders
  (`F0842A` é transação de PARÂMETRO — `TSTCP` aponta o UIAD; lado UI 34 obj/8 tipos, 3% coberto — LRCC/
  WAPA/UIAD/SICF sem caminho na lib; lado serviço `ODATA_MM_PUR_PO_MAINTAIN_V2` 276 obj, e descontando
  gerados (VIEW+STOB `GENFLAG='X'`, medido) e metadados, **94% do desenvolvimento coberto**). O "Provaria"
  saiu — a ordem do que falta: (1º) deploy UI5/LRCC/UIAD, (2º) VIEW clássica, (3º) customizing
  CUS*/TOBJ/VKO*, (4º) SHLP, (5º) NROB; e a coluna "catálogo" subestima — TRAN/TOBJ/forms/BRF/ENHO são
  cobertos por módulos driver que o cruzamento não vê.
- [x] 26. Segunda sonda no `spike-discovery.mjs`: `POST repository/typestructure` (I20) — **medido
  2026-08-31, S4H 758, só leitura** → modo `--tipos` no script (+ o script passou a ler `SAP_<SID>_*`
  do ambiente, como o cobertura). POST SEM corpo → 651 descritores. O "Provaria" saiu: OBJNAME_MAXLENGTH
  de todos os tipos de uma vez → **6 correções nos módulos** (DCLS 30→40 — o abap-adt-api estava a
  menor; FUGR/I 40→30; BDEF/DDLX/SRVB/SRVD ganharam `nomeacao` que não tinham: 30/40/40/40); catálogo
  regenerado. Desmentido no caminho: `CAPABILITIES` é do workbench CLÁSSICO — nem necessário (BDEF/
  DDLS/SRVB/SRVD "sem CREATE" e a lib cria) nem suficiente (VIEW/DV "CREATE" e é só SE11); toda
  URI_TEMPLATE é `/vit/`. Bônus: `USER_AUTHORIZATIONS` por tipo (o que ESTE usuário pode criar).
  `pesquisa-tipos-adt-nao-cobertos.md § Mecanismos`.
- [x] 27. ATC por ADT REST (I4) — **medido 2026-08-31, S4H 758, mandante 250, E2E pela lib LOCAL 13/13
  PASS**, cobaias `YJBV_POC_CL_ATCB` (suja) e `YJBV_POC_CL_ATCG` (limpa) em `$TMP`, ambas apagadas
  (TADIR e SEOCLASS vazias; 0 sessões antes e depois). Virou módulo **`atc.mjs`** (export
  `jbv-adt-client/atc`): `verificar` roda o ciclo em três chamadas — `POST atc/worklists?checkVariant`
  (200, worklistId em TEXTO PURO) → `POST atc/runs?worklistId` (`FINDING_STATS "p1,p2,p3"`) → `GET
  atc/worklists/<id>` com accept `application/atc.worklist.v1+xml` — sobre `{type,name}`, lista ou
  `{pacote}`; mais `customizing`, `variantes`, `documentacaoDoFinding` e `formatarFindings`. O parse
  entrega prioridade, check, mensagem, `checkId`/`messageId` e **linha** (duas formas de
  `atcfinding:location`; acentos vêm como entidade NUMÉRICA). **O achado que justifica o módulo: o SAP
  devolve 200 com zero findings em TRÊS situações distintas** — limpo, variante inexistente e objeto
  inexistente — e não separa nenhuma por status. `checkVariant=NAO_EXISTE_XYZ` é aceito com 200 e cai
  num default: os 6 findings P1 da cobaia viraram zero em silêncio (o SAP não confere o nome; a lib
  confere na `SCICHKV_HD`, porque `GET /atc/variants` devolve `totalItemCount 0` mesmo com os
  parâmetros do template). Objeto inexistente devolve worklist **sem objeto** — é o `executed === 0`
  do ABAP Unit, e `verificar` lança; objeto limpo de verdade APARECE com `<findings/>` vazio (o
  contrafactual). Contrafactual medido: `ABAP_CLOUD_READINESS` → 6 P1 na suja / 0 na limpa;
  `PERFORMANCE_DB` → 2 P2 (`SELECT` dentro do `LOOP`). Fato do sistema: a `systemCheckVariant` do s4h
  é `ZATC_PROXY_MIGRATION` e **não pega nada** — o gate default da moovi está mudo. Desmentidos:
  `maximumVerdicts` não limita (com `1` vieram os 6); e "zero findings = limpo" é falso no s4h, onde a
  variante `DEFAULT` injeta um P3 de AMBIENTE (inconsistência de fusos na TTZCU) em TODA classe — daí
  `reprovaAte: 2` por default. Ciclo inteiro stateless. Achados que viraram ideia: I37 (ATC de pacote
  como gate — `{pacote}` roda mas J1BNFE tem 2.538 objetos e a worklist trouxe 18, não isolado), I38
  (isenções), I39 (quickfix), I40 (`checkruns`, o syntax check). `docs/receita-atc.md`,
  `atc.test.mjs` (13 testes puros com fixtures reais), README/CONTEXT + skill `sap-testes` (canal ATC
  na matriz). 286/286 testes.
- [x] 28. Assert "não dumpou" (I5) — **medido 2026-08-31, S4H 758, mandante 250, E2E pela lib LOCAL
  21/21 PASS**, cobaias `YJBV_POC_CL_D28A/B/C/D` + `YJBV_POC_FG_D28`/`YJBV_POC_FM_D28` em `$TMP`, todas
  apagadas (TADIR `YJBV_POC%D28%` vazia; 1 sessão antes e depois). Virou módulo **`dumps.mjs`** (export
  `jbv-adt-client/dumps`): `semDump(cx, act)` levanta a marca d'água, roda o act e reprova se ele deixou
  dump; mais `marcaDagua`, `dumpsDesde`, `lerDump`, `feed`, `formatarDumps` e os puros `parseFlist`/
  `chaveDoDump`/`linhaParaDump`/`parseDumpXml`/`parseFeed`. Só leitura. **O achado que justifica o
  módulo: o dump não chega a canal nenhum.** No classrun ele vem como HTTP 500 + a página
  "Application Server Error" do ICM (10 KB sem o erro, sem o programa, sem a linha); e em trabalho
  ASSÍNCRONO (`CALL FUNCTION … STARTING NEW TASK` sobre FM RFC que divide por zero) o canal devolve
  **200 com a saída normal e `subrc=0`** — o E2E fica verde com dump no sistema. **⚠ E o feed
  `/sap/bc/adt/runtime/dumps` do ADT PERDE dumps**: no mesmo dia e mandante, SNAP **14** × feed **7**,
  sete ausentes (dois por mais de 7 min) e um mais ANTIGO ausente enquanto um mais novo era listado —
  não é só latência (que também existe: 11 s numa medição, > 4 min noutra), e a **causa não foi
  isolada** (virou I41). Por isso o assert é pela **SNAP** por `dataPreview` (imediata: dump visto na
  1ª leitura, 491 ms após o act), e a janela vem da própria SNAP (`MAX(DATUM||UZEIT)`), nunca de
  relógio: o `datetime` do ADT sai **5 h errado** (TTZCU diz `CET`, o SO do s4h roda em BRT — o mesmo
  fuso torto do item 22), enquanto `systemTime` = hora da SNAP. Anatomia medida: o cabeçalho é
  `SEQNO='000'` e o `FLIST` é `TAG(2)+LEN(3)+valor` (`FC` erro · `AP` programa · `AI` include · `AL`
  linha · `XC` exceção), cruzado e concordante com o `<dump:dump>` do recurso ADT; a chave é a da SNAP
  concatenada (`DATUM+UZEIT`+AHOST 32+UNAME 12+MANDT 3+MODNO 9 à direita) e reproduz byte a byte a do
  feed — dump ausente do feed **continua legível** por ela. Protocolo: o feed só aceita
  `application/atom+xml;type=feed` (406 nomeia), usa namespace prefixado (`<atom:entry>` — parser que
  procura `<entry>` volta vazio com 200), e o texto do dump é o sub-recurso `/formatted` (`text/plain`
  na URI base dá 406). **Ponto aberto do item 7 fechado:** o `SUBMIT` no classrun dumpa
  `DYNPRO_SEND_IN_BACKGROUND` em `SAPLKKBL:457`. Não medido: dump em **update task** e em job de
  background (virou I42). `docs/receita-dumps-st22.md`, `dumps.test.mjs` (13 testes puros com fixtures
  reais), README/CONTEXT + skill `sap-testes` (canal ST22 na matriz e assert `semDump`). 299/299 testes.
- [x] 29. Assert por application log — SLG1 (I6) — **medido 2026-08-31, S4H 758, mandante 250, E2E pela
  lib LOCAL 15/15 PASS**, cobaias `YJBV_POC_LOG29` (objeto de log) e as classes `YJBV_POC_CL_BAL29*`/
  `YJBV_BAL_*` em `$TMP`, todas removidas (TADIR, BALOBJ, BALSUB e BALHDR vazias para o nome; nenhuma
  sessão minha no fim). Virou módulo **`bal.mjs`** (export `jbv-adt-client/bal`): `comLog(cx, act,
  { objeto, espera })` roda o act e cobra do log `semErro` · `tipos` (contagem por tipo) · `contem`
  (texto), `semErroNoLog` como atalho; mais `marcaDagua`, `logsDesde`, `lerMensagens`, `lerLogs`,
  `gravarLog` (o arrange) e `apagarLogs` (SLG2, `confirm:true`). **O achado que justifica o módulo: o
  caminho barato não existe** — (1) **nenhum FM `BAL_*` é RFC** (`TFDIR-FMODE` vazio nos 100+ do grupo),
  então SOAP RFC não alcança; (2) as mensagens **não estão na `BALM`, que tem 0 linhas** — moram
  comprimidas na **`BALDAT`** (`CLUSTD` LRAW 512, cluster INDX, 683.289 linhas), que o `dataPreview`
  recusa (400). Daí a divisão que é a economia: **cabeçalho e contadores por SQL na BALHDR (sem driver,
  nada criado); texto só por driver classrun** — `comLog` só roda o driver quando o `espera` pede texto.
  **Três formas de "logou" sem log, todas com `subrc 0`:** log sem objeto (o `BAL_DB_SAVE` recusa,
  `save_not_allowed`), `BAL_LOG_MSG_ADD` com **handle vazio** (a mensagem vai para OUTRO log em
  memória — medido), e ausência de save; e o oposto, `i_save_all = abap_true` num ponto qualquer salva
  TODO log em memória (2 lognumbers de uma chamada). Objeto/subobjeto inexistente, esse, é recusado na
  porta (`log_header_inconsistent`). Janela pelo **LOGNUMBER** (NUMC 20 do number range, atribuído no
  SAVE), nunca por relógio; limite medido: log **acrescentado** mantém o número e a marca d'água não o
  vê. `BAL_DB_LOAD` é **tudo-ou-nada** (um número inexistente na lista → zero logs) e o **segundo LOAD
  do mesmo log volta vazio com subrc 0** — por isso um LOAD por execução, e sem lock. Achado que virou
  tipo novo: **`APLO/TYP` se cria por ADT REST** — `applicationlog/objects`, `blues.v1+xml` (PLURAL; os
  outros dão 415 sem nomear o suportado), fonte **JSON** do formato AFF com `$schema` servido pelo
  próprio sistema, PUT em `application/json`, e **não ativa** (nasce ativo, o PUT grava BALOBJ/BALSUB) —
  módulo `tipos/applicationLogObject.mjs` (forma custom, 25 tipos no catálogo), a linha "objeto de log:
  só SLG0" caiu. Dois desmentidos de ambiente medidos: `BALHDR-MANDANT` é campo CLIENTE e o
  `dataPreview` o RECUSA no WHERE (na SNAP dos dumps o `MANDT` entra — a diferença é essa); e **o
  `dataPreview` satura a sessão** após dezenas de consultas freestyle (dump `GENERATE_SUBPOOL_DIR_FULL`
  em `CL_ADT_DP_OPEN_SQL_HANDLER`, achado pelo `dumps.mjs` do item 28 — sem ele o 500 pareceria "o SAP
  caiu"). Ideias novas: I44 (a família "blue"/AFF inteira por um caminho só — `applicationjob/*` tem o
  mesmo desenho) e I45 (a saturação do `dataPreview`). `docs/receita-application-log-slg1.md`,
  `bal.test.mjs` + `tipos/applicationLogObject.test.mjs` (fixtures reais), README/cobertura-tadir +
  skills `sap-testes` (canal SLG1 na matriz e assert `comLog`) e `adt-objetos` (ledger + desmentido).
  319/319 testes.
- [x] 31. Relatório de cobertura legível (I13) — **medido 2026-08-31, S4H 758, mandante 250, E2E pela lib
  LOCAL 7/7 PASS**, cobaias `YJBV_POC_CL_COV31` (3 métodos, 2 exercitados) e `YJBV_POC_CL_COV31N` (sem
  teste) em `$TMP`, apagadas (TADIR vazia). **A pergunta do item tinha resposta no meio: nem só
  percentuais, nem linhas — o `cov:result` é uma ÁRVORE por MÉTODO.** Raiz → programa (`CLAS/OCI`) →
  método (`CLAS/OM`), cada nó com `statement`/`branch`/`procedure` (total + executados) e o
  `#start=<linha>,<coluna>` do fonte. Virou módulo **`cobertura.mjs`** (export
  `jbv-adt-client/cobertura`): `coberturaDe(cx, { name })` devolve árvore, métodos, totais e o
  **`markdown`** pronto para o ticket — tabela por método com semáforo (🔴 nada coberto · 🟡 abaixo do
  limiar · 🟢 ok) e a lista dos nunca executados; `parseCoverageTree`, `metodosDaArvore`,
  `totaisDaArvore` e `relatorioMarkdown` são puros. **⚠ Bug da lib que a medição achou e corrigiu:** cada
  nível da árvore REPETE os mesmos números (raiz 12/6, programa 12/6, métodos 6/4+4/0+2/2) e o
  `parseCoverage` somava todo `<coverage>` do XML — contava cada statement **3×** (36 em vez de 12); o
  percentual saía certo por acaso (a árvore é proporcional), e foi por isso que passou despercebido.
  **Guard-rail novo:** `executed === 0` **lança** — 0 testes não é 0% de cobertura, é medição que não
  aconteceu (a mesma regra do ABAP Unit; contrafactual medido com classe sem classe de teste).
  **Linha a linha ficou fora, medido:** o GET do `statements` do nó dá 404 em toda variante e o
  `bulkstatements` só aceita POST de `<cov:statementsBulkRequest/>` VAZIO com Accept `application/xml`
  (com filho, 400 "Fim de elemento esperado"; com `+scov`, 406) e responde 200 **vazio** — virou I47,
  com o handler já localizado (`if_scv_stmnt_results_builder`). `docs/receita-e2e-classe-entregue.md
  § Cobertura`, `cobertura.test.mjs` (fixture do XML real), README. 346/346 testes.
- [x] 32. Lembrar o `probe` por sistema (I11) — **decidido e medido 2026-08-31 (s4h 758/250 e sxd 816/100,
  só leitura, nenhuma sessão aberta): o cache da DECISÃO de canal foi DESCARTADO; o que entrou foi o
  registro datado + o mapa do landscape** (opção escolhida pelo Joris entre quatro). O item pedia "propor
  antes de codar", e a proposta virou número: o probe custa **242/110/157 ms** (dois GETs paralelos) e o
  `tiposDisponiveis`, **311/430/314 ms com 303.443 bytes** de discovery. Ou seja, o ganho prometido
  ("menos dois GETs por sessão") vale ~150 ms **numa chamada que nenhum código da lib, script ou exemplo
  faz hoje** — `probe` só aparecia nos testes. Contra isso, o que o cache guardaria é de três naturezas:
  `release`/`sysid`/coleções do discovery são do SISTEMA (envelhecem em upgrade), `mandante`/`usuario` são
  da CREDENCIAL, e `adt.ok`/`soapRfc.ok`/`classrun.ok` são do MOMENTO — e envelhecem mal nos dois sentidos,
  com prova na própria fila: o ADT stateful do s4h caiu em 30/08 (item 21) enquanto o stateless respondia
  200, e **o SXD, "fora" em 29/08 (item 15), respondeu HOJE**. Um `adt:true` cacheado mandaria o consumidor
  num canal morto, trocando o `motivo` claro do probe por erro obscuro; um `adt:false` cacheado esconderia
  o sistema que voltou. E "re-sondar quando um canal falhar" exigiria que todo caminho de erro
  (`rfc-soap`, `adt-client`, `classrun`) conhecesse o arquivo — acoplamento transversal para escolher
  outra coisa. Entregue: módulo **`canais.mjs`** (export `jbv-adt-client/canais`) com `chaveDe`
  (alvo = alias+mandante), `entradaDaMedicao`, `mesclarRegistro`, `idadeEmDias` e `tabelaMarkdown` PUROS,
  mais `gravarMedicao`/`lerRegistro` sobre `canais.json` (ao lado do `sistemas.json`, gitignored) — e
  **`scripts/canais.mjs [alias…] [--tipos] [--tabela]`**, que sonda N sistemas sem abrir sessão (o probe é
  Basic), grava e imprime o mapa. O `probe` ficou **intacto**: não escreve em disco e ninguém lê o registro
  para decidir canal — a coluna "medido" (hoje · 2 d · …) e os motivos das falhas são o que o arquivo serve.
  Medido pela lib LOCAL: s4h `S4H 758 ✅✅✅ 25/25 tipos`, sxd `SXD 816 ✅✅✅`, e o caminho de falha
  (`d01` inexistente → `adt: sem resposta: fetch failed`, `classrun: sem ADT`, sem sujar o registro).
  9 testes puros novos em `canais.test.mjs` (369/369). README (2 linhas + gitignored) e skill `sap-testes`
  (Passo 0: "sonde SEMPRE; não reaproveite mapa de ontem", com os números e o ponteiro para o script).
  Achado que virou ideia: **nenhuma sonda do probe tem timeout** (I51).
  > medido de graça no caminho, e vale para a fila: **o SXD 816 está alcançável em 2026-08-31**
  > (`adt+soap+classrun` ok, mandante 100, usuário do `.env`) — desbloqueia o item 35 e a pendência do
  > item 15 (rodar `cobertura-tadir.mjs sxd --tudo`). Alcance é do MOMENTO: re-sondar antes de contar com ele.
- [x] 33. wdi5 contra app Fiori custom deployado (I9) — **medido 2026-08-31, S4H 758 mandante 250, SÓ
  LEITURA (nada criado, alterado ou apagado — os alvos são apps do cliente que já estavam lá)**, harness
  do repositório rodando **4/4 PASS em DOIS apps** com a env `SAP_APP` como única diferença: `ZBSP_VENDAS`
  (pacote ZDEV_AND, "Listagem de Vendas", ResponsiveTable — Go → 20 linhas de 2.649, clique → Object Page
  do doc 1/item 10, PNG conferido) e `ZNFMRP02` (pacote ZNFM, "Usuários", GridTable — 1.067 linhas,
  navegação → `#/ZNFMRP02('MVAACQUESTA1')`). **A promessa "só a URL muda" se confirmou — com três desvios
  que custam a tarde:** (1) **os seletores mudam**: o app do cliente é Fiori Elements **V2**
  (`@sap/generator-fiori:lrop`) — `sap.ui.comp.smartfilterbar.SmartFilterBar`, não o `sap.ui.mdc.FilterBar`
  do preview V4 — e o tipo de tabela sai do MANIFEST (`tableSettings.type`): ResponsiveTable →
  `sap.m.Table` (`getItems`), Analytical/Grid → `sap.ui.table.Table` (`getRows` com contexto); um poll que
  só olha `sap.m.Table` conta ZERO no segundo app. (2) **o gesto de navegar depende da família da tabela,
  e 5 de 7 formas não fazem nada sem erro**: no ResponsiveTable só o `press()` do wdi5 no `ColumnListItem`
  navega (o `getDomRef().click()` não, e `firePress` por `browser.execute` estoura `Maximum call stack size
  exceeded` — o execute tenta serializar o controle devolvido; termine com `return null`); no GridTable
  nem clique real do WebDriver na linha/célula nem `fireCellClick` (o `selectionBehavior` é `RowSelector`)
  — quem navega é o **chevron**, `sap.ui.table.RowActionItem type='Navigation'`. (3) **o par Chrome ×
  ChromeDriver**: com o Chrome do sistema + driver da MESMA versão passa (spec de 10–31 s); com o driver
  uma major à frente é `session not created`; e com o **Chrome-for-Testing** que o wdio baixa
  (`browserVersion`, testado em 151 e 152) a sessão sobe, a página carrega e o **`injectUI5` PENDURA** até
  o timeout — 5 execuções perdidas, e run travado deixa Chrome órfão que trava os seguintes. **Dois asserts
  que enganam, medidos:** `sap.uxap.ObjectPageLayout` existe no registry ANTES de qualquer navegação (a
  primeira rodada ficou verde com a tela ainda no List Report — o que prova é DOM visível + hash com a
  chave), e "tem linha" não é "tem dado" (a 1ª linha do ZDD_VENDAS vem em branco: 20 linhas / 19 com
  conteúdo). **Achar o app era metade do trabalho** e virou módulo **`ui5.mjs`** (export
  `jbv-adt-client/ui5`, só leitura): `listarAppsUi5` (TADIR WAPA por `dataPreview`, sem driver),
  `lerManifest`/`sondarApp` (GET pelo ICM na sessão da conexão, uma só para N apps) e os puros `urlDoApp`,
  `resumoDoManifest` e `controleDaTabela`. Censo do s4h: **278 apps custom na TADIR, 242 servem
  `manifest.json`, 35 dão 404** (registro sem conteúdo no BSP repository) e 1 dá 403; dos 239 com
  `mainService`, 213 respondem `$metadata` e **155 têm dados** — escolher alvo sem sondar é loteria. O FLP
  do 758 é `/sap/bc/ui5_ui5/**ui2**/ushell/shells/abap/FioriLaunchpad.html` (sem `ui2` é 404); rodar o app
  DENTRO do launchpad ficou fora (tile/catálogo/papel são customizing) → ideia I52. E2E do módulo pela lib
  LOCAL 8/8; 378/378 testes puros (9 novos em `ui5.test.mjs`, fixtures dos manifests reais). Entregues:
  `ui5.mjs`, `examples/wdi5-app/` (harness que rodou), `docs/receita-wdi5-fiori.md § 7`, README e skill
  `sap-testes` (matriz do canal wdi5).
- [x] 34. GUI Scripting (COM) (I8) — **medido 2026-08-31, S4H 758 mandante 250 + SAP GUI for Windows 8.00
  (8000.257.4.1), E2E pela lib LOCAL 12/12 PASS**, zero restos (classe `YJBV_POC_CL_GS_PARAM` apagada, USR05
  sem a linha de teste, conexão do GUI fechada e `sessoesAbertas()` vazio, sessão ADT encerrada). Módulo
  **`gui.mjs`** (export `jbv-adt-client/gui`): passos declarativos (`rodarGui([{ acao, id, valor }])`, 18
  ações) viram VBS rodado por `cscript`; `acharPorTipo` acha o controle pelo TIPO; `verificarScriptingNoServidor`
  lê os 5 parâmetros de perfil por driver classrun; `abrirSapGui`/`fecharSapGui` pelo `sapshcut`.
  **A hipótese se confirmou** — as telas que o BDC não alcança são alcançáveis: popup modal
  (`GuiModalWindow "Restringir intervalo de valores"`, F4 na VA03, fechado por VKey 12), **ALV Grid** lido
  por NOME de coluna (SE16N/T000: 5×17, MANDT 000/250/300) e **table control** por índice (itens da ordem 8:
  16×25, `10 EWMS4-21 50 PEÇ`); a statusbar do canal é a MESMA do BDC do item 2 (`E V1 302` no mesmo
  documento inexistente). **Escrita provada com assert externo**: SU3 → grid editável → `S 01 039 Usuário …
  foi modificado` → `readTable USR05` em outra LUW → `BUK=1010` → removido por `DEL_LINE` → ausência
  confirmada. Desvios que a ideia não previa, e que custaram a POC: (1) **o PowerShell MENTE** — o
  `SapROTWr.SapROTWrapper` instancia, o `GetROTEntry("SAPGUI")` devolve objeto e TODA propriedade vem VAZIA
  (Children=0), sem erro, nos DOIS bitness (`InvokeMember` → TYPE_E_CANTLOADLIBRARY), enquanto o
  `GetObject("SAPGUI")` do VBScript no mesmo instante devolve o engine inteiro — daí o canal ser VBS, não
  `winax`/PS; (2) **a tela aceita o inválido em SILÊNCIO e não grava** — um PARID fora da TPARA entrou na
  célula, sobreviveu ao Enter, não gerou mensagem e a USR05 ficou vazia (com um ID válido o Enter devolve o
  texto do parâmetro: ESSE é o sinal de que o programa aceitou) → statusbar não é assert; (3) `SendVKey 11`
  (Ctrl+S) NÃO gravou, o botão `tbar[0]/btn[11]` gravou; `ModifyCell` sozinho não transfere (falta o Enter);
  e `DEL_LINE` age na SELEÇÃO, não no cursor (virou a ação `linhaGrid`); (4) o **`sapshcut` fica vivo
  enquanto a sessão existir** — `await execFile` pendura para sempre; solta-se com `spawn({detached})` e
  espera-se a sessão APARECER no ROT; (5) o id literal de tutorial não vale (o subscreen da VA03 é 4401, não
  4400) e o **ALV do SE16N mora em `wnd[0]/shellcont/shell`, FORA do `usr`**; (6) gotchas de COM:
  `Children.ElementAt(i)` (índice cru → "Bad index type"), `Children.Count` em folha LANÇA, e o VBS grava em
  arquivo UTF-16 porque o stdout do cscript come os acentos. Ambiente medido: servidor
  `sapgui/user_scripting=TRUE` (readonly e notificação FALSE), cliente `UserScripting=1` em
  `HKLM\...\WOW6432Node\SAP\SAPGUI Front\SAP Frontend Server\Security` (no GUI 8 o HKCU não tem essa chave).
  Custo: ~1,0 s por transação, ~1,2 s SE16N até o ALV, ~2,1 s a aba de itens. `docs/receita-gui-scripting.md`,
  `gui.test.mjs` (9 testes puros), README, skill `sap-testes` (canal na matriz + roteamento). 387/387 testes.
  Achados que viraram ideia: `HardCopy` como evidência visual (I53) e traduzir a GRAVAÇÃO do próprio SAP GUI
  para os passos da lib (I54 — o recorder está liberado: `disable_recording=FALSE`).
- [ ] 36. Auth BTP/SAML no wdi5 (I10) — a receita só mediu on-premise Basic → cookie. **Provaria:** o
  canal wdi5 em cloud. **Medir:** depende de um tenant BTP com Fiori acessível.
  > bloqueado: sem tenant BTP.
- [x] 37. BRF+ criado por driver classrun — cl_fdt_factory (I33) — **MEDIDO 2026-08-30 no s4h 758,
  E2E 6/6 PASS** → `brf.mjs`: `deployDecisionTable` (app LOCAL + elementos TEXT + decision table +
  função, activate deep, testes DENTRO do driver), `executarFuncao` (por NOME via if_fdt_query +
  cl_fdt_convenience=>get_name), `deleteAplicacao` (delete_incl_assigned_object — LÓGICO, DELETED='X').
  Cobaia da assinatura: demos FDT_DEMO_% do próprio 758 lidos por getSource stateless (21 na TRDIR).
  Medido: célula sem range = curinga; sem concordância = cx_fdt (não erro); descrição de classe ≤60;
  POC v1 RESULT_A=APROVADO/RESULT_B=REJEITADO/C=exceção; E2E com 2 elementos de contexto e curinga.
  Tudo local, $TMP limpo, zero órfãs (o ADT stateful do s4h voltou nesta janela). O marco do Joris:
  decision table BRF+ criada e executada pela lib. `docs/receita-brfplus.md § Criar`; `brf.test.mjs`.
- [x] 38. Carimbar a pesquisa de APIs no s4h — **medido 2026-08-31, S4H 758 mandante 250, SÓ LEITURA**:
  nada criado, nada alterado, **zero sessão stateful** (só `readTable` por SOAP RFC e GET com Basic Auth).
  49 FMs, 41 classes/interfaces, `CVERS`, o discovery inteiro e os OData citados conferidos um a um; o
  veredito está no próprio `docs/pesquisa-apis-sap-cookbook.md` (**§ Carimbo no s4h 758** + uma linha
  `**Carimbo…**` por seção), e a tabela de prioridade foi **reordenada por fato** (a antiga ficou preservada
  num `<details>`). **Existência:** 47/49 FMs e 39/41 classes existem; as ausências não são surpresa nem
  bloqueio, exceto **`CL_SUI_UIAD_DB_ACCESS`/`IF_…`, que NÃO existem** — a seção 15 (UIAD) fecha por falta
  de peça. `/UI5/UI5_REPOSITORY_LOAD` e `_HTTPN` "faltam" porque são REPORT (`TRDIR SUBC='1'`), não FM.
  **O achado que reordenou a fila inteira: o `FMODE` do espelho erra nos DOIS sentidos.** `RPY_VIEW_INSERT`
  e `STREE_HIERARCHY_SAVE` **são** RFC (o espelho dizia que não); `DDIF_SHLP_PUT`/`_GET`,
  `F4IF_GET_SHLP_DESCR`, `SSF_ACTIVATE_STYLE`, `SSF_READ_FORM`, `RS_CORR_INSERT`, `RS_TREE_OBJECT_PLACEMENT`,
  `SXO_IMPL_ACTIVE`, `STREE_EXTERNAL_DELETE`, `S_CUS_ACTIVITY_SAVE` e **todos** os `NUMBER_RANGE_*` **não
  são** (o espelho dizia que sim). Contra-prova feita, não deduzida: `RPY_VIEW_READ` (`R`) respondeu por
  SOAP RFC; `NUMBER_RANGE_OBJECT_READ` e `F4IF_GET_SHLP_DESCR` (`FMODE` vazio) devolveram SOAP Fault — o
  `FMODE` prediz, o espelho não. Efeito: a seção 6 (SHLP) perde a perna SOAP e vira driver puro; a 7 (VIEW)
  fica **mais barata** que o previsto (view clássica por SOAP RFC puro, sem driver → I57).
  **Dois desmentidos de "não existe no on-prem":** (1) **`/sap/bc/adt/numberranges/objects` EXISTE no 758** —
  GET 200 em `blues.v1+xml` (`blue:blueSource`, `NROB/NRO`) e **`source/main` em `application/json` devolve o
  `nrob-v1.json` do AFF**, com o sistema servindo o próprio `$schema` e o `$configuration` do editor; NROB
  sai da cauda e vira a 1ª prioridade (I55); (2) **`businessservices/servprovs` (SOAP Provider Model,
  `blues.v2+xml`, com `$new/schema`) EXISTE** — SPRV sai do "Descartado" (I60). Ainda: **27 coleções do
  discovery declaram `$schema`** — a família AFF/JSON, cujo fluxo a lib **já roda** desde a fila 29
  (`APLO/TYP`); o item mediu o tamanho da família, não inventou a via (I56). `ddic/typegroups` existe e lê
  (200, `v3+xml`). **Leitura por ADT provada:** SUSH (`aps/iam/sush/<nome>` → 200; nome **posicional**, 30 +
  `TYPE`, como o `LIMU METH` do item 14). **Pré-requisitos confirmados:** `SAP_UI 758` (≥ 753) e
  `/UI5/ABAP_REPOSITORY_SRV/` 200 com `$metadata` 200 → seção 4 destravada; `CATALOGSERVICE;v=2` → 200 com
  **4.885** serviços, assert de publicação mais barato que `readTable /IWFND/I_MED_SRH` (I59).
  Gotchas da sonda, na receita: nome com namespace quebra a URI (`objects//ACCGO/ACC` → 404); **o 406 do
  NROB NÃO nomeia o media type** (ao contrário do 415 do item 11) — o accept sai do `<app:accept>` do
  discovery (cinco palpites, cinco 406). Sem mudança de código (387/387 testes, sem bump); `cobertura-tadir.md`
  corrigido em NROB/SHLP/VIEW/WAPA; ideias novas **I55–I60**.
- [x] 40. Gate do ADS — re-sonda + o que falta para provisionar (I35) — **medido 2026-08-31, SXD 816
  mandante 100 (VPN da KART), depois de o Joris mandar levantar o ambiente. Veredito: ADS VIVO, e ainda
  SEM PDF.** A prova de que vive é a MUDANÇA do erro: em 2026-08-30 o `renderAdobeForm FP_TEST_00`
  morria em `communication_failure (100.101)` — ninguém atendia; hoje `FP_JOB_OPEN` devolve
  `subrc=0 connection=ADS` e o erro vem de DENTRO do Java, `com.adobe.ProcessingException (200.101)`;
  a `FPCONNECT` guarda `ADSVERSION=1190.20230809095430.911550`, que só é gravada quando o handshake
  acontece. **O que falta é do lado JAVA e é item de infra:** o ADS não resolve o destino de volta ao
  ABAP — `Destination exception during destination lookup: FP_ICF_DATA_SXD(200.101)`. O lado ABAP está
  pronto: o nó ICF `/sap/bc/fp` responde **200** com credencial (`/sap/bc/fpads` e `/sap/bc/fp/form`
  são 404). Lista entregue para a infra na receita: criar `FP_ICF_DATA_SXD` no AS Java (NWA →
  Destinations, HTTP → `http://172.31.28.129:8000/sap/bc/fp`, mandante 100, usuário de serviço) e
  conferir pelos reports que o próprio SXD tem (`FP_CHECK_DESTINATION_SERVICE`,
  `FP_CHECK_HTTP_DATA_TRANSFER`, `FP_ADS_CONNECTIVITY_CHECK` — os três são report, rodam na SE38, não
  por classrun: `SUBMIT` no driver dumpa). Gotchas novos medidos: o FM do form cobra os parâmetros
  obrigatórios da interface ANTES do ADS (`TEXTLINES TYPE TSFTEXT` no FP_TEST_00 — o
  `renderAdobeForm` já os imprime em `FP_IF_PARAMS`, e `declaracoes`/`preparo`/`exporting` os
  preenchem); e a `RFCDES` não tem coluna `RFCHOST` (o destino mora todo em `RFCOPTIONS`, e
  `RFC_READ_TABLE` estoura nela com `DATA_BUFFER_EXCEEDED` — leia por `dataPreview`). Zero restos no
  SXD (TADIR sem `Y_FP_*`/`Y_SF_*`); alias `sxd` cadastrado no `sistemas.json` local (a URL do ADT
  vinha só do SAPUILandscape.xml). `docs/receita-forms.md § Veredito do ADS`.
- [x] 41. Cópia Adobe sem GUI — `CL_FP_WB_FORM`/`INTERFACE` (I35) — **medido 2026-08-31, E2E pela lib
  LOCAL 7/7 PASS no SXD 816:100**, cobaias `Y_FP_F41` (SFPF) + `Y_FP_IF41` (SFPI) em `$TMP`, apagadas
  (TADIR e FPLAYOUT vazias; o s4h também ficou limpo). **A linha "form: só GUI" caiu pela metade, como o
  item previa — e a metade que cai tem preço:** a via NÃO são os FMs do Form Builder (`FP_FB_FORM_COPY`/
  `FP_FB_INTERFACE_COPY` são UI: no classrun devolvem, capturável, "Envio da tela SAPLFPUIFB 1210
  impossível"), e sim a API por baixo — `cl_fp_wb_interface=>copy( i_source i_name i_devclass )` +
  `cl_fp_wb_form=>copy( … i_dark = 'X' )` + `cl_fp_wb_helper=>interface_activate`/`form_activate`, com
  `delete` simétrico. **O achado que justifica ter rodado nos dois sistemas: a cópia do FORM exige ADS
  alcançável; a da INTERFACE não.** Mesmo driver, mesmo dia: no SXD (ADS respondendo) `COPY ok`, FPLAYOUT
  ativo e TADIR SFPF; no s4h (ADS mudo) `CX_FP_API_INTERNAL` — "erro interno em SAFP API", sem `previous`
  e sem detalhe (a lib anexa a dica ao erro). Gotchas medidos: **`I_DARK` só existe no FORM** (na interface
  é erro de compilação); `i_devclass='$TMP'` evita o popup de pacote; **`form_exists`/`form_layout_exists`
  sinalizam AO CONTRÁRIO** (levantam "O objeto já existe" quando ele existe — são check de nome livre);
  o clone **não** redireciona `FPCONTEXT-INTERFACE` (continua apontando para a interface da origem);
  `load( i_mode='SHOW' )` é `CX_FP_API_USAGE`. O clone é form de verdade: ganha FM próprio
  (`/1BCDWB/SM00000020`) e o `renderAdobeForm` roda sobre ele até `FP_JOB_OPEN subrc=0` — o PDF só não sai
  pelo destino do item 40. Na lib (`forms.mjs`): `copiarAdobeForm`, `apagarAdobeForm` (`confirm:true`) e os
  puros `buildAdobeCopySource`/`buildAdobeDeleteSource`/`parseAdobeCopyOutput`. Ideia nova I48 (criar do
  ZERO por `create( i_form )` e trazer de outro sistema por `form_create_from_version( i_destination )`).
  `docs/receita-forms.md § Cópia de Adobe Form SEM GUI`; `forms.test.mjs` (4 testes novos).
- [x] 42. Escada Smart Form — cópia + mutilação com assert visual (I35) — **medido 2026-08-31, S4H 758
  mandante 250, E2E pela lib LOCAL**, cobaias `Y_SF_C42` (clone) e `Y_SF_D1`…`D5` (degraus) em `$TMP`,
  todas apagadas (STXFADM, TADIR SSFO e TADIR CLAS vazias; 0 sessões antes e depois). **A linha "Smart
  Form: só SMARTFORMS" caiu inteira** — a lib copia, poda, troca texto, gera o FM, renderiza e apaga.
  **O gotcha que custou a POC: o DOM do `xml_download` NÃO serve direto para o `xml_upload`.** Com ele o
  `store` diz ok e grava só o CABEÇALHO (STXFCONT 1 linha de 344 bytes vs 2.886 da origem, STXFOBJT e
  STXFTXT zeradas), e quem denuncia é a geração — `FB_GENERATE_FORM` subrc 5 "Erro ao gerar formulário",
  sem dizer que o form está vazio. O que falta é o **RE-PARSE** (render para string + `create_parser`),
  que no abapGit sai de graça porque ele passa por arquivo; com ele, STXFOBJT 255, STXFTXT 82, FM
  `/1BCDWB/SF00000189`. Outros medidos: **a geração é passo à parte** (`store( im_active='X' )` deixa o
  form ativo SEM FM); **`FB_DELETE_FORM` apaga sem GUI** (`i_with_dialog=' '`) e leva a TADIR junto; a
  TADIR do form novo é nossa (`TR_TADIR_INTERFACE`); o clone nasce com o MASTERLANG da SESSÃO (P), não o
  da origem (D); o nó `RC` de dentro da janela vem **com atributo** (`<sf:NODE ID="834 ">`) e uma
  varredura que só case `<sf:NODE>` corta o XML no lugar errado — o SAP engole e o parse devolve
  `num_errors=1`; **`TDLINE` é CHAR 132** e o que passa disso é truncado sem aviso (o degrau 3 saiu com a
  frase pela metade → `fatiarTdline`). **Escada de 5 degraus, cada um com o PDF trazido para o disco
  (`salvarPdfEm`) e OLHADO** (PDF→PNG por PyMuPDF): (0) cópia inteira = a fatura do IDES, 13.230 bytes;
  (1) poda até `PA FIRST → WI MAIN → TI` + interface limpa = uma linha itálica a 2/10 cm, 1.776 bytes;
  (2) nó clonado = duas linhas em sequência; (3) `TH`/`AS`/`*`/`/` = título, parágrafo com quebra
  automática e as duas quebras; (4) janela movida para 8/3 cm e estreitada = o bloco andou e re-quebrou;
  (5) texto de 235 caracteres fatiado pela lib = a frase inteira. **A tabela de vocabulário nasceu** com
  texto, parágrafo, quebra, sequência e posicionamento (`elemento HTML ↔ nó SSFO ↔ PDF visto`, na
  receita); tabela, imagem e campo com dado seguem sendo cópia, não construção. Na lib (`forms.mjs`):
  `copiarSmartForm`, `baixarSmartFormXml`, `subirSmartFormXml`, `apagarSmartForm`, `renderSmartForm({
  salvarPdfEm })` + as puras `arvoreSmartForm`/`nosDoSmartForm`/`podarSmartForm`/
  `limparInterfaceSmartForm`/`trocarTextoSmartForm`/`fatiarTdline`/`clonarNoSmartForm`/
  `posicionarJanelaSmartForm`/`juntarBase64`. `docs/receita-forms.md § Smart Form SEM GUI`;
  `forms.test.mjs` (10 testes novos sobre fixture recortada do XML real). 361/361 testes.
- [x] 44. NROB — objeto de numeração por ADT REST + intervalos por driver (I55) — **medido 2026-09-01, S4H 758
  mandante 250, E2E pela lib LOCAL 28/29 PASS** (a falha foi um assert do próprio script, que truncava a
  mensagem antes do `874`), objetos `YJBV_POC_A`…`_D` e drivers `Y_NRIV*`/`YJBV_POC_CL_NR44*` em `$TMP`, todos
  removidos (TNRO, TADIR `NROB` e NRIV vazias; 0 classes driver). **A SNRO saiu da lista de manual**, e em dois
  arquivos, porque são duas coisas: o OBJETO (R3TR NROB, linha da TNRO) é repositório e sai por **ADT REST**
  (`tipos/numberRangeObject.mjs`, 26º tipo do catálogo); o INTERVALO é **dado de mandante** (NRIV, sem TADIR,
  sem versão) e vai por **driver classrun** (`nrob.mjs`: `deployIntervalos`/`lerIntervalos`/`apagarIntervalos`)
  — porque nenhum `NUMBER_RANGE_*` é RFC, o que a fila 38 já tinha medido. **Os dois desvios do tipo, contra o
  APLO da fila 29:** (1) o shell do create leva **`version="inactive"`** — com `"active"` o create devolve
  **400 `NR 870` "O objeto não existe" E CRIA O OBJETO ASSIM MESMO** (TADIR gravada, GET 200 `inactive`,
  lock/PUT/activate funcionando; quem trata o 400 como falha deixa órfã), e com `inactive` (ou sem `version`)
  é 201 limpo; (2) ele **ATIVA — e é a ativação que grava a TNRO**, não o PUT. Isso responde metade da I56: os
  media types (`blues.v1+xml` plural + `application/json` no fonte) são da FAMÍLIA AFF; o `version` e a
  ativação são **por tipo**. **Os três silêncios do intervalo, todos medidos:** sem `INRIV-PROCIND` os dois FMs
  devolvem sucesso e nada muda (quem denuncia é o CLOSE, `NO_CHANGES_MADE`); para apagar, o `NRLEVEL` tem de ir
  **zerado** (senão `INRER` msgnr 210, campo NRLEVEL); e `acao: 'alterar'` sem `nivel` **zera o contador**
  (10000 → 0, sem erro) — virou guard-rail que recusa antes da rede. Ciclo: `ENQUEUE` → `UPDATE_INIT` →
  `INTERVAL_UPDATE` → `UPDATE_CLOSE(commit)` → `DEQUEUE`. **Prova de uso:** intervalo 01 → `NUMBER_GET_NEXT`
  `0000000001` e `0000000002`, NRIV em outra LUW com o nível andado; **contrafactual**: objeto inexistente já
  para no `UPDATE_INIT` (`OBJECT_NOT_FOUND`). **E a ordem do desfazer importa:** com NRIV o DELETE do objeto dá
  **400 `NR 874`** — `apagarIntervalos` antes. Estruturas contra a intuição: `INRIV` não tem `OBJECT` (tem
  `SUBOBJECT`), `INRER` não tem `ERRORNUMBER` (é MSGNR/TABLENAME/FIELDNAME/TABIX), e `ERROR_IV` é tabela de
  INRIV (os recusados), não de INRER. Lib: `tipos/numberRangeObject.mjs` + `nrob.mjs` + os dois testes irmãos,
  catálogo regerado (26 tipos), `docs/receita-nrob.md`, README/cobertura-tadir/ideias + skill `adt-objetos`
  (ledger, "deixou de ser manual", dois desmentidos). 408/408 testes.
  > não medido: que passar `nivel` no `acao: 'alterar'` **preserva** o contador — é inferência do mesmo
  > mecanismo que o zerou, e o ADT stateful do s4h caiu antes de rodar essa passagem (três tentativas, sempre
  > 400 `Service nicht erreichbar`, com SOAP e ADT stateless em 200 e só 2 sessões minhas no sistema). O
  > guard-rail que RECUSA `alterar` sem `nivel` está medido e é o que protege hoje. Fica para a próxima janela,
  > junto com subobjeto, intervalo externo e NROB transportável (§ "O que ficou fora" da receita).
  > achado que virou ideia: **I61** — o `$configuration` de cada coleção AFF declara o TIPO de repositório de
  > cada campo (`numberLengthDomain` → `DOMA/DD`), insumo para validar REFERÊNCIA antes da rede.
- [x] 45. View clássica sem GUI (I57) — **concluído 2026-09-01, S4H 758, mandante 250, E2E pela lib LOCAL
  21/21 PASS**; tabelas `YJBV_POC_V45_A`/`_B`, views `YJBV_POC_V45_V`/`_M` e os drivers, todos `$TMP` e todos
  removidos (TADIR/DD25L/DD02L/TVDIR/TDDAT/OBJH vazias por readTable). **O tipo que o item 12 declarou
  impossível nasce — mas NÃO pela via da ideia.** A I57 apostava em `RPY_VIEW_INSERT` por SOAP ("uma chamada,
  sem driver") porque o item 38 mediu `FMODE='R'`. O FMODE está certo e a conclusão não: **o INSERT dumpa em
  TODO canal sem GUI** — ele chama `RS_CORR_INSERT` sem `suppress_dialog`/`activation_call`/`genflag`, e o
  caminho mudo do RS_CORR_INSERT (LSEUQU04:218) exige um desses três; sem eles vai a `TRINT_CORR_INSERT` com
  `iv_dialog='X'` → `TRINT_TADIR_POPUP` → `DYNPRO_SEND_IN_BACKGROUND`. Medido nos dois canais (SOAP: Fault
  "Internal Server Error"; classrun: HTTP 500), e `DEVELOPMENT_CLASS='$TMP'` **não** salva (no dump,
  `WI_MESSAGE_ENTER_DEVCLASS='X'`). A pilha e a condição foram lidas no fonte, não inferidas.
  **A via que funciona é a que a pesquisa apostava**: `DDIF_VIEW_PUT` + `TR_TADIR_INTERFACE` (a TADIR, que o
  PUT não escreve) + `DDIF_VIEW_ACTIVATE`, num driver classrun — nenhuma das três é RFC. **Decisão do fim,
  com o medido na mão: módulo de CANAL** (`view.mjs`, como o `sm30.mjs`), porque o create ficou FM-shaped.
  `deployView` cria **e altera** view de banco (`database`) e de manutenção (`maintenance`); `readView` é o
  assert em outra LUW; **`deleteView` apaga por `RPY_VIEW_DELETE` em SOAP PURO** — ao contrário do INSERT, o
  DELETE não passa pelo popup, e leva junto a linha da TADIR (o `RS_DD_DELETE_OBJ 'V'` com `no_ask='X'` também
  foi medido, mas custa driver). Prova de uso: 3 linhas nas tabelas base, o INNER JOIN descartou o cabeçalho
  sem item, e as 3 linhas vieram iguais por `readTable` (SOAP) e por `dataPreview`.
  Gotchas que custaram rodada, os três na receita: (1) **`DD28J` (o join) e `DD28V` vão JUNTAS ou nenhuma** —
  sozinha, o PUT dá `view_inconsistent` (subrc 3) sem dizer qual falta; o join de view de banco mora na DD28J
  (LTAB/LFIELD/RTAB/RFIELD, SOURCE='S'), e a forma JL/JR do `RPY_VIEW_READ` é representação legada; (2)
  **`DD25V-GLOBALFLAG` é descartado em silêncio** pelo PUT; (3) depois de ativar, **`SELECT` na MESMA sessão
  roda o load antigo e dumpa** (isolado por contraprova: o mesmo driver sem o SELECT devolve 200).
  **O par com o item 17 fechou pela metade:** a view de manutenção nasce e ativa (rc=4, aviso), e o
  `deployTableMaintenance` gera o diálogo em cima dela (TVDIR `BASTAB='X'`, TDDAT, pool, FMs — `GEN_RESULT`
  todo C); mas a SM30 recusa manter (`E SV 792`), e descartei por medição que fosse a tabela base (com
  `dataMaintenance : #ALLOWED` a mensagem é a mesma). A diferença que sobra é justamente o `GLOBALFLAG` que o
  PUT descarta → **virou a ideia I62**. Lib: `view.mjs` + `view.test.mjs` (25 testes puros), export
  `jbv-adt-client/view`, `docs/receita-view-classica.md`, README/CONTEXT/cobertura-tadir (VIEW saiu de "só
  SE11") + skill `adt-objetos` (ledger, a tabela "não dá pelo ADT REST" e um desmentido novo). 433/433 testes.
  > ⚠ pendência de ambiente, não do item: **5 sessões 202 órfãs** minhas no s4h. O ADT stateful caiu no meio da
  > sessão (400 `Service cannot be reached` a tudo, com SOAP e stateless em 200) e voltou sozinho ~20 min
  > depois — as tentativas nesse intervalo é que deixaram as órfãs. SM04/`TH_DELETE_USER` é do Joris.

- [x] 39. Engenharia reversa da SE09: como o GUI cria a request — **concluído 2026-09-01, S4H 758, mandante
  250**; TRs `S4HK912793`…`912810` e o projeto `S4H_P00002/3` criados e removidos (E070/E070A/CTSPROJECT
  vazias por readTable; nenhum driver `Y*CTS39*` na TADIR). **A resposta é que a SE09 não cria nada:** o
  `TRINT_POPUP_TO_CREATE_REQUEST` (SAPLSCTSREQ, chamado por `CL_CTS_REQUEST`) é só `CALL SCREEN 200` — colhe
  tipo/texto/usuários/pacote/camada/alvo/projeto e devolve. Quem cria é sempre
  `TR_INSERT_REQUEST_WITH_TASKS` (SAPLSTR8), **e é o mesmo FM que a API REST do CTS chama**
  (`CL_CTS_REST_API_IMPL~create_request`, com `it_users` e `it_attributes` — lido no fonte). A diferença
  entre as portas não está no motor: está no que cada uma preenche. **Três portas medidas lado a lado**,
  produzindo E070/E070C idênticas (só o LANGU da E07T muda: ADT e driver gravam no idioma de LOGON, o SOAP
  puro em EN): `criarRequest` (ADT, item 24) · **`criarRequestPorRfc`** (`TR_EXT_CREATE_REQUEST` é FMODE='R'
  — SOAP PURO, sem sessão e sem driver) · **`criarRequestComTarefas`** (driver classrun: tarefa por usuário
  inclusive de OUTRO, N atributos, alvo, `simular`). Medidos, um por rodada: (1) **o tipo da TAREFA sai do
  tipo da ORDEM** — ordem K → tarefa `X`, ordem W → tarefa `Q` (o FM sobrescreve o `type` do `scts_user`);
  (2) **usuário inexistente derruba a criação DEPOIS de a ordem estar gravada e o `ROLLBACK WORK` do FM não
  a desfaz** (TR 809; sobrou a `S4HK912800`, apagada) → guard-rail confere a USR02 antes da rede;
  (3) `iv_devclass`/`iv_tardevcl` em ordem K **não geram E070M** — silêncio; (4) **o projeto CTS não mora na
  `E070C-REPOID`** (vazia nas três portas): é o atributo `SAP_CTS_PROJECT` da E070A, com o **TRKORR** do
  projeto (`S4H_P00002`), não o id externo — e o `tm:cts_project` do ADT grava exatamente isso;
  (5) `iv_simulation='X'` é dry-run de verdade (subrc 0, número vazio, nada gravado). **Família de projeto
  CTS inteira por SOAP puro** (`TR_RFC_CREATE_PROJECT`/`READ`/`DELETE`, todos RFC): o projeto nasce como
  E070 tipo `G` + linha da CTSPROJECT; `IV_EXTERNALPS` é obrigatório e tem de existir na `CTS_EXT_PS` (a
  condição foi lida no FORM `CHECK_PROJECT_DESCRIPTION`, `LTR_CTS_PROJECTSF03`, não inferida — sem ela é
  `INVALID_INPUT` mudo). **E o delete de TR ficou barato:** `CTS_WBO_DELETE_REQUEST` é RFC — apaga
  ordem+tarefas+entradas por SOAP, sem o driver que o `desmancharRequest` custa. Dois silêncios medidos:
  `TR_EXT_ADD_REQ_ATTR` com `IV_DEL_FLAG` e REFERENCE **errado** devolve sucesso e não apaga nada (o
  `removerAtributo` confere a E070A depois); e **`SAPCORR` IMUNIZA a request** — com ele a TR não se edita,
  não se apaga e o próprio atributo não sai (TO 086, nas três vias) → `ATRIBUTOS_IMUNIZANTES` recusa antes
  da rede. Lib: `cts.mjs` (+8 funções), `cts.test.mjs` (4 testes puros novos), `docs/receita-change-request.md
  § Paridade com a SE09`, README/CONTEXT + skill `sap-testes` (linha "CTS (arrange/desfazer)" na matriz).
  437/437 testes. Ideias novas: **I63** (a outra API REST do CTS), **I64** (`TR_EXT_INSERT_IN_REQUEST`),
  **I65** (leitura do CTS por SOAP puro).
  > E2E pela lib LOCAL: **20/20 PASS** nas partes que não dependem do ADT stateful (guard-rails, SOAP puro,
  > projeto CTS, `tm:cts_project`, limpeza). **Falta rodar `criarRequestComTarefas` PELA LIB** — o ADT
  > stateful do s4h caiu no meio da sessão (400 `Service nicht erreichbar` a tudo; SOAP e stateless em 200)
  > e não voltou em ~1h de sondas espaçadas. O COMPORTAMENTO dessa via está medido por driver direto (os
  > seis casos B1–B6, com assert em outra LUW) e o fonte que a lib gera é o mesmo; o que falta é o
  > exercício do código. Próxima janela com stateful: rodar o `e2e-39` inteiro.
  > ⚠ pendências de ambiente, não do item: **a TR `S4HK912799` ficou presa no s4h** — criei-a com o
  > atributo SAPCORR antes de saber o que ele faz, e não há via na lib (nem no ADT) que a apague; sai por
  > `DELETE FROM e070a` num driver, ou pelo Joris. E **14 sessões 202 órfãs** minhas (5 herdadas da sessão
  > anterior) — SM04/`TH_DELETE_USER` é do Joris.
- [x] 30. Trace de runtime por ADT (I7) — `/sap/bc/adt/runtime/traces` num driver classrun. **Provaria:**
  regressão de performance no mesmo ciclo do teste. **Medir (s4h):** criar trace request, rodar a classe,
  ler o resumo (tempo por método). **FECHADO 2026-09-02, S4H 758 mandante 250 — pela via GUI, não pela via
  ADT.** Retomando a nota `> em andamento:` abaixo: `TH_GET_PARAMETER` (SOAP RFC) funciona — o campo certo,
  achado pela `FUPARAREF`, é `PARAMETER_NAME` (não `PARAMNAME`, o que a sonda anterior usava); com ele,
  `abap/atrapath` existe e aponta pra um path válido (`/usr/sap/S4H/D00/data/AT00++++`, RC=0) e
  `abap/atra_switch`/`abap/atra` **não existem** como parâmetros (RC=4) — a hipótese "falta parâmetro de
  perfil" cai por medição. **A contraprova pelo SAT (GUI) foi o desmentido decisivo:** medindo a MESMA
  classe de trabalho por uma transação clássica (SE16N sobre T000), o hitlist saiu com **4.192 linhas**,
  tempos reais em microssegundos, RFC wait e DB fetch discriminados por programa — o sistema MEDE. A causa
  do trace vazio não é o sistema, é o CANAL: o SAT mede dentro da MESMA sessão de diálogo do alvo; o
  classrun (ADT REST) e a API `cl_atrapi_main_service` chamados de dentro dele rodam numa requisição HTTP à
  parte, fora da unidade de medição do kernel — a causa exata dessa separação não foi isolada, só o efeito.
  Produtizado: `medirComSat`/`mediuDeVerdade`/`numeroSat` em `gui.mjs`, E2E pela lib LOCAL (SE16N/T000,
  total 4.192, `mediuDeVerdade=true`, sessão do GUI fechada sem sobra). De brinde, um bug real do módulo
  corrigido: `GuiRadioButton.Text` é SOMENTE LEITURA (o jeito certo é `.Select`, ação `selecionar` que já
  existia) — e o `rodarGui` não limpava `Err` entre passos, então um erro no passo N deixava os passos
  seguintes rodarem com efeito colateral real e atribuía o erro ao ÚLTIMO passo executado, não ao que
  falhou; agora cada passo só roda se o anterior não tiver estourado (`montarVbs`). 624/624 testes (1 novo
  em `gui.test.mjs`). Docs: `docs/receita-runtime-analysis-sat.md`, README, skill `sap-testes` (canal novo
  na matriz). **O que falta:** só `tipo: 'transacao'` tem E2E — `programa`/`funcao` têm o caminho de
  entrada pronto (radio/campo/botão medidos) mas a navegação de saída pode diferir, sem medição ainda.
  > em andamento (histórico, mantido como registro): sessão de 2026-08-31 (S4H 758, 250) mapeou o canal INTEIRO e parou num ponto só —
  > **o trace nasce VAZIO**. Tudo abaixo é medido; nada ficou no sistema (0 trace requests, 0 trace
  > files, 0 objetos — limpo por `ATRA_DELETE_TRACE_REQUEST`/`ATRA_DELETE_FILE`/`deleteObject`).
  >
  > **O canal existe nas DUAS vias.** ADT: workspace "ABAP Profiler" no discovery →
  > `runtime/traces/abaptraces` (feed Atom por `?user=<X>`; `?user=*` mostra os de todos, foi assim que
  > o media type apareceu), sub-recursos `/hitlist` e `/dbAccesses`
  > (`application/vnd.sap.adt.runtime.traces.abaptraces.<sub>+xml`), mais `objecttypes` e `processtypes`.
  > O `extendedData` de cada entry JÁ traz o resumo que o item pede: `runtime`, `runtimeABAP`,
  > `runtimeSystem`, `runtimeDatabase`, `isAggregated`, `objectName`, `state`. **`requests` responde 400
  > "Accept header missing" a QUALQUER Accept** (inclusive os do padrão descoberto) e `parameters` dá 405
  > no GET — o create do request não sai pelo ADT.
  > SOAP RFC: **os FMs `ATRA_*` SÃO RFC** (`FMODE='R'` — o oposto do BAL do item 29):
  > `ATRA_SCHEDULE_TRACE_REQUEST`, `ATRA_GET_TRACE_REQUESTS`, `ATRA_GET_FILE_DIR`,
  > `ATRA_GET_FILE_HEADER`, `ATRA_GET_HITLIST_FROM_FILE`, `ATRA_GET_METHHTLST_FROM_FILE`,
  > `ATRA_GET_DB_HITS_FROM_FILE`, `ATRA_DELETE_FILE`, `ATRA_DELETE_TRACE_REQUEST` — e o `callFunction`
  > da lib alcança todos (file dir, header, hitlist e os dois deletes medidos; tabela de saída precisa ir
  > declarada vazia no envelope, o gotcha do `TH_USER_LIST`).
  >
  > **O achado que custou a sessão: `ATRA_STR_TRACE_SCHEDULE-TYPE = 'X'`.** Sem ele o request nasce
  > `STATE='A'` e NUNCA dispara (9 requests, um por process type, `JRUNS=0` depois de rodar o act);
  > com ele o mesmo agendamento vira `STATE='D'`, `JRUNS=3` e nascem 3 trace files. O campo vira o
  > `OTYPE` do request; o resto do schedule é `UREQ_SUSER`/`UREQ_CLIENT`/`UREQ_PTYPE`/`UREQ_ONAME`/
  > `UREQ_IRUNS`/`UREQ_EDATE`/`UREQ_ETIME`. Enums medidos: **PTYPE** 0 any · 1 dialog · 3 batch · 4 RFC ·
  > 5 HTTP · 6 SMTP · 8 shared objects · 9 SQL service; **OBJTYPE** R programa · T transação · F FM ·
  > U URL · A shared objects · X qualquer · Q SQL service. Dois requests iguais: o 2º dá subrc 1.
  >
  > **O ponto aberto (o único):** os trace files nascem mas **não medem nada** — `KSIZE=6`, `RUNTIME`/
  > `RUNTIME_ABAP`/`RUNTIME_DB` = 0, `STATE='R'`, e a hitlist volta com **1 linha** (`ID='O'`, brutto e
  > netto 0); `ATRA_GET_METHHTLST_FROM_FILE` levanta `FAILURE` (nome curto e full path, mesmo resultado).
  > O mesmo vazio pelas outras duas vias: `SET RUN TIME ANALYZER ON/OFF` dentro do classrun não deixa
  > trace nenhum no feed, e o **instant trace** da API (`cl_atrapi_main_service=>s_get_instance( )->
  > get_tracing_service( )->setup_new_instant_trace( )` → `set_object` → `start_local` → `stop` →
  > `get_trace_file` → `get_analysis_service( )->get_analysis_from_file( )`) CRIA o arquivo
  > (`AT000047`, header completo) mas com hitlist de 1 linha — não mede a execução corrente.
  > Hipótese a testar primeiro: **pré-requisito de sistema** (parâmetro de perfil do runtime analysis —
  > `abap/atrapath` e afins — ou autorização), não a montagem da chamada; a sonda por `C_SAPGPARAM` num
  > driver DUMPOU e ficou sem resposta. **Próximo passo:** ler os parâmetros por outra via (RZ11 com o
  > Joris, ou `TH_GET_PARAMETER`/`RSPARAM` por driver) e, se o analyzer estiver ligado, rodar a
  > contraprova pelo SAT/SE30 no GUI — se o SAT também vier vazio, é ambiente e o item vira "medido:
  > não dá neste sistema"; se o SAT medir, a diferença está no que o request precisa e ainda não sabemos.
  > O que JÁ funciona e serve de assert de performance hoje: **`GET RUN TIME FIELD` dentro do driver**
  > (medido: 36.039 µs para o act da POC) — barato, sem trace file e sem canal novo.

- [x] 46. Markdown → Smart Form: o conversor, e a AST que o Adobe vai herdar — **concluído 2026-09-01,
  S4H 758, mandante 250, E2E pela lib LOCAL 15/15 PASS**; cobaias `Y_SF_MD46*` em `$TMP`, todas apagadas
  (STXFADM e TADIR SSFO vazias). **Um Markdown vira Smart Form imprimível pela lib** —
  `markdown.mjs` + export `jbv-adt-client/markdown`, com a **AST no meio** que o item exigia: o parser
  não sabe o que é TDFORMAT, o emissor não sabe o que é `##`, e o emissor XFA do item 43 pendura na
  mesma árvore. `publicarMarkdown` faz o caminho inteiro (copia o molde, poda, escreve, sobe, gera o FM,
  salva o PDF). **O degrau 0 respondeu o risco central a favor:** o vocabulário sai do Smart Style
  (`STXSPARA`/`STXSCHAR` do `SF_STYLE_01`, confirmado no `<STDSTYLE>` do XML) e ele **já tinha** ênfase
  inline (`B`/`I`/`S`) e lista numerada (`N1`, `TDNUMBERIN='A'`, numera sozinha) — **não foi preciso criar
  SSST**, que é "só GUI" e teria virado um item inteiro. As tags de formatação FUNCIONAM: `<B>x</>` sai
  negrito no PDF e a tag SOME do texto. **Os dois silêncios, e os dois foram pegos pelo PDF OLHADO, não
  pelo `contemTexto` (que passou VERDE nas duas vezes):** (1) **o device é Latin-1** — `•`, `─`, `—` e `◆`
  viram `#` sem erro nenhum, e o corte é U+00FF, medido com 13 caracteres num PDF só (acentuação
  portuguesa passa intacta); virou `paraLatin1`, que translitera o comum de editor moderno e RECUSA o
  resto com o code point; (2) **o parágrafo `UL` tem entrelinha de MEIA linha** (`TDPLDIST 0.50 LN`) e a
  primeira linha do bloco de código SOBREPÔS a última da lista no papel — bloco de código passou para
  `AS`. Correção de leitura minha no caminho: o recuo do `TB` é **2 MM**, não 2 cm — a UNIDADE do
  `TDPLEFT` decide, e ler o número sem ela engana (por isso a lista com marcador sai rente à margem; nem
  o parágrafo nem espaço à esquerda recuam — espaço à esquerda do TDLINE é comido). Vocabulário FECHADO:
  imagem, link, citação, tabela e HTML são **erro duro com a linha**. Lib: `markdown.mjs` +
  `markdown.test.mjs` (14 testes puros), `docs/receita-forms.md § Markdown → Smart Form`,
  README/CONTEXT/package.json. 451/451 testes. Segundo caso concreto para a **I50** (assert visual de PDF).
  > fora, e de propósito: campo com DADO (`&VAR&` + parâmetro na interface — o mesmo degrau que o item 42
  > adiou), níveis de título (`#`/`##`/`###` caem todos em `TH`, o estilo só tem um), recuo do bullet
  > (ficaria com Smart Style próprio) e quebra de página/cabeçalho/rodapé (o documento vai num nó só).
- [x] 48. MD→SF · degrau 1: CAMPO COM DADO — **concluído 2026-09-01, S4H 758, mandante 250, E2E pela lib
  LOCAL 23/23 PASS**; cobaias `Y_SF_MD48*` em `$TMP`, todas apagadas (STXFADM e TADIR SSFO vazias; 1 sessão
  202 antes e depois). **O documento deixou de ser estático:** `{{NUMERO}}` vira nó `variavel` na AST,
  `&NUMERO&` no TDLINE e `<item><IOTYPE>I</IOTYPE><NAME>NUMERO</NAME><TYPING>TYPE</TYPING><TYPENAME>STRING
  </TYPENAME><BYVALUE>X</BYVALUE></item>` na `<INTERFACE>` — **sem `<STANDARD>X</STANDARD>`**, que é a marca
  do que é do Smart Form e não do form (com ela, o `limparInterfaceSmartForm` levaria o parâmetro embora).
  As três perguntas do item, respondidas: (1) **o Smart Form SUBSTITUI** — o PDF traz `Fatura 4711`, não
  `&NUMERO&`; (2) o FM gerado ganha os parâmetros, `FUPARAREF` = `I:NUMERO:STRING` ×4; (3) **dois PDFs
  OLHADOS do MESMO form** (`4711 ACME` × `9902 GLOBEX`, mesmo `/1BCDWB/SF00000222`) — `imprimirMarkdown`
  troca o valor sem republicar nada. **A contra-prova mediu qual ponta reclama, e é o argumento do erro
  duro:** campo no texto SEM parâmetro na interface não falha no render — falha na GERAÇÃO, tarde e MUDA
  (`FB_GENERATE_FORM` subrc 5, "Erro ao gerar formulário", sem dizer qual campo); com parâmetro e sem valor,
  o runtime diz o nome ("O parâmetro obrigatório CLIENTE não está preenchido"); por isso `prepararVariaveis`
  recusa ANTES da rede o campo sem valor E o valor sem campo. **Achado que corrigiu um assert da lib:** o
  canal ASCII do `CONVERT_OTF` **escapa o `&` como `&amp;`** e o papel não (medido com 4 linhas: `P&D` sai
  `P&D` no PDF e `P&amp;D` no texto; `<` e `>` vêm crus) — terceiro engano do `contemTexto` neste caminho, e
  o primeiro FALSO NEGATIVO: ele passou a desescapar. Lib: `acrescentarInterfaceSmartForm` +
  `parametrosDaInterface` (forms.mjs), `variaveisDoMarkdown`/`nomeDeVariavel`/`prepararVariaveis`/
  `imprimirMarkdown` (markdown.mjs), 6 testes puros novos, `docs/receita-forms.md § Degrau 1`,
  README/CONTEXT. 457/457 testes. Limites do degrau: um tipo só (`STRING`), valor até 200 caracteres (a
  linha do fonte do driver corta em 255) e o valor também passa pelo Latin-1.
  > fora, e virou ideia: formatação de campo (`&VAR(10CR)&`, a forma que o próprio `SF_EXAMPLE_01` usa,
  > lida neste item) e tipo numérico/data de verdade → **I66**.
- [x] 49. MD→SF · degrau 2: TABELA — **concluído 2026-09-01, S4H 758, mandante 250, E2E pela lib LOCAL
  21/21 PASS**; cobaias `Y_SF_MD49*` em `$TMP`, todas apagadas (STXFADM e TADIR SSFO vazias). **O risco
  que o item mandou nomear cedo NÃO se realizou: a tabela ESTÁTICA existe.** A anatomia respondeu antes
  de escrever qualquer coisa — **`SECTTYPE` é quem decide o papel do nó**: `C` tabela · `R` linha · `E`
  célula · `L` loop; e o loop mora em campos **OPCIONAIS** da tabela (`DATATYPE`/`TABNAME`/`TABHTYPE`/
  `TABHEADER`), então tirá-los deixa a tabela imprimindo o que está no XML. A **coluna é a ORDEM da
  célula** (não há campo de coluna nela); a largura é por (tipo de linha × coluna) no `CELLS`, e o
  `DYNLINES` declara os tipos. **Dois silêncios novos, os dois pegos só pelo PDF olhado** (bisseção,
  uma variável por rodada): sem `<OTABTYPE>` o form **GERA** (`FB_GENERATE_FORM` subrc 0) e o
  **RUNTIME** recusa — subrc 2, "Definição de tabela X não conhecida"; sem `<OTABHEADER>` **tudo
  responde ok e o cabeçalho não sai no papel**. `PATTERN` e `T_TEXT` são dispensáveis (PDF idêntico).
  Terceiro achado visual: a **borda de TOPO da 1ª linha corta o parágrafo anterior** — daí o padrão
  `borda: 'baixo'` (só `CBOTTOM`); `<SB>` foi tentado e não resolve. **O emissor mudou de forma:** a
  tabela não é linha de TDLINE, é NÓ, então `emitirBlocosSmartForm` devolve um bloco por nó (texto
  contíguo = um `TI`, cada tabela = um `SE`) e `publicarMarkdown` os pendura na MAIN em ordem — o nó do
  molde (`INTRODUCTION`) recebe o 1º texto e é a âncora, que não pode ser podada. **Alinhamento à
  direita é erro duro MEDIDO**, não inferido: `STXSPARA` do `SF_STYLE_01` tem `AS/N1/TB/TH/UL = LEFT` e
  `C = CENTER`, **nenhum RIGHT** (o `C` centraliza DENTRO da célula, visto no PDF) — `| ---: |` recusa
  e aponta o item 52. Quatro PDFs olhados: tabela de pedido com filete sob cada linha e colunas
  proporcionais ao conteúdo; célula longa quebrando dentro da coluna com a linha crescendo; e **dois
  PDFs do MESMO form** com `{{VAR}}` dentro de célula (degrau 2 sobre o degrau 1). Lib:
  `xmlTabelaSmartForm` + `xmlTextoSmartForm` + `inserirNoSmartForm` (forms.mjs), `emitirBlocosSmartForm`
  + `emitirTabela` + `larguraDasColunas` + `textoDoInline` (markdown.mjs), parser de tabela GFM com
  `\|` escapado, 14 testes puros novos, `docs/receita-forms.md § Degrau 2`, README/CONTEXT. 471/471
  testes. Limites: célula acima de 132 caracteres ganha uma quebra dura a mais (teto do `TDLINE`, o
  `*` quebra em vez de emendar); tabela DINÂMICA, rodapé de tabela, mesclagem, `SHADING` e alinhamento
  vertical ficam fora — nenhum tem sintaxe em Markdown.
- [x] 50. MD→SF · degrau 3: PÁGINAS, CABEÇALHO E RODAPÉ — **concluído 2026-09-01, S4H 758, mandante 250,
  E2E pela lib LOCAL 24/24 PASS**; cobaias `Y_SF_MD50*` em `$TMP`, todas apagadas (STXFADM vazia ao final).
  **O item achou um bug que estava esperando o primeiro documento longo: nenhum documento da lib passava de
  UMA página.** O molde manda `FIRST → NEXT`, a poda leva a `NEXT` embora, e a `FIRST` fica apontando para o
  vazio — 45 parágrafos bastaram para o render devolver `subrc 2, "Nenhuma página seguinte definida"`, zero
  OTF, zero PDF. Enquanto o texto coube, ninguém viu. A correção é UMA linha e vale para todo documento:
  `apontarProximaPagina(xml, { pagina: 'FIRST', proxima: 'FIRST' })` — a página aponta para SI MESMA e o SAP
  a repete quantas vezes precisar (medido: **9 páginas de um nó de texto só**), levando junto as janelas que
  ela tem. **Não foi preciso construir página nenhuma** — era a hipótese cara do item, e ela caiu.
  **Cabeçalho e rodapé são janelas CONSTRUÍDAS** (`xmlJanelaSmartForm`), e a anatomia tinha duas surpresas:
  o conteúdo da janela mora no `sf:PROC_CTRL/sf:NODE RC/sf:SUCC` (o `sf:SUCC` do próprio `WI` fica vazio), e
  **`ID`/`IDREF` são do SAP** — a página `NEXT` do molde não repete as janelas, ela as REFERENCIA
  (`<sf:WINDOW IDREF="786 "/>`), então nó construído (sem `ID`) não é referenciável por outra página; com a
  página apontando para si mesma isso não custa nada. **Numeração: `&SFSY-PAGE&`/`&SFSY-FORMPAGES&` num
  `TDLINE` de janela construída imprimem "Pagina 1 de 3" SEM parâmetro de interface** — viraram
  `{{PAGINA}}`/`{{PAGINAS}}` (mais `{{DATA}}`/`{{HORA}}` → `&SY-DATUM&`/`&SY-UZEIT&`) no `CAMPOS_SISTEMA`,
  e `variaveisDoMarkdown` os deixa de fora da conta da interface. **Front-matter** (`titulo` → CAPTION ·
  `cabecalho` · `rodape` · `formato` → PAGEFORMAT · `orientacao` → PAGEORTN · `margem`), com chave
  desconhecida/linha torta/formato inventado/margem que não cabe recusados ANTES da rede (3 documentos
  recusados, 0 forms criados). **A ambiguidade `---` NÃO se resolveu por posição sozinha** — o item mandava
  resolver assim, e a primeira tentativa quebrou um caso legítimo (documento que começa por régua): a regra
  ficou com TRÊS partes (1ª linha · bloco FECHADO · forma `chave: valor` dentro), e faltando qualquer uma
  aquilo é régua. `geometriaDoDocumento` é pura, e a margem padrão de **2,5 cm** foi escolhida por conta:
  é a que deixa a área útil do A4 em exatamente os **16 cm** da `larguraTabela` do degrau 2. Quatro PDFs
  olhados; o achado que só o papel dá: **a tabela atravessa a quebra de página e o SAP REPETE O CABEÇALHO
  DELA** na página seguinte, de graça, pelo `OTABHEADER A` que o item 49 já punha. `LETTER` deitado mudou o
  mediabox de verdade (27,9 × 21,5 no PDF contra 27,94 × 21,59 da conta). ⚠️ **Mudança de comportamento
  visível:** a janela MAIN saiu dos 10 cm do topo (herança do molde de carta do IDES) e passa a ocupar a área
  útil — os PDFs dos degraus 0–2 mudam de aparência. Lib: `apontarProximaPagina` + `definirFormatoSmartForm`
  + `FORMATOS_PAGINA` + `xmlJanelaSmartForm` (forms.mjs), `parseFrontMatter` + `geometriaDoDocumento` +
  `LAYOUT_PADRAO` + `CAMPOS_SISTEMA` (markdown.mjs), 13 testes puros novos, `docs/receita-forms.md § Degrau
  3`, README/CONTEXT. 484/484 testes. Limites: uma página só se repetindo (sem "primeira página diferente"),
  sem quebra explícita, cabeçalho/rodapé de UMA linha e altura fixa de 1,2 cm (texto maior é cortado sem
  aviso). Achado de ambiente virou **I67** (a `conexao` encerrar as sessões que ela mesma abriu).
  > pendência de ambiente: **2 sessões 202 minhas ficaram vivas** no s4h — as duas do script de SONDA, que
  > chamou `cx.sessaoStateless()` (logon próprio, quando há senha) e só encerrou a sessão de trabalho. Não é
  > queda do ADT como nas sessões anteriores: é erro do script, com causa isolada, e sem o cookie delas o
  > logoff ICF não tem o que encerrar — SM04 é do Joris. É exatamente o que a I67 propõe fechar na lib.
- [x] 51. MD→SF · degrau 4: IMAGEM — **concluído 2026-09-01, S4H 758, mandante 250, E2E pela lib LOCAL
  26/26 PASS**; cobaias `Y_SF_MD51*` (forms) e `YJBV_POC_G51*`/`YJBV_POC_LOGO51*` (gráficos) apagadas ao
  final (STXFADM e STXBITMAPS vazias, conferidas em outra LUW). **Os DOIS níveis saíram — o barato e o
  caro.** (1) O nó `GR` construído (`xmlGraficoSmartForm`): `GTYPE B` + `GKEYBDS` (OBJECT/NAME/ID/BTYPE) +
  `ALIGNMENT`, e **nada de `sf:OUTATTR`** — o nó não posiciona nem redimensiona. Funcionou de primeira
  dentro da MAIN (flui com o texto) e numa janela `WTYPE=G`. (2) A imagem NOVA no sistema sem GUI
  (`subirGrafico`): `SAPSCRIPT_IMPORT_GRAPHIC_BDS` é dynpro (`CALL SCREEN 4001`), mas o fonte por trás
  dela — `LSTXBITMAPSF05`, form `IMPORT_BITMAP_BDS` — dá a receita inteira, e ela roda em driver com o
  `GUI_UPLOAD` trocado por base64: `ENQUEUE_ESSGRABDS` → `SAPSCRIPT_CONVERT_BITMAP_BDS` →
  `cl_bds_document_set->create_with_table` (`DEVC_STXD_BITMAP`/`OT`) → `INSERT stxbitmaps` (o DOCID sai da
  signature) → `change_properties` → `DEQUEUE` + commit. **O TAMANHO impresso vem do DPI do arquivo**, não
  do nó: o mesmo BMP de 168×104 px sai 4,27 cm a 100 dpi e 1,42 cm a 300 (medido nos dois, visto no PDF).
  **Só BMP e TIFF entram** — os cinco casos medidos, cada um com sua mensagem (`PNG`/`JPG` →
  "formato não suportado"; conteúdo que não bate com o formato → `no_bmp_file`/`tifferr_invalid_format`),
  daí `formatoDaImagem` recusar antes da rede. Dois erros MUDOS medidos: gráfico inexistente só reclama no
  RENDER (`subrc 1`, "A saída de gráfico não é possível", **sem dizer o nome**; o form até gera) — por isso
  `graficoInfo` confere antes de o form nascer, e a contra-prova está no E2E; e **o `GR` não avança a
  linha**: sem quebra ele sobe sobre a última linha do parágrafo anterior e CORTA o texto, com qualquer
  alinhamento (medido em quatro variantes) — o emissor passou a fechar o texto anterior com um `TDFORMAT /`,
  e o assert virou numérico (bbox da imagem × bbox do texto no PDF). No Markdown, `![alt](GRAFICO "centro")`:
  o `src` **não é arquivo** (caminho/URL é erro duro com a explicação), o título entre aspas é o
  ALINHAMENTO (L/C/R medidos no papel: x = 2,5 · 9,8 · 14,9→18,5 cm) e a imagem ocupa a linha inteira.
  Lib: `xmlGraficoSmartForm` + `subirGrafico` + `apagarGrafico` + `graficoInfo` + `formatoDaImagem` +
  `buildGraphicUploadSource`/`buildGraphicDeleteSource`/`parseGraphicUploadOutput` (forms.mjs), bloco
  `imagem` na AST + `nomeDeGrafico`/`alinhamentoDaImagem`/`graficosDoMarkdown` + opção `imagens` do
  `publicarMarkdown` (markdown.mjs), 11 testes puros novos, `docs/receita-forms.md § Degrau 4`,
  README/CONTEXT. 495/495 testes. Achados novos → **I69** (o BDS como canal de arquivo: oito
  `BDS_BUSINESSDOCUMENT_*` são RFC — arquivo sem ADT e sem driver) e **I70** (timbre: gráfico dentro da
  janela de cabeçalho). Limites: PNG/JPG ficam fora (limite do FM do SAP), sem tamanho no documento, sem
  legenda, sem "float"; gráfico não tem TADIR (mora em STXBITMAPS+BDS) e transporte ficou fora; o branco
  puro do BMP saiu cinza claríssimo no PDF, observado sem causa isolada.
  > 2026-09-01 (item 52): o `SF_STYLE_01` deixou de ser o teto — o vocabulário do MD→SF agora tem estilo
  > próprio (`ESTILO_JBV` sobre o `ESTILO_MARKDOWN`), e os PDFs deste degrau mudam de aparência com ele.
- [x] 52. MD→SF · degrau 5: SMART STYLE PRÓPRIO (SSST) sem GUI — **concluído 2026-09-01, S4H 758,
  mandante 250, E2E pela lib LOCAL 16/16 PASS**; cobaias `Y_SF_MD` (estilo) e `Y_SF_MD52*` (forms) em
  `$TMP`, todas apagadas (STXSADM, STXSPARA, TADIR SSST e STXFADM vazias em outra LUW; 3 sessões 202
  antes e depois). **O SSST saiu do "só GUI" da cobertura, e o vocabulário deixou de ser refém do
  molde.** A via é API pura e saiu inteira do FONTE dos FMs, lido pelo ADT — o mesmo método do item 51:
  `TR_TADIR_INTERFACE ($TMP)` → `SSF_SAVE_STYLE` → `SSF_ACTIVATE_STYLE`, todos do `SAPLSTXBS`, nenhum
  RFC, em driver classrun. **`SSF_CREATE_STYLE`/`SSF_CHANGE_STYLE` NÃO servem** — o corpo das duas é
  `perform style_builder`, o editor da SMARTSTYLES. **Três armadilhas, as três mudas, as três medidas:**
  (1) `SSF_ACTIVATE_STYLE` exige `redirect_error_msg = 'X'`, senão o `SSF_CHECK_STYLE` que ele chama por
  baixo faz `CALL SCREEN` e o classrun dumpa; (2) **a TADIR tem de existir ANTES do save** — o
  `RS_CORR_INSERT` de dentro dele (`global_lock='X'`) abre a dynpro do `SAPLSTRD` e o driver morre com
  `DYNPRO_SEND_IN_BACKGROUND`, sem nada na saída (o classrun só devolve HTTP 500; quem conta é a ST22);
  (3) a **versão vem do HEADER**, não do banco (`ADD 1 TO iadm-version`), então sem ler a STXSADM antes
  toda republicação regravaria a versão 1. Custou uma rodada: **o `LOOP AT` sobre a tabela de erros
  VAZIA põe `sy-subrc = 4`** e transformava o activate bem-sucedido em falha relatada. O estilo próprio
  entregou o que o item pediu, conferido no PDF em COORDENADAS: `#`/`##`/`###` em **18/14/12 pt**
  (Helvetica-Bold, -Bold, -BoldOblique — contra os três iguais em Courier-Oblique 12 do molde); bullet
  **pendurado** (marcador em x=2,90 cm, continuação em 3,30); código em Courier recuado 0,5; citação em
  itálico a 3,50; e a coluna `| ---: |` com `9.600,00` e `4.200,00` terminando no MESMO x=16,93 — o
  alinhamento à direita que o item 49 tinha de recusar. **A citação mudou de LADO, e essa é a decisão de
  desenho:** `>` deixou de ser recusa do PARSER e virou bloco da AST; quem recusa é o EMISSOR, quando o
  estilo não tem `QU` — o documento diz o que É, o backend diz o que sabe imprimir (é o que deixa o
  emissor XFA do item 43 herdar a citação sem herdar o teto do `SF_STYLE_01`). **Dois achados com causa
  isolada, os dois pegos só pelo papel:** `TDNUMBERIN` **sozinho não numera** — a lista saiu sem "1." e
  sem "2.", sem erro; faltavam `TDLFIRSTPA` + `TDLDEPTH`, que declaram o parágrafo como estrutura; e
  **`TDHEIGHT` fora da `TFO02` não é recusado** — o SAP imprime no tamanho que achar (`COURIER 090` saiu
  **8,5 pt**), daí `tamanhosDeFonte` + a conferência de família/tamanho dentro do `publicarSmartStyle`.
  **Quarto erro mudo deste caminho:** form apontando para `<STDSTYLE>` inexistente **gera e imprime**,
  tudo com o parágrafo default — `publicarMarkdown` confere a STXSADM e os TDFORMAT antes de criar o
  form (contra-prova no E2E: recusou e nenhum form nasceu). Efeito colateral corrigido: o cabeçalho
  usava `titulo[0]` e com H1=18 pt estourava a janela de 1,2 cm — o vocabulário ganhou `cabecalho`/
  `rodape`. Lib: `ESTILO_MARKDOWN` + `validarSmartStyle` + `buildSmartStyleSource`/`Delete` +
  `parseSmartStyleOutput` + `publicarSmartStyle`/`apagarSmartStyle`/`smartStyleInfo`/`tamanhosDeFonte` +
  `definirEstiloSmartForm` (forms.mjs), `ESTILO_JBV` + bloco `citacao` no parser/emissor (markdown.mjs),
  10 testes puros novos, `docs/receita-forms.md § Degrau 5`, README/CONTEXT/cobertura-tadir + skill
  `adt-objetos` (linha SSST). 505/505 testes.
  > aberto, observado sem causa isolada: **`COURIER 080` também sai 8,5 pt** no papel, embora esteja na
  > TFO02 (e `HELVE 080/100/140/180` saem exatos). A conferência da TFO02 pega o tamanho inexistente,
  > não a diferença entre pedido e impresso numa família de largura fixa. Uma POC de fontes
  > (`Y_SF_ST52F`, oito pares família×tamanho num PDF só) ficou escrita e **não rodou**: o ADT stateful
  > do s4h caiu no fim da sessão (400 `Service nicht erreichbar`; SOAP e stateless em 200) e nada chegou
  > a ser criado.

- [x] 47. Application Job (SAJC + SAJT) — criar, agendar e provar que RODOU — **medido 2026-09-01,
  S4H 758, mandante 250, E2E 24/24 PASS pela lib local**; objetos `YJBV_POC_JOBC` (SAJC),
  `YJBV_POC_JOBTM` (SAJT), classe `YJBV_POC_CL_JOB`, log `YJBV_POC_JOBLOG` e tabela `YJBV_POC_JOB_T`,
  todos `$TMP` e todos removidos (TADIR, `APJ_W_JCE_ROOT`, `APJ_W_JT_ROOT`, DD02L e BALOBJ vazias;
  **0 sessões órfãs**). **A família AFF publica DUAS coleções e só UMA cria.** O **SAJC** sai por ADT
  REST e virou tipo (`tipos/applicationJobCatalog.mjs`, o 3º "blue" e o primeiro em **`blues.v2+xml`**
  — o v1 dá 415); o **SAJT dá 500 "Anular referência da referência NULL"** (sem dump ST22, nada criado)
  em v1/v2, com `version` inactive/active/ausente e com `relatedObjectUri`, e sai pela API que a
  própria SAP documenta com exemplo em classrun: `CL_APJ_DT_CREATE_CONTENT` → módulo **`job.mjs`**
  (`deployJobTemplate`/`apagarJob`/`existeJob` + runtime `agendarJob`/`esperarJob`/`statusJob`/
  `cancelarJob`/`lerJobLog`). **Prova de uso, que era o ponto:** job agendado por `SCHEDULE_JOB`,
  esperado até `F` com poll DENTRO do driver, linha lida em **outra LUW** e log conferido pelo
  `comLog` do `bal.mjs`; **contra-prova**: parâmetro inválido → status `A`, log com `E`, nenhuma linha.
  Quatro achados com causa isolada: (1) **o activate do SAJC só passa em SESSÃO NOVA** — na sessão do
  create/PUT ele responde `activationExecuted="false"` culpando uma *classe* de nome VAZIO
  ("Report ou classe  inválida"), e a classe existe e está ativa; (2) **os parâmetros do job não estão
  no fonte** — vêm de `IF_APJ_DT_EXEC_OBJECT~GET_PARAMETERS` da classe, e é o PUT que os copia para a
  `APJ_W_JCE_PAR`; (3) **a API DT não grava a TADIR, e sem ela o próprio DELETE dela quebra**
  ("Indicar pacote para R3TR SAJT") — a lib grava (`TR_TADIR_INTERFACE`) e remove depois, e o
  `exists_*` devolve **`I`** enquanto sobrar TADIR sem entrada; (4) **job abortado sem log de aplicação
  e sem dump** só se explica pelo log do JOB (`BP_JOBLOG_READ`), onde o `BT570` diz "Erro ao instanciar"
  logo depois do `BT645` "Class successfully instantiated" — a exceção veio de dentro do `execute`.
  Lib: `tipos/applicationJobCatalog.mjs` + `job.mjs` + testes irmãos, `encerrarSessao` no ctx dos
  módulos (o deploy custom precisa de sessão nova), catálogo regerado (27 tipos), export
  `jbv-adt-client/job`, `docs/receita-application-job.md`, README/CONTEXT/cobertura-tadir + skills
  `adt-objetos` (ledger, "nada fica manual", dois desmentidos) e `sap-testes` (o joblog como assert).
  534/534 testes. Achados novos → **I71** (job clássico SM36/SM37), **I72** (job periódico) e **I73**
  (inventário de jobs de um sistema de cliente).


- [x] 53. A importação SAPscript da SFP traz LAYOUT ou só a interface? — **respondido 2026-09-01, S4H 758,
  mandante 250**, objetos `YJBV_POC_SF_MIG` (SSFO) + `YJBV_POC_MIG_F`/`_MIG2_F` (SFPF) + `YJBV_POC_MIG_I`/
  `_MIG2_I` (SFPI) em `$TMP`, todos apagados (FPCONTEXT/FPINTERFACE/FPLAYOUTT/STXFADM/TADIR vazias ao final;
  0 sessões em `TH_USER_LIST`). **A pergunta estava mal-posta, e a resposta é melhor que os dois desfechos
  previstos: a importação SAPscript da SFP NÃO EXISTE no 758** — nenhum dos 53 includes do `FUGR FPUIFB`/
  `FPUIFBFORM` cita SAPscript, não há FM `FP*`/`SFP*` de migração, e as transações `SFP*` são duas. O que a
  SAP entrega são **duas migrações que COMPÕEM em cadeia**, as duas **medidas rodando sem GUI em driver
  classrun**: `FB_MIGRATE_FORM` (SAPscript → Smart Form, `i_with_dialog=' '` + `i_with_form_builder=' '`,
  subrc 0) e **`cl_ssf_migration=>migrate( )`** (Smart Form → Adobe/XFA — class-method; o diálogo mora nos
  FMs `FB_MIGRATE_FORM_FP_DEF`/`_FP_CUST`, não nela). Isso **desmenta a premissa do item 54** ("as duas
  migrações partem do mesmo nó e não compõem"): o par alinhado é DIRETO, SSFO × XFA do mesmo objeto.
  **Veredito do layout: VEM, e não é prancheta burra** — `SF_EXAMPLE_01` → 17.540 bytes de XDP
  (`<?xfa generator="SAP_SmartForms"?>`): 18 `subform` · 18 `draw` · 6 `field` com `bind ref="$record.…"` ·
  2 `image` · `pageArea` FIRST/NEXT com `medium stock="a4"` · `contentArea` x/y/w/h · `proto`+`use` ·
  `layout="tb"`/`"lr-tb"`; **texto formatado vai como XHTML em `<exData contentType="text/html">`**, que é o
  formato que o emissor da fila 43 tem de gerar. Correções e gotchas medidos: (1) **o XFA não está na
  `FPLAYOUT`** — ali mora o asx de `CL_FP_LAYOUT` (541/633 bytes); o XDP é a **`FPLAYOUTT`, uma linha por
  IDIOMA (receita corrigida)**; (2) **a migração usa o idioma da SESSÃO e o que falta sai VAZIO em silêncio**
  — o mesmo form em `P` deu 1.177 bytes com `<div/>` vazio e em `D` (masterlang) 9.473 bytes com o texto;
  (3) **TADIR antes** para SSFO/SFPI/SFPF, senão `CX_SY_SEND_DYNPRO_NO_RECEIVER … SAPLSTRD 0100` (o mesmo da
  fila 52); (4) **desmentido parcial do item 41**: no s4h **criar** SFPF pela migração FUNCIONA — o que falha
  é **ativar** (`form_activate` → `CX_FP_API_INTERNAL`, a assinatura que o 41 atribuiu à cópia); ler o XDP
  não exige ativação nem ADS, então **a fila 54 roda inteira no s4h**; (5) `set_default_migrating_options( )`
  deixa **`TABLE` DESLIGADA** (e `CONDITION_*`, `ALTERNATIVE_*`, `CODING`); (6) form inativo é "não existe"
  para `FP_FUNCTION_MODULE_NAME`. Doc: `receita-forms.md` § Migração de forms SEM GUI + correção da anatomia
  e da tabela "em qual sistema medir". Nada de código novo na lib (sem bump). Achados → **I74** (a família
  `CL_SXFT_*`, API ABAP que CONSTRÓI XFA, com `CL_SXFT_API_DEMO` — candidata a base do emissor da fila 43),
  **I75** (`migrarSmartFormParaAdobe` na lib: Markdown → SF → PDF Adobe sem emissor próprio) e **I76** (todo
  `conexao.encerrar()` parece deixar um dump `TEXTENV_UNICODE_LANGU_INVALID` na ST22).

- [x] 54. Pedra de Roseta SSFO × XFA — o dicionário que a própria SAP escreve — **medido 2026-09-01,
  S4H 758, mandante 250, 45/45 asserts**; corpus `YJBV_POC_RS_{TXT,VAR,TAB,IMG}` (SSFO) + 20 objetos
  Adobe `YJBV_RS_*` (SFPF+SFPI, cinco variantes de migração) + gráfico `YJBV_RS_LOGO` + Smart Style
  `Y_SF_MD`, tudo em `$TMP` e tudo apagado (STXFADM, FPCONTEXT, FPLAYOUTT, FPINTERFACE, STXBITMAPS,
  STXSADM e TADIR vazias ao final; **0 sessões órfãs**). **O corpus não veio de forms SAPscript
  padrão: veio da nossa própria escada MD→SF** (46, 48–52) — é ela que fabrica o lado SSFO com
  conteúdo escolhido, e a migração do 53 escreve o lado XFA. **Veredito: o XFA migrado NÃO é burro**
  (fluxo `layout="tb"`/`"lr-tb"`, `proto`+`use`, `break overflowLeader`, `bind ref="$record.…"`) — o
  risco que o item nomeava não se confirmou, e o mapa saiu inteiro (`receita-forms.md § Pedra de
  Roseta`): nó `TI` → **um** `<draw>` com `exData contentType="text/html"` e **uma linha de `TDLINE`
  = um `<div style>`**; `SE`/`R`/`E` → `subform layout="tb"/"table"/"row"` + célula `lr-tb` com a
  largura em cm e três `<edge presence="hidden"/>` + um de 0,26mm; `GR` → `<field
  access="nonInteractive">` com `<image href="/sap/bc/fp/graphics/public/graphics/bmap/bcol/…bmp">`;
  janela irmã → `<proto>`+`use`; e **o parágrafo do Smart Style vira CSS INLINE** (`TDHEIGHT 180` →
  `font-size: 18pt`, `TDPLEFT 0,80` → `margin-left: 8.01mm`, `TDPLDIST 1 LN` → `line-height:
  4.23mm`). Três silêncios com causa isolada, todos medidos por contra-prova no MESMO documento:
  (1) **`TABLE` desligada — que é o DEFAULT — não omite a tabela: ela a ACHATA** (mesmos 14 `<draw>`,
  todos `w="16cm"`, zero borda, zero cabeçalho repetido; 7.140 bytes contra 11.085), e a migração diz
  `ok` nos dois casos; (2) **sem `TEXT_BINDING` o campo perde o dado** — `&CLIENTE&` vira o texto
  `{CLIENTE}` e, da 2ª ocorrência em diante, um `<span xfa:embed="CLIENTE"/>` **sem `<field>` que o
  defina**; com a opção ligada cada variável ganha `<field presence="hidden">` + `bind` + `CL_FP_DATA`
  no CONTEXT, ao preço de **17.546 bytes de JavaScript XFA** injetados no `$form:ready`; (3) **o nó
  que a LIB constrói é MONOLÍNGUE** — migrado em D, o TAB manteve a estrutura inteira (14 draws,
  tabela, cabeçalho, bordas) e perdeu TODO o texto, sobrando só o nó herdado do molde: corrige o
  gotcha do 53 ("migre no masterlang" → **migre no idioma em que o TEXTO existe**). Não viajam:
  `TDPENTRY` (o pendurado do bullet), a numeração automática (vira "1" literal + `xfa-tab-count`) e
  `&SFSY-PAGE&` (vira o texto `{SFSY-PAGE}`). Nada de código novo na lib (sem bump). Doc:
  `receita-forms.md § Pedra de Roseta SSFO × XFA` + CONTEXT. Achados → **I77** (nó construído
  monolíngue) e **I78** (o gráfico da SE78 tem URL ICF); a **I75** perdeu o "Medir" (feito aqui) e
  ficou só implementação.

  **Enunciado original, mantido como registro do que se pensava antes do 53:**
  As duas migrações partem do mesmo nó (SAPscript), então NÃO compõem em cadeia — `SF → SAPscript`
  não existe, e não é acaso: migração é enriquecimento com perda, e o que o `SF_MIGRATE` inventa
  (hierarquia, contexto, interface) não tem volta. **Mas partir do mesmo lugar é o que as torna um
  corpus alinhado:** de um form SAPscript `S` saem `SF(S)` e `XFA(S)` — duas traduções do MESMO
  documento, feitas pela SAP. **Provaria:** que o `emitirXfa()` do item 43 nasce de um mapa MEDIDO,
  em vez de inventado nó a nó. **Medir (s4h, leitura + as duas migrações):** (1) 3–4 forms SAPscript
  padrão em ESCADA, na mesma disciplina dos degraus 48–52 — só texto · campo `&VAR&` · tabela ·
  gráfico; (2) `SF_MIGRATE` e importação SFP do mesmo original, par a par; (3) ler os dois lados
  pela lib (`baixarSmartFormXml` × `FPLAYOUT`) e alinhar construto a construto: TI/TDFORMAT ↔ o quê
  no XFA, `&VAR&` ↔ binding, SE/EV ↔ tabela, GR ↔ imagem; (4) o mapa vai para `receita-forms.md`.
  **Risco a nomear cedo, e decidido no PRIMEIRO par:** o XFA migrado pode ser burro — posicionamento
  absoluto, tudo estático, sem estrutura. Se for, o dicionário vale pouco e o item fecha com essa
  medição. **Não depende do ADS:** o corpus se lê no XML, e é por isso que o 43 pode ganhar o
  emissor inteiro com o ADS ainda fechado.
  > depende do 53: sem layout na importação da SFP não há corpus alinhado.
  > **DESBLOQUEADO e REDESENHADO pelo item 53 (2026-09-01).** Três coisas do enunciado acima estão
  > desmentidas por medição: (1) **as migrações COMPÕEM** — `FB_MIGRATE_FORM` (SAPscript→SF) e
  > `cl_ssf_migration=>migrate` (SF→XFA) são elos da mesma cadeia, então o par alinhado é **SSFO × XFA do
  > MESMO form**, e nem precisa partir de SAPscript: a escada MD→SF (46, 48–52) já fabrica o lado SSFO com
  > conteúdo que NÓS escolhemos; (2) **o XFA não é burro** — `layout="tb"/"lr-tb"`, `proto`+`use`,
  > `bind ref="$record.…"`, texto como XHTML em `exData` (contagem no item 53); (3) **o lado XFA se lê na
  > `FPLAYOUTT` filtrando o idioma**, não na `FPLAYOUT`. O que muda no plano: a escada de 3–4 forms passa a
  > ser a nossa (texto · campo · tabela · imagem), migrada no **masterlang** (senão o texto sai vazio em
  > silêncio), com `options-table = 'X'` ligado à mão — o default não migra tabela.

- [x] 55. A via de migração é chamável sem GUI? — **FECHADO ESCREVENDO O CÓDIGO (2026-09-01, S4H 758,
  mandante 250, E2E pela lib LOCAL 30/30)**, não apontando para a ideia: a pergunta do enunciado já estava
  respondida pelo item 53, então o que este item entregou foi a OPERAÇÃO — `migrarSmartFormParaAdobe` em
  `forms.mjs` (+ `buildMigracaoAdobeSource`, `parseMigracaoOutput`, `anatomiaXfa`, `validarOpcoesMigracao`,
  `OPCOES_MIGRACAO`, `OPCOES_MIGRACAO_PADRAO`). Objetos `YJBV_POC_M55*` (SSFO + dois pares SFPF/SFPI) em
  `$TMP`, todos apagados (FPLAYOUT/FPCONTEXT/FPINTERFACE/STXFADM/TADIR vazias ao final; **0 sessões órfãs
  antes e depois**). **O default da SAP ficou de fora por MEDIÇÃO, não por gosto**: o mesmo documento
  (título + parágrafo + tabela + `{{CLIENTE}}` + cabeçalho/rodapé) migrado duas vezes deu `layout="table"`
  **3 → 0**, `xfa:embed` **4 → 0** (o `{CLIENTE}` vira TEXTO) e **10.224 → 7.856 bytes** — com a migração
  respondendo `ok` das duas vezes. Por isso a lib liga `table`/`text_binding`/`header_footer` por cima do
  `set_default_migrating_options( )`, devolve `anatomia` (a contagem que serve de contra-prova: subform,
  draw, field, image, edge, `layout="table"`, `xfa:embed`, `<div>` × `<div/>`) e **avisa** o que o SAP cala
  (3 avisos quando as opções são desligadas; aviso de XDP sem texto quando o idioma não é o do texto). Os
  **22 campos de `SSFMEXPROPERTIES`** foram medidos por RTTI e corrigem a receita do item 54:
  `OUTPUT_OPTION` nasce **vazio**. Guard-rails antes da rede: Z/Y, form ≠ interface, opção fora da estrutura
  (um `ASSIGN COMPONENT` nela falha calado) e idioma de mais de um caractere. Ler o XDP num idioma que a
  `FPLAYOUTT` não tem é ERRO com dica, não silêncio. O par nasce INATIVO e a lib não tenta ativar — ativação
  é ADS (fila 43). Doc: `receita-forms.md § A migração como OPERAÇÃO da lib` + CONTEXT/README/skill
  `adt-objetos`. 538/538 testes (45 em forms). Achado sem causa isolada → **I79** (com o `SF_STYLE_01` o XDP
  saiu com ZERO `<edge>`, contra 48 do corpus do item 54 com o Smart Style próprio). A **I75 fechou junto**.

  **Enunciado original:** o item 41 mediu que
  `FP_FB_FORM_COPY`/`FP_FB_INTERFACE_COPY` são UI e morrem no classrun; a pergunta aqui é se a
  migração tem API por baixo, como `cl_fp_wb_form=>copy` tinha. **Provaria:** que converter um SSFO
  de cliente vira operação da lib, não roteiro de GUI. **Medir (s4h, só leitura primeiro):** (1)
  varrer TFDIR/RIS por `*MIGRAT*` nas famílias `SSF*`/`FP*`/`SFP*` e ler o status GUI das transações
  SMARTFORMS e SFP atrás do item de menu; (2) achada a classe/FM, o teste do item 41 decide API ×
  dynpro; (3) se for API, rodar sobre a escada do 54 e conferir que o XDP sai igual ao da via GUI.
  **Fica fora:** render pelo ADS (item 43, bloqueado por infra) — este item para no objeto gerado.
  > depende do 54: só faz sentido se o corpus da Pedra de Roseta valer a pena.
  > **A PERGUNTA DO ENUNCIADO JÁ ESTÁ RESPONDIDA pelo item 53 (2026-09-01): SIM, é chamável sem GUI**, e as
  > três etapas do "Medir" foram feitas — a varredura achou `FB_MIGRATE_FORM` (+ `_FP_DEF`/`_FP_CUST`) e
  > `cl_ssf_migration=>migrate`, o teste do item 41 rodou (as duas passaram em driver classrun, com TADIR
  > prévia) e o XDP saiu. O que sobra deste item é **implementação, não pergunta**: virar operação da lib —
  > é a **I75**. Decisão do Joris: fechar o 55 apontando para a I75, ou mantê-lo como o item que escreve o
  > código.

- [x] 56. A `conexao` encerra as sessões que ela mesma abriu (I67) — **medido 2026-09-01, S4H 758:250,
  E2E pela lib LOCAL 14/14 PASS + leitura no SXD 816:100**. `sessaoNova`/`sessaoStateless` nascem
  RASTREADAS e `encerrar()` faz logoff de todas (`{ manter: true }` é o opt-out; a sessão do `connect` e
  a stateless de cookie EMPRESTADO ficam fora — logoff nesta derrubaria a do CLI). A hipótese dos "5"
  caiu pela metade, por medição: **só a stateful fica órfã no s4h** (3 de 3 ficaram; as 2 stateless
  morrem sozinhas ao fim da requisição) — mas **no SXD a stateless PERSISTE** (a sonda das 16:41 seguia
  viva às 17:05; timeout é configuração do alvo), então `probe.mjs` passou a capturar o cookie da sonda
  e fazer logoff (`despedirCookie`) e `cobertura-tadir.mjs` encerra o `conectar` que ele mesmo fez (e
  apaga o `.sessao.json` — cookie morto no cache viraria 401 mudo). Medidos ainda: logoff de uma sessão
  NÃO derruba as outras (s2 respondeu 200 após o logoff de s1); sessão já fechada pelo chamador
  (`runClass` no `finally`) é pulada de graça; `deployAndRun` intacto (driver `YJBV_POC_CL_I67` rodou e
  foi apagado, delta de sessões 0); e a contagem por `TH_USER_LIST` **enxerga a própria requisição** (um
  202 com `ZEIT` = agora) — compare deltas, nunca o absoluto. Lib: `sap-connection.mjs` (+6 testes,
  580/580), `probe.mjs`, scripts. Docs: `receita-tobj-sm30.md` § órfãs, CONTEXT (§ Sessão rastreada),
  README, skill `sap-testes`. A I67 fechou junto.
  > pendência (SM04, decisão do Joris): **1 sessão 202 minha ainda viva no SXD** (TID 8, das 16:41 de
  > 2026-09-01, deixada pela sonda ANTES do fix) — sem cookie não há logoff; fecha por SM04 ou timeout.

- [x] 57. Emissor XFA pela API do SAP — a família `CL_SXFT_*`/`IF_SXFT_*` (I74) — **medido 2026-09-01,
  S4H 758:250, só leitura + cobaias `YJBV_POC_CL_XFT1/2/3` e `YJBV_POC_X57_F/I` em `$TMP` (tudo
  apagado, TADIR e FPLAYOUTT vazias, 7/7 PASS na limpeza)**. A hipótese da I74 confirmou nos três
  pontos do Medir: (1) o menor template rende — e **o render devolve o XDP COMPLETO com a mesma
  assinatura da migração** (`generator="SAP_SmartForms" APIVersion="R700.SP0.N0"`, ns
  `xfa-template/2.2`): 562 bytes com um draw de texto, gramática inteira na receita; (2) o xstring
  **entra num SFPF real e persiste byte a byte** — o `migrate` devolve o WB (`IF_FP_WB_FORM`, sem o
  `load` que o item 41 mediu falhando) e `get_layout( )->set_layout_data( i_set_xliff_ids =
  abap_false )` + `save` gravou 813 = 813 na FPLAYOUTT, relido em outra LUW, **sem validar contra
  interface/contexto** (meio caminho da I82, anotado lá); (3) o custo é ruído: 100 blocos exData com
  100 parses = 33,8 ms, ~11 chamadas/bloco. Dois achados que custaram a POC: **`SET_CONTENT_AS_XSTRING`
  do exData é um stub `TODO` da SAP** (chama `set_content_as_dom` com ref inicial →
  `CX_SY_REF_IS_INITIAL`; o caminho vivo é parsear o XHTML com iXML e `set_content_as_dom`), e a
  exceção não declarada escapando de `RAISING` estreito vira **500 mudo do classrun sem dump do
  driver na SNAP** — bissecar com `CATCH cx_root`. A família tem tudo que a Pedra de Roseta pede
  (exdata, field+bind, image, proto+use); `SF_EXAMPLE_01` migrou inteiro em P (reforça a I77: o
  monolíngue é o NOSSO nó). Docs: `receita-forms.md § A API que CONSTRÓI XFA`. A I74 fechou; o
  próximo passo virou **I85** (o emissor `astParaXfa` sobre a API — Markdown → Adobe sem migração).

- [x] 58. Emissor `astParaXfa` — Markdown → Adobe Form sem o Smart Form no meio (I85) — **medido
  2026-09-01, S4H 758:250, cobaias `YJBV_POC_X58*` em `$TMP` (tudo apagado; TADIR/FPLAYOUT/
  STXBITMAPS/STXSADM confirmadas vazias por readTable)**. Módulo novo `xfa.mjs`
  (`jbv-adt-client/xfa`), 612/612 testes. O assert do Medir (1) mudou de corpus para melhor: em vez
  do corpus arquivado do item 54, o GABARITO foi gerado NA SESSÃO — o mesmo documento (título+
  variável, 3 inlines, lista, tabela 3×2 com três alinhamentos, imagem centrada, citação,
  cabeçalho/rodapé com `{{PAGINA}}/{{PAGINAS}}`) pelas duas vias, e a contagem deu IGUAL: 28
  subform · 13 draw · 4 field · 1 image · 3 `layout="table"` · 3 embed · 29 div — e o **CSS dos
  `<div>` byte a byte**, porque a regra escondida foi isolada: a SAP arredonda as medidas em **twips
  inteiros** antes dos mm (0,80 cm → 8.01mm, não 8.00 — `mmDeTwips`). Medir (2): `gravarEm` grava o
  XDP num SFPF real pela via do 57 e o sha1 da FPLAYOUTT **relido em outra LUW** = sha1 do render
  (6.452 bytes). O risco da ideia resolveu como `publicarMarkdown`: driver GERADO por documento,
  XHTML em base64 dentro do fonte, `set_content_as_dom`. Dois achados: **em janela construída o
  `&SFSY-PAGE&` VIRA campo XFA** (`SFSY` hidden + `xfa.layout.page(this)` — corrige a Pedra de
  Roseta, que só via o corpo; o emissor faz igual) e **`append_child( as_ref )` com o pai fora da
  árvore é engolido em silêncio** (o `use=` some do render sem erro — custou a 1ª rodada; teste de
  regressão na lib). Dado novo para a **I79**: o gabarito saiu com ZERO `<edge>` mesmo com o
  `Y_SF_MD` recém-publicado — "é o estilo" enfraqueceu. Docs: `receita-forms.md § O emissor da
  AST`; README/CONTEXT; I85 fechada. O render em PDF segue sendo a fila 43 (ADS).

- [x] 59. Substituir o layout de um Adobe Form EXISTENTE por um XDP de arquivo (I82) — medido
  2026-09-01, S4H 758, mandante 250, sobre um clone do item 41 (`YJBV_POC_LAYX` em `$TMP`, apagado
  ao final; ausência confirmada por readTable TADIR/FPLAYOUT). Fecha o passo manual da nota SAP
  3751960 ("SFP → form → substituir o layout pelo XDP anexo → salvar") e a metade que o item 41
  tinha deixado aberta sobre `i_mode`: os valores aceitos são `READ`/`WRITE`/`TOGGLE`
  (`IF_FP_WB_OBJECT=>C_MODE_*`, case-insensitive; internamente viram SHOW/MODIFY) — `'SHOW'` cru cai
  no `WHEN OTHERS` e É o `CX_FP_API_USAGE` "parâmetro I_MODE não é válido" que o 41 mediu, e **`load`
  em READ (o default) + `set` + `save` também é recusado** com a MESMA exceção — o modo de escrita é
  WRITE. Com `i_set_xliff_ids = abap_false` (default da lib, não da SAP) o XDP grava **byte a byte**
  na FPLAYOUTT — inclusive um XDP nascido fora (escrito à mão, sem passar pela migração/emissor da
  lib) — sem validar nada contra a interface/contexto do form; o default do SAP (`abap_true`)
  re-serializa o XDP inteiro e injeta ids de tradução (666 → 871 bytes no mesmo documento).
  `substituirLayoutAdobe` (`forms.mjs`) soma o guard-rail que o `save` não tem: recusa antes da rede
  um arquivo sem o namespace `xfa-template` nos primeiros 2000 bytes. O layout entra na versão
  INATIVA (state `I`, por idioma — gotcha do item 53); ativar segue exigindo ADS (item 53). E2E pela
  lib: 4/4 (build do driver com WRITE/xliff/idioma/ordem, três guard-rails, parse do sucesso/exceção/
  vazio). Lib: `forms.mjs` + `forms.test.mjs`, `docs/receita-forms.md § Substituir o layout`,
  README/CONTEXT atualizados. 615/615 testes.

- [x] 60. Forma `json` genérica na lib — a família AFF (I56) — decidido 2026-09-01, **sem SAP novo**: as
  3 cobaias já existentes (APLO/fila 29, NROB/fila 44, SAJC/fila 47) bastavam para responder. O
  TRANSPORTE é mesmo genérico — PUT de `/source/main` sempre `application/json` nos três — e virou a
  forma `json` de verdade (`deployJson` em `adt-client.mjs`, ao lado de `deploySource`/`deployBody`).
  O CICLO não é: nem o media type do create (`blues.v1+xml` no APLO/NROB, `v2+xml` no SAJC) nem a
  ativação (APLO não ativa · NROB ativa na mesma sessão · SAJC só em sessão nova — `activateEmSessaoNova`,
  extraído do que o SAJC já fazia à mão) se decoram da família — por isso `ativacaoJson` é campo
  obrigatório do módulo (`nenhuma` | `mesmaSessao` | `sessaoNova`), validado em `_registro.mjs`, nunca
  inferido. Os três módulos saíram de `forma: 'custom'` com um `deploy(ctx, conexao, opts)` bespoke
  (~15-20 linhas cada, quase idênticas) para `forma: 'json'` + um gancho `body(name, pkg, description, def)`
  de poucas linhas que só monta o JSON — o `create → lock → PUT → unlock → ativação` ficou no genérico.
  `activateMany` ganhou um 3º parâmetro opcional (`{ sessao }`) para permitir a sessão explícita.
  615/615 testes (mesma contagem — só reclassificação; `docs/tipos.md` regerado, 27 tipos inalterados).
  `tipos/_esquema.mjs § FORMAS.json`, `CONTEXT.md § Forma`. **Resultado para a I56: qualquer tipo `json`
  futuro (customfields, changedocuments, destruction/archiving objects, feature toggles,
  transportobject/objects…) só precisa medir o PAR (media type do create, estratégia de ativação) e
  declarar — não reescrever o fluxo.** I56 fechada.

- [x] 61. Texto construído pela lib é monolíngue no caminho MD→SF (I77) — medido 2026-09-01, S4H 758,
  mandante 250, objeto `YJBV_POC_I77` em `$TMP` (apagado ao final, ausência confirmada). **A causa não era
  a que a ideia apontava.** Publicar em sessão P e renderizar por `SSF_FUNCTION_MODULE_NAME` numa sessão EN
  confirmou a hipótese (nó herdado do molde aparece, os dois nós CONSTRUÍDOS pela lib — tabela e 2º
  parágrafo — saem em branco), mas o culpado não é `xmlTextoSmartForm` faltando `<T_TEXT>`: o SAP, sem
  `control_parameters-langu` explícito, já tenta `sy-langu` de quem imprime e cai para o `MASTERLANG` do
  form quando falta — nunca cru do `<TEXT>`. O que quebra é o `MASTERLANG`, que o item 42 achava que nascia
  igual ao da sessão (`master_language = sy-langu` no `enqueue`) e na prática vem da ORIGEM: a escada baixa
  o XML, edita a STRING (que nunca toca `<MASTERLANG>`) e reenvia — `YJBV_POC_I77` publicado em sessão P
  saiu com STXFADM-MASTERLANG **D** (herdado do `SF_EXAMPLE_01`, com FIRSTUSER/LASTUSER `SAP` e datas de
  1999/2004 também copiadas). Fix de uma linha no `BLOCO_UPLOAD` (usado por `copiarSmartForm` E
  `subirSmartFormXml`): `lo_res->header-masterlang = sy-langu.` entre o `xml_upload` e o `store`. Com
  MASTERLANG correto, o fallback nativo do SAP resolve sozinho — **nenhuma mudança em `xmlTextoSmartForm`
  ou `renderSmartForm` foi necessária** (uma versão anterior deste fix chegou a fixar `control_parameters-
  langu` no render; revertida por redundante depois de medir que o fallback do SAP já fazia o mesmo).
  Contrafactual medido: com o MASTERLANG velho (D), EN e PT divergiam (2204 × 2869 bytes de PDF, textos
  diferentes); com o fix, EN e PT ficam byte a byte iguais (2869, mesmo `texto[]`), sem tocar a chamada de
  render. 615/615 testes (2 novos cobrindo o `header-masterlang`, líquido igual — removi um teste de uma
  abordagem descartada). Não afeta `astParaXfa` (item 58): o texto lá vive no próprio XDP, não em tabela
  por idioma. Achado à parte: 1 sessão stateful possivelmente órfã no s4h (script de POC que leu T002 via
  `dataPreview` e lançou antes do `encerrar()` no `finally` — falta do PRÓPRIO script, não da lib; SM04 é
  do Joris se sobrar).
- [x] 62. Bordas de tabela somem na migração para XFA (I79) — medido 2026-09-01, S4H 758, mandante 250,
  `$TMP`, tudo apagado ao final. Não era o Smart Style: seis configurações testadas (dois estilos,
  `bordaTabela` baixo/caixa, remigração do mesmo Smart Form, documento maior com cabeçalho/rodapé, réplica
  byte a byte da estrutura do item 54) deram **zero `<edge>`** em TODAS, com o lado do Smart Form
  (`STXSDINF`/`BORDERS`) sempre correto nos dois lados. A causa saiu de disco, não de teoria: os três
  `driver.abap` que o item 54 salvou no scratchpad (sobrevivem entre sessões) mostraram que só a migração
  de 48 `<edge>` ligava `OUTPUT_OPTION` — as outras duas (uma delas com as MESMAS opções que a lib liga
  hoje) já tinham medido zero. Isolado e confirmado por reprodução positiva: `opcoes: { output_option:
  true }` sobre um documento NOVO reproduz 48 `<edge>` (12 células × 4) e, noutro documento/estilo, 24 (6
  células × 4). `OPCOES_MIGRACAO_PADRAO` (`forms.mjs`) passou a ligar `output_option` — quarta opção além
  do default da SAP, com aviso se alguém desligar de propósito. 615/615 testes. Detalhe em
  `docs/receita-forms.md § Por que a borda da tabela some no XFA`.

<!-- adiados por dependerem do SXD (VPN da KART) — decisão do Joris, 2026-09-01 -->

- [x] 35. Diff de objeto entre dois sistemas (I12) — medido 2026-09-01, **s4h 758 (moovi, 250) × sxd 816
  (KART, 100)**, E2E **27/27** pela lib local; só a classe `YJBV_POC_DIFF` em `$TMP` dos dois sistemas
  (apagada, ausência confirmada por GET 404 nos dois). Módulo novo `diff.mjs` (`jbv-adt-client/diff`),
  o **único da lib sem caminho de escrita**: `compararObjetos` devolve veredito por objeto (`igual` ·
  `difere` · `soEmA` · `soEmB` · `ausente`), diff unificado por parte com o número de linha dos dois
  lados, diff **atributo a atributo** para tipo sem fonte, e `relatorioMarkdown`. **A resposta da
  pergunta é: por conteúdo, e só por conteúdo.** Três achados que mudam como se lê qualquer comparação:
  (1) **o `getSource` mente três vezes, sempre com cara de "igual"** — tipo de forma `xml` não tem
  `/source/main` (404 com o MESMO texto "Nenhum recurso adequado encontrado" nos dois sistemas), parte
  de classe ausente idem (mesmo XML de exceção), e **o `main` da classe não é a classe**: com o mesmo
  `main` (255 bytes byte a byte iguais) e classes de teste diferentes o `getSource` diz IGUAL — a lib
  compara `main` + os 4 includes e acusa `testclasses`; o guard-rail é só comparar o que veio **200 dos
  dois lados**; (2) **o carimbo não responde nada**: `changedAt` sai no fuso de cada servidor e o
  deslocamento VARIA com a data gravada (3 h em `IF_OO_ADT_CLASSRUN` e `DTEL BUKRS`, 4 h em `TADIR` e
  `DOMA BUKRS`) — nem por offset fixo dá para corrigir, então ele é aviso e nunca veredito; (3) **o XML
  não é comparável cru**: além do carimbo, a lista de `<atom:link>` cresce com o release (4 no 758 × 5–6
  no 816) — limpados os dois, DTEL/DOMA/`MATNR` padrão ficam idênticos. Normalizar caixa/espaço é
  OPCIONAL e declarado, porque foi medido: em `CL_SALV_TABLE` derruba a divergência de 197/175 para
  74/52 linhas (62% era pretty-print, `CLASS cl_salv_table DEFINITION` × `class CL_SALV_TABLE
  definition`) e nos outros cinco objetos do corpus não muda nada; e nunca toca literal nem comentário.
  Guard-rail novo: comparar **dois mandantes do mesmo sistema é recusado antes da rede** (o repositório
  é cross-client — diria "igual" sempre). A pergunta "cabe aqui ou no `jbv-abapgit`?" ficou respondida
  com fato: **aqui** — o CLI compara checkouts (disco, tipo que ele saiba baixar, duas passadas), o
  módulo compara leituras e alcança todo tipo do registro, inclusive os de forma `xml`, que o checkout
  não escreve. Lib: `diff.mjs` + `diff.test.mjs` (36 testes, fixtures reais da medição), export
  `./diff`, `docs/receita-diff-entre-sistemas.md`, README/CONTEXT. **574/574 testes.** Achados →
  **I80** (escopo do diff: "a TR chegou inteira?") e **I81** (o recurso `versions` do ADT, que a lib
  nunca chamou). Fora: descobrir o que comparar (a lista vem de quem chama) e versão inativa.
  > desbloqueado 2026-08-31 (item 32): o SXD 816 respondeu ao probe (adt+soap+classrun ok, mandante 100).
  > Sondar de novo antes de começar — alcance é do momento, não estado gravado.
  > 2026-08-31 (sessão do item 38): sondado de novo e **o SXD NÃO respondeu** (`fetch failed` em ADT e SOAP —
  > VPN da KART fora); registrado em `canais.json`. O item ficou parado antes de escrever qualquer código: o
  > "Provaria" é sobre DOIS sistemas, e s4h × s4h não prova diff (repositório é cross-client). Sondar de novo
  > na próxima sessão; se o SXD estiver de pé, este é o alvo.
  > 2026-09-01: sondado de novo (probe, sem sessão stateful) e **o SXD segue fora** (`fetch failed` em ADT e
  > SOAP; s4h ✅ adt+soap+classrun, release 758). Pela decisão registrada no cabeçalho, a sessão rodou a I55
  > (fila 44) no lugar. Continua sendo o alvo assim que a VPN da KART voltar.
  > **ADIADO 2026-09-01 (pedido do Joris): tudo que depende do SXD vai para o fim da fila.** Não é
  > bloqueio novo nem descarte — a nota acima segue valendo; o item volta a ser alvo quando a VPN da
  > KART estiver de pé (sondar primeiro: `node scripts/canais.mjs sxd`).
  > ⚠ **CORREÇÃO 2026-09-01 (Joris): o SXD fica no ar das 09h às 20h de São Paulo.** As sondas de
  > 2026-09-01 (as duas) rodaram por volta das **06h** — ou seja, FORA da janela. O "SXD não
  > respondeu / VPN fora" registrado acima é diagnóstico **não confirmado**: fora do horário o
  > `fetch failed` é o esperado. Só vale como fato a sonda feita entre 09 e 20. Conferir a hora pelo
  > PowerShell (`Get-Date -Format HH:mm`) — no Git Bash o `TZ=America/Sao_Paulo` devolve UTC.
  > ✅ **2026-09-01, 08:26 (item 48): o SXD RESPONDEU** — probe adt+soap+classrun ok, release 816,
  > mandante 100, sem sessão stateful. O aviso veio do Joris ("sxd já está no ar") e a sonda confirmou
  > FORA da janela nominal (antes das 09h). O item deixou de ter impedimento técnico: falta a decisão
  > do Joris de trazê-lo do rodapé para a posição de alvo.
- [x] 63. Acabamento de tabela que o Markdown não sabe pedir — `SHADING`, mesclagem e rodapé (I84) — medido
  2026-09-01, S4H 758, mandante 250, objetos `YJBV_POC_I84*` em `$TMP` (todos apagados, `conexao.encerrar()`
  no `finally` em cada rodada). **O primeiro palpite estava errado**: `SHADING` (o campo isolado de
  `CELLS`/`DYNLINES`) é INERTE — 020 a 100 testados, zero efeito no PDF. Quem pinta o fundo é
  `BORDERS/item` `INTENSITY` + `FILLCOLOR`, e pinta a célula INTEIRA mesmo com a borda só de BAIXO (não
  precisa da caixa fechada — o `sombreado` novo não reabre o bug de borda do item 49); `INTENSITY 100`
  com preto imprime a célula **toda preta e apaga o texto, em silêncio**. Mesclagem não tem campo próprio:
  sai de um `T_LINETYPE` com uma coluna a menos e a largura somada (medido sem gap nem sobreposição, a
  borda direita da célula mesclada alinha com a da última coluna substituída). `EVTYPE F` (rodapé) **não
  repete por página** — só o `EVTYPE H` (cabeçalho, `OTABHEADER='A'`) repete; o `F` (`OTABFOOTER='E'`) sai
  uma vez, no fim real da tabela (medido forçando 2 páginas com 45 linhas de enchimento) — o certo para uma
  linha de totais. Superfície: os três (`colspan`, `sombreado`, `rodape`) entraram só no CHAMADOR
  (`xmlTabelaSmartForm`) — não há sintaxe de Markdown para nenhum, mesma régua do item 49; sem eles a
  tabela gera o XML de sempre, byte a byte (48 testes do degrau 2 sem alteração). E2E final com a função
  REAL da lib (não réplica de POC): cabeçalho + linha sombreada + rodapé mesclado, 1 PDF olhado. Lib:
  `xmlTabelaSmartForm` (forms.mjs) + 6 testes novos, docs/receita-forms.md (seção nova) + README/CONTEXT.
  **621/621 testes.**
- [x] 64. Dump no logoff (I76) — observado no item 53: a ST22 registra `TEXTENV_UNICODE_LANGU_INVALID`
  (`CX_SY_LOCALIZATION_ERROR`) em `CL_HTTP_EXT_LOGOFF============CP, CM001:11` para CADA script da sessão,
  no minuto de cada `conexao.encerrar()`, em todo sistema onde a lib roda — inclusive de cliente. A
  atribuição é por coincidência de horário, não por contraprova ainda. **Provaria:** que dá para encerrar
  sem sujar a ST22 — e explica dumps que apareceriam numa auditoria de cliente com o nome da lib.
  **Medir (s4h, marca d'água da `dumps.mjs` antes e depois):** (1) script que só abre e encerra, com
  `cfg.lang = 'PT'` — conta os dumps; (2) o mesmo com `'EN'` e com o idioma omitido, para ver se o culpado
  é o `sap-language` que o logoff herda (o texto do erro é sobre idioma inválido no ambiente de texto);
  (3) contra-prova: encerrar sem o GET do `/logoff` (deixar a sessão morrer) — se o dump some, é o logoff.
  Se for o idioma, a correção é do lado da lib e cabe em uma linha. **Fechado 2026-09-01, S4H 758,
  mandante 250 — era mesmo o idioma, e a linha existe.** Medido com `criarConexao`+`encerrarSessao`
  direto (sem passar pelo `config.mjs`, que já teria posto o default): logon com `cfg.lang='PT'` ou
  `'EN'` → logoff HTTP 200, zero dump; logon **sem** `lang` (`cfg` montado à mão, sem idioma) → logoff
  HTTP **500** e 1 dump (`TEXTENV_UNICODE_LANGU_INVALID` em `CL_HTTP_EXT_LOGOFF`, no minuto exato do
  GET). Contra-prova: sessão aberta sem NENHUM logoff — zero dump na janela (o gatilho é o logoff, não
  a abertura). **Corrige também um desmentido do próprio código**: o comentário de `encerrarSessao`
  dizia "o ICF responde 500 ao logoff bem-sucedido, não é erro" — não é regra geral, é ESTE bug; com
  idioma sempre presente, logoff bem-sucedido responde 200. Fix de uma linha em `fetchToken`
  (`sap-connection.mjs`): `const L = lang || session.cfg.lang || 'PT'` — todo `cfg` monta com idioma
  daqui pra frente, mesmo o que pula o `config.mjs`. Revalidado no s4h com o fix: os quatro casos
  fecham limpo (200, zero dump). 2 testes novos (`sap-connection.test.mjs`, contra ICM de mentira —
  verificam o `sap-language` na URL do logon). **623/623 testes.**
- [x] 65. Gráfico da SE78 por URL HTTP (I78) — o XFA migrado referencia o bitmap da `STXBITMAPS` por
  `href="/sap/bc/fp/graphics/public/graphics/bmap/bcol/<nome>.bmp"`; hoje a lib só lê gráfico por
  driver classrun (`graficoInfo`). **Provaria:** que conferir/baixar um gráfico de cliente custa um
  `GET` — e que `subirGrafico` pode ser verificado byte a byte contra o arquivo de origem, o que hoje
  não é feito. **Medir (s4h, só leitura):** (1) subir um BMP conhecido e fazer `GET` nessa URL com a
  sessão da lib — comparar o corpo com o arquivo local, byte a byte; (2) variar `bcol`/`bmon` e um
  nome inexistente (o que volta: 404, 200 vazio, HTML de logon?); (3) conferir se o nó exige
  autenticação (o caminho diz `public`) — se não exigir, é dado de cliente exposto e vira achado de
  segurança, não conveniência. **Fica fora:** subir gráfico por HTTP (a escrita é do BDS).
  > fechado (2026-09-02, S4H 758, mandante 250): a URL **não resolve no s4h** — medido com um
  > gráfico real (`YJBV_POC_I78`, BCOL, via `subirGrafico`/`graficoInfo`, apagado ao final, ausência
  > confirmada). `GET /sap/bc/fp/graphics/public/graphics/bmap/bcol/<nome>.bmp` devolve **404 em
  > TODAS as variações testadas**: autenticado e sem `Authorization`, nome em maiúsculo/minúsculo,
  > com e sem `.bmp`, nome existente e inexistente — sempre 404, corpo vazio, ~170ms (não é timeout
  > de rede). A pergunta "exige autenticação?" ficou **indecidível**: o recurso nunca resolve, com
  > ou sem credencial, então não dá pra saber se seria exposto. Isolado por profundidade de path:
  > `…/bmap` e `…/bmap/bcol` (SEM nome) respondem **200 vazio** — são nós SICF de verdade,
  > confirmados ativos na `ICFSERVLOC`/`ICFHANDLER` (`FP` e a cadeia até `GRAPHICS` com
  > `ICFACTIVE='X'`) — mas QUALQUER coisa a mais no path (o nome do gráfico, ou um texto aleatório
  > como `nonexistent99`) dá 404 igual, então o 404 não distingue "gráfico não existe" de "path
  > errado". As classes candidatas encontradas por busca ADT (`CL_FP_GRAPHIC_URL`,
  > `CL_FP_GRAPHIC_CONTENT`, `CL_FP_GRAPHIC`) são o modelo de nó da INTERFACE do Adobe Form (campos
  > `graphicURL`/`graphicContent`), não o handler HTTP do serviço ICF — a classe que de fato atende
  > `/sap/bc/fp/graphics` não foi identificada nesta sessão. **Hipótese (não confirmada):** a mesma
  > classe de dependência do item 43/40 — o nó ABAP está ativo, mas resolver o conteúdo passa pelo
  > AS Java/ADS, que o s4h não tem.
  > **DESMENTIDA (2026-09-02, SXD 816:100, dentro da janela, sondado 10h43 São Paulo):** a MESMA
  > bateria repetida no SXD (que TEM ADS vivo — § Veredito do ADS) deu o resultado IDÊNTICO ao s4h,
  > byte a byte (`YJBV_POC_I78` BCOL, subido/confirmado/apagado por `subirGrafico`/`graficoInfo`,
  > ausência confirmada): 404 em toda variação com nome, 200 vazio em `bcol`/`bmap` sem nome, mesmo
  > sem credencial. Não é dependência de ADS/AS Java — a classe handler real de
  > `/sap/bc/fp/graphics/bmap/<btype>/<nome>` segue não identificada por busca ADT. A lib segue
  > lendo gráfico só por driver classrun (`graficoInfo`); achar o handler virou **I86** (SICF por
  > GUID próprio ou rastreio por SAT). Doc: `docs/receita-forms.md § Gráfico por URL HTTP`.
- [ ] 43. Conversor Adobe — a escada portada para XFA/XDP (I35) — herda a metodologia do item 42 sobre o
  clone do item 41 (`GET_LAYOUT( )->SET_LAYOUT_DATA` no XDP). **Provaria:** a prancheta HTML imprimindo
  via ADS — o alvo final da I35. **Medir:** o mesmo loop do item 42, com XFA no lugar do SSFO e o PDF
  vindo do ADS.
  > alvo (regra do Joris, 2026-08-31): **mede no `sxd` 816:100, não no s4h** — o s4h não tem ADS, e lá a
  > falha vem disfarçada (`CX_FP_API_INTERNAL` sem detalhe na cópia do FORM, item 41). Vale para todo
  > item de Adobe Form que toque o ADS (render, cópia/criação do FORM, I48); Smart Form e a cópia da
  > INTERFACE continuam no s4h. Tabela em `receita-forms.md § Em qual sistema medir`.
  > bloqueado: o motivo MUDOU (item 40, 2026-08-31): o ADS não está mais morto — está vivo e
  > responde, mas não resolve o destino `FP_ICF_DATA_SXD` de volta ao ABAP, então nenhum render
  > devolve PDF. Desbloqueia quando a infra criar esse destino no AS Java (a lista está na
  > `receita-forms.md § Veredito do ADS`); a via da lib já está inteira até a porta do ADS.
  > **ADIADO 2026-09-01 (pedido do Joris): tudo que depende do SXD vai para o fim da fila.** Não é
  > bloqueio novo nem descarte — a nota acima segue valendo; o item volta a ser alvo quando a VPN da
  > KART estiver de pé (sondar primeiro: `node scripts/canais.mjs sxd`).
- [x] 66. Campo FORMATADO no Markdown — `&VAR(10CR)&`, e o tipo por trás dele (I66) — medido 2026-09-02,
  S4H 758, mandante 250, `Y_SF_MD66POC` em `$TMP` (apagado ao final). Sintaxe escolhida: `{{NOME:FMT}}`
  (`variavelDeInline`/`formatoDeVariavel` em `markdown.mjs`), retrocompatível — sem `:` o nó fica
  idêntico ao de antes do item. Confirmado com tipo numérico real: CURR (`WERTV8`, valor `1234.56`,
  formato `10CR`) imprimiu `1.234,56` (separador de milhar/decimal de verdade, alinhado à direita);
  DATS (`20260902`, formato `10`) imprimiu `02.09.2026`; QUAN (`MENGV13`, `5.500`, formato `8.3`)
  imprimiu `5,500`. Contra-prova: largura menor que o valor (CURR `123456.78` em largura `5`) NÃO
  trunca calado — o SAP marca overflow com `*` à esquerda mantendo as casas decimais (`*6,78`, exatos
  5 caracteres). Achado: o separador decimal não veio de USR01-DCPFM do usuário (vazio) — é default
  do kernel/mandante, não override pessoal (T005 × kernel fica em aberto, não bloqueia). 626/626
  testes. Docs: `docs/receita-forms.md § Campo FORMATADO — {{NOME:FMT}} e tipo real`.
- [x] 67. Timbre: gráfico dentro da janela de cabeçalho (I70) — medido 2026-09-02, S4H 758, mandante 250,
  `Y_SF_I70*`/`Y_SF_I70E*` em `$TMP`/BDS (todos apagados, ausência confirmada). A hipótese (2) saiu
  **desmentida**: a `WHEIGHT` da janela não recorta nem redimensiona o `GR` — um gráfico de 4,57cm dentro
  de janela declarada com 1,2cm imprimiu os 4,57cm inteiros, invadindo a MAIN por baixo (não cortado por
  cima). O que evita a invasão é reposicionar a MAIN pela altura REAL do gráfico (`graficoInfo(...).alturaCm`),
  não a altura declarada da janela. As outras duas se confirmaram: `GR` dentro da janela `T` do cabeçalho
  funciona (raw XML e via `publicarMarkdown`), repete nas duas páginas de um corpo longo; `cabecalho`
  (texto) + `logo` convivem na mesma janela, empilhados com a mesma quebra `/` do item 51, altura segura
  = 1,2cm (texto) + 0,3 folga + altura do logo. `logo: NOME` / `logo: NOME alinhamento` novo no
  front-matter; `geometriaDoDocumento` ganhou `logoAlturaCm` (retrocompatível — sem `logo` o cabeçalho
  continua com a 1,2cm fixa do item 50, testado). E2E pela lib LOCAL (`publicarMarkdown`, sem XML à mão):
  logo sozinho e texto+logo+rodapé com `{{PAGINA}}`/`{{EMPRESA}}` em duas páginas, sem sobreposição.
  631/631 testes (5 novos). Docs: `docs/receita-forms.md § Timbre: gráfico no cabeçalho`.
- [x] 68. Job CLÁSSICO (SM36/SM37) — a outra metade do agendamento (I71) — medido 2026-09-02, S4H 758,
  mandante 250, `YJBV_JOB68_*` em `$TMP` (todos apagados, ausência confirmada por readTable — TRDIR,
  TADIR, VARID, TBTCO). O carimbo do item 7 se aplicava só ao `SUBMIT` SÍNCRONO: `SUBMIT <report> …
  VIA JOB <jobname> NUMBER <jobcount> AND RETURN` **funciona dentro do classrun** (só registra o step,
  não roda na hora) — `JOB_OPEN`/`SUBMIT VIA JOB`/`JOB_CLOSE` com os três `subrc=0`, job terminado `F`,
  linha lida em outra LUW. Quatro desmentidos: **`RS_VARIANT_CREATE` não existe** no S4H 758 (o certo é
  `RS_CREATE_VARIANT`, assinatura por TABLES `vari_contents`/`vari_text`); **`TBTCP-VARIANT` não é o
  nome da variante usada** (grava um `&<contador>` interno, mesmo com `USING SELECTION-SET` de
  verdade); **periodicidade não tem flag `PERIODIC`** (basta `PRDDAYS`/etc > 0 com `SDLSTRTDT` futuro,
  o SAP marca sozinho); e **`BP_JOB_DELETE` devolveu `subrc=1` apagando de verdade** (mesma classe do
  BT570 do item 47) — por isso o assert é reler a TBTCO, não o subrc. Achado de armadilha: `DATA(x) =
  sy-datum + 1` dentro do driver infere tipo incompatível com `SDLSTRTDT` e dumpa
  `CALL_FUNCTION_CONFLICT_TYPE` mudo (500 sem corpo) — por isso `data`/`hora` em `agendarJobClassico`
  são strings prontas do chamador, nunca calculadas no ABAP. `RS_VARIANT_DELETE` não é headless-safe
  (dynpro, mesmo com `SUPPRESS_INPUT_DIALOG`) mas não bloqueia: apagar o REPORT por ADT REST cascateia
  a variante. Novo em `job.mjs`: `criarVarianteJob`/`agendarJobClassico`/`apagarJobClassico`. E2E pela
  lib LOCAL (funções de produção, não driver raw): arrange → criarVarianteJob → agendarJobClassico →
  assert (status F + linha em outra LUW) → desfazer com ausência confirmada. 641/641 testes (10 novos).
  Docs: `docs/receita-application-job.md § Job CLÁSSICO`.
- [x] 69. Job PERIÓDICO de Application Job — o que `is_scheduling_info` faz de verdade (I72) — ficou
  fora do item 47 por recorte: a POC mediu só `start_immediately`. `CL_APJ_RT_API=>SCHEDULE_JOB` aceita
  `is_scheduling_info` (granularidade, valor, timezone, dias da semana, dia do mês, calendário de
  exceção) e `is_end_info` (fim por data ou por número de execuções), e o template guarda
  `JOB_PERIODIC_GRANULARITY`/`JOB_PERIODIC_VALUE` na `APJ_W_JT_ROOT` — campos que a lib preenche com
  zero hoje. **Provaria:** que a lib entrega o caso REAL do cliente (o job que roda toda madrugada),
  não só o disparo único. **Medir (s4h, `$TMP`):** (1) agendar de minuto em minuto com fim em 2
  execuções; (2) esperar as duas e conferir DUAS linhas na tabela do executor, com timestamps
  diferentes; (3) ver o que a TBTCP (o job periódico "pai") e a `APJ_D_JOB_EXE` mostram; (4) cancelar a
  série e provar que a terceira não veio; (5) medir o efeito do `timezone` (o s4h tem fuso torto — ver
  `dumps.mjs`).
  > em andamento (2026-09-02, S4H 758, mandante 250): `job.mjs` ganhou `periodicidade`/`fim` em
  > `buildAgendarSource`/`agendarJob` (granularidade minutos/horas/dias — semanas/meses ficam de
  > fora, exigem `weekday_info`/`month_info` não medidos), com guard-rails e 33/33 testes puros.
  > `schedule_job` aceita a chamada sem erro e a TBTCO grava `PERIODIC='X'`/`PRDMINS` certos — a
  > parte (1) do Medir. As partes (2)/(4) NÃO fecharam: nenhum dos três agendamentos comparados
  > (cru, compensado em -2h, e um SEM periodicidade isolando essa variável) saiu do status `S`
  > (liberado) em até 4 minutos — achado no caminho: o `timestamp` de `is_start_info` grava em
  > `TBTCO-SDLSTRTDT/TM` sempre **+2h** sobre o valor enviado (o mesmo "fuso torto" que `dumps.mjs`
  > já tinha achado pro SNAP — item (5) do Medir, respondido, mas a causa do não-disparo é outra: o
  > relógio do dispatcher de batch não bate com esse +2h nem com UTC puro, e não foi identificado).
  > Confirmar se o job periódico dispara de verdade exige esperar horas reais (fora do orçamento da
  > sessão) ou investigar o dispatcher (RZ10/SM61) — despriorizado por ora. Achado lateral:
  > `cancelarJob` sobre job em status `S` APAGA o job (confirmado 2x). Objetos `YJBV_JOB69_*`
  > apagados, ausência confirmada. Doc: `docs/receita-application-job.md § Job PERIÓDICO`.
  > Próximo passo: medir o disparo real (esperar ≥3h um job agendado) ou trocar de abordagem —
  > investigar o dispatcher antes de tentar de novo por tentativa e erro.
  > **2026-09-02 (2ª sessão, decisão do Joris: investigar o dispatcher em vez de esperar): achada a
  > causa provável, sem driver nenhum — só leitura por SOAP RFC (`TH_GET_PARAMETER`, `readTable`
  > TBTCO/TBTCS/BTCOMSET/BTCOMSDL).** Nos últimos 4 dias corridos (29/30/31-08, 02-09) **100% dos
  > jobs disparados caem entre 00h00 e 01h30** — zero fora dessa janela, inclusive hoje (200 jobs,
  > todos `STRTTIME` 000022–002926, nada depois até as 08h50 da medição). Não é falta de work
  > process (`rdisp/wp_no_btc = 6`, lido ÀS 08h50, fora da janela) nem RZ04/operation mode
  > (`BTCOMSET`/`BTCOMSDL` vazias — sistema não usa troca de modo nativa). `TH_WPINFO`/
  > `TH_SERVER_LIST` não servem de assert por SOAP RFC (resposta sempre vazia, sem Fault — o canal
  > não serializa essas tabelas de shared-memory, não é "zero processos"). **Achado, não fechado**:
  > a bancada moovi (s4h) parece só processar o dispatcher de batch numa janela de madrugada — causa
  > exata (script de infra externo?) não identificável por ABAP puro. Teste natural pendente:
  > `/1LT/IUC_HEALTH_C` (JOBCOUNT `05122900`) está agendado para HOJE `10:22:26`; reconferir status
  > na TBTCO depois das 10h30 confirma ou derruba a janela fixa. Detalhe em
  > `docs/receita-application-job.md § Causa investigada`.
  > **Fechado com comparação cross-sistema, a pedido do Joris** ("dá pra medir isso no SXD?"): sondado
  > o SXD (dentro da janela 09h–20h) e repetida a MESMA leitura (`readTable` TBTCO, sem driver) —
  > resultado OPOSTO: jobs distribuídos o dia inteiro (`08h`–`19h`, inclusive hoje às `09h`, medido em
  > tempo real), `rdisp/wp_no_btc = 18` (vs `6` no s4h). **Isola a causa**: a janela de madrugada não é
  > política geral de appliance de treinamento nem do tipo de sistema — é peculiaridade só da bancada
  > s4h (moovi); o SXD despacha `timestamp` normalmente. Mecanismo exato (script de infra do provedor,
  > provável) não identificável por ABAP puro — RZ04 descartado nos dois sistemas.
- [x] 70. Inventário de jobs de aplicação de um sistema de cliente, só leitura (I73) — medido
  2026-09-02, S4H 758, mandante 250. `scripts/inventario-jobs.mjs` (novo, no molde do
  `cobertura-tadir.mjs`) responde "o que está agendado, por quem, com que parâmetros e quando rodou
  pela última vez" inteiro por `dataPreview` (sem classrun, sem driver), sobre quatro tabelas:
  catálogo `APJ_W_JCE_ROOT` (910, todas tipo `A`), templates de repositório `APJ_W_JT_ROOT` (924 —
  920 `SAP`, 4 custom), templates de MANDANTE criados por usuário via Fiori `APJ_X_JT_ROOT` (1) e
  execuções `APJ_D_JOB_EXE` (16). Três achados: (1) **apagar catálogo/template não apaga o histórico
  de execução** — as 12 linhas da POC do item 47 (`YJBV_POC_JOBC`, apagada há mais de 24h) seguem na
  `APJ_D_JOB_EXE`, que é log durável e independente; (2) **`dataPreview` não aceita alias de tabela
  nem JOIN neste sistema**, e o erro ("Só é permitida uma instrução SELECT") não distingue isso de SQL
  genuinamente inválido — isolado por contraprova (`SELECT e.col FROM tab AS e` sem JOIN já falha); o
  cruzamento com TBTCO saiu por um SELECT por execução; (3) **sequência de `dataPreview` pode devolver
  500 "Application Server Error"** (HTML do ICM, sem exceção ADT) depois de ~14 chamadas seguidas —
  reproduzido no MESMO índice em duas sessões novas, contornado com retry único. Confirmado o
  "Provaria": `TBTCO` sozinha SUBESTIMA "última vez que rodou" (3 das 4 execuções reais de cliente já
  não tinham mais linha lá; só a `APJ_D_JOB_EXE` as tinha). 646/646 testes (nenhum novo — script de
  leitura). Doc: `docs/receita-application-job.md § Inventário de jobs de aplicação, só leitura`.
- [x] 71. Leitura do CTS por SOAP puro — `TR_EXT_GET_REQUESTS` / `TR_READ_COMM` (I65) — medido
  2026-09-02, S4H 758, mandante 250, SÓ LEITURA (nada criado, zero sessão órfã; ADT aberto só para
  o comparativo e encerrado). Os dois FMs são `FMODE='R'` e cobrem a leitura inteira sem sessão:
  `lerRequestPorRfc` (`TR_READ_COMM` — E070+E07T+E070C+E071+E071K+**E070A** numa chamada; tarefas
  pela E070.STRKORR e consolidado como a via tabelas) e `listarRequestsPorRfc`
  (`TR_EXT_GET_REQUESTS`). E2E 48/48 nas três TRs pedidas (modificável, liberada, com chaves):
  cabeçalho idêntico ao `parseRequest` nos 8 campos comparáveis, consolidado idêntico à via
  tabelas (1×1, 3×3, 51×51), TABKEY inteiro com `fatiarChaves` por cima. A hipótese confirmou
  (`wbtype`/`obj_info`/`status_text` somem — enriquecimento do ADT), por isso virou VIA PRÓPRIA e
  não troca silenciosa do `lerRequest`. Três achados além do pedido: (1) **com status `'R'` a via
  RFC é a ÚNICA listagem de TR LIBERADA da lib** (123 no s4h; a árvore ADT com `requestStatus=R`
  devolve vazio — item 24); (2) **gotcha do canal SOAP, contra-prova dupla: parâmetro TABLES fora
  do ENVELOPE não volta** — 0 linhas SEM ERRO (`ET_REQUESTS` 0→9 com a tag; `ET_E070A` idem com o
  SAPCORR da 912799) — toda chamada da lib manda as tabelas vazias; (3) **bug latente do canal
  corrigido: o ICF escapa entidade XML nos valores** (`&`→`&#38;`) e `xmlField`/`xmlItems`/
  `xmlStruct` nunca desescapavam — alcançava o `readTable` desde sempre. De brinde: a árvore ADT
  não é "ordens do autor" (inclui ordens alheias com tarefa minha) — `comTarefasDoAutor: true`
  (`IV_ALL_REQ_AND_ALL_OWN_TASK`) reproduz a árvore exata (10×10), e a variante `WITH_OWN_TASK`
  perde ordens (8 de 10, fora da lib). `IV_REQ_STATUS` não é TRSTATUS (`NA 'ACR'`; 'D' →
  CALL_FUNCTION_ERROR — guard-rail antes da rede); `WI_DIALOG` vai `' '`; TR inexistente → Fault
  `NOT_EXIST_E070` limpo; `ET_E071KF` veio vazio (o fatiado segue sendo da lib). 650/650 testes
  (4 novos). Docs: `receita-change-request.md § Leitura por SOAP puro`, `canal-soap-rfc.md`
  (os dois gotchas do canal).
- [x] 72. A OUTRA API REST do CTS — o endpoint HTTP de `if_cts_rest_api` (I63) — medido 2026-09-02,
  S4H 758, mandante 250, POC 10/10 + E2E 11/11, todas as TRs de POC apagadas por `apagarRequestPorRfc`
  (ausência confirmada), zero sessão órfã. A hipótese confirmou por um caminho que a ideia não previa:
  `if_cts_rest_api` NÃO tem handler ICF próprio (a busca em ICFHANDLER só acha o gCTS `cts_abapvcs` e o
  `cts_tmsconf`) — quem a consome é a família `CL_CTS_ADT_TM_*` do PRÓPRIO ADT: o
  `CL_CTS_ADT_TM_RES_COLL_CONT->post` do `POST /sap/bc/adt/cts/transportrequests` (o endpoint que a lib
  usa desde o item 24) deserializa `<tm:task tm:owner>` pela ST `ST_CTS_ADT_TM_MAIN` e passa os owners
  como `it_users` ao `create_request` → `TR_INSERT_REQUEST_WITH_TASKS`. Ou seja: **o endpoint sempre
  aceitou tarefas; a lib é que não mandava o pedaço do XML.** `criarRequest` ganhou `usuarios` e
  `criarRequestComTarefas` roteia: caso comum por HTTP sem driver (`via:'http'`); dono alheio, atributos
  ou simulação seguem no driver (`via:'driver'`). Limites medidos com contra-prova: `tm:attributes` no
  corpo é IGNORADO no create (E070A vazia), o dono é sempre o usuário logado, owner duplicado deduplica
  (1 tarefa), owner inexistente é 400 limpo SEM criar nada (o `validate` do handler fecha o buraco da
  ordem órfã que o FM cru do item 39 deixava — por isso a rota HTTP dispensa `assertUsuarios`). A
  resposta do 201 não traz as tarefas (elas existem na E070 na mesma hora; a lib as lê de volta).
  651/651 testes. Achado → **I94** (release de TR pelo `tm:useraction` do mesmo handler). Docs:
  `receita-change-request.md § Criar TR COM tarefas por HTTP`.
- [x] 73. Achar o handler HTTP real de `/sap/bc/fp/graphics/bmap/<btype>/<nome>` (I86) — medido
  2026-09-02, S4H 758:250, POC + E2E 10/10, zero órfã, objetos `YJBV_*` de POC apagados (BDS e MIME),
  ausência confirmada. **A via EXISTE — o veredito do item 65 caiu.** A árvore SICF decomposta por
  `readTable` (ICFSERVICE/ICFHANDLER): quem atende é o nó `/sap/bc/fp`, handler `02
  CL_HTTP_EXT_WEBDAV_SKWF` (o WebDAV do KPro), que lê o **MIME Repository** (`IF_MR_API`), **não o
  BDS**. O 404 do item 65 tinha DUAS causas somadas, as duas por contra-prova: (1) o MIME estava
  vazio — o gráfico do SE78 vive no BDS, e a URL só resolve depois de COPIá-lo para o MIME (o que o
  report `RSXFT_MIGRATE_BDS_GRAPHICS` faz por `MIGRATE_GRAPHIC_BDS_TO_MIME`); (2) **o 404 é cacheado
  ~24h no servidor** (`sap-cache-control: +86400`), então cada sonda do item 65 à mesma URL reforçava
  o cache — leitura NEGATIVA é cacheada, POSITIVA é ao vivo. Isso desmente os dois "achados" do 65:
  não é caixa (num nome FRESCO minúsculo e MAIÚSCULO resolvem igual) nem ADS (o 65 já descartara pelo
  SXD); responde até anônima. `forms.mjs` ganhou `publicarGraficoHttp`/`despublicarGraficoHttp`/
  `urlGraficoHttp` (BDS→MIME por driver, a URL que o XFA migrado referencia passa a resolver —
  alimenta o item 43). 653/653 testes (2 novos). Docs: `receita-forms.md § Gráfico por URL HTTP`.
- [x] 74. Liberar TR pelo ADT — o `tm:useraction` de release (I94) — medido 2026-09-02, S4H 758,
  mandante 250, E2E 12/12 pela lib, zero órfã. **`liberarRequest` está no `cts.mjs`** — o ciclo da TR
  fecha inteiro sem GUI (criar → objeto → liberar → visto na listagem RFC 'R' da fila 71). A ação real
  é `POST …/<nr>/newreleasejobs` SEM corpo (`CL_CTS_ADT_TM_REST_RES_CONT->do_release`, lido no fonte);
  `releasejobs` sem "new" é LEGADO e não libera (devolve a URI da tela GUI). Cinco armadilhas medidas,
  cada uma com contra-prova: **HTTP 200 sempre** (sucesso, inexistente, já liberada, tarefa vazia —
  o veredito é o `chkrun:checkReport`: `released` × `abortrel*` + msg E); liberação **assíncrona**
  ("foi INICIADA", E070 passa por 'O' → poll); **`release_simulation=true` NÃO simula — LIBERA**
  (abap_bool só aceita 'X'), e na simulação de verdade **o corpo mente** (`released` + timestamp
  iguais ao real; só a E070 'D' prova que era dry-run); **o SAP não recusou dono alheio** (liberou a
  ordem de ME00083 — guard-rail de dono é da lib, não do servidor); tarefa vazia não se libera
  (TK 494) mas a ordem a APAGA ao liberar (paridade SE09), e a ordem consolida E071 + CORR RELE
  (lock '3'). Liberada é PERMANENTE (`CTS_WBO_DELETE_REQUEST` → INVALID_REQUEST) — por isso confirm
  obrigatório. Achado → **I95** (o resto do vocabulário do dispatcher: `moveobjects`, `tasks`,
  `reassigntask`, `mergerequests`…). Ficam no s4h, de propósito e nomeadas POC74: S4HK912853/55/59/61
  (+tarefa 912862), 912863 (a alheia do desmentido) e 912871. 657/657 testes. Docs:
  `receita-change-request.md § Liberar TR pelo ADT`.
- [x] 75. Inserir objeto na TR sem deploy — `TR_EXT_INSERT_IN_REQUEST`, FMODE='R' (I64) — medido
  2026-09-02, S4H 758, mandante 250, POC + E2E 10/10 pela lib, zero órfã, tudo apagado com ausência
  confirmada (TDEVC/TRDIR/TADIR/E070 = 0). **`inserirObjetosNaRequest` está no `cts.mjs`** — SOAP
  puro, sem sessão ADT: a TR de entrega se monta a partir de LISTA e fecha o pipeline do 74
  (montar + liberar; a montada por lista passou na simulação de release). A hipótese central da
  I64 caiu com contra-prova: **o FM NÃO trava o objeto** (`LOCKFLAG` fica VAZIO; quem trava é o
  deploy com `corrNr`) — o mesmo objeto entrou em DUAS ordens sem colisão, e o "risco sobre
  terceiros" é menor que o previsto. A entrada cai na **E071 da ORDEM** (`iv_append_at_order='X'`
  no fonte), sem criar tarefa. Medido com contra-prova: duplicado deduplica em SILÊNCIO (1 linha),
  objeto sem TADIR é recusado limpo ("requires a directory entry"), tarefa e tipo fora de K/T/W
  recusados (TR 054), liberada recusada, e **dono alheio o FM ACEITA** (`iv_no_owner_check='X'`,
  só actionlog) — a recusa de ordem alheia é da lib (mesmo guard do liberar), e só objeto Z/Y
  passa (o guard-rail que o item previa). O erro do FM vem ESTRUTURADO em HTTP 200
  (`EV_EXCEPTION`+`ES_MSG`), não como Fault. 658/658 testes (5 novos). Docs:
  `receita-change-request.md § Inserir objeto na ordem por RFC`.
- [x] 76. O resto do vocabulário de `useraction` do CTS ADT (I95) — medido 2026-09-02, S4H 758,
  mandante 250 (POC em 4 fases + E2E 14/14 pela lib, zero órfã, TRs de POC apagadas com ausência
  confirmada — inclusive a que o merge apagou sozinho e a que ficou de outro dono e voltou). SETE
  funções novas no `cts.mjs`: `criarTarefa`, `moverObjetos`, `reatribuirTarefa`, `trocarDonoRequest`,
  `fundirRequests`, `compactarRequest`, `verificarConsistencia`. O desmentido central: **três nomes de
  ação da hipótese estavam errados** — os valores reais moram em `IF_CTS_ADT_TM_CONSTANTS` (`reassign`,
  `merge`, `lockobject`; o chute "reassigntask" custou 400 "Benutzeraktion … nicht unterstützt") — e o
  contrato do corpo é a ST `ST_CTS_ADT_TM_MAIN` (`@tm:targetuser`, `@tm:number`, `<tm:abap_object>` em
  `<tm:request>`). Medido com contrafactual: `tasks` cria N tarefas do MESMO usuário (zero dedup, o
  contrário do create); `moveobjects` é só ORDEM→ORDEM ("mesmo tipo" recusa tarefa) e recusa objeto
  ausente; `reassign` muda o STRKORR da tarefa com as entradas dentro; `merge` APAGA a origem da E070
  (fica entrada-marca no destino, irmã do CORR RELE); `changeowner` é PUT com segmento obrigatório e o
  servidor NÃO recusa TR alheia (guard da lib, como no release); `consistencychecks` flagra de verdade
  (objeto travado noutra TR). Ao contrário do release, erro aqui é 400 limpo com mensagem legível.
  662/662 testes (4 novos). Sobras sem medir → I96 (`lockobject`, `preparerelease`, resumes). Docs:
  `receita-change-request.md § As demais useractions do dispatcher`.
- [x] 77. O fim do dispatcher do CTS: `lockobject`, `preparerelease` e os resumes de release (I96) —
  medido 2026-09-02, S4H 758, mandante 250 (POC em 4 fases + E2E 12/12 pela lib, zero órfã, tudo
  apagado com ausência confirmada). **A hipótese central da I96 caiu**: o lock do `lockobject` NÃO é
  o `E071.LOCKFLAG` (ficou vazio) — mora na **TLOCK**, e o servidor trava até objeto SEM entrada na
  E071 (lock "fantasma" que bloqueia o delete com 409 sem rastro; guard da lib). O ciclo
  release→interrupção→retomada fechou REAL (S4HK912911: objeto travado noutra TR não aborta — o
  chkrun responde `relwithignlock` como status + o `user_action` a reenviar; `retomarLiberacao`
  libera) e a SIMULAÇÃO vale para as duas pontas (dá para ensaiar sem liberar). `relObjigchkatc` é
  camelCase na URL (minúsculo → 400, contra-prova) e exige o `releasetimestamp` da interrupção (lock
  otimista: sem ele, status `relobjchkobs` "recomece"). `preparerelease` é o gancho do gCTS
  (pull_request_url; sem gCTS, 200 sem `tm:review`). DOIS fixes de lib no caminho: o unlock dos
  drivers agora roda também NA ordem (só por tarefa, a TLOCK de ordem sem tarefa ficava presa e o
  TR_DELETE_COMM recusava) e `liberarRequest` devolve `retomar`. Teardown mediu de brinde: TADIR de
  objeto que viajou em TR liberada é "distribuída" (TR 024) — a exclusão tem de VIAJAR (release da
  TR de deleção; a TADIR some após o export). Novas: `travarObjetosNaRequest`, `prepararRelease`,
  `retomarLiberacao`, `buildResumeBody`. 667/667 testes (5 novos). Achado → **I97** (o vocabulário
  do EDITOR de TR: outro handler). Ficam no s4h, nomeadas POC77: S4HK912911 e S4HK912912
  (liberadas, decisão consciente do item). Docs: `receita-change-request.md § O fim do dispatcher`.
- [x] 78. O vocabulário do EDITOR de TR — o outro handler do CTS ADT (I97) — medido 2026-09-02,
  S4H 758, mandante 250 (POC em 4 fases + E2E 19/19 pela lib; contrato lido no fonte antes de
  qualquer chamada). O "outro recurso" da hipótese é **outro handler no MESMO recurso**:
  `CL_CTS_ADT_RES_APP` registra `/cts/transportrequests/{trnumber}` para
  `CL_CTS_ADT_TM_RES_REQUEST_CONT` — e o **PUT no próprio recurso** roteia pelo `tm:useraction`
  do CORPO; useraction desconhecida (ou nenhuma) cai no `save()` do editor do Eclipse —
  **`editdesc` não é roteado: editar descrição É o save**. NOVE funções no `cts.mjs`:
  `editarRequest` (desc curta E a docu/long_desc, que nenhuma via escrevia), `trocarAlvoRequest`,
  `trocarProjetoRequest`, `mudarAtributoRequest` (modify com `TRINT_CHECK_ATTR_CHANGEABLE`),
  `protegerRequest` ('D'↔'L'), `mudarTipoTarefa` (TRFUNCTION, código de 1 letra),
  `removerObjetosDaRequest` — **a remoção de entrada que o item 24 deu como inexistente EXISTE**
  (desmentido na receita) — e `lerActionLog`/`lerTransportLog` (a SE03 sem GUI). Três armadilhas
  medidas com contra-prova: **o save grava o documento inteiro e APAGA o que o corpo não traz**
  (alvo e projeto — a lib lê e reenvia; é também a ÚNICA via de tirar o projeto),
  **`removeobject` é MUDO** (position errada/ausente = 200 sem efeito; a lib resolve a AS4POS e
  confere a E071) e **`addobject` não valida posse nem lock** (aceitou objeto SAP e travado
  noutra ordem — a via da lib segue `inserirObjetosNaRequest`, com guard Z/Y).
  `setstatusmodifiable` deu 400 em 'D' E em 'L' (caso de sucesso não isolado; não virou função);
  `objectkeys` deu 400 "I::000" → **I98**. 671/671 testes (5 novos). Docs:
  `receita-change-request.md § O editor de TR`. ⚠ O ADT stateful do s4h caiu DURANTE o teardown e
  expôs mais um silêncio: **DELETE de pacote respondeu ok sem efetivar** (→ **I99**); as TRs e o
  projeto saíram por SOAP+PUT stateless, mas o pacote `YJBV_POC78_PKG` (TDEVC/TADIR, sem TR)
  ficou no s4h esperando o stateful voltar — limpeza: `deleteObject` com corrNr de TR nova +
  `apagarRequestPorRfc` + `removerTadirOrfa` (script pronto: `poc78-limpeza3.mjs` desta sessão).
  > limpeza feita 2026-09-02 (45ª sessão): stateful de volta, o script rodou e confirmou —
  > TDEVC=0, TADIR=0 (a DELFLAG saiu por `removerTadirOrfa`), TRs S4HK912936/912937 apagadas,
  > zero órfã. Detalhe: a entrada de exclusão do pacote caiu numa TR aberta pelo SISTEMA
  > (912937), não na corrNr passada (912936) — o script previa e limpou as duas.
- [x] 79. O Object Key Editor do CTS ADT — `objectkeys` (I98) — medido 2026-09-02, S4H 758,
  mandante 250 (contrato lido no fonte ANTES de chamar; POC em 5 fases + E2E 13/13 pela lib, zero
  órfã, TRs S4HK912938–912945 apagadas com ausência confirmada). A hipótese fechou INTEIRA: o 400
  "I::000" do item 78 era só o GET sem `objName`+`objType` (e o objeto tem de ESTAR na lista da
  TR); com eles o GET devolve as chaves + o layout dos campos-chave servido pelo próprio CTS. A
  ESCRITA existe e está na lib: `gravarChavesNaRequest` (PUT, `lockHandle` VAZIO funciona; a
  entrada `R3TR TABU <tabela>` entra sozinha na lista), `verificarChavesNaRequest` (checkrun —
  ensaio sem gravar; tabela inexistente volta E limpa) e `montarTabkey`, o inverso PURO do
  `fatiarTabkey` — a metade que faltava do item 21 (CLNT do logon, NUMC com zeros, `'*'` curinga
  sozinho ou sufixo de prefixo, roundtrip testado nos layouts reais). Armadilhas medidas com
  contra-prova: corpo sem `tk:tables` = **200 MUDO que grava zero e APAGA as que existiam**
  (`fill_table_key_details` itera `obj_key_tables`); o PUT é DOCUMENTO por objeto (1 chave → só
  ela; zero → apaga tudo, daí `confirm:true`; as dos OUTROS objetos ficam — T005 sobreviveu ao PUT
  da TVARVC); objeto fora da lista = 400 limpo SEM varrer a E071; só TABU grava (whitelist
  `cl_ars_object_check` — TVARVC/T005 passam); "system objects" (T000, T100, TRDIR…) o
  `TR_EXT_INSERT_IN_REQUEST` recusa limpo, e o insert em LOTE é tudo-ou-nada (um recusado derruba
  todos — custou a rodada 2c da POC). Chave string (E071K_STR) ficou de fora → **I100**. 677/677
  testes (6 novos). Docs: `receita-change-request.md § O Object Key Editor`.
- [x] 80. `deleteObject` confere ausência — o DELETE que respondeu ok sem apagar (I99) — medido
  2026-09-02, S4H 758, mandante 250 (POC em 3 fases + E2E 7/7 pela lib, `YJBV_POC80_*` em `$TMP` e
  `YJBV_POC80T` transportável, tudo apagado com ausência confirmada, zero órfã). A "resposta ok
  mentirosa" foi reproduzida contra um ICM de mentira SEM derrubar o s4h, e tinha DUAS mentiras: o
  GET inicial com o stateful caído devolve 400 e a lib lia como "não existe" → retorno
  `{deleted:false, status:404}` com **status FORJADO e sem nunca mandar o DELETE**; e o DELETE
  200-mudo passava sem conferência. Fix: só 404 explícito é "não existe" (outro status lança antes
  de escrever), e pós-DELETE a ausência é conferida por **GET stateless** (sobrevive ao stateful
  caído): 404 = `verificado:true`, 200 = lança "AINDA EXISTE". Custo medido: 52–66 ms/delete. O
  caso transportável NÃO dá falso alarme (pacote com `corrNr`, TADIR `DELFLAG='X'` pendente → GET
  404 mesmo assim). Testes novos contra ICM local em `adt-client.test.mjs` (5). 682/682. Docs:
  `receita-ciclo-escrita-verificacao.md § O DELETE também se prova` + nota fechada na
  `receita-change-request.md`.
- [x] 81. Chave STRING no objectkeys — E071K_STR, `isStringTable=true` (I100) — medido 2026-09-02,
  S4H 758, mandante 250 (contrato lido em QUATRO fontes antes de chamar: handler, ST,
  TR_NAMETAB_GET, TR_CONVERT_STRING_TO_FIELDS; POC em 4 rodadas + E2E 13/13 pela lib, zero órfã,
  TRs S4HK912948–912954 apagadas com ausência confirmada). O editor do item 79 FECHOU: o critério
  de "tabela string" é campo-CHAVE `DATATYPE='SSTR'` (não o comprimento — a hipótese da I100
  "chave que não cabe em 120" era parte da história); o TABKEY string é concatenação SEM largura
  fixa e o `tk:length` leva o KEY_LENS (números de 5 dígitos, um por campo, teto 3000); chave
  string mora SÓ na E071K_STR (que estava VAZIA no s4h — as da POC foram as primeiras). Na lib:
  `ehTabelaString`/`montarTabkeyString` (puros) e `gravarChavesNaRequest`/
  `verificarChavesNaRequest` detectam pelo layout e montam sozinhas — assert na E071K_STR por
  dataPreview (TABKEY/KEY_LENS são string; RFC_READ_TABLE não lê). Três armadilhas com
  contra-prova: PUT sem `tk:length` = 400 ENGANOSO (TK318 "não estão definidos campos-chave");
  **valor > LENG do dicionário = 500 SEM dump que DERRUBA a sessão de segurança ADT** ("Session
  Timed Out" nas chamadas seguintes — guard da lib antes da rede); insert TABU de tabela classe A
  recusado genérico em TR W, aceito em TR K (2 tabelas, 2 direções). Curinga `*` vale (conta no
  comprimento; campo inteiro = `*` com lens 00001, medido por checkrun). 687/687 testes (5
  novos). Docs: `receita-change-request.md § O ramo STRING`.
