---
description: Traz UM objeto ABAP do sistema conectado para o disco
argument-hint: <objeto> [tipo]
allowed-tools: Bash(node bin/adt-git.mjs checkout:*), Bash(node bin/adt-git.mjs list:*), Bash(node bin/adt-git.mjs status:*), Read
---

Traga o objeto `$ARGUMENTS` para o disco.

```
node bin/adt-git.mjs checkout $ARGUMENTS
```

`checkout` traz **um objeto**. Para um pacote inteiro seria `clone`, que ainda não existe — se o
usuário pedir um pacote, diga isso em vez de fazer um laço de `checkout`.

Sem o tipo, o CLI sonda os tipos conhecidos até achar (uma chamada por tipo). Se você já sabe o tipo,
passe como segundo argumento — é mais rápido e o erro fica mais claro.

Guard-rails que o CLI aplica e você não deve tentar contornar:
- **só objetos Z/Y** — objeto padrão SAP é recusado
- **só leitura** — nada é criado, alterado ou apagado no servidor
- objetos sem `/source/main` (`DTEL`, `MSAG`) gravam só o `.meta.json`; isso é o esperado, não falha

Se o objeto não for achado, **leia o erro inteiro**: ele consulta o serviço de busca e diz qual dos
três casos é — nome inexistente (com os parecidos), tipo que existe mas o checkout ainda não baixa,
ou objeto existente cuja leitura falhou. Só nesse último caso repita com `--debug` para ver o status
HTTP. Não repita o comando às cegas nem tente adivinhar o tipo.

Ao final, diga onde os arquivos caíram e a que sistema/mandante pertencem.
