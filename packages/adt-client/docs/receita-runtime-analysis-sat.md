# Receita — Runtime Analysis (SAT) por GUI Scripting, quando o ADT não mede

**Medido 2026-09-02 no S4H 758, mandante 250.** Módulo: [`gui.mjs`](../gui.mjs)
(`medirComSat`/`mediuDeVerdade`/`numeroSat`), export `adt-client/gui`. Item 30 da fila.

## A pergunta e o desmentido

O item 30 partia de "medir regressão de performance no mesmo ciclo do teste" pela via ADT
(`/sap/bc/adt/runtime/traces`). Essa via foi mapeada por inteiro numa sessão anterior — coleção,
sub-recursos, os FMs `ATRA_*` por SOAP RFC, o campo que liga o agendamento
(`ATRA_STR_TRACE_SCHEDULE-TYPE='X'`) — e o trace **nasce vazio**: header completo, `RUNTIME=0`,
hitlist de 1 linha. O mesmo vazio saiu de duas outras vias: `SET RUN TIME ANALYZER ON/OFF` dentro
de um driver classrun, e a API `cl_atrapi_main_service` (instant trace) chamada do mesmo jeito.

**Contraprova decisiva:** medir a MESMA classe de trabalho pelo SAT (transação clássica, via GUI)
devolveu um hitlist real — 4.225 linhas, tempos em microssegundos, RFC wait e DB fetch
discriminados por programa chamador/chamado, numa SE16N simples sobre T000. **O sistema mede.** A
causa do trace vazio não é parâmetro de perfil nem licença — é o **canal**: o SAT mede dentro da
MESMA sessão de diálogo do alvo; o classrun (ADT REST) e a API chamada de dentro dele rodam numa
requisição HTTP separada, fora da unidade de medição do kernel. Ninguém isolou a causa exata dessa
separação (não foi medido *por que* o kernel não associa a medição à requisição HTTP) — o que foi
medido é que muda de canal, muda o resultado.

## Descartado no caminho

`TH_GET_PARAMETER` (SOAP RFC) tinha ficado pendente numa sessão anterior por usar o campo errado
(`PARAMNAME`); o campo certo, achado pela `FUPARAREF`, é `PARAMETER_NAME`. Com o campo certo:
`abap/atrapath` existe e aponta para `/usr/sap/S4H/D00/data/AT00++++` (RC=0) — a infraestrutura
clássica do Runtime Analysis está configurada; `abap/atra_switch` e `abap/atra` **não existem**
como parâmetros no kernel (RC=4). A hipótese "falta parâmetro de perfil" está descartada por
medição — reforça que a causa é o canal, não configuração de sistema.

## `medirComSat` — medir pelo canal que funciona

```js
import { abrirSapGui, medirComSat, mediuDeVerdade, fecharSapGui } from 'adt-client/gui';

await abrirSapGui({ sistema: 'S4H', cliente: '250', usuario, senha, idioma: 'PT' });
try {
  const r = await medirComSat({
    tipo: 'transacao',           // hoje só este tipo tem E2E — ver "O que falta"
    alvo: 'SE16N',
    passosDentro: [               // os passos DENTRO do alvo, mesma linguagem de `ACOES`
      { acao: 'texto', id: 'wnd[0]/usr/ctxtGD-TAB', valor: 'T000' },
      { acao: 'tecla', valor: 8 },   // F8 executa
      { acao: 'tecla', valor: 3 },   // F3 sai da lista
      { acao: 'tecla', valor: 3 },   // F3 sai da seleção, volta ao SAT
    ],
  });
  // r = { total: 4192, amostra: [{ ANZAHL, BRUTTO, NETTO, PROZ_BRUTTO, PROZ_NETTO, HIER_FELD, CALLED_PROG, CALLING_PROG }, …] }
  mediuDeVerdade(r); // true — mais de uma linha, com NETTO > 0 em alguma
} finally {
  await fecharSapGui();
}
```

A medição **não é salva** no sistema: a saída é por `/n` (SAP Easy Access), nunca pelo botão
"Save" do SAT — não fica trace nenhum gravado no cliente.

`passosDentro` é o ponto de acoplamento: o SAT abre a transação/programa e devolve o controle pra
quem chamou — o resto (preencher, executar, sair de volta pra tela de resultado) é responsabilidade
de quem mede, porque cada transação tem sua própria navegação. `medirComSat` só sabe procurar o
hitlist (`GuiShell` cujo id contém `HITLIST`) depois que `passosDentro` termina — funciona pra
qualquer transação cuja saída volte ao SAT em até 5 tentativas de "voltar" (F3, com o botão da
toolbar como fallback quando F3 está desabilitado — medido na lista de resultado da SE16N).

## Dois gotchas de COM que custaram a maior parte da sessão

1. **`GuiRadioButton.Text` é SOMENTE LEITURA.** O código tentava `{ acao: 'texto', id: radio, valor:
   'X' }` para marcar "Medir por: Transação" — e isso lança `The property is readonly`. O jeito
   certo é `{ acao: 'selecionar', id: radio }` (`.Select`), a mesma ação que já existia pra
   abas/nós de árvore. Sem essa correção, o fluxo às vezes "funcionava" por coincidência: o radio
   de Transação (`X_TRACE_T`) já vem selecionado por padrão no SAT, então o erro ficava mascarado
   sempre que o alvo era mesmo uma transação.

2. **`rodarGui` não limpava o `Err` entre passos** (bug real do módulo, não desta receita — corrigido
   em `montarVbs`). O corpo do VBS rodava inteiro sob um único `On Error Resume Next`: um erro no
   passo N não interrompia nada — os passos N+1, N+2… continuavam executando **com efeito colateral
   real no SAP GUI**, e o `Err` ficava pendurado até o fim, onde era relatado como erro do **último**
   passo executado, não do que realmente falhou. Isso fez o erro do gotcha 1 aparecer atribuído a um
   `lerTela` inocente duas telas depois. Fix: cada passo agora roda dentro de
   `If Err.Number = 0 Then … End If` — o primeiro erro real interrompe a cadeia e o número do passo
   no relatório final é o certo.

## O que falta

- **Só `tipo: 'transacao'` tem E2E.** `programa`/`funcao` têm radio, campo e botão (`btnRUN_2`/
  `btnRUN_3`) medidos na tela inicial do SAT, mas a navegação de SAÍDA de um programa livre ou de
  uma function module de teste pode diferir da SE16N — sem medição ainda.
- **A causa exata da separação de canal não foi isolada** (por que o kernel não associa a medição
  à requisição HTTP do classrun) — só o efeito (funciona num canal, não no outro).
- Não confundir com o item 47 (Application Job): lá o log de execução é outro mecanismo (SLG1/
  joblog), sem relação com Runtime Analysis.
