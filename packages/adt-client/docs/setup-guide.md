# Conectar no SXD 100 usando ADT Client

## Configuração em 3 passos

### 1. Configurar `sistemas.json`

Edite `.lib/adt/sistemas.json` com as credenciais do SXD 100:

```json
{
  "SXD": {
    "cliente": "seu-cliente",
    "url": "http://sxd100.seuhost.com:8000",
    "mandante": "100",
    "idioma": "PT"
  }
}
```

**Campos obrigatórios:**
- `cliente` — nome da pasta em `destinos.json` onde os objetos ABAP serão salvos
- `url` — endereço do ADT REST (ICM do SAP) — exemplo: `http://sxd100:8000`
- `mandante` — tenant SAP (normalmente 100, 200, etc.)
- `idioma` — português (PT), inglês (EN), etc.

**Dica:** O alias `SXD` é um identificador de 3 letras. Use o SID do seu sistema.

### 2. Configurar `destinos.json`

Edite `.lib/adt/destinos.json` para definir onde os objetos ABAP serão salvos:

```json
{
  "seu-cliente": {
    "raiz": "C:\\repositorio\\seus-projetos\\abap",
    "prefixos": ["ZSUA", "Z"],
    "profundidadeMaxima": 1
  }
}
```

**Campos:**
- `raiz` — pasta onde os objetos ABAP ficarão (DEVE estar **fora** deste repositório)
- `prefixos` — apenas objetos com esses prefixos (ex: Z, Y, ZSUA)
- `profundidadeMaxima` — níveis de dependência a trazer (1 = somente o objeto)

### 3. Testar a conexão

```bash
# Verificar configuração
node node_modules/adt-client/session.mjs SXD 100

# Listar objetos do sistema
node node_modules/adt-client/search.mjs SXD 100 ZSUA*
```

## Como usar

### Via CLI do abapgit (recomendado)

Se você tiver o CLI `abapgit` instalado:

```bash
# Listar sistemas configurados
abapgit.mjs sistemas

# Conectar e listar objetos
abapgit.mjs list SXD 100

# Baixar um objeto
abapgit.mjs checkout SXD 100 ZCLASS_NAME
```

### Via Node.js direto

```bash
# Teste de conexão
node -e "
const { criarConexao } = require('./node_modules/adt-client/sap-connection.mjs');
const cfg = {
  base: 'http://sxd100:8000',
  user: 'seu_usuario_sap',
  pass: '', // será perguntado
  client: '100',
  lang: 'PT'
};
criarConexao(cfg).then(conn => console.log('Conectado!'));
"
```

## Troubleshooting

### "Não consigo acessar a URL do ADT"

- Verifique se a porta está correta (normalmente 8000)
- Teste: `ping sxd100.seu-dominio.com`
- Verifique firewall / proxy corporativo

### "Erro de autenticação"

- Confirme que o usuário SAP tem permissão ADT (PFCG role)
- Tente primeiro via SAP GUI para validar as credenciais

### "Erro no mandante"

- O mandante deve ser exatamente como aparece no SAP (100, 200, etc.)
- Verifique se há um leading zero (100 vs 0100)

### "Sessão expirada"

- O arquivo `.sessao.json` é criado automaticamente
- Se expirar, delete-o e reconecte — a senha será perguntada novamente

## Próximos passos

Com a conexão configurada, você pode:

1. **Listar objetos** — procurar por tipos e prefixos
2. **Baixar objetos** — trazer código do SAP para seu repositório local
3. **Subir objetos** — criar/alterar objetos direto no SAP via ADT REST
4. **Testar com ABAP Unit** — validar código automaticamente
5. **Integrar no VAPER** — usar como parte do ciclo de delivery

## Referência

- README: `node_modules/adt-client/README.md`
- Skill ADT: `.claude/skills/adt-objetos/SKILL.md`
- Skill abapgit: `.claude/skills/abapgit/SKILL.md`
- Conhecimento: `.lib/knowledge/sap/sap-adt-learnings.md`
