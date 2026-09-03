---
name: abapgit
description: Traz objetos ABAP de um sistema SAP para o disco local, via ADT REST — conectar num sistema pelo SID de 3 letras, listar objetos de um tipo (tabelas Z*, classes Z*) e baixar um objeto. Use quando o usuário quiser ler, buscar, comparar ou versionar código ABAP fora do SAP, ou disser "conecta no <sistema>", "lista as tabelas Z", "baixa a <objeto>".
---

# abapgit — objetos ABAP do SAP para o disco

CLI que fala **ADT REST** direto com o SAP, da máquina do usuário, com o usuário SAP dele. **Nada é
instalado no servidor** — sem transporte, sem Basis, sem aprovação.

**Roda de qualquer pasta.** Os arquivos de estado ficam junto do script (a raiz vem de
`import.meta.url`, não de `process.cwd()`), então o diretório de trabalho não importa — é o que
permite usar a ferramenta de dentro da pasta de qualquer cliente.

Se `abapgit` estiver no PATH (`npm link` feito uma vez), invoque `abapgit <comando>`. Senão, use o
caminho completo: `node C:\repositorio\jorisveloso\abapgit\abapgit.mjs <comando>`. Os exemplos abaixo
usam a forma curta.

> Apesar do nome, **não tem relação** com a ferramenta homônima do mundo ABAP. Aquela roda dentro do
> SAP e fala com o Git; esta roda fora e fala com o SAP. Não aplique nada que você "saiba" da outra:
> não existe `.abapgit.xml`, nem repo online/offline, nem formato `.clas.abap`.

## Fase atual: SÓ LEITURA

SAP → disco. **Nenhum comando cria, altera ou apaga nada no servidor.** As funções de escrita existem
em `lib/adt-client.mjs` mas nenhum comando as chama — são a fase 2. Não as invoque por conta própria.

O que se sabe sobre **escrever** — receita e gotcha por tipo de objeto, media types, o que falha em
silêncio — está na skill **`adt-objetos`** (`skills/adt-objetos/SKILL.md`). Consulte-a antes de mexer
em qualquer `deploy*`, e **registre lá** todo erro de ADT que custar mais de uma tentativa.

Isso vale inclusive para `deleteObject`, que **APAGA o objeto no servidor** e é irreversível. Ela tem
guard-rail próprio (só Z/Y, e exige `confirm: true`), mas o guard-rail é a última linha, não a
primeira: não escreva script que a chame sem o Joris ter pedido aquela remoção, naquele sistema, por
nome. O mesmo para `dataPreview` — essa é só leitura (recusa qualquer coisa que não seja SELECT/WITH),
mas roda SQL contra dados de cliente.

## Comandos

```bash
node abapgit.mjs sistemas                # sistemas do SAP GUI e o que falta configurar em cada um
node abapgit.mjs connect d01:100:pt      # abre a sessão (PEDE A SENHA — ver abaixo)
node abapgit.mjs list TABL Z*            # busca objetos de um tipo
node abapgit.mjs list ZPKG_*             # sem tipo: busca em TODOS os tipos
node abapgit.mjs checkout ztb_pedido     # grava UM objeto no disco
node abapgit.mjs status                  # sessão atual
node abapgit.mjs logout                  # encerra
```

Mandante e idioma são opcionais no `connect` — sem eles valem os defaults de `sistemas.json`.

**`list` sem tipo é a forma de descobrir o que um nome é.** Ele lista tudo que casa, inclusive tipos
que o `checkout` ainda não baixa; os baixáveis vêm marcados com `✓`. Use quando o usuário der um nome
solto (`ZPKG_1234`) em vez de adivinhar o tipo.

**`--debug` (ou `-v`)** em qualquer posição mostra cada requisição ADT — método, URL, status, tempo,
tamanho — e o corpo das respostas de erro. Sai em stderr e acumula em `.abapgit.log` na raiz (não
versionado). É o primeiro passo quando um erro não se explica sozinho; sem ele, 403, 406 e 404 são
indistinguíveis de fora.

## `connect` precisa do terminal do usuário

O **usuário SAP** e a **senha** são perguntados na hora. A senha não tem eco e **nunca toca o disco**.
Se você rodar `connect` por uma ferramenta sem terminal interativo, ele falha dizendo isso.

O usuário SAP não vem do login do Windows (são nomes diferentes, e o login Windows costuma passar dos
12 caracteres que o SAP aceita) nem de `sistemas.json`, que é versionado. Quando já houve um `connect`
naquele sistema, o último usuário vira sugestão entre colchetes.

