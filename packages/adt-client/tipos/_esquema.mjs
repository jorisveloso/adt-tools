// tipos/_esquema.mjs — o ESQUEMA ÚNICO do módulo de tipo. PURO.
//
// Todo `tipos/<libKey>.mjs` exporta (default) um objeto com estes campos. É daqui que saem:
//   • a validação no carregamento (`validarModulo`, em _registro.mjs) — a "interface" em runtime;
//   • o `@typedef ModuloDeTipo` abaixo — a mesma interface para o editor (autocompletar, `@ts-check`);
//   • as colunas do catálogo (`docs/tipos.md`, gerado por scripts/catalogo.mjs);
//   • a seção "como adicionar um tipo" do catálogo.
// Um campo novo entra aqui e aparece nos quatro lugares de uma vez.
//
// Vocabulário (CONTEXT.md): `libKey` é a identidade do módulo (= nome do arquivo); o código TADIR
// (`codigo`) e o `adtType` são campos. Um código TADIR pode ter mais de um módulo (TABL → table e
// structure; PROG → prog e include; FUGR → functionGroup e functionModule).

export const FORMAS = Object.freeze({
  source: 'create shell → lock → PUT /source/main → unlock → activate (deploySource genérico)',
  xml:    'a definição É o body: create(body) se faltar → lock → PUT(body) SEMPRE → unlock → activate (deployBody genérico)',
  custom: 'fluxo próprio no gancho `deploy(ctx, conexao, opts)`, montado só com primitivas do ctx',
  json:   'família "blue"/AFF (I56): create shell (createBody) → lock → PUT /source/main em application/json SEMPRE → unlock → ativa conforme `ativacaoJson` (deployJson genérico). O content-type do PUT é o único ponto que se repetiu nos três tipos medidos (APLO/NROB/SAJC) — a ativação NÃO: cada um mede a própria.',
});

// Gancho que cada forma EXIGE (além dos campos obrigatórios).
export const GANCHO_DA_FORMA = Object.freeze({ source: 'createBody', xml: 'body', custom: 'deploy', json: 'body' });

// Canais do arsenal que agem sobre um objeto (matriz da skill sap-testes).
export const CANAIS = Object.freeze(['adt', 'classrun', 'soapRfc', 'odata', 'wdi5', 'aunit']);
// Canal pelo qual um teste do tipo é executado / verificado.
export const CANAIS_DE_TESTE = Object.freeze(['aunit', 'classrun', 'soapRfc', 'odata', 'wdi5', 'readTable']);

