# Apresentação do adt-client

Deck de slides que descreve o que a lib faz **na versão atual**. Vive no repositório para
evoluir junto com o código: mudou recurso, muda slide.

## Abrir

Abra `index.html` no browser. Não precisa de servidor. Navegação: `←` `→`, `PageUp`/`PageDown`,
`Espaço`, `Home`/`End`, ou os botões no rodapé. Funciona em tema claro e escuro.

As fontes (Archivo, IBM Plex) vêm do Google Fonts; sem internet o deck cai nas fontes de
sistema declaradas no fallback — legível, só menos bonito.

## Como manter

Tudo o que muda de uma versão para outra está no fim do `index.html`, no bloco
**DADOS DA APRESENTAÇÃO**:

| Constante | O que é | Quando mexer |
|---|---|---|
| `VERSAO` | O commit da lib que o deck descreve. | Sempre que atualizar qualquer slide. |
| `MARCO` | O commit em que o deck foi **apresentado** pela última vez. | Depois de apresentar: mova para a `VERSAO` atual. |
| `HISTORICO` | Uma entrada por commit que mudou recurso — data, hash, título, uma linha de detalhe. Cronológico, mais antigo primeiro. | A cada commit que adiciona/remove/altera recurso. Commits de manutenção pura não entram. |
| `IDEIAS` | Espelho das ideias **abertas** de `docs/ideias.md` — número, título, uma linha de hipótese, agrupadas como lá. | Quando `ideias.md` mudar (`/todo ideia`, `promover`, descarte). A fonte é o `.md`; isto é só o que o slide mostra. |

Os slides **"O que há de novo"**, **"Histórico"** e **"Ideias"** são gerados a partir dessas constantes:

- *Histórico* lista o `HISTORICO` inteiro, marca a entrada do `MARCO` como "apresentado" e as
  posteriores como "novo".
- *O que há de novo* mostra só as entradas depois do `MARCO`, mais recente primeiro. Se não
  houver nenhuma, o slide diz isso.
- *Ideias* mostra o `IDEIAS` por grupo, com a contagem no cabeçalho. Ideia promovida vira item
  da fila (sai daqui, entra no slide "fila"); ideia descartada simplesmente sai.

### Regra de trabalho

Ao fechar um commit que muda recurso da lib:

1. Ajuste o slide afetado (canais, tipos, receitas, guard-rails, fila…). Números de capa
   (canais, tipos, sistemas validados) são texto fixo — confira.
2. Acrescente a entrada no `HISTORICO`.
3. Atualize `VERSAO`.

Ao apresentar: mova `MARCO` para a `VERSAO` e faça commit. O próximo ciclo começa limpo.

### O que não fazer

- Não descreva recurso que não foi validado por spike/medição. O deck segue a mesma regra
  da lib: só entra o que foi medido, com sistema e data.
- Não duplique a fila aqui — o slide "fila" resume `docs/fila.md`, que continua sendo a fonte.
