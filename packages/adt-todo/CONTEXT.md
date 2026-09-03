# adt-todo

Ferramenta **lib** de **fila de trabalho local, multi-projeto** — o "jeito `/todo`" do
jbv-adt-client, generalizado para **várias filas** (um arquivo markdown por projeto), para o
ecossistema adt. É o `packages/adt-todo` do monorepo `adt-tools`.

## Linguagem

**Fila / projeto**:
Um arquivo markdown que guarda os itens de trabalho de uma origem. Ex.: `matt-pocock.md` (os
tickets do Azure DevOps do matt pocock), `jbv-adt-client.md` (a fila da lib). Corresponde ao
"repositório"/"projeto" do git.
_Evite_: lista, backlog

**Item**:
Uma unidade de trabalho, `- [ ] N. Título` com notinhas `>` sob ele. O **N** é identidade (nunca
muda; commits apontam "fila N"); a **ordem** no arquivo é a de execução. Corresponde ao "ticket".
_Evite_: tarefa, issue

**Next**:
O próximo item a executar — o primeiro aberto sem `> bloqueado:`; item com `> em andamento:` tem
prioridade (retomar do estado descrito). Todos os abertos bloqueados → sem próximo. Corresponde a
"pegar o próximo".
_Evite_: próximo disponível, pick

**Bloqueado / em andamento**:
Notinhas `>` que alteram o estado do item (`> bloqueado: <motivo>`, `> em andamento: <estado +
próximo passo>`). Estado em voo mora no item, não em memória nem em handoff avulso.

## Origens — o adt-todo guarda fila, não sincroniza origem

Cada fila aponta para uma realidade externa — o jbv-adt-client tem `docs/fila.md` própria; o matt
pocock tem work items no Azure DevOps — mas o pacote **guarda filas próprias** (markdown local).
A sincronização com cada origem é **responsabilidade da skill/consumidor**, não deste pacote:
o `/next` documenta como puxar/fechar tickets do matt pocock via `devops.mjs`, e a fila do
jbv-adt-client segue vivendo onde já vive. O adt-todo não fala com SAP nem com Azure DevOps.

## Decisão: filas locais no v1, MCP adiado

**Decidido (2026-09-02):** o v1 mantém as filas como **markdown local** (`docs/filas/*.md`). Um MCP
só para filas **não** compensa agora: o agente lê/escreve o arquivo direto, e o MCP adicionaria uma
camada sem benefício (sem autenticação nem sistema externo no meio). O MCP ganharia sentido quando
a origem externa **automatizasse** (ex.: `queue.list`/`queue.next` puxando os tickets do Azure
DevOps por trás) — aí o servidor encapsularia credenciais/HTTP. Até lá, fila local; o MCP é
evolução quando a integração DevOps for além do manual.
_Revisitar quando_: a sincronização DevOps sair do manual.

## Sem estado (mesma regra do ecossistema)

As funções da lib recebem a **pasta** das filas (default `docs/filas/`) e o **nome** da fila; não
guardam estado de sessão. A lógica de parser (`lib/fila.mjs`) é **pura** (string → estrutura),
testável sem disco. O `listarFilas`/disco vive em `lib/index.mjs`.

## Ecossistema adt

O `adt-todo` é uma ferramenta consumidora sobre o motor `adt-client`, como o `adt-git` e o
`adt-query`, no monorepo `adt-tools`. Verdade por proximidade: mudou o motor → as ferramentas veem
na hora (workspace). A fila do próprio monorepo pode morar aqui.
