# Plano de aplicação — 3751960 (v0, exemplo)

> Nota de exemplo: ilustra o fluxo do `PLANO-v1.md` num caso real. Veredito esperado do passo
> central: `MANUAL (hoje)` — demonstra o fluxo inteiro e a resposta honesta "ainda não executável".

## Origem
- `notas/NOTA_3751960_E_20260901.pdf` — Inbound CT-e: Missing Start and End Service Provision
  Location Fields in DACTE.
- Manual Activities (extraída): SFP → form `EDOC_BR_DACTE_OP` → Change →
  Utilities → Upload/Download → Uploading form → escolher `EDOC_BR_DACTE_OP.XML` → Save and activate.

## Passos de aplicação

### 1. Estado atual do form (AGENTE, assert de leitura)
- **Operação da lib:** `readTable` (FPLAYOUT / FPCONTEXT / FPINTERFACE) via `adobeFormInfo(cfg, form)`.
- **Assert:** `exists` e `active` do form + interface apontada (SFPI) — prova o estado ANTES.
- **Onde:** sistema-alvo (dado no uso, nada hardcoded — `PLANO-v1.md`).
- **Veredito:** `AGENTE` — leitura sem GUI, canal readTable medido (item 19).

### 2. Backup do layout atual (AGENTE, não provado)
- **Passo fiel:** "Utilities → Upload/Download → Downloading form; salvar cópia local".
- **O que a lib tem hoje:** o XDP ativo mora na `FPLAYOUTT`, por idioma; o padrão de leitura
  (SELECT na `FPLAYOUTT`) foi medido no item 53/54. **Não há** operação nomeada de download de
  layout Adobe (a `baixarSmartFormXml` é para Smart Form, formato SF-XML ≠ XDP).
- **Veredito:** `AGENTE (não provado)` — existe via/canal, sem op exposta; spike antes de prometer.

### 3. Substituir layout pelo XDP anexo + save + activate (MANUAL hoje)
- **Passo fiel:** "Uploading form → escolher `EDOC_BR_DACTE_OP.XML` → Save and activate".
- **Veredito:** `MANUAL (hoje)` — apendado em `jbv-adt-client\docs\demandas.md` (2026-09-01),
  triagem → **I82** (substituir XDP de form existente; porta `set_layout_data` conhecida, fila 43/I74;
  "ativar" é gate de ADS, não lacuna de código).
- **Consequência honesta:** a v1 não executa este passo — responde "ainda não executável".

### 4. Teste pós-aplicação (AGENTE)
- **Operação da lib:** render/leitura para confirmar os campos Início/Fim da Prestação no DACTE.
  Limite conhecido: `renderAdobeForm` exige ADS vivo (SXD); leitura do XDP novo por `FPLAYOUTT` não.

## Decisões deste plano
- Sistema-alvo: dado no uso (per `PLANO-v1.md`; nada hardcoded).
- Guard-rails da lib na execução: assertZY, unlock em finally, activate após unlock,
  readTable como assert (quando um passo for executável).

## Status
- Rascunho v0 (exemplo). Aguarda aprovação do usuário antes de qualquer execução em sistema.