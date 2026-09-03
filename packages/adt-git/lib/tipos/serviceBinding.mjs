// tipos/serviceBinding.mjs — SRVB/SVB, service binding RAP. Forma `custom` (config + ação de publish).
// (SPIKE 2026-07-27, POC validada no $TMP; binding read-only 2026-07-28; runtime URL medida 2026-08-05)
//
// NÃO é source-based: é config. Create: POST /businessservices/bindings, body <srvb:serviceBinding
// contract="C1"> com <srvb:services><srvb:content><srvb:serviceDefinition uri=.../srvd/sources/<srvd>
// type=SRVD/SRV/> + <srvb:binding type="ODATA" version="V4" category="0">. Depois activate.
// PUBLISH (ação separada): POST /businessservices/odatav4/publishjobs, Accept application/vnd.sap.as+xml,
// body objectReferences com uri `.../bindings/<name>?servicename=<name>&amp;serviceversion=0001` (escapar &!).
// UNPUBLISH (antes de deletar): POST /businessservices/odatav4/unpublishjobs (mesmo body).
// READ-ONLY = a SRVD expõe a interface view entity DIRETO (sem BDEF); `as projection on` é transacional e exigiria BO.
// category '1' = OData Web API (consumo externo/microserviço) · '0' = UI.
import { call } from '../sap-connection.mjs';
import { XML_PREF, pkgRef, esc } from './_xml.mjs';
import serviceDefinition from './serviceDefinition.mjs';

const COLL = '/sap/bc/adt/businessservices/bindings';
const CT = 'application/vnd.sap.adt.businessservices.servicebinding.v2+xml';

export function createBody(name, pkg, description, { srvd, category = '1', bindingType = 'ODATA', version = 'V4', contract = 'C1' } = {}) {
  const N = String(name).toUpperCase();
  return XML_PREF
    + `<srvb:serviceBinding srvb:contract="${contract}" adtcore:name="${N}" adtcore:type="SRVB/SVB" adtcore:description="${esc(description)}" xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings" xmlns:adtcore="http://www.sap.com/adt/core">`
    + pkgRef(pkg)
    + `<srvb:services srvb:name="${N}"><srvb:content srvb:version="0001" srvb:releaseState="NOT_RELEASED">`
    + `<srvb:serviceDefinition adtcore:uri="${serviceDefinition.coll}/${String(srvd).toLowerCase()}" adtcore:type="SRVD/SRV" adtcore:name="${String(srvd).toUpperCase()}"/>`
    + `<srvb:bindingTypeData><adtcore:content adtcore:encoding="base64"/></srvb:bindingTypeData>`
    + `</srvb:content></srvb:services>`
    + `<srvb:binding srvb:type="${bindingType}" srvb:version="${version}" srvb:category="${category}"><srvb:implementation adtcore:name="${N}"/></srvb:binding>`
    + `</srvb:serviceBinding>`;
}

// publish/unpublish são AÇÕES (jobs), não objetos: sem lock, sem activate; sucesso lido de <SEVERITY>.
async function job(conexao, acao, { name, version = 'V4' }) {
  const s = await conexao.sessao();
  const N = String(name).toUpperCase(), n = N.toLowerCase();
  const path = version === 'V4'
    ? `/sap/bc/adt/businessservices/odatav4/${acao}jobs`
    : `/sap/bc/adt/businessservices/odatav2/${acao}jobs`;
  const body = XML_PREF
    + `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">`
    + `<adtcore:objectReference adtcore:uri="${COLL}/${n}?servicename=${N}&amp;serviceversion=0001" adtcore:name="${N}"/>`
    + `</adtcore:objectReferences>`;
  const r = await call(s, { method: 'POST', path, accept: 'application/vnd.sap.as+xml', contentType: 'application/xml', body });
  const severity = (r.text.match(/<SEVERITY>([^<]*)/) || [])[1] || '';
  const short = (r.text.match(/<SHORT_TEXT>([^<]*)/) || [])[1] || '';
  return { status: r.status, ok: severity === 'OK', severity, message: short, text: r.text };
}

// Publish do binding (torna o serviço chamável). V4 → odatav4/publishjobs; Accept vnd.sap.as+xml; `&` escapado como &amp;.
export const publish = (conexao, opts) => job(conexao, 'publish', opts);

// UNPUBLISH — o inverso do publish, e PRÉ-REQUISITO para apagar o binding: um SRVB publicado não pode
// ser removido. Mesmo body e mesmo Accept do publish; só muda `publishjobs` → `unpublishjobs`.
export const unpublish = (conexao, opts) => job(conexao, 'unpublish', opts);