// Erros que valem para QUALQUER tipo (medidos; skill adt-objetos § gotchas transversais). A lib anexa
// a dica ao erro na hora da falha (`dicaDeErro`), depois dos `erros` do próprio tipo.
export const ERROS_TRANSVERSAIS = Object.freeze([
  { status: 404, causa: 'o recurso não existe', correcao: 'conferir path/nome; 404 ≠ 406 — não procure objeto que está lá' },
  { status: 406, causa: 'o recurso existe, o Accept está errado', correcao: 'usar o accept do módulo (ou application/*); ler 406 como 404 é o erro clássico' },
  { status: 415, causa: 'o recurso existe, o Content-Type está errado', correcao: 'usar o ct do módulo — media type vem do /sap/bc/adt/discovery, não de memória' },
  { status: 405, causa: 'o recurso existe, o método está errado', correcao: 'trocar o método (ex.: cobertura é POST; GET dá 405 e parece inacessível)' },
  { status: 428, causa: 'o recurso exige requisição condicional', correcao: 'mandar If-Match (etag)' },
  { status: 400, contem: 'descri', causa: 'adtcore:description acima de 60 caracteres ("Descrição demasiado longa" / "description")', correcao: 'encurtar a descrição (vale para todo tipo) — medido 2026-08-28 S4H 758' },
  { status: 403, contem: 'EU510', causa: 'lock órfão — sessão stateful que morreu sem unlock, ou ENQUEUE preso de um create', correcao: 'esperar o timeout, SM12, ou liberar por classrun (classrun.liberarLocks: ENQUEUE_READ + ENQUE_DELETE locais)' },
  { status: 403, contem: 'já está processando', causa: 'ENQUEUE preso no nome: create do mesmo nome logo após um delete (ou create/PUT que morreu antes do unlock)', correcao: 'classrun.liberarLocks(conexao, "<prefixo>") — medido 2026-08-28 S4H 758: delete → create do mesmo nome dá 403 em CDS, MSAG, SRVD, PROG/INC; 9 ENQUEUEs (TRDIR, T100, RSDEO, WBS_ENQUEUE_STRU) liberados com subrc=0' },
  { status: 403, contem: 'currently editing', causa: 'o objeto está travado por outra sessão', correcao: 'unlock no finally do fluxo anterior; para MSAG, create em sessão stateless' },
  { status: 500, contem: 'já está bloqueado na ordem', causa: 'lock CTS: o objeto está em tarefa de TR aberta (status D) e não aceita outra TR', correcao: 'usar como corrNr a TR onde o objeto já está, ou liberar a TR antiga (decisão humana)' },
  { contem: 'activationExecuted="false"', causa: 'ativação no-op: a URI referenciada não é a que tem a versão inativa (pai em vez de include/FM)', correcao: 'ativar a URI de quem recebeu o PUT (include, FM), ou o par na mesma requisição' },
  { status: 400, contem: 'Service nicht erreichbar', causa: 'a SESSÃO nasceu morta — não o nó. Passado o teto de sessões HTTP do MESMO usuário (~150 medidas no s4h 758 em 04/09/2026: 144 passavam, 154 não), o logon responde 200 com token mas o cookie vem SEM SAP_SESSIONID, e aí QUALQUER requisição com esse cookie dá este 400 — inclusive /sap/public/ping', correcao: 'testar a MESMA URL só com Basic, sem cookie: se responder 200, é sessão e não SICF. Fechar depois NÃO cura (no estado doente o próprio logoff dá 400 e a sessão fica) — resta esperar http/security_session_timeout (1800s). Prevenir: logoff em toda sessão aberta; contar por SOAP RFC TH_USER_LIST com USRLIST: []' },
  { status: 400, causa: 'a exceção do 400 pode apontar para o lugar errado (ex.: ExceptionResourceAlreadyExists = erro de sintaxe no fonte)', correcao: 'ler o corpo inteiro da resposta, não o tipo da exceção' },
]);

// Crenças que PARECEM certas e foram desmentidas por medição, valendo para todo tipo. Folclore se
// regenera sozinho — por isso o desmentido fica registrado com a data em que foi medido.
export const DESMENTIDOS_TRANSVERSAIS = Object.freeze([
  {
    crenca: '`activate` exige sessão NOVA, senão "currently editing"',
    fato: 'a mesma sessão cacheada (só cookie, sem senha) ativa: HTTP 200, activationExecuted="true", version active. O que morde é o LOCK — o unlock no finally já resolve. Exceção conhecida: o create de MSAG.',
    medido: { data: '2026-08-05', sistema: 'DEV' },
  },
  {
    crenca: '`adtcore:masterLanguage` no XML define o idioma master do objeto',
    fato: 'o atributo é ignorado; quem decide é o `sap-language` da requisição do token. Sem informar, cai no default do sistema (normalmente EN) e o objeto nasce master EN com texto em português — e não muda por PUT (conserto manual, SE03). Já contaminou 29 objetos de uma vez.',
    medido: { data: null, sistema: 'DEV' },
  },
]);

