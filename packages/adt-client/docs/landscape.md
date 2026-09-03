# Landscape — registro canônico dos sistemas (conhecimento do time)

**Registro ativo** dos sistemas que a lib alcança. Fica **versionado** porque é conhecimento do time
(janelas de disponibilidade, VPN, para que cada sistema serve), não segredo. Os dados de CONEXÃO
(url de ADT, cliente, mandante, idioma) vivem no `sistemas.json` (gitignored) — este doc é o *porquê
e o quando*, não o *como conectar*.

> Regra de atualização: quando a disponibilidade, a janela ou o papel de um sistema mudar,
> atualize AQUI primeiro (é a fonte de consulta), depois aponte os consumidores (fila, receitas).

## Tabela

| sistema | release | mandante | janela de disponibilidade (SP) | VPN | papel / o que medir |
|---|---|---|---|---|---|
| **s4h** | 758 | 250 | 24 h/dia | sem VPN | bancada padrão: tudo que NÃO depende de ADS nem de canal de cliente. Smart Form (render por `CONVERT_OTF`, sem ADS), cópia/criação da INTERFACE Adobe, migração SAPscript→SF→XFA, anatomia por leitura, DDIC, ABAP Unit, maioria dos tipos |
| **sxd** (KART) | 816 | 100 | **09:00–24:00** (atualizado 2026-09-03, Joris) | VPN da KART | ADS vivo — tudo que depende do Adobe Document Services. Cópia/criação do FORM Adobe (SFPF), `renderAdobeForm` (`FP_JOB_OPEN…CLOSE`), conversor XFA/XDP |

### Janela do SXD — histórica e atual

- Originalmente registrada como **09:00–20:00** SP (regra do Joris, 2026-09-01, em `docs/fila.md`).
- **Atualizada 2026-09-03 (Joris): agora é 09:00–24:00 SP.** Vale a mesma régua: só confia em sonda
  feita DENTRO da janela; hora pelo PowerShell (no Git Bash o `TZ=America/Sao_Paulo` devolve UTC).

## Regras de medição por sistema (ver receita-forms.md § Em qual sistema medir)

- **Forms é a exceção**: tudo que depende do ADS mede no **sxd**, não no s4h (o s4h não tem ADS, e a
  falha do lado errado chega disfarçada — `CX_FP_API_INTERNAL` sem detalhe na cópia do FORM, item 41).
- Smart Form e cópia da INTERFACE continuam no **s4h**.
- ⚠️ No sxd o ADS **está vivo mas ainda NÃO devolve PDF** — falta o destino `FP_ICF_DATA_SXD` no AS
  Java (item 40; é infra). Até lá o teto medido do lado Adobe é `FP_JOB_OPEN subrc=0`, não `%PDF`.

## Antes de contar com o sxd: sonde

O sxd esteve inalcançável em 29/08, respondeu em 31/08, falhou por timeout em 03/09 06:54 SP (fora da
janela). **Alcance é do momento, não estado gravado** — dentro da janela, sonda o sxd ANTES de
escolher o alvo. Sonda: `node scripts/canais.mjs sxd`, ou o `probe` da lib.