**Não tente contornar.** Não passe senha por argumento, variável de ambiente, `echo |` ou arquivo —
tudo isso vaza no histórico, e a decisão de não persistir senha é deliberada. Peça ao usuário para
rodar `node abapgit.mjs connect <alvo>` no terminal dele.

Depois que ele conectar, **`list` e `checkout` você roda normalmente**: eles leem a sessão cacheada
(só cookie + token CSRF, com validade de 30 min) e não precisam de terminal.

## Tipos de objeto

O termo canônico é o **código TADIR de 4 letras** — a mesma palavra da request de transporte, da
TADIR e do ADT.

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

**Passe o que o usuário escreveu, sem traduzir.** O CLI resolve sinônimo, acento, caixa e plural
(`tabelas`, `classes`, `includes`); tipo desconhecido falha listando os aceitos. Normalizar por conta
própria só esconde o erro dele.

Tipos fora dessa lista (`FUGR`, `TRAN`, `DOMA`, `SHLP`, `VIEW`, `ENQU`…) **ainda não são suportados**.

## Guard-rails — não contorne

- **Só objetos Z/Y.** Objeto padrão SAP é recusado por desenho.
- **Só leitura.** Nada é criado, alterado ou apagado no SAP.
- Objetos sem `/source/main` (`DTEL`, `MSAG`) gravam só o `.meta.json`. **Isso é o esperado**, não é falha.
- **`clone` não existe ainda.** Se pedirem um pacote inteiro, diga isso — não faça laço de `checkout`.

## Onde os arquivos caem

```
<raiz-do-cliente>/D01_100/ZPACOTE1/
├── _origem.json              sistema, mandante, idioma, url, usuário, quando
├── TABL/
│   ├── ZTB_PEDIDO.abap       o /source/main, como veio
│   └── ZTB_PEDIDO.meta.json  metadado normalizado
└── CLAS/ ...
```

A raiz por cliente está em `destinos.json` e fica **fora** do repositório da ferramenta — código de
cliente não entra em repo pessoal. Se `destinos.json` não existir, o erro diz como criar — e vem
**antes** de qualquer requisição, não depois de baixar o objeto.

## Quando algo falha

Os erros do CLI são acionáveis — **leia antes de investigar**. Os casos comuns:

| sintoma | causa | o que fazer |
|---|---|---|
| `nenhuma sessão aberta` | ainda não conectou, ou passaram 30 min | pedir ao usuário para rodar `connect` |
| `recusou o usuário` (401) | usuário ou senha errados, ou usuário bloqueado | o servidor está no ar — é credencial, não VPN nem SICF |
| `negou o discovery` (403) | autenticou, mas falta autorização (S_DEVELOP / S_ADT_RES) | pedir o perfil ao Basis do cliente |
| `404 no discovery` | nó SICF `/sap/bc/adt` inativo, ou URL de outro ICM | ativar em SICF, ou conferir a URL |
| `sem URL de ADT` | sistema está no SAP GUI mas sem endereço ADT | o erro traz o palpite e o `curl` para confirmar |
| timeout / DNS não resolve | VPN do cliente fora do ar | pedir ao usuário para subir a VPN |
| objeto não encontrado | nome errado, tipo não suportado, ou leitura barrada | **o erro já diz qual dos três é** — ele consulta o RIS e mostra o que existe com aquele nome |
| `cliente "x" não tem destino` | falta a entrada em `destinos.json` | copiar `destinos.exemplo.json` e ajustar a raiz daquele cliente |

O `connect` distingue esses três status — **não trate "não conectou" como causa desconhecida**, o
erro já diz qual dos três é.

Erro que continua sem explicação: repita com `--debug` e leia o status HTTP de cada requisição antes
de formular hipótese. Adivinhar a causa a partir da mensagem do CLI é o que faz perder tempo aqui.

A porta HTTP do ADT **não é** a do SAP GUI: SAP GUI usa o dispatcher (`32<nn>`), o ADT usa o ICM
(`80<nn>` / `443<nn>`), e o host pode ser outro — é comum o SAP GUI apontar para um IP e o ADT para
um nome DNS diferente.

## Estado dos sistemas

Não está escrito aqui, e não deve estar: host, mandante e cliente vivem em `sistemas.json`, que é
local e não versionado. **Rode `node abapgit.mjs sistemas`** para ver quais já têm URL de ADT
confirmada e quais ainda são incógnita. Sistema sem URL não é sistema quebrado — é sistema que
ninguém testou ainda; o erro do `connect` traz o palpite e o `curl` para confirmar.
