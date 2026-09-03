---
description: Abre a sessão com um sistema SAP via ADT (ex: d01:100:pt)
argument-hint: <alias>:<mandante>:<idioma>
allowed-tools: Bash(node bin/adt-git.mjs connect:*), Bash(node bin/adt-git.mjs status:*), Read
---

Abra a sessão ADT com o alvo `$ARGUMENTS`.

Rode, a partir da raiz deste repositório:

```
node bin/adt-git.mjs connect $ARGUMENTS
```

O comando **pede o usuário SAP e a senha no terminal**. Se o ambiente não for interativo, ele falha
dizendo isso — não tente contornar, nem passar senha por argumento ou variável de ambiente. Peça ao
usuário para rodar o comando ele mesmo (`! node bin/adt-git.mjs connect $ARGUMENTS`).

O usuário SAP **não** é o login do Windows e **não** está em nenhum arquivo do repositório: quem
responde é a pessoa. Se já houve um `connect` naquele mesmo sistema, o último usuário aparece entre
colchetes como sugestão e Enter aceita.

Se o alias não existir ou estiver sem URL, o erro já traz o que fazer: os aliases conhecidos estão no
`sistemas.json` local. Nem todo sistema tem URL de ADT confirmada — os que não têm precisam da porta
HTTP do ICM (`80<nn>`), que **não** é a porta do SAP GUI. `node bin/adt-git.mjs sistemas` mostra quais.

Ao final, relate em uma linha: sistema, mandante, usuário e até quando a sessão vale.
