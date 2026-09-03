# Receita: E2E de código ENTREGUE — driver classrun chamando a classe do cliente

**Validado: SXD (KART) release 816, mandante 200, 2026-08-26.** Task de origem: 10753 do Asset
9718 (SAP Accelerate). Driver descartável `YJBV_POC_10753_E2E` ($TMP) chamando
`ZO2M_9718_CL_SPLIT_MANUAL->executar` — o caminho real inteiro (integração em modo teste +
posting FI com COMMIT), com assert em outra LUW.

A `receita-ciclo-escrita-verificacao.md` prova o MECANISMO (tabela própria, INSERT próprio).
Esta prova o PRODUTO: a classe entregue, com as dependências reais dela (config em tabela Z,
mestre de fornecedor, períodos contábeis). A diferença de postura: aqui o teste não controla o
ambiente — ele o REVELA, camada por camada.

## O ciclo

1. **Mapa da massa (read-only)** — `dataPreview` nas tabelas Z do pacote (`dd02l WHERE tabname
   LIKE 'Z<asset>%'`), no conteúdo delas e nos dados FI envolvidos (BSEG: item em aberto =
   `augbl` vazio; `t001b`: períodos abertos; `lfa1/lfb1`: mestre citado pela config).
   **Ler a config Z ANTES de executar** — cada parâmetro dela (BP, conta, tipo de doc) é uma
   dependência que pode não existir no mandante-alvo.
2. **Estudo do fonte real** — `getSource` das classes envolvidas ANTES do driver: é aí que se
   descobre o que o método exige (correlation, status), o que ele grava, e se reexecutar é
   seguro (upsert `MODIFY` vs `INSERT` que dumpa).
3. **ACT — driver classrun** (`deployAndRun`, $TMP): SELECT da linha real, montar os parâmetros
   como a UI montaria, chamar a classe entregue, `out->write` de TUDO que o assert vai procurar
   (chaves, status, mensagem). O popup/GUI fica FORA do headless — chama-se o método que o popup
   alimentaria, com os valores que ele proporia.
4. **ASSERT — outra LUW** — `dataPreview`/`readTable` das tabelas Z e das tabelas standard
   (BKPF/BSEG novos, `augbl` do item compensado, auditoria).
5. **Config trocada é dívida**: toda alteração temporária (ex.: apontar BP da config para
   fornecedor que existe no mandante) entra numa tabela de restauração REGISTRADA ANTES da
   troca, com verify-after-write na troca e na restauração.

## O que este E2E revelou no primeiro posting real (por que a receita vale)

O código estava "pronto" havia semanas — unit tests verdes, simulação ok. O primeiro posting
REAL revelou, em camadas (cada erro só aparece depois de resolver o anterior):

1. **Mestre ausente**: BPs da config não existiam no mandante de teste (`Vendor 61 is not
   defined in company code BR99`) — existiam só no mandante de desenvolvimento.
2. **Recon alternativa**: conta de reconciliação da config ≠ AKONT do fornecedor exige
   configuração de recon alternativa (F5: `Reconciliation account ... not permitted`).
3. **Período herdado**: o posting herdava `budat` do documento ORIGINAL (2024) — período
   fechado (`Posting period 007 2024 is not open`). Documento velho NUNCA splitaria; virou
   questão funcional (lançar na data corrente?).
4. **Bug de regra de negócio** que teste unitário com seam dublado não pega: a comparação de
   divergência usava a SOMA dos impostos em vez do valor por imposto — medido com o caminho
   real, valor proposto pela UI caía SEMPRE em divergência.

Nenhum desses quatro aparece em ABAP Unit (seams dublados) nem em simulação (`i_simulation`
não chama o posting). Só o E2E dirigido contra o mandante real, com assert em outra LUW.

## Gotchas medidos nesta validação

- **`dataPreview` só aceita UM SELECT simples** — JOIN com alias devolveu 400 "Only one SELECT
  statement is allowed". Decompor em SELECTs e juntar no script.
- **Logon ADT pode devolver HTTP 500 transiente** (VPN/servidor); o POST do classrun pode ficar
  pendurado e AINDA EXECUTAR no servidor. Antes de reexecutar um driver com efeito colateral,
  **assert primeiro** — reexecução cega pode processar duas vezes (aqui: recompensar item já
  compensado e sobrescrever status bom com erro).
- **Reexecução segura exige ler o fonte**: aqui o `gravar` da DARF era `MODIFY` (upsert, safe);
  um `INSERT` teria dumpado na 2ª rodada.
- Driver com dado REAL de outra pessoa (massa de teste funcional) é decisão do dono, não do
  agente — perguntar antes, com o efeito permanente explicitado (posting só sai por estorno).

- **`COMMIT WORK` sem `AND WAIT` + accounting interface = documento INVISÍVEL no assert
  imediato.** Medido: a classe devolveu `belnr_split` e o readTable seguinte achou BKPF VAZIA;
  segundos depois o documento estava lá, completo. O posting nasce na update task (V1) — o
  número é consumido síncrono, a gravação não. Assert de posting FI precisa tolerar a latência
  da V1 (re-ler; conferir `VBHDR`/`VBERROR` se não aparecer) — e `COMMIT WORK AND WAIT` no
  código é a correção de verdade.
