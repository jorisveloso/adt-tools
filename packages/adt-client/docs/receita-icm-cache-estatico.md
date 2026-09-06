# Receita — cache estático do ICM: quando o servidor devolve 200 com o corpo VAZIO

**Medido no S4H 758, mandante 250, em 05/09/2026** (fila `adt-client` #67; POC em
`sap-accelerate/work/POC_icm_static_cache/`, medição em
`medicoes/item67-icm-cache-vazio.md`). Módulo: [`icm.mjs`](../icm.mjs); teste puro em
`icm.test.mjs`.

## O sintoma — e por que ele não parece um erro

`GET /sap/public/bc/ui5_ui5/resources/sap-ui-core.js` responde **200** com
`Content-Length: 0`. O navegador trata como script carregado: o `onload` dispara, não há erro no
console, nenhum status ruim em lugar nenhum — e a página UI5 fica **sem `window.sap`**. Quem estiver
dirigindo o app pelo canal navegador vê "a página não terminou de carregar" e vai culpar o timing.

Não é cache do navegador: o `fetch` do Node recebe o mesmo vazio.

## A causa: a chave do cache do ICM inclui o ENCODING

As entradas do HTTP server cache têm a forma

```
<path>&&&GZ=<enc>&<mandante>&<hash da query>&        GZ=0 identity · GZ=1 gzip · GZ=B br
```

O envenenamento é de **uma variante**, não do recurso. No S4H, o `sap-ui-core.js` voltava vazio
**só** com `accept-encoding: gzip`; `identity` e `br` da mesma URL vinham completos (774.788 bytes),
e nenhum dos outros 14 recursos medidos tinha o problema — inclusive `library-preload.js` de 3 MB.
**Não é tamanho, não é o handler, não é autenticação.** `cache-control: no-cache` e
`pragma: no-cache` no pedido são ignorados pelo ICM.

Dois sinais úteis:

- a resposta boa carrega o header **`sap-isc-etag`**; a vazia não carrega ETag nenhum;
- **a entrada envenenada é invisível na listagem do cache**: não havia entrada `GZ=1` com o hash da
  query vazia, nem nenhuma entrada com `dsize = 0` em 9.952 — e mesmo assim o ICM servia o vazio.
  Procurar a entrada ruim na SMICM não acha nada. A listagem também não reflete a invalidação de
  imediato. **Quem responde a verdade é o GET, não a lista.**

## A cura

```js
import { medirRecurso, curarRecursoVazio, lerCacheEstatico, invalidarCacheEstatico } from 'adt-client/icm';

// 1. o veredito, sem sessão ADT (HTTP puro contra o ICM)
const d = await medirRecurso(cfg, '/sap/public/bc/ui5_ui5/resources/sap-ui-core.js');
// { envenenado: true, encodingsVazios: ['gzip'], tamanho: 774788, respostas: [...] }

// 2. mede → se vazio, invalida → remede. Não toca em nada se o recurso estiver são.
const r = await curarRecursoVazio(conexao, '/sap/public/bc/ui5_ui5/resources/sap-ui-core.js');
// { curado: true, antes, depois, invalidacao }
```

Por baixo, `invalidarCacheEstatico` roda `ICM_CACHE_INVALIDATE_ONE(name, coption, global)` por
classrun. **Contra-prova medida**: antes, gzip = 0 bytes; depois do `subrc = 0`, o MESMO GET gzip
voltou com 774.788 bytes e `sap-isc-etag`.

Detalhes que a medição deixou abertos, e que ficam registrados em vez de adivinhados:

- `coption` é opaco (parâmetro do kernel). As variantes 0 e 1 foram disparadas juntas — **não se
  sabe qual delas surtiu efeito**, e por isso o driver dispara as duas.
- `global: true` propaga para os outros servidores de aplicação (RFC assíncrona); o default é
  local, que é o que basta num servidor único.
- O que se perde ao invalidar: as entradas voltam a ser buscadas do backend na próxima requisição —
  custo de latência, **nenhum dado**.

Para o cache inteiro existe `ICM_CACHE_INVALIDATE_ALL(global)` (é o que a SMICM chama em
*Goto → HTTP Server Cache → Invalidate*). A lib **não** o expõe: derrubar 9.952 entradas para curar
uma é desproporcional.

## ⚠️ Carimbar a URL não é a defesa

`?jbv=<timestamp>` também traz o conteúdo de volta — e é por isso que a tentação existe. Mas o
último campo da chave é o hash da query: **cada carimbo distinto cria uma entrada NOVA**. Medidas
oito entradas de ~213 KB, expiração de 7 dias, uma por timestamp, num cache que estava com **9.952
de 10.000 entradas** (`MAX_ENTR`) e 182 MB de 419 MB. Carimbar a cada carga de página queima a
capacidade do cache do sistema do cliente para disfarçar um estado que se cura em um comando.

**Portanto: o canal navegador não carimba URL sozinho.** Quem dirige app UI5 chama
`curarRecursoVazio` uma vez sobre os recursos de que a página depende — ele não faz nada quando não
há o que curar.

## O que continua aberto

**O gatilho.** Partindo do cache limpo, nenhuma destas hipóteses produziu entrada vazia: download
gzip abortado no meio (5×), 10 GETs gzip concorrentes, 8 GETs concorrentes misturando
gzip/br/identity. O único sinal próximo foi a rodada concorrente criar **duas entradas com a mesma
chave** — ambas com o tamanho certo. Enquanto não se souber o que envenena, a defesa é detectar e
curar, não prevenir.
