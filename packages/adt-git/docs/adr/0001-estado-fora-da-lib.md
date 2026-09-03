# O abapgit é sem estado; a conexão e os caminhos vêm de quem chama

O `abapgit` deixa de ser uma ferramenta autônoma com lógica própria de config/sessão/layout e vira uma
**lib distribuível** (repositório git próprio, `bin` incluído) cujas funções de repositório (`clone`,
`checkout`, `commit`, `diff`, `list`) recebem de quem chama a `conexao` (do `jbv-adt-client`) já aberta
e os `caminhos` de disco. O `abapgit` não conhece sistemas, não abre sessão, não decide pastas e não
grava estado de sessão.

**Opções consideradas:** (1) a arquitetura antiga, com cópia local do adt-client e o CLI resolvendo
config/caminhos por conta própria — descartada porque duplica a lib e trava projetos como `sap-accelerate`,
que já têm a conexão e o layout de pastas definidos por fora; (2) subir as funções de repositório para o
consumidor — descartada porque reaproveitar a metáfora clone/checkout/commit/diff exigiria duplicar a
orquestração em cada projeto.

**Consequências:** o CLI `abapgit` continua existindo, mas só como um consumidor mínimo — monta a
conexão e resolve os caminhos antes de chamar a lib. O consumidor de verdade (ex.: `sap-accelerate`)
é quem detém o estado. Decidido na sabatina 2026-09-02, junto da decisão de o `abapgit` ser lib + CLI
consumindo `jbv-adt-client` por dependência local `file:`.
