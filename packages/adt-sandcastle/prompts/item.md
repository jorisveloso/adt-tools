/next {{FILA}}

## Sessão autônoma (adt-sandcastle) — o que muda em relação ao `/next` de sempre

O runner (`packages/adt-sandcastle`) escolheu a fila `{{FILA}}`; o `next()` dela devolve o item
**{{ITEM_N}}** — "{{ITEM}}". Execute-o pela skill `next`, **um item só**, e saiba que ninguém vai
ler a sua resposta antes da próxima sessão: o runner decide **pelo ARQUIVO da fila** quando esta
sessão acabar.

| o item ficou… | o runner faz |
|---|---|
| `[x]` (por `fechar`) | conta como entregue; puxa o próximo |
| `> bloqueado:` (por sua decisão) | respeita — sai da rotação até alguém desbloquear |
| qualquer outra coisa | **adia o item para o fim da fila** (`adiar`), preservando o que você anotou (`em andamento` vira `adiado`), e puxa o próximo |

Ou seja: **o que você não gravar na fila não existe.**

- **Precisaria perguntar algo ao Joris** para prosseguir? Não invente a resposta:
  `anotarItem(undefined, '{{FILA}}', {{ITEM_N}}, 'bloqueado', '<a pergunta, objetiva>')`.
- **Travou por outro motivo** (ambiente, rede, medição inconclusiva, teto de tempo)? Registre o
  handoff — `anotarItem(undefined, '{{FILA}}', {{ITEM_N}}, 'em andamento', '<estado, hipótese,
  próximo passo>')` — e termine.
- Antes de fechar o pad do SAP GUI, matar processo, apagar ou sobrescrever arquivo: meça o que se
  perde e registre no resultado — não há ninguém para confirmar.
- Commit onde a mudança viveu, com a mensagem que explica a mudança (é seu). Depois da sessão o
  runner commita **o que sobrar** (a fila, arquivo esquecido) e faz `git push` no repositório da
  fila e no monorepo.
- **Termine a resposta com um bloco `<resumo>`** de até 3 linhas curtas (é lido num celular): o que
  evoluiu, o que ficou aberto, onde está (arquivo/commit). Exemplo:
  `<resumo>`
  `- Fechado: popup do cliente segura o GetObject; receita atualizada (adt-tools 106098d)`
  `- Aberto: onde mora a opção do cliente → fila 60`
  `- Medição: sap-accelerate/work/POC_rot_sapgui/medicoes/item34-rot.md`
  `</resumo>`

## Onde as coisas vivem

- Código **canônico** da lib do agente: `packages/adt-client/` (neste repositório). **Não** edite
  `C:\repositorio\jorisveloso\jbv-adt-client` — é o repositório legado, migrado para cá.
- Credenciais SAP: `C:\repositorio\jorisveloso\sap-accelerate\.env`
  (`SAP_<SID>_USER` / `_PASSWORD` / `_MANDANTE` / `_LANGUAGE`). Leia o arquivo à mão — senha com
  `#` quebra o `--env-file` do Node.
- POCs e medições: `C:\repositorio\jorisveloso\sap-accelerate\work\POC_<tema>/{scripts,medicoes/raw}`
  (fora do git; o backup é a cópia agendada da pasta). Scripts de POC importam a lib de
  `packages/adt-client/…` **deste** repositório, não do `node_modules` do sap-accelerate (atrasado).
- Laboratório de POC: **S4H, mandante 250** (sem VPN). O SXD exige a rede do cliente.
