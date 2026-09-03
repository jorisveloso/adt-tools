# Composição de soluções reais — o que falta no arsenal para reproduzir um app

**Medido no S4H 758, mandante 250, 2026-08-31 — só leitura** (item 25 da fila, ideia I25). A cobertura pela
TADIR (`cobertura-tadir.md`) dá **frequência** (quantos objetos de cada tipo existem); este recorte dá
**composição** (o que precisa coexistir para uma solução funcionar). Ferramenta:
`node scripts/cobertura-tadir.mjs s4h --pacote <P1>[,<P2>…] [--sub]` — recorte por pacote com cruzamento
de catálogo, adicionado neste item.

## Método (repetível para qualquer solução)

1. Do objeto conhecido ao pacote: transação → `TSTC` (`PGMNA`) ou `TSTCP` (`PARAM`, para transação de
   parâmetro Fiori) → `TADIR` por `OBJ_NAME` → `DEVCLASS`.
2. Árvore: `TDEVC` (`PARENTCL`) para subpacotes/irmãos — atenção: pacote clássico pode pendurar direto na
   raiz `APPL` (o `J1BNFE` pendura; irmãos ali não são "a solução").
3. Composição: `TADIR` por `DEVCLASS` agrupada por `OBJECT` (o `dataPreview` agrega — nada é criado).
4. Separar o que não é desenvolvimento: `GENFLAG='X'` (gerado), e os metadados CINS/NOTE (notas SNOTE
   aplicadas), AVAS (classificação), DSYS/DOCT/DOCV (documentação).

## Alvo 1 — Monitor NF-e (transação `J1BNFE`)

`J1BNFE` → programa `J_1BNFE_MONITOR` → pacote **`J1BNFE`** (pai `APPL`, sem subpacotes). A solução
NF-e/CT-e é maior que o pacote do monitor: família `J1B*` = `J1BA` 13.019 · `J1BNFE` 2.538 ·
`J1BNFE_OUT_CLOUD` 1.421 · `J1BA_DEPRECATED` 667 · `J1BA_UDO` 186 (+5 menores).

**`J1BNFE` (o monitor): 2.538 objetos em 41 tipos; catálogo `tipos/` cobre 14 tipos = 53%.**
Núcleo coberto: CLAS 681 · TABL 163 · INTF 119 · DTEL 110 · PROG 108 · TTYP 83 · FUGR 34 · DOMA 20 ·
MSAG 6 · ENQU 5 · XSLT 5 · DDLS 1 · SUSO 1. Metadados (não são "desenvolvimento a reproduzir"):
CINS 856 · AVAS 162 · NOTE 73 · DSYS/DOCT/DOCV 11. **Fora do catálogo `tipos/`:** SUSH 19 · TOBJ 11 ·
VIEW 10 · CUS0/1/2 25 · JOBD 9 · TRAN 7 · SRFC 3 · ENHS 3 · SHLP 2 · SHI3 1 · SFSW 1 · **SFPF 1 + SFPI 1**
(o DANFE!) · OA2P 1 · SXSD 1 · SUSC 1 · IWSV 1 · STOB 1 · SOTR 1.

**`J1BA` (localização Brasil, o chão que o monitor pisa): 13.019 objetos em 67 tipos; 52% coberto.**
O que aparece aqui e não aparecia em POC nenhuma: TRAN 290 · TOBJ 268 · VIEW 186 · CUS0/1/2 459 ·
SCAT 80 · APIS 59 · SHLP 53 · VKOS/VKOI 40 · ENHS 82 · ENHO 14 · FORM 9 (SAPscript) · NROB 4 ·
SSFO/SSST/SFPF/SFPI 7 · SOBJ/AOBJ/CHDO/LDBA/ILMB 1 cada.

## Alvo 2 — App Fiori "Manage Purchase Orders" (`F0842A` / `MM_PO_MANAGES1`)

Cadeia medida: `F0842A` é transação **de parâmetro** (`TSTC.PGMNA` vazio; `TSTCP.PARAM` =
`/*/UI2/SAPUI5_APP_FE UIAD=42010AEE2A7C1EEAA999CD708FFFF5D5;`) → aponta o **UIAD** (app descriptor) do
pacote **`UI_PRC_MM_PURCHASEORDER_MANAGE`** (pai `CONTENT_PRC_PUR_APPS`, 118 irmãos — um pacote por app).

