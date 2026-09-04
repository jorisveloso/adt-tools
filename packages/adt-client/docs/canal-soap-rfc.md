# Canal SOAP RFC — chamar FM remote-enabled por HTTP puro (/sap/bc/soap/rfc)

**Validado por spike: S4H release 758, mandante 250, 2026-08-26** — `STFC_CONNECTION`, HTTP 200 em ~350ms.
**Re-validado em sistema de cliente: SXD (KART) release 816, mandante 100, 2026-08-26** — ping,
`readTable` (T000), `callBapi` (BAPI_COMPANYCODE_GETLIST, 91 empresas) e wrapper BDC, sem divergência.
Sem SDK, sem biblioteca: `fetch` + XML + Basic Auth. Alcança sistemas antigos (ICF existe desde Web AS ~6.20),
desde que o nó esteja ativo na SICF. tRFC/qRFC não passam por este canal.

## Receita

```
POST {base}/sap/bc/soap/rfc?sap-client={mandante}
Content-Type: text/xml; charset=utf-8
SOAPAction: (vazio)
Authorization: Basic user:pass
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP-ENV:Body>
    <urn:STFC_CONNECTION xmlns:urn="urn:sap-com:document:sap:rfc:functions">
      <REQUTEXT>eco de teste</REQUTEXT>
    </urn:STFC_CONNECTION>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>
```

O elemento do Body é o NOME DO FM; parâmetros de import viram elementos filhos; tabelas viram
`<NOME_TABELA><item>…</item></NOME_TABELA>`. A resposta vem em `<urn:NOME_FM.Response>` com os
parâmetros de export/tables.

⚠️ **Parâmetro TABLES que NÃO vai no envelope NÃO volta na resposta** (medido 2026-09-02, S4H 758,
item 71, com contra-prova dupla): o FM roda, preenche a tabela, e o serializador do ICF a omite —
o resultado é **0 linhas SEM ERRO**. `TR_EXT_GET_REQUESTS` com `IV_AUTHOR` devolveu 0 requests até
o request levar `<ET_REQUESTS></ET_REQUESTS>`; com a tag, as mesmas 9. Idem `ET_E070A` no
`TR_READ_COMM` (o atributo SAPCORR só veio com a tabela no envelope). Regra: **toda tabela que se
quer de volta entra vazia no request** — `TABELA: []` no `callFunction` da lib.

⚠️ **Os valores da resposta chegam escapados como entidade XML** — `&` num campo da E07T vem
`&#38;` (medido 2026-09-02: a mesma descrição via ADT era `SOAP & RFC`). Desde o item 71 os
parsers da lib (`xmlField`/`xmlItems`/`xmlStruct`) desfazem o escape (named + numéricas); parse
manual do XML cru precisa fazer o mesmo, senão o valor devolvido não é o que está no banco.

Resposta real do spike (`STFC_CONNECTION`): `ECHOTEXT` (eco) e `RESPTEXT` com dados do sistema —
`SAP R/3 Rel. 758 Sysid: S4H Date: … Logon_Data: 250/USER/E`. Útil como ping + descoberta de release.

## Requisitos no sistema

- Nó `/sap/bc/soap/rfc` ativo na SICF (no S4H da Moovi já estava; 401 sem credencial = nó ativo).
- Usuário com S_RFC para o function group do FM chamado.
- Alerta de segurança SAP (Nota 1394100): o canal é poderoso — em produtivo, restringir por autorização.

## Para que serve no arsenal (✅ = validado no S4H em 2026-08-26)

- ✅ `ping`/`systemInfo` — STFC_CONNECTION (o RESPTEXT traz release/SID/logon)
- ✅ `readTable` — RFC_READ_TABLE (QUERY_TABLE/DELIMITER/ROWCOUNT/FIELDS; linhas voltam em
  `<DATA><item><WA>campo|campo|…</WA></item></DATA>`). Validado na T000, 5 linhas parseadas.
  ⚠️ **`TABLE_WITHOUT_DATA` também é o que o FM levanta quando um CAMPO PEDIDO NÃO EXISTE** — a
  exceção se lê como "a tabela não tem dados" e manda procurar no lugar errado (medido 2026-08-29,
  S4H 758: `E071` com o campo `GENFLAG`, cujo nome certo é `GENNUM`, e com um campo inventado
  levantam a MESMA exceção; com `GENNUM`, lê). A lib anexa a dica ao erro (`dicaDeLeitura`).
  Quando o nome exato não é certeza, chamar **sem `campos`**: os nomes vêm na própria resposta.
- ✅ `callBapi` — BAPI_COMPANYCODE_GETLIST devolveu 128 empresas + `<RETURN>` com TYPE vazio
  (= sucesso). Parse do RETURN: TYPE/CODE/MESSAGE/MESSAGE_V1..4.
- ✅ **`TH_USER_LIST` — a SM04 sem passar pelo ADT** (s4h 758, 04/09/2026, item 28). É o instrumento
  para medir quando o próprio ADT é o suspeito: este canal usa Basic e **não carrega cookie**, então
  continua respondendo quando toda sessão stateful está caída.
  `callFunction(cfg, 'TH_USER_LIST', { USRLIST: [] })` + `xmlItems(xml, 'USRLIST')` → TID, MANDT,
  BNAME, TCODE, TERM, ZEIT, TYPE (202 = HTTP), STAT, EXTMODI, HOSTADDR. Lembrar da regra da tabela
  vazia no envelope: **sem `USRLIST: []` volta 200 com zero linhas**. `TH_WPINFO` com `WPLIST: []`
  idem (19 WPs). `TH_SYSTEMWIDE_USER_LIST` e `TH_USER_INFO` dão SOAP Fault neste release.
- ⛔ **BAPI de ESCRITA por este canal NÃO persiste** (medido no S4H em 2026-08-26): BAPI numa
  chamada + BAPI_TRANSACTION_COMMIT em OUTRA = cada POST é uma LUW própria, o update task da
  1ª morre com o contexto e o commit da 2ª responde "ok" sem gravar nada — armadilha SILENCIOSA.
  Escrita via BAPI exige BAPI + COMMIT na MESMA LUW: driver classrun (≥ 7.52) ou wrapper Z
  único. Ver `receita-ciclo-escrita-verificacao.md`.
- ✅ **Wrapper Z de BDC por este canal — VALIDADO (S4H 758, 2026-08-26).** É o caminho de ESCRITA
  para sistemas SEM classrun (basis < 7.52): um FM RFC que faz `CALL TRANSACTION` é criado por ADT
  REST (`deployFunctionModule` + `buildBdcWrapperSource`) e chamado por SOAP RFC. POC com VA03 +
  documento inexistente devolveu `EV_SUBRC=1001` e a msg de negócio `E V1 302` de volta — o mesmo
  resultado do canal classrun, mas por HTTP puro. Ver `receita-fm-rfc-wrapper.md`.
