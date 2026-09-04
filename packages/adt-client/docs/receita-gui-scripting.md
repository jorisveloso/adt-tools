# Receita — SAP GUI Scripting (COM) pelo Node

**Medido 2026-08-31 no S4H 758, mandante 250, com SAP GUI for Windows 8.00 (8000.257.4.1).**
Módulo: [`gui.mjs`](../gui.mjs) (export `adt-client/gui`); teste puro em `gui.test.mjs`; E2E do
item 34 da fila: **12/12 PASS**.

## Para que serve — e quando NÃO usar

É o canal que **enxerga a tela**. O BDC ([receita-bdc-classrun.md](receita-bdc-classrun.md))
preenche campos de dynpro e devolve a BDCMSGCOLL; ele não vê popup modal, não lê ALV Grid, não sabe
quantas linhas a table control tem. Aqui isso é leitura direta.

O preço é alto e não some: **SAP GUI instalado**, uma **sessão de diálogo aberta e visível** na
máquina de quem roda, e o servidor com `sapgui/user_scripting = TRUE`. Não roda em CI, não roda em
servidor, não roda sem alguém logado no Windows. Por isso: **último recurso**. A ordem de escolha é
ADT → SOAP RFC → classrun → BDC → **WebGUI** → **GUI Scripting**.

Desde 2026-09-04 há um degrau ANTES deste: o **WebGUI**
([receita-webgui.md](receita-webgui.md)) também enxerga e dirige a dynpro, e **não** exige SAP GUI
instalado nem sessão visível — roda sem ninguém na frente da tela. O GUI Scripting fica para o que o
WebGUI não alcança: a **saída** de uma transação (medido: no WebGUI nenhum caminho devolve o `fcode`
de saída) e o ALV Grid / table control **como objeto** (`lerGrid` por nome de coluna, `toolbarGrid`).

| Precisa de… | Canal |
|---|---|
| criar/alterar objeto ABAP | ADT REST (a lib) |
| chamar FM/BAPI | SOAP RFC |
| rodar ABAP arbitrário | classrun |
| dirigir dynpro clássica sem tela | BDC por classrun |
| ver e dirigir a dynpro sem SAP GUI e sem ninguém na tela | WebGUI |
| **popup modal, ALV Grid, table control, toolbar, e a SAÍDA de uma transação** | **GUI Scripting** |

## Os dois lados do interruptor

**Servidor** — `verificarScriptingNoServidor(conexao)` roda um driver classrun com
`cl_spfl_profile_parameter=>get_value` e lê os cinco parâmetros. Medido no s4h:

```
sapgui/user_scripting=TRUE                      ← sem isso, nada funciona
sapgui/user_scripting_disable_recording=FALSE
sapgui/user_scripting_force_notification=FALSE  ← TRUE = o GUI avisa o usuário a cada script
sapgui/user_scripting_set_readonly=FALSE        ← TRUE = o script lê, não escreve
sapgui/user_scripting_per_user=FALSE
```

**Cliente** — `UserScripting = 1` em
`HKLM\SOFTWARE\WOW6432Node\SAP\SAPGUI Front\SAP Frontend Server\Security` (com `SecurityLevel=1`,
`DefaultAction=0`). No GUI 8.00 o HKCU **não tem** a chave `Security`: sem valor de usuário, vale o
da máquina. `guiInstalado()` confere o resto (saplogon, sapshcut, `sapfewse.ocx`, pasta `Scripting`).

## ⚠ O PowerShell mente — e é o gotcha que custa a POC

Na mesma máquina, no mesmo instante, com o SAP GUI logado:

```powershell
$rot = New-Object -ComObject SapROTWr.SapROTWrapper      # instancia, sem erro
$app = ($rot.GetROTEntry("SAPGUI")).GetScriptingEngine   # devolve objeto, sem erro
$app.Children.Count                                      # 0
$app.MajorVersion                                        # (vazio)
```

Tudo vazio, **nenhuma exceção** — nos dois bitness (o `SapROTWr` só tem `InprocServer32` sob
`Wow6432Node`, mas o PS 32-bit devolve o mesmo objeto mudo). `InvokeMember` estoura
`TYPE_E_CANTLOADLIBRARY (0x80029C4A)`. Quem lê esse resultado conclui "scripting desligado no
servidor" e vai mexer em RZ11 à toa.

```vbscript
Set app = GetObject("SAPGUI").GetScriptingEngine   ' o mesmo instante, pelo VBScript
' engine.Name=app MajorVersion=8000 Minor=257 Patch=4 Rev=1
' Connections=1 Children=1 → /app/con[0]/ses[0] S4H/250 MVJVELOSO
```