// tipo: 'string' | 'boolean' | 'array' | 'object' | 'function'
export const ESQUEMA = Object.freeze({
  // ---- identidade ----
  libKey:     { obrigatorio: true,  tipo: 'string',  doc: 'Identidade do módulo; igual ao nome do arquivo (sem .mjs); chave de TYPES.' },
  codigo:     { obrigatorio: true,  tipo: 'string',  doc: 'Código TADIR de 4 letras maiúsculas (TABL, CLAS…) — o mesmo da SE09 e da pasta no checkout.' },
  adtType:    { obrigatorio: true,  tipo: 'string',  doc: 'Tipo ADT com subtipo (TABL/DT). Único entre os módulos; é o que o RIS devolve e o shell de create declara.' },
  descricao:  { obrigatorio: true,  tipo: 'string',  doc: 'Nome curto, minúsculo ("tabela").' },
  sinonimos:  { obrigatorio: true,  tipo: 'array',   doc: 'Entradas de usuário que resolvem SÓ para este módulo ("tabela", "tab"). O libKey normalizado entra sozinho. Plural com "s" é automático.' },
  sinonimosDoCodigo: { obrigatorio: false, tipo: 'array', doc: 'Entradas que resolvem para TODOS os módulos do mesmo código TADIR ("programa" → prog + include). O código normalizado entra sozinho.' },
  // ---- ADT ----
  coll:       { obrigatorio: true,  tipo: 'string',  doc: 'Coleção ADT (/sap/bc/adt/…), como aparece no /sap/bc/adt/discovery. Para tipo aninhado, a coleção do contêiner.' },
  ct:         { obrigatorio: true,  tipo: 'string',  doc: 'Content-Type do create.' },
  accept:     { obrigatorio: false, tipo: 'string',  doc: 'Accept do GET, só quando difere do ct (INTF exige v5/application/*; MSAG só application/*).' },
  source:     { obrigatorio: true,  tipo: 'boolean', doc: 'Tem /source/main (o checkout baixa fonte). Semântica do TYPES antigo, mantida para o CLI.' },
  forma:      { obrigatorio: true,  tipo: 'string',  doc: `Como a lib despacha o deploy: ${Object.keys(FORMAS).join(' | ')}.` },
  ativacaoJson: { obrigatorio: false, tipo: 'string', doc: `Só para forma 'json': 'nenhuma' (nasce ativo, o PUT já persiste — APLO) | 'mesmaSessao' (activate normal — NROB) | 'sessaoNova' (activate na sessão que fez o PUT falha — SAJC). Medido por tipo (I56): NÃO é decorável a partir da família.` },
  container:  { obrigatorio: false, tipo: 'object',  doc: '{ libKey, param } — tipo aninhado dentro de outro (FM dentro do FUGR). Exige o gancho `path`; sai de todasAsLibKeys().' },
  zyPeloContainer: { obrigatorio: false, tipo: 'boolean', doc: 'O nome do objeto é IMPOSTO pelo SAP a partir do contêiner (include de FUGR: L<GRUPO><SUFIXO>) e não começa com Z/Y. Com isto, o guard-rail transversal Z/Y roda sobre o CONTÊINER (opts[container.param]), não sobre o name — o dono do namespace é ele. Exige `container`.' },
  nomeacao:   { obrigatorio: false, tipo: 'object',  doc: '{ max, fonte, prefixo? } — tamanho máximo do nome (com namespace). `deploy` recusa antes da rede. `fonte` diz se foi medido ou vem de documentação. `prefixo` é uma letra que o SAP IMPÕE ao nome (lock object: E) — o guard-rail Z/Y roda sobre o que vem DEPOIS dele (EY…/EZ… é nosso).' },
  // ---- conhecimento medido ----
  oQueFaz:    { obrigatorio: true,  tipo: 'string',  doc: '1-3 frases: o que o objeto é no SAP e para que a lib o usa.' },
  comoTrata:  { obrigatorio: true,  tipo: 'string',  doc: '1-3 frases: o fluxo em palavras, com os desvios que custaram spike.' },
  spike:      { obrigatorio: true,  tipo: 'object',  doc: '{ data: "YYYY-MM-DD"|null, sistema, release?, revalidacoes?: [{data, sistema, release?}] } — quando e onde o CREATE/ACTIVATE foi provado. Não inventar: data null = validado sem data registrada.' },
  releases:   { obrigatorio: true,  tipo: 'object',  doc: '{ medidos: ["758","816"], minimo?: "750" } — releases SAP onde foi medido (têm de constar em spike/revalidacoes); minimo só quando documentado.' },
  guardRails: { obrigatorio: true,  tipo: 'array',   doc: 'O que este tipo exige ALÉM dos transversais (só Z/Y, unlock em finally, activate depois do unlock). Pode ser [].' },
  canais:     { obrigatorio: true,  tipo: 'array',   doc: `Canais do arsenal que agem sobre o objeto: ${CANAIS.join(' | ')}. Liga o tipo à matriz da skill sap-testes.` },
  origem:     { obrigatorio: true,  tipo: 'array',   doc: 'De onde a receita veio: docs/receita-*.md, seção da skill, commit. Para quem for conferir a fonte.' },
  dependencias: { obrigatorio: true, tipo: 'array',  doc: '[{ tipo, papel, ativarJunto }] — o que precisa existir (ou ativar na MESMA requisição) para este objeto ativar. Pode ser [].' },
  exemplo:    { obrigatorio: true,  tipo: 'object',  doc: '{ opts, nota? } — as opções REAIS de um `deploy(conexao, libKey, opts)` (nome $TMP do spike). O teste do tipo roda a parte pura (validar, createBody/body/path) sobre ele; o catálogo o imprime.' },
  testes:     { obrigatorio: true,  tipo: 'array',   doc: `[{ canal, descricao, abap?, assert, medido: [{data, sistema, release?}] }] — como PROVAR no lado ABAP que o objeto funciona: canal (${CANAIS_DE_TESTE.join(' | ')}), o driver/teste em ABAP quando houver, e o assert (readTable em outra LUW, saída do console, HTTP). medido vazio = escrito, ainda não provado.` },
  erros:      { obrigatorio: true,  tipo: 'array',   doc: '[{ status?, contem?, causa, correcao }] — falhas conhecidas DESTE tipo e o conserto. A lib anexa a dica ao erro na hora da falha; os transversais (406/415/EU510…) ficam em ERROS_TRANSVERSAIS.' },
  desmentidos: { obrigatorio: true, tipo: 'array',   doc: '[{ crenca, fato, medido: {data, sistema} }] — o que PARECE certo sobre este tipo e foi desmentido por medição. Sem medição não entra (seria folclore ao contrário). Os que valem para todo tipo ficam em DESMENTIDOS_TRANSVERSAIS. Regra: cada fato mora num campo só — guardRails diz o que fazer, erros diz como ler a falha, desmentidos diz o que não acreditar.' },
  // ---- ganchos (funções) ----
  prova:      { obrigatorio: true,  tipo: 'function', doc: '(name, extra?) → { tabela, campos, where, espera, medido } — como verificar por readTable (outra LUW) que o objeto existe/está ativo. Alimenta o script de re-validação e a skill sap-testes.' },
  validar:    { obrigatorio: false, tipo: 'function', doc: '(opts) → lança se as opções do deploy não servem. Roda depois de assertZY(name) e ANTES de qualquer rede.' },
  createBody: { obrigatorio: false, tipo: 'function', doc: '(name, pkg, description, extra?) → XML do shell de create. Obrigatório na forma source.' },
  body:       { obrigatorio: false, tipo: 'function', doc: '(name, pkg, description, def) → XML completo do objeto (a definição É o body) na forma xml, ou o fonte JSON (AFF) na forma json. Obrigatório nas duas.' },
  path:       { obrigatorio: false, tipo: 'function', doc: '(name, extra) → path ADT do objeto quando não é coll/<name> (tipo aninhado). Obrigatório com `container`.' },
  deploy:     { obrigatorio: false, tipo: 'function', doc: '(ctx, conexao, opts) → resultado. Obrigatório na forma custom. Só usa primitivas do ctx — nunca importa adt-client.mjs.' },
  antesDeApagar: { obrigatorio: false, tipo: 'function', doc: '(ctx, conexao, { name, …extra }) → o que tem de acontecer antes do DELETE (SRVB: unpublish). `deleteObject` chama.' },
});

