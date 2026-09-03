# adt-git

Traz objetos ABAP de um sistema SAP para o disco, via **ADT REST**. Roda na sua máquina, com o seu
usuário SAP. **Nada é instalado no servidor do cliente** — sem transporte, sem Basis, sem aprovação.

> Este pacote é o antigo `abapgit` migrado para o monorepo `adt-tools`. Não há relação com a ferramenta
> ABAP homônima do mundo Git: aquela roda *dentro* do SAP e fala com o Git; esta roda *fora* e fala com
> o SAP.

**Fase atual: só leitura.** SAP → disco. Nenhum comando cria, altera ou apaga nada no servidor.
Gravar de volta é a fase 2 — as receitas e gotchas de escrita já estão na skill `adt-objetos`
(`skills/adt-objetos/SKILL.md`).

## Instalar

Só o **Node ≥ 18**. Sem SAP NW RFC SDK, sem binding nativo, sem dependência de runtime — o cliente
ADT usa o `fetch` nativo.

```bash
npm link      # uma vez, de dentro desta pasta; põe `adt-git` no PATH
```

Depois disso **roda de qualquer pasta**: os arquivos de estado (`sistemas.json`, `destinos.json`,
`.sessao.json`, `.abapgit.log`) ficam junto do script, não do diretório onde você está. Não existe um
`process.cwd()` no código — a raiz vem de `import.meta.url`. É isso que deixa a ferramenta utilizável
a partir da pasta de qualquer cliente.

> `npm link`, e não `pnpm link --global`: o `--global` não existe mais no `pnpm` 11. O pnpm continua
> sendo o gerenciador do projeto (`packageManager` no `package.json`) — o `npm link` só cria o symlink
> do binário.

Sem o link, use o caminho completo: `node <pasta-do-adt-git>/bin/adt-git.mjs`. Os exemplos abaixo assumem
o link feito. Se **mover** a pasta depois, refaça o link.

Para rodar os testes: `pnpm install` (vitest é a única dependência, e é de desenvolvimento).

## Pré-requisitos no SAP

O que costuma faltar em cliente novo — confira antes de investigar qualquer outra coisa:

| requisito | como conferir |
|---|---|
| Porta **HTTP do ICM** alcançável | `curl -i http://<host>:80<nn>/sap/bc/adt/core/discovery` (`nn` = nº da instância) |
| Nó SICF **`/sap/bc/adt`** ativo | SICF → `default_host/sap/bc/adt`. Inativo responde **404** |
| Usuário com autorização de **desenvolvedor** | sem ela, **403** |
| **VPN** do cliente | quase todos os sistemas são IP privado |

⚠️ **A porta do ADT não é a do SAP GUI.** O SAP GUI usa o dispatcher (`32<nn>`); o ADT usa o ICM
(`80<nn>` HTTP, `443<nn>` HTTPS). E o **host pode ser outro** — é comum o SAP GUI apontar para um IP e
o ADT para um nome DNS diferente. Um não implica o outro, e é por isso que a URL sugerida pelo
`sistemas` vem marcada como **palpite**.

## Configurar

### Sistemas

A lista vem do próprio SAP GUI (`%APPDATA%\SAP\Common\SAPUILandscape.xml`, inclusive os arquivos que
ele inclui). Não se mantém host à mão.

```bash
adt-git sistemas
```

```
· P01    http://10.0.0.20:8000  (palpite)          —        01-ACME-P01-PRODUCAO
         falta: url do ADT + cliente → sistemas.json
✓ D01    http://sapdev01.exemplo.local:8000        acme     ACME - D01 - Dev / Testes
```

O que o landscape **não** sabe vai em `sistemas.json` — a URL do ADT e o cliente:

```bash
cp sistemas.exemplo.json sistemas.json
```

```json
"d01": { "cliente": "acme", "url": "http://sapdev01.exemplo.local:8000", "mandante": "100", "idioma": "PT" }
```

Alias que não existe no SAP GUI também pode ser cadastrado aqui, com todos os campos.

### Destinos

```bash
cp destinos.exemplo.json destinos.json
```

Define, por cliente, **onde os objetos são gravados**. A raiz precisa ficar **fora deste
repositório**: código de cliente não entra em repo pessoal.

### Senha

Não se configura. É perguntada no `connect`, fica em memória enquanto o processo roda e **nunca toca
o disco**. O que é cacheado (`.sessao.json`) é só o cookie e o token CSRF, com prazo de validade.

`sistemas.json`, `destinos.json`, `.sessao.json` e `.abapgit.log` são **locais e não versionados** —
host, mandante e nome de objeto de cliente não entram em repositório.

## Usar

