# adt-todo

Fila de trabalho **local**, **multi-projeto** — um item por sessão, com ideias e triagem. O
comando `/next` da skill consome isto. Herda o modelo e o formato da fila do jbv-adt-client
(`docs/fila.md`), generalizado para **várias filas** (um arquivo markdown por projeto).

## Modelo

- **Fila / projeto**: um arquivo markdown em `docs/filas/<nome>.md`. `projetos.json` (opcional)
  descreve cada projeto (nome, origem, rota). Sem ele, toda `*.md` da pasta é uma fila.
- **Item**: `- [ ] N. Título` com notinhas `>` sob ele (`> bloqueado:`, `> em andamento:`,
  resultado). O **N** é identidade (nunca muda); a **ordem** no arquivo é a de execução.
- **Next**: o primeiro item aberto sem `> bloqueado:`; item com `> em andamento:` tem prioridade
  (retomar do estado descrito). Todos bloqueados → sem próximo.

## Uso (lib)

```js
import { next, add, fechar, anotarItem, status, listarFilas } from 'adt-todo';

listarFilas();                 // [{ nome, caminho }] as filas em docs/filas/
add('matt-pocock', 'Escrever spec', { bloqueado: 'aguarda grilling' });
next('matt-pocock');           // item a executar (ou null)
anotarItem('matt-pocock', 1, 'em andamento', 'rascunhando o modelo');
fechar('matt-pocock', 1, 'spec publicada no tracker');
status('matt-pocock');         // { total, concluidos, abertos, bloqueados, proximo }
```

Cada fila aponta para uma realidade externa (ex.: a fila `docs/fila.md` do jbv-adt-client, ou os
tickets do Azure DevOps do matt pocock), mas o **pacote guarda filas próprias** — a integração com
cada origem é responsabilidade da skill/consumidor, não deste pacote. As versões com disco usam a
pasta `docs/filas/` por padrão (`FILAS_DIR`); passe outra pasta para atacar filas externas.

## Testes

```bash
pnpm test        # vitest, só a lógica pura (sem disco/rede)
```