export const CAMPOS = Object.freeze(Object.keys(ESQUEMA));
export const CAMPOS_OBRIGATORIOS = Object.freeze(CAMPOS.filter((c) => ESQUEMA[c].obrigatorio));

// ---------- a mesma interface, para o editor ----------
// Cada módulo anota `/** @type {import('./_esquema.mjs').ModuloDeTipo} */` no default export: o
// VS Code completa os campos e marca o que está fora do esquema, sem TypeScript nem build. A fonte
// continua sendo ESQUEMA (runtime); isto é a projeção dele para JSDoc — mantenha os dois juntos.

/**
 * @typedef {{ data: string|null, sistema: string, release?: string }} Medicao
 *
 * @typedef {object} Ctx  As primitivas que um `deploy` custom recebe (congeladas; ver adt-client.mjs).
 * @property {Function} call
 * @property {(session:any, type:string, name:string, extra?:object) => Promise<{exists:boolean,status:number,version?:string,description?:string,text?:string}>} getObject
 * @property {(session:any, type:string, name:string, o?:{pkg?:string,description?:string,corrNr?:string,body?:string,stateless?:boolean}) => Promise<any>} createShell
 * @property {(session:any, type:string, name:string, source:string, lockHandle:string, corrNr?:string) => Promise<any>} setSource
 * @property {(session:any, type:string, name:string, extra?:object) => Promise<string>} lock
 * @property {(session:any, type:string, name:string, h:string, extra?:object) => Promise<any>} unlock
 * @property {(session:any, path:string) => Promise<string>} lockPath
 * @property {(session:any, path:string, h:string) => Promise<any>} unlockPath
 * @property {(session:any, path:string, fn:(h:string)=>Promise<any>) => Promise<any>} withLockPath
 * @property {(conexao:any, type:string, name:string, extra?:object) => Promise<{ok:boolean,hasError:boolean,messages:Array<{type:string,text:string}>,status:number}>} activate
 * @property {(conexao:any, objects:Array<{type:string,name:string}>) => Promise<any>} activateMany
 * @property {(xml:string) => Array<{type:string,text:string}>} activationMessages
 * @property {(type:string, name:string, extra?:object) => string} objPath
 * @property {(name:string) => void} assertZY
 * @property {(conexao:any, type:string, opts:object) => Promise<any>} deploy
 * @property {(session:any) => Promise<{status:number|null, encerrada:boolean}>} encerrarSessao  logoff ICF — quem abre `conexao.sessaoNova()` num deploy custom encerra no finally
 * @property {string} LOCK_ACCEPT
 *
 * @typedef {object} ModuloDeTipo
 * @property {string} libKey            identidade; = nome do arquivo
 * @property {string} codigo            código TADIR (TABL)
 * @property {string} adtType           TABL/DT — único
 * @property {string} descricao
 * @property {string[]} sinonimos
 * @property {string[]} [sinonimosDoCodigo]
 * @property {string} coll
 * @property {string} ct
 * @property {string} [accept]
 * @property {boolean} source
 * @property {'source'|'xml'|'custom'|'json'} forma
 * @property {'nenhuma'|'mesmaSessao'|'sessaoNova'} [ativacaoJson]
 * @property {{ libKey: string, param: string }} [container]
 * @property {{ max: number, fonte: string, prefixo?: string }} [nomeacao]
 * @property {string} oQueFaz
 * @property {string} comoTrata
 * @property {{ data: string|null, sistema: string, release?: string, revalidacoes?: Medicao[] }} spike
 * @property {{ medidos: string[], minimo?: string }} releases
 * @property {string[]} guardRails
 * @property {Array<'adt'|'classrun'|'soapRfc'|'odata'|'wdi5'|'aunit'>} canais
 * @property {string[]} origem
 * @property {Array<{ tipo: string, papel: string, ativarJunto: boolean }>} dependencias
 * @property {{ opts: { name: string, [k: string]: any }, nota?: string }} exemplo
 * @property {Array<{ canal: 'aunit'|'classrun'|'soapRfc'|'odata'|'wdi5'|'readTable', descricao: string, abap?: string, assert: object|string, medido: Medicao[] }>} testes
 * @property {Array<{ status?: number, contem?: string, causa: string, correcao: string }>} erros
 * @property {Array<{ crenca: string, fato: string, medido: Medicao }>} desmentidos
 * @property {(name: string, extra?: object) => { tabela: string, campos: string[], where: string[], espera: string, medido: boolean }} prova
 * @property {(opts: object) => void} [validar]
 * @property {(name: string, pkg: string, description: string, extra?: object) => string} [createBody]
 * @property {(name: string, pkg: string, description: string, def?: object) => string} [body]
 * @property {(name: string, extra?: object) => string} [path]
 * @property {(ctx: Ctx, conexao: any, opts: object) => Promise<any>} [deploy]
 * @property {(ctx: Ctx, conexao: any, opts: { name: string }) => Promise<any>} [antesDeApagar]
 */
export {};
