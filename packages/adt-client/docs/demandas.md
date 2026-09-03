# Demandas — caixa de entrada de capacidade

O que consumidores da lib (sap-note, outros projetos) precisaram fazer **à mão** porque a lib não
cobre. **Append-only**: quem consulta a capacidade (skill `adt-capacidade`) só ACRESCENTA no fim
de "Entradas" — não numera ideia, não edita o que já existe, não toca em `ideias.md`/`fila.md`.
A triagem é do fluxo da lib (`/todo triar`): cada demanda vira ideia nova (`I<n>`), aponta para
ideia/item que já cobre, ou é recusada — sempre com nota `> triagem:` sob a entrada.

**A mesma lacuna batendo de novo NÃO é duplicata aqui — é contagem de dor.** Registrar de novo,
citando a nova origem; três demandas na mesma ideia priorizam a ideia sozinhas.

Formato de entrada (uma por passo não coberto):

    - [ ] <nota/origem> · "<passo manual, fiel ao original>" — <veredito> · <projeto>, <AAAA-MM-DD>
      fontes: <uma linha: o que a consulta achou nas fontes da lib, e onde parou>

## Entradas

- [x] 3751960 · "SFP → form EDOC_BR_DACTE_OP → substituir o layout pelo XML anexo (XDP), salvar e
  ativar" — MANUAL (hoje) · sap-note, 2026-09-01
  fontes: forms.mjs não tem upload de layout Adobe (só Smart Form, formato ≠); porta
  `set_layout_data` conhecida (fila 43/I74); "ativar" é gate de ADS (itens 40/53), não lacuna de código.
  > triagem: → I82 (criada 2026-09-01, na consulta que antecedeu esta caixa)