Por isso o módulo **gera VBS e roda por `cscript.exe`** — não é preferência de estilo, é o que
funciona. E o VBS gravar num **arquivo UTF-16** (`CreateTextFile(caminho, True, True)`) também não
é: o stdout do cscript sai na codepage do console e come os acentos das mensagens do SAP.

## Abrir a sessão

`abrirSapGui({ sistema, cliente, usuario, senha, idioma })` chama o `sapshcut.exe` — `sistema` é o
`systemid` do `SAPUILandscape.xml` (o SID que o SAP GUI mostra) — e espera a sessão **aparecer no
ROT**, que é o sinal real de que dá para falar com ela.

⚠ **O `sapshcut` fica VIVO enquanto a sessão existir.** Esperar o processo terminar pendura o script
para sempre (medido: `await execFile` nunca voltou). O módulo o solta com `spawn({ detached })` e
espera pelo ROT.

⚠ A senha vai na **linha de comando** do sapshcut — visível na lista de processos enquanto ele sobe.
Laboratório, sim; credencial de produção, não.

`fecharSapGui()` fecha a conexão no fim (`CloseSession` + `CloseConnection`); o SAP Logon pad
continua aberto. Vale a mesma regra das sessões ADT: **sessão que o script abre, o script fecha.**

## Dirigir a tela: passos declarativos

```js
import { rodarGui, acharPorTipo } from 'adt-client/gui';

const r = await rodarGui([
  { acao: 'transacao', valor: 'VA03' },
  { acao: 'texto', id: 'wnd[0]/usr/ctxtVBAK-VBELN', valor: '9999999999' },
  { acao: 'tecla', valor: 0 },          // Enter
  { acao: 'lerStatus' },
]);
r.resultados[3];  // { tipo:'lerStatus', msgTipo:'E', msgId:'V1', numero:'302', texto:'O documento SD …' }
```

`E V1 302` é **a mesma mensagem** que o wrapper de BDC do item 2 devolveu para o mesmo documento
inexistente — os dois canais concordam no que o SAP diz; o que muda é o que se consegue ler depois.

Ações: `transacao` · `texto` · `tecla` · `pressionar` · `selecionar` · `foco` · `lerCampo` ·
`lerTela` · `lerStatus` · `janelas` · `fechar` · `achar` · `lerGrid` · `celulaGrid` · `linhaGrid` ·
`botaoGrid` · `toolbarGrid` · `lerTabela`. Cada uma é validada **antes** de gerar VBS (`validarPasso`)
— erro de digitação não vira tela aberta à toa.

Teclas medidas: `0` Enter · `4` F4 (matchcode) · `8` F8 (executar) · `11` Ctrl+S · `12` F12 (cancelar,
fecha popup).

## Achar o controle: por TIPO, não pelo id

O id literal muda por tela, por aba e por release. `acharPorTipo('GuiTableControl')` varre a árvore
e devolve os ids que existem AGORA:

```js
await acharPorTipo('GuiTableControl');
// wnd[0]/usr/tabsTAXI_TABSTRIP_OVERVIEW/tabpT\02/ssubSUBSCREEN_BODY:SAPMV45A:4401/subSUBSCREEN_TC:SAPMV45A:4900/tblSAPMV45ATCTRL_U_ERF_AUFTRAG
```

O caminho "de manual" (`…SAPMV45A:4400/…`) não existe nessa tela: o subscreen é o **4401**. Um id
copiado de tutorial falha com `The control could not be found by id.`

**O ALV do SE16N mora em `wnd[0]/shellcont/shell` — FORA do `usr`.** Quem procura só dentro do `usr`
conclui que não há grid.

## Ler a tela

**Table control** (`lerTabela`, por índice de coluna) — VA03, aba Síntese de itens da ordem 8:

```
16 linhas × 25 colunas; linha 0 = 10 | EWMS4-21 | 50 | PEÇ
```

**ALV Grid** (`lerGrid`, por NOME de coluna, via `ColumnOrder`) — SE16N sobre T000:

```
GridView, 5 linhas × 17 colunas
MANDT=000 MTEXT=SAP AG · MANDT=250 MTEXT=Neduca · MANDT=300 MTEXT=Moovi Academia
```

**Popup modal** (`janelas` / `fechar`) — F4 no campo de documento da VA03:

```
wnd[0] [GuiMainWindow]  Exibir documentos de vendas
wnd[1] [GuiModalWindow] Restringir intervalo de valores   → SendVKey 12 fecha
```

