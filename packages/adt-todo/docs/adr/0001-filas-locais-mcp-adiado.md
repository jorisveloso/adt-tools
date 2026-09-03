# As filas do adt-todo são markdown local no v1; MCP fica adiado

O `adt-todo` guarda as filas de trabalho como **arquivos markdown locais** (`docs/filas/<nome>.md`),
um por projeto, e o agente opera esses arquivos direto. Um MCP dedicado às filas **não** é construído
agora: sem autenticação nem sistema externo no meio (as filas são locais), o MCP adicionaria uma
camada sem benefício — o agente já lê/escreve o markdown.

**Opções consideradas:** (1) MCP de filas já no v1 — descartado porque encapsula execução que não
precisa de servidor; as filas são locais e o agente as alcança direto; (2) filas vivendo no tracker
externo (Azure DevOps) — descartado neste v1 porque reinicia a fila numa origem com credencial e
acoplamento desnecessário para começar.

**Consequências:** o pacote guarda fila, não sincroniza origem — cada fila é um espelho local de uma
realidade externa (jbv-adt-client `fila.md`, matt pocock no Azure DevOps) e a sincronização é
**manual, documentada na skill `/next`**. O MCP ganha sentido quando a origem externa **automatizar**
(ex.: `queue.list`/`queue.next` puxando tickets do Azure DevOps por trás) — aí o servidor encapsularia
credenciais/HTTP; até lá, fila local. Decidido na sessão 2026-09-02.
