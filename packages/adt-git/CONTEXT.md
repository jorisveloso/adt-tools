# abapgit

Ferramenta **lib + CLI** que traz objetos ABAP de um sistema SAP para o disco local, via ADT REST, sem
instalar nada no servidor do cliente. O vocabulário mapeia o SAP para a metáfora do git: o **pacote** é
o "repositório" e o objeto de código é o "arquivo".

O `abapgit` é uma **lib distribuível** (repositório git próprio): expõe a lógica de "repositório"
(`clone`, `checkout`, `commit`, `diff`, `list`) como funções importáveis, e tem o `bin` que as chama
pela linha de comando. Consome a mecânica ADT da lib irmã `jbv-adt-client` (**dependência `file:`
local**). O `abapgit` orquestra a metáfora de repositório sobre a pasta em disco; o `jbv-adt-client`
faz a mecânica ADT com o SAP.

## Linguagem

**Pacote**:
Um objeto de agrupamento SAP (`Z*`) que contém outros objetos de código, identificado pelo `DEVCLASS`
na TADIR. Corresponde ao "repositório" do git.
_Evite_: repositório, grupo, pasta de código

**Objeto**:
Uma unidade única de código ABAP (tabela, classe, interface, CDS, programa...), referenciada pelo código
TADIR de 4 letras (`TABL`, `CLAS`, ...) e pelo nome. Corresponde ao "arquivo" do git.
_Evite_: fonte, artefato, unidade

**Checkout**:
Baixar um único objeto do SAP para o disco. Comando `abapgit checkout <objeto>`. Analogia: `git checkout <arquivo>`.
_Evite_: baixar, buscar

**Clone**:
Baixar um pacote inteiro — ler a TADIR para descobrir os objetos do pacote e baixar cada um. Comando
`abapgit clone <pacote>`. Analogia: `git clone <repositorio>`.
_Evite_: copiar pacote, exportar

**List**:
Comando `abapgit list` com duas semânticas disjuntas por presença de tipo:
- sem tipo (ou com o alias `pkg`) → sempre sobre pacotes: conteúdo de um pacote exato (`list zpacote`)
  ou busca de pacotes por nome (`list z*`), ambos via TADIR;
- com tipo (`list tabl z*`) → busca de objetos por tipo+nome via Search do ADT, como sempre foi.
Sem tipo `=` pacote, sempre. Não existe tipo explícito `PKG` no sistema de tipos — é só um alias de
digitação no `list`.
_Evite_: listar tudo, buscar

**TADIR**:
A tabela SAP que mapeia objetos ao pacote (`DEVCLASS`) a que pertencem. Fonte de verdade da descoberta
de pacotes e do conteúdo de um pacote, via `dataPreview`.

**Commit**:
Criar ou atualizar um objeto no SAP a partir do disco local. Comando `abapgit commit <objeto>`. Analogia:
`git commit`. É a fase de escrita (fase 2) — hoje o ferramenta é só leitura.
_Evite_: gravar, subir, enviar, push

**Diff**:
Comparar o fonte local (no disco) com o objeto ativo no SAP. Comando `abapgit diff <objeto>`. Analogia:
`git diff`. Começa textual (linha a linha, igual/diferente); a normalização e o comparativo entre
sistemas são evolução posterior.
_Evite_: comparar, conferir

## Equivalentes do git — cultura de decisão

Nem todo comando do git tem correspondência no ABAP. Decidido nesta sabatina (2026-09-02):

**Fazem sentido:** `clone` (pacote), `checkout` (objeto), `commit` (objeto), `diff` (objeto), `status`,
`list`.

**Descartados** (sem correspondência no domínio ABAP):
- `add`/`stage` — não há área de staging no SAP; o objeto ou é gravado ou não é.
- `init`/`branch`/`merge` — não há branch/merge no modelo de objetos ABAP.
- `fetch`/`remote` — o SAP é a única origem; não há remoto.
- `push` — não há "área intermediária" no SAP equivalente ao remoto do git.
- `log` — decidido descartar nesta etapa (o versionamento ADT é luxo não prioritário).

## Capacidade (adt-capacidade)

Semântica transversal ao `checkout`, `clone` e `commit`: a pergunta "esse tipo a lib trata?" é
respondida **em runtime** pelo registro de tipos da lib `jbv-adt-client` — o `checkout`/`clone` sonda
as lib keys conhecidas da lib (`MODULOS`/`TYPES`) e baixa tudo o que ela cobre; não há lista fixa de
tipos duplicada no abapgit. A skill `adt-capacidade` é o caminho humano/agente para ler o catálogo e a
cobertura TADIR da lib e, quando um tipo não é coberto, registrar a lacuna em `docs/demandas.md` da lib
para tratamento futuro — o objeto não é trazido/gravado, mas a dor fica registrada. Pode ser consultada
em tempo de `checkout` (sem `clone`) ou de `clone`/`commit`.

## Ecossistema adt e futuro MCP (decidido na sabatina 2026-09-02)

O `adt-client` é visto como **um conjunto de ferramentas para conectar e trabalhar objetos SAP**
(ler, criar, alterar, testar, apagar). Sobre ele orbitam ferramentas consumidoras — `adt-git` (metáfora
de repositório, o antigo `abapgit`), `adt-query` (consultas), `adt-note` — num **monorepo `adt-tools`**
futuro: uma raiz git com `packages/` (cada ferramenta um pacote publicável, todas dependendo do motor
via `workspace:*`). Os repos externos atuais (`jbv-adt-client`, `abapgit`) são mantidos intactos; o
monorepo é criado por cópia, e o motor ainda roda em repositório paralelo até ser movido para dentro.

O MCP (ex.: `adt-tools`) é o **destino natural** para encapsular a execução: o agente passa
`conexao` + pedido e o servidor executa internamente (a lib fica dentro do servidor, não exposta ao
agente); pode rodar **local** (stdio, na máquina com a VPN) alcançando SAP de cliente. Foi feito um
**protótipo MCP local** com 3 tools (`adt_capacidade`, `adt_conectar`, `adt_criar_tabela`) para o Joris
experimentar o conceito. Um pacote/service de **capacidade/oráculo** (`atório` do que a lib faz) é a
consulta "consigo fazer X?" — no protótipo, uma tool; no futuro, alimentada pelo registro/cobertura da
lib. Cobrança e proteção do conhecimento são objetivos futuros, ainda a desenhar (esbarram na VPN para
acesso remoto a SAP de cliente). O **plano completo do monorepo** está em `docs/plano-monorepo-adt-tools.md`.
_Evite_: expor os .mjs/lib ao agente quando a execução for encapsulada pelo MCP

## Estado fora da lib (inversão de dependência)

O `abapgit` é **sem estado**: não conhece sistemas, não abre sessão, não decide pastas, não grava
estado de sessão. As funções da lib recebem a `conexao` (do `jbv-adt-client`) já aberta e os `caminhos`
(de disco) de quem chama. O **consumidor** (ex.: `sap-accelerate`) é quem monta a conexão, decide a
config de sistemas e o layout de pastas no disco. O CLI `abapgit` existe para uso standalone, mas como
um consumidor mínimo — ele monta a conexão e resolve os caminhos antes de chamar a lib. [ADR 0001].
_Evite_: abapgit resolver config/caminhos, abapgit abrir sessão
