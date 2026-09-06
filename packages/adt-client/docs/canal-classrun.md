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

- **Linha de fonte > 255 caracteres derruba o PUT com HTTP 400**, e o corpo do erro é o único lugar
  que diz isso: `ExceptionResourceBadRequest` / `Zeile N hat mehr als 255 Zeichen`
  (SEDI_ADT 015, `com.sap.adt.communicationFramework.subType=TooLongLine`). Pega quando o driver
  **gera** o ABAP a partir de JS e concatena uma lista numa linha só (um `WHERE … OR … OR …`).
  Quebre a linha gerada. Medido no SXD 816/100 em 2026-09-06. O tipo da exceção não ajuda —
  vale a regra que já está na dica do `setSource`: ler o corpo inteiro.

## Buscar no código-fonte quando o ADT não deixa

O ADT expõe busca full-text em fonte — `/sap/bc/adt/repository/informationsystem/textsearch`
`{?searchString,searchFromIndex,searchToIndex,getAllResults}{&packageName*}{&userName*}{&objectName*}{&objectType*}`,
declarada no `/sap/bc/adt/discovery`. **Mas o sistema pode recusar:** no SXD 816/100 (2026-09-06)
responde HTTP 500 `Quelltextsuche wird nicht unterstützt` (SRIS_SEARCH 006) — o índice de busca de
fonte não está ativo. O `search` (quickSearch) que a lib usa é só por NOME de objeto; não substitui.

Fallback medido: varrer com `READ REPORT` dentro de um classrun, filtrando a TRDIR por padrão de
nome. O programa de uma classe é `CL_NOME…===CP`, então padrões de FUGR/PROG **não** cobrem classes
— precisa de um lote próprio (`CL_%`).

```abap
SELECT name FROM trdir WHERE name LIKE 'LJ1B%'
                          OR name LIKE 'CL_J_1B%' INTO TABLE @DATA(lt_prog).
LOOP AT lt_prog INTO DATA(ls_prog).
  READ REPORT ls_prog-name INTO lt_src.
  IF sy-subrc <> 0. CONTINUE. ENDIF.
  LOOP AT lt_src INTO DATA(lv_line).
    IF to_upper( lv_line ) CS 'GTIN'.  " … out->write( … )
```

Custo medido no SXD (mesma máquina, uma chamada de classrun cada): **7.775 programas em 22s**,
**21.522 em 38s**, **19.555 em 31s** — ~600 programas/s. Cabe folgado no timeout do ICM, e pega
transformações (`…===XT`) e pools de classe junto. Exemplo real: `medir-item16-scan.mjs` da
`sap-accelerate/work/POC_4029823_j1b1n`.

## Para que serve no arsenal

Canal genérico "agente executa código ABAP e lê o resultado" — base para drivers de POC
(ex.: montar BDCDATA, chamar wrapper de BDC e escrever a BDCMSGCOLL como JSON no console) e para
varredura de repositório quando o canal de busca do ADT não está disponível.