**Lado UI: 34 objetos em 8 tipos; catálogo cobre 3% (só o DEVC).**
LRCC 23 (conteúdo do Layered Repository — os arquivos do app UI5) · SMIM 3 · UIAD 2 · SICF 2 · TRAN 1 ·
WAPA 1 · AVAS 1. **Nenhum tipo do lado UI tem caminho na lib** — o deploy de app UI5 é o OData
`/UI5/ABAP_REPOSITORY_SRV` (anotado como fora de alcance ADT em `ideias.md` desde 2026-08-28).

**Lado serviço (`ODATA_MM_PUR_PO_MAINTAIN_V2`, serviço `MM_PUR_PO_MAINT_V2_SRV`): 276 objetos em
24 tipos; 59% coberto — e o real é maior:** VIEW 45 e STOB 48 têm **`GENFLAG='X'`** (gerados pelas 48
DDLS — medido). Descontando gerados (93) e CINS/NOTE/AVAS (10), sobram **173 objetos de desenvolvimento,
dos quais o catálogo cobre 163 (94%)**: DDLS 48 · PROG 47 · DCLS 34 · CLAS 20 · TTYP 5 · TABL 3 + miúdos.
Fora: a família SEGW V2 (IWPR/IWMO/IWSV/IWVB, 4 objetos — o item 16 provou que o caminho RAP a gera por
SRVB V2; o projeto SEGW clássico segue sem create), PINF 1, SITD 2, SUSH 1, ENHO 1 (a lib altera, não cria
hook), SOTR 1. Ressalva: o vínculo UIAD→serviço é por convenção de nome — o descriptor (LREP) não foi lido.

## O que falta, na ordem em que falta (a resposta do item)

1. **Deploy de app UI5 (WAPA + LRCC + UIAD + SICF)** — 100% do lado UI de qualquer app Fiori está fora
   da lib. Sem isso, "entregar um app" para no serviço. Canal conhecido: OData `/UI5/ABAP_REPOSITORY_SRV`
   (pesquisa § 3 do cookbook); LRCC/UIAD nem ideia têm.
2. **VIEW clássica** — 186 no `J1BA`, 10 no `J1BNFE` (as 45 do pacote OData são geradas). Já sabida "só
   SE11"; candidata no cookbook (`DDIF_VIEW_PUT`, § 7).
3. **Customizing como objeto** — CUS0/CUS1/CUS2 (484 nas duas soluções) + TOBJ (279) + VKOS/VKOI (40):
   o mundo IMG/SM30. Leitura já coberta pela anatomia CTS; escrita passa por `sm30.mjs`/BDC caso a caso.
4. **SHLP** — 55 nas soluções; cookbook § 6 (`DDIF_SHLP_PUT`).
5. **NROB** — 4; cookbook § 10.
6. Cauda longa sem ideia registrada: SHI3 (menu de área), JOBD, SOBJ/SWO1, AOBJ/ILMB (arquivamento),
   CHDO (change documents), SRFC, OA2P, SUSH/SUSC, APIS, SCAT/ECTD, FORM/STYL (SAPscript), SFSW/SFBF
   (switch framework). Entram como ideia só se uma lista de cliente puxar.
7. **Já coberto mas invisível na coluna "catálogo"**: TRAN (`tran.mjs`), TOBJ/SM30 (`sm30.mjs`),
   SSFO/SFPF/SFPI (render por `forms.mjs`; criação = itens 41–43), FDT (`brf.mjs`), ENHO (`enho.mjs`) —
   o cruzamento do script só enxerga `tipos/*.mjs`; os módulos por driver cobrem mais 5+ códigos.

## Gotchas de medição

- `TSTCP` é quem revela transação Fiori de parâmetro; `TSTC.PGMNA` vazio não é erro.
- Join com duas tabelas que têm `DEVCLASS` exige alias qualificado no freestyle — coluna ambígua dá 400.
- `EUOBJALL` não tem descrição para CINS/NOTE/CUS1/DSYS/DOCT/DOCV/FORM/STYL/VBED/SHI8/SOTS (ficam em
  branco na tabela do script); não é sinal de tipo "estranho".
- Pacote clássico (J1BNFE) pendura na raiz `APPL` com centenas de irmãos — a árvore TDEVC não delimita a
  solução; quem delimita é o prefixo de pacote (`J1B*`) ou a lista de objetos da TR.