// Runtime URL do serviço OData V4 publicado. O SEGMENTO DO REPOSITÓRIO DEPENDE DA CATEGORIA do
// binding, e errar isso dá 403 "Serviço <srvd> repositório <X> não atribuído a grupo <binding>":
//   category '1' = Web API (A2X) → `srvd_a2x`   (SPIKE 2026-07-28, confirmado no sistema de dev)
//   category '0' = UI            → `srvd`       (MEDIDO no sistema de dev 2026-08-05: $metadata devolveu 200
//                                                com `srvd`; com `srvd_a2x` era 403)
// A versão anterior fixava `srvd_a2x` — veio de um spike onde a categoria era 1, e quebrava calada
// em qualquer binding de UI, que é justamente o caso de um app Fiori.
export const odataV4RuntimeUrl = (binding, srvd, { category = '1' } = {}) =>
  `/sap/opu/odata4/sap/${String(binding).toLowerCase()}/${String(category) === '0' ? 'srvd' : 'srvd_a2x'}/sap/${String(srvd).toLowerCase()}/0001/`;

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'serviceBinding', codigo: 'SRVB', adtType: 'SRVB/SVB',
  descricao: 'service binding',
  sinonimos: ['service binding', 'binding'],
  coll: COLL,
  ct: CT,
  source: false,
  forma: 'custom',
  oQueFaz: 'Service binding RAP (SRVB): liga uma service definition a um protocolo (OData V2/V4, UI ou Web API) e, publicado, vira o serviço chamável em /sap/opu/odata4/….',
  comoTrata: 'Objeto de CONFIG: POST do body (sem lock, sem source) se faltar → activate. Publicar é ação à parte (`publish`), lida em <SEVERITY>; `unpublish` é pré-requisito para deletar (deleteObject chama `antesDeApagar`). `odataV4RuntimeUrl` monta a URL de runtime pela categoria.',
  spike: { data: '2026-07-27', sistema: 'DEV', revalidacoes: [{ data: '2026-08-05', sistema: 'DEV' }, { data: '2026-08-26', sistema: 'S4H', release: '758' }, { data: '2026-08-28', sistema: 'S4H', release: '758' }] },
  releases: { medidos: ['758'] },
  guardRails: [
    'description é obrigatória (create dá 400 "Falta a descrição")',
    'activate ≠ publish: ativar cria o binding; publicar é POST em odatav4/publishjobs com Accept vnd.sap.as+xml e <SEVERITY>OK',
    'unpublish antes de deletar — SRVB publicado não pode ser removido',
    'categoria decide tudo: 0 = UI (app Fiori), 1 = Web API (consumo externo); binding UI consumido como API dumpa UNCAUGHT_EXCEPTION no service document',
    'runtime URL: use odataV4RuntimeUrl(binding, srvd, { category }) — o segmento depende da categoria (ver desmentidos)',
    'o CSRF do runtime OData é DO SERVIÇO (o do ADT não vale); o cookie rotaciona a cada resposta (ver desmentidos)',
  ],
  canais: ['adt', 'odata', 'wdi5'],
  origem: ['skill adt-objetos § SRVB/SVB — service binding + publish', 'skill adt-objetos § Consumir o OData V4 gerado', 'docs/receita-wdi5-fiori.md'],
  dependencias: [{ tipo: 'serviceDefinition', papel: 'a SRVD ligada (uri no body do create)', ativarJunto: false }],
  exemplo: {
    opts: { name: 'YJBV_POC_WDI5_B', pkg: '$TMP', description: 'POC binding OData V4 UI', srvd: 'YJBV_POC_WDI5_S', category: '0' },
    nota: 'Reconstituído do spike wdi5 (S4H 758, 2026-08-26): binding OData V4 categoria 0 (UI), publicado, servido pelo preview FE do ADT. Depois do deploy: publishServiceBinding; URL: odataV4RuntimeUrl(name, srvd, { category: "0" }).',
  },
  testes: [
    {
      canal: 'odata',
      descricao: 'depois de publish: GET <odataV4RuntimeUrl>/$metadata → 200 com a entidade; GET da entidade com $top → linhas. Sessão do runtime: cookie rotaciona a cada resposta, CSRF do serviço',
      assert: { http: '$metadata 200 + EntitySet; entidade ?$top=3 → 3 linhas', espera: 'serviço publicado e respondendo (2026-08-28: deployMany SRVD+SRVB → publish "published locally" → $metadata 200 com a entidade → unpublish → delete, tudo pela lib)' },
      medido: [{ data: '2026-08-05', sistema: 'DEV' }, { data: '2026-08-26', sistema: 'S4H', release: '758' }, { data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
    {
      canal: 'wdi5',
      descricao: 'preview Fiori Elements servido pelo ADT (…/odatav4/feap) dirigido por wdi5 headless com injeção de cookie: FilterBar → Go → linhas do OData V4',
      assert: { wdi5: 'examples/wdi5/test/specs/preview.test.js 3/3 verdes', espera: 'app renderiza e lista linhas' },
      medido: [{ data: '2026-08-26', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { status: 400, contem: 'Falta a descrição', causa: 'create sem adtcore:description', correcao: 'informar description (validar do módulo já recusa antes da rede)' },
    { status: 406, contem: 'publish', causa: 'publish com Accept diferente de application/vnd.sap.as+xml', correcao: 'o módulo já manda o Accept certo; conferir chamada manual' },
    { status: 400, contem: 'Fim de elemento esperado', causa: '& cru na uri do objectReference do publish', correcao: 'escapar como &amp; (o módulo já faz)' },
    { status: 403, contem: 'não atribuído', causa: 'segmento da runtime URL não bate com a categoria (srvd vs srvd_a2x)', correcao: 'odataV4RuntimeUrl(binding, srvd, { category }) com a categoria real; na dúvida, sondar as duas' },
    { status: 405, contem: 'Creating operations', causa: 'binding read-only (view entity sem BDEF) recebeu escrita', correcao: 'esperado: read-only recusa escrita; para CRUD, BDEF + projections' },
    { contem: 'UNCAUGHT_EXCEPTION', causa: 'binding categoria 0 (UI) consumido como Web API — o service document espera anotações @UI', correcao: 'consumidor externo usa categoria 1' },
    { contem: 'CL_SADL_GW_V4_MODEL_PROPERTY', causa: 'a geração do modelo engasgou numa propriedade/associação', correcao: 'pegar o campo exato na ST22 (GET /sap/bc/adt/runtime/dumps) antes de podar a projeção' },
    { status: 403, contem: 'EU510', causa: 'lock órfão no nome do binding após unpublish → delete → create', correcao: 'esperar ou limpar na SM12' },
  ],
  desmentidos: [
    {
      crenca: 'a URL de runtime OData V4 é sempre /sap/opu/odata4/sap/<binding>/srvd_a2x/…',
      fato: 'depende da categoria: 1 (Web API) → srvd_a2x; 0 (UI) → srvd. O valor fixo vinha de um spike com categoria 1 e quebrava calado para UI (403 "repositório não atribuído"). Na dúvida, sondar as duas e usar a que responder 200.',
      medido: { data: '2026-08-05', sistema: 'DEV' },
    },
    {
      crenca: 'o 400 "Session Timed Out or Not Found" do runtime OData é o header stateful',
      fato: 'é o COOKIE, que o runtime rotaciona a cada resposta — quem guarda o cookie antigo leva 400 na chamada seguinte. Três tentativas perdidas no diagnóstico errado.',
      medido: { data: '2026-08-05', sistema: 'DEV' },
    },
  ],
  prova: (name) => ({
    tabela: 'TADIR', campos: ['PGMID', 'OBJECT', 'OBJ_NAME', 'DEVCLASS'], where: ["OBJECT = 'SRVB'", `OBJ_NAME = '${String(name).toUpperCase()}'`],
    espera: '1 linha (existe). Publicado: getObject → published=true / allowedAction=UNPUBLISH; runtime: $metadata 200.',
    medido: false,
  }),
  validar({ description }) {
    if (!description) throw new Error('serviceBinding exige description (create dá 400 "Falta a descrição")');
  },
  createBody,

  // Cria (com adtcore:description OBRIGATÓRIA), ativa e devolve status.
  async deploy(ctx, conexao, { name, srvd, category = '1', bindingType = 'ODATA', version = 'V4', description = '', pkg = '$TMP', contract = 'C1' }) {
    const s = await conexao.sessao();
    const N = String(name).toUpperCase();
    const existing = await ctx.getObject(s, 'serviceBinding', N);
    if (!existing.exists) {
      const body = createBody(N, pkg, description, { srvd, category, bindingType, version, contract });
      const c = await call(s, { method: 'POST', path: COLL, contentType: CT, accept: CT, body });
      if (c.status >= 400) throw new Error(`create binding ${N} falhou (${c.status}): ${c.text.slice(0, 300)}`);
    }
    const act = await ctx.activate(conexao, 'serviceBinding', N);
    return { created: !existing.exists, activated: act.ok, activate: act };
  },

  // Um SRVB publicado não pode ser apagado: unpublish primeiro. `deleteObject` chama isto antes do DELETE.
  // O unpublish de um binding não publicado responde com SEVERITY ≠ OK — não é erro para a deleção.
  async antesDeApagar(ctx, conexao, { name, version = 'V4' }) {
    return unpublish(conexao, { name, version });
  },
};
