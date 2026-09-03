---
description: Lista objetos no sistema conectado (ex: TABL Z*, ou só Z* para todos os tipos)
argument-hint: [TIPO] <padrão>
allowed-tools: Bash(node bin/adt-git.mjs list:*), Bash(node bin/adt-git.mjs status:*), Read
---

Liste os objetos pedidos: `$ARGUMENTS`.

```
node bin/adt-git.mjs list $ARGUMENTS
```

**Não traduza nem normalize o tipo você mesmo** — passe o que o usuário escreveu. O CLI resolve
sinônimos e plural (`tabela`, `tabelas`, `table`, `relatório`, `include`…) para o código TADIR
canônico, e um tipo desconhecido falha listando os aceitos. Adivinhar aqui só esconde o erro.

**O tipo é opcional.** `list ZPKG_*` busca em todos os tipos e marca com `✓` os que o `checkout` sabe
baixar — é o caminho quando o usuário deu só um nome e ninguém sabe o tipo ainda. Não invente um tipo
para preencher o argumento.

Este comando **não grava nada em disco** — é busca. Para trazer um objeto, use `/adt-git:checkout`.

Se o erro disser que não há sessão, o passo anterior é `/adt-git:connect`.

Ao relatar, prefira a tabela como o CLI imprimiu. Se vier vazio, diga contra qual sistema a busca
rodou — pode ser sistema errado, não padrão errado.