```bash
adt-git sistemas                # o que o SAP GUI conhece e o que falta configurar
adt-git connect d01:100:pt      # pede a senha, abre a sessão (vale 30 min)
adt-git list TABL Z*            # lista tabelas Z do sistema conectado
adt-git list ZPKG_*             # sem tipo: lista TODOS os tipos que casam
adt-git checkout ztb_pedido     # grava o objeto no disco
adt-git status                  # sessão atual
adt-git logout                  # encerra
```

Mandante e idioma são opcionais no `connect` — sem eles valem os defaults do `sistemas.json`.

**`list` sem tipo é como se descobre o que um nome solto é.** Ele busca em todos os tipos e marca com
`✓` os que o `checkout` sabe baixar — `ZPKG_1234` é um **pacote**, não um objeto, e sem isso o
`checkout` só dizia "não encontrado". O servidor corta em 200 resultados e o rodapé avisa quando isso
acontece: **lista truncada não é lista vazia.**

Pelo Claude Code: `/adt-git:connect`, `/adt-git:list`, `/adt-git:checkout`.

### `--debug` quando algo não se explica

```bash
adt-git checkout ztb_pedido --debug
```

Mostra cada requisição — método, URL, status, tempo, tamanho — e o corpo das respostas de erro. Sai em
**stderr** (o stdout continua só com o resultado) e acumula em `.abapgit.log`. Senha, cookie e token
**nunca** entram no log; header aparece por nome, nunca por valor.

Sem ele, 403, 404 e 406 são indistinguíveis de fora — e significam coisas diferentes.

## Tipos

O termo canônico é o **código TADIR de 4 letras**, a mesma palavra da request de transporte, da TADIR
e do ADT.

| código | objeto | também aceita |
|---|---|---|
| `TABL` | tabela | tabela, table, tab |
| `CLAS` | classe | classe, class, cl |
| `INTF` | interface | interface, if |
| `PROG` | programa | programa, program |
| ↳ | só report | `REPORT`, relatorio, executavel |
| ↳ | só include | `INCLUDE`, inc |
| `DTEL` | data element | elemento de dados, data element, de |
| `DDLS` | CDS view | cds, cds view, ddl |
| `MSAG` | classe de mensagens | message class, mensagens |

Plural também vale. Sinônimo é conveniência de digitação: a saída, o `.meta.json` e o nome da pasta
usam **sempre** o código canônico. Tipo desconhecido falha listando os aceitos.

## Onde os arquivos caem

```
<raiz-do-cliente>/D01_100/ZPACOTE1/
├── _origem.json              sistema, mandante, idioma, url, usuário, quando
├── TABL/
│   ├── ZTB_PEDIDO.abap       o /source/main, como veio
│   └── ZTB_PEDIDO.meta.json  metadado normalizado
└── CLAS/
    ├── ZCL_PEDIDO.abap
    └── ZCL_PEDIDO.meta.json
```

A procedência está **no caminho**, não só no metadado: `D01_100/` e `Q01_100/` convivem lado a lado, e
baixar do segundo nunca sobrescreve o primeiro.

Objetos sem `/source/main` (`DTEL`, `MSAG`) gravam só o `.meta.json` — a definição deles é o próprio
metadado. Isso é o esperado, não é falha.

## Testes

```bash
pnpm install        # uma vez
pnpm test
```

Cobrem o que dá para testar **sem VPN** — parsers de XML do ADT, vocabulário de tipos, scanner de
dependências e a montagem de sessão (contra um servidor HTTP local). Rede real e gravação em disco só
são exercitáveis contra um SAP de verdade.

## Limites conhecidos

- **O `checkout` baixa o que a pasta `lib/tipos/` sabe** — hoje **13 códigos TADIR**: `TABL`,
  `CLAS`, `INTF`, `DTEL`, `DDLS`, `MSAG`, `PROG`, `DOMA`, `FUGR`, `DDLX`, `SRVD`, `SRVB`, `BDEF`.
  Um tipo fora dela (ex.: `SHLP`, `VIEW`, `ENQU`) dá "o objeto existe mas o tipo ainda não é
  suportado" — não confunda com nome errado.
  *(A metade de **escrita** da lib `adt-client` cobre mais tipos que o `checkout` — ver a skill
  `adt-objetos`.)*
- **Busca limitada a 200 resultados** pelo servidor. O `list` avisa quando cortou; refine o padrão.
- **`clone` não existe.** Trazer um pacote inteiro depende de listar o conteúdo do pacote, que é
  código novo e não escrito. Se pedirem um pacote, diga isso — não faça laço de `checkout`.
- **ADT comprovado em um sistema só.** Cada sistema novo é incógnita até alguém rodar o `curl` do
  discovery — `adt-git sistemas` mostra quais ainda estão sem URL.
- **Conteúdo de tabela está fora de escopo.** `checkout TABL` traz a definição DDIC, não as linhas.