- **Rede caiu no meio: TCP conectava e o HTTP ficava mudo** (headers timeout). O caminho que
  destravou: watcher de estabilidade no `/sap/public/ping` (N leituras OK seguidas) e SÓ ENTÃO
  o assert. O assert-primeiro provou que os POSTs pendurados NUNCA tinham executado — a
  reexecução foi segura porque foi PROVADA segura, não assumida.

## Resultado do posting real (a prova)

Caso feliz medido no SXD 200: `ZO2M_9718_CL_SPLIT_MANUAL->executar` numa linha real →
`ok=X, status=3, belnr_split=0100000003`. Assert em outra LUW: BKPF 0100000003/2026 (BLART AB),
BSEG com 3 linhas balanceadas (mercadoria líquida herdando condições da fatura; imposto no BP
da config COM bloqueio de pagamento e SEM herdar condições; compensação com `augbl` no item
original da fatura), DARF gravada e Z LOG com status/refs finais. O caminho inteiro — integração
em 2 tempos, regra de divergência, montagem contábil, post-with-clearing, persistências — provado
contra o mandante real, dirigido 100% pelo agente.

---

## Cobertura como ARTEFATO, não como número (item 31 da fila)

**Medido 2026-08-31, S4H 758, mandante 250** — cobaia `YJBV_POC_CL_COV31` (3 métodos, 2
exercitados) em `$TMP`, apagada ao final; E2E pela lib **7/7 PASS**. Na lib:
[`cobertura.mjs`](../cobertura.mjs) (export `adt-client/cobertura`).

`runUnitTestsWithCoverage` responde **"50%"**. Isso passa num gate e não diz a ninguém qual teste
falta escrever. A resposta do SAP tem muito mais: o `POST` na medição
(`runtime/traces/coverage/measurements/<id>`) devolve uma **árvore** — raiz → programa → **método** —
e cada nó traz `statement`, `branch` e `procedure` com total e executados, mais o `#start=<linha>` do
fonte. É isso que o Eclipse pinta, e é isso que vira relatório:

```js
import { coberturaDe } from 'adt-client/cobertura';

const c = await coberturaDe(cx, { name: 'ZCL_PEDIDO', limiar: 90 });
console.log(c.markdown);                                            // o artefato do ticket
c.metodos.filter((m) => !m.cobertura.procedure.executed);           // o que nenhum teste chamou
```

```
# Cobertura — YJBV_POC_CL_COV31

**Testes:** 2/2 passaram
**Statement:** 50% (6/12) · **Branch:** 57.14% (4/7) · **Procedure:** 66.67% (2/3)

| | método | linha | statement | branch | procedure |
|---|---|---|---|---|---|
| 🟡 | `CLASSIFICAR` | 13 | 66.67% (4/6) | 60% (3/5) | 1/1 |
| 🔴 | `NUNCA_CHAMADO` | 23 | 0% (0/4) | 0% (0/1) | 0/1 |
| 🟢 | `SOMAR` | 9 | 100% (2/2) | 100% (1/1) | 1/1 |

**Nunca executados (1):** `NUNCA_CHAMADO`
```

### ⚠️ O bug que a medição achou: a árvore não se soma

Cada nível **repete** os mesmos números (raiz 12/6, programa 12/6, métodos 6/4 + 4/0 + 2/2). O
`parseCoverage` antigo somava todo `<coverage>` do XML com um `matchAll` chapado — contava cada
statement **três vezes** (36 em vez de 12). O percentual saía certo por acaso, porque a árvore é
proporcional; `total` e `executed` mentiam. Corrigido: agora conta só a profundidade 0.

### 0 testes não é 0% de cobertura

`coberturaDe` **lança** quando `executed === 0` — é a mesma regra do ABAP Unit (`executed === 0`
nunca é sucesso) aplicada à cobertura: uma classe sem classe de teste devolveria "0%", que se lê como
"código sem cobertura" quando na verdade é "medição que não aconteceu". Medido com o contrafactual.

### Linha a linha: não (ainda)

O `cov:result` anuncia dois links de `statements` — um por nó e um `bulkstatements` na raiz. Medido:
o GET do primeiro dá **404** em toda variante (com e sem o `%3d` do `===CP`, com `?type=`), e o
`bulkstatements` só aceita **POST** de `<cov:statementsBulkRequest/>` **vazio** com Accept
`application/xml` (com filho: 400 "Fim de elemento esperado"; com `application/xml+scov`: 406 dizendo
que o permitido é `application/xml`) — e responde **200 com resposta vazia**. Como abrir esse recurso
ficou em aberto (ideia I47); o handler ABAP é `if_scv_stmnt_results_builder`. Por isso o grão do
módulo é o **método**.
