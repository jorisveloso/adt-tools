# Canal classrun — executar código ABAP e ler a saída (POST /sap/bc/adt/oo/classrun)

**Validado por spike: S4H release 758 (ABAP Platform 7.58), mandante 250, 2026-08-26.**
**Re-validado em sistema de cliente: SXD (KART) release 816, mandante 100, 2026-08-26** — deploy +
execução do driver de escrita, mesma mecânica, sem divergência.
Piso: ABAP ≥ 7.52 (é quando `if_oo_adt_classrun` existe). É o endpoint que o Eclipse usa no F9.

## Receita

1. Classe que implementa `if_oo_adt_classrun`, criada/ativada normalmente via `deploySource`
   (`type: 'class'`, `$TMP` para POC):

   ```abap
   CLASS yjbv_poc_cl_classrun DEFINITION PUBLIC FINAL CREATE PUBLIC.
     PUBLIC SECTION.
       INTERFACES if_oo_adt_classrun.
   ENDCLASS.

   CLASS yjbv_poc_cl_classrun IMPLEMENTATION.
     METHOD if_oo_adt_classrun~main.
       out->write( |…qualquer saída…| ).
     ENDMETHOD.
   ENDCLASS.
   ```

2. Execução — sessão ADT autenticada (cookie + token CSRF, a mesma do `call`):

   ```
   POST {base}/sap/bc/adt/oo/classrun/{classe}?sap-client={mandante}
   Accept: text/plain
   ```

   HTTP 200; **o body é a saída do console** (`out->write`). Nome da classe na URL funciona em
   maiúsculas E minúsculas (testados os dois). ~80ms no S4H.

## Gotchas (medidos)

- **HTTP 200 NÃO significa sucesso.** Erro de execução vem com status 200 e o erro no body
  (ex.: `Error: Class does not implement if_oo_adt_classrun~main method!`). Interpretar o BODY, não o status.
- **O load antigo da classe fica preso à SESSÃO STATEFUL que fez o deploy** — causa-raiz medida
  (S4H, 2026-08-26): após o activate, a mesma sessão devolve `Error: Class does not implement …`
  indefinidamente (5 retries de 3s não convergiram), enquanto uma sessão NOVA executa o load novo
  DE PRIMEIRA. Não é questão de esperar. Mitigação correta: rodar em sessão nova
  (`runClass(conexao, nome, { novaSessao: true })` — exige senha no cfg); `deployAndRun` já faz
  isso sozinho. O retry na mesma sessão é só o fallback para conexão só-cookie, e pode não convergir.

## Para que serve no arsenal

Canal genérico "agente executa código ABAP e lê o resultado" — base para drivers de POC
(ex.: montar BDCDATA, chamar wrapper de BDC e escrever a BDCMSGCOLL como JSON no console).
