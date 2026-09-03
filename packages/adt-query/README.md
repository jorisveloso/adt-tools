# adt-query

Ferramenta de **consultas SAP (read-only)** via `adt-client` — pergunta "me dá os dados X do
sistema" por cima do motor, sem reinventar a rede.

## Estado

**Fundação criada (item 1)** e **spike medido no s4h (item 2), 2026-09-03**. **`consultar()` — a
consulta transparente por nome (item 3, primeiro passo)**: informa o nome da tabela **ou** da CDS
view + parâmetros; o adt-query descobre o tipo (DD02L + TADIR) e escolhe o canal (`readTable` ou
`dataPreview`) — transparente como uma SE16N. Ver [`docs/consulta.md`](docs/consulta.md).

```js
import { consultar } from 'adt-query';
const r = await consultar(conexao, 'I_CUSTOMER', { campos: ['CUSTOMER'], linhas: 5 });
// { ok: true, dados: [{ CUSTOMER: '...' }], tipo: 'view' }
```

## Próximo

**Item 3** (continuação): exemplos práticos do `consultar`; o que a medição quebrar vira item na
fila adt-client.