**Toolbar do próprio ALV** (`toolbarGrid`) — a lista real, com os ids que `botaoGrid` aceita:
`&DETAIL`, `&REFRESH`, `&LOCAL&COPY`, `&LOCAL&PASTE_NEW_ROW`, `&SORT_ASC`, `&SORT_DSC`, `&FIND`,
`&MB_FILTER`, `&PRINT_BACK`, `&MB_VARIANT`, **`DEL_LINE`** (sem `&`, ao contrário dos outros).

## Escrever pela tela — e por que a statusbar não basta

Ciclo medido (SU3 → aba Parâmetro, que no S/4 é um **ALV Grid editável**, não table control):

```js
await rodarGui([
  { acao: 'transacao', valor: 'SU3' },
  { acao: 'selecionar', id: 'wnd[0]/usr/tabsTABSTRIP1/tabpPARAM' },
  { acao: 'celulaGrid', id: GRID, linha, coluna: 'PARID', valor: 'BUK' },
  { acao: 'celulaGrid', id: GRID, linha, coluna: 'PARVA', valor: '1010' },
  { acao: 'tecla', valor: 0 },                            // Enter: o grid TRANSFERE ao programa
  { acao: 'pressionar', id: 'wnd[0]/tbar[0]/btn[11]' },    // Gravar
  { acao: 'lerStatus' },                                   // S 01 039 "Usuário … foi modificado"
]);
// e o assert de verdade, em OUTRA LUW:
await readTable(cfg, 'USR05', { campos: ['PARID','PARVA'], where: [`BNAME = '…'`, "AND PARID = 'BUK'"] });
```

Três coisas medidas que fazem esse ciclo dar errado em silêncio:

1. **`ModifyCell` sozinho não grava** — sem `SendVKey 0` (Enter) o grid não transfere as células ao
   programa.
2. **`SendVKey 11` (Ctrl+S) NÃO gravou** na SU3; `wnd[0]/tbar[0]/btn[11]` gravou, com
   `S 01 039 Usuário MVJVELOSO foi modificado`. Quando o save silencia, pressione o botão.
3. **A tela aceita o que não vale, sem dizer nada.** Um `PARID` inexistente na TPARA
   (`YJBV_POC_GS`) entrou na célula, sobreviveu ao Enter, não gerou mensagem alguma — e a USR05
   ficou vazia. Com um ID que existe (`BUK`), o Enter devolveu o texto do parâmetro (`Empresa`) na
   coluna `PARTXT`; **esse retorno é o sinal de que o programa aceitou.**

Daí a regra do canal, que é a mesma da casa: **statusbar não é assert.** Toda escrita por GUI fecha
com `readTable` em outra LUW ([receita-ciclo-escrita-verificacao.md](receita-ciclo-escrita-verificacao.md)).

Para **apagar linha** de ALV editável: `linhaGrid` (que faz `CurrentCellRow` **e** `SelectedRows`) e
então `botaoGrid` com `DEL_LINE` — o botão age na **seleção**, não no cursor. Esvaziar as células
(`ModifyCell` com `''`) limpou o VALOR e deixou a LINHA: a USR05 ficou com `PARID='BUK' PARVA=''`.

## Gotchas de COM que não são do SAP

- **Coleção não aceita índice cru**: `app.Children(0)` → `Bad index type for collection access`.
  É `app.Children.ElementAt(0)`.
- **`Children.Count` em folha LANÇA** (`Object doesn't support this property or method`): antes de
  descer, conferir `ContainerType`. É o que a `Sub Busca` do VBS gerado faz.
- `Tooltip` não existe em todo `GuiButton` da tbar — proteger com `On Error Resume Next`.
- `Split("", vbLf)` devolve array **vazio** em VBScript (não um elemento vazio): `(0)` estoura
  `Subscript out of range`.
- Em VBScript, `If … Then instrução : outra` no meio de string com `(` mal fechado é erro de
  COMPILAÇÃO na linha inteira — o cscript aponta a linha, não a causa.

## Custo medido

| Passo | Tempo |
|---|---|
| `StartTransaction` + Enter (VA03) | ~1,0 s |
| SE16N até o ALV com resultado | ~1,2 s |
| aba de itens da VA03 (`Select`) | ~2,1 s |

Cada `rodarGui` é um processo `cscript` novo (a sessão do GUI guarda o estado entre chamadas). Para
uma sequência longa, mandar todos os passos numa chamada só sai mais barato.

## Limpeza

O E2E do item 34 fecha com: classe do POC apagada, `USR05` sem a linha de teste, conexão do SAP GUI
fechada e `sessoesAbertas()` vazio, sessão ADT encerrada. **Nada fica aberto** — nem sessão de
diálogo, nem `sapshcut` órfão (que, se ficar, segura a sessão no servidor).
