// adt-server.mjs — PROTÓTIPO de servidor MCP local (stdio).
//
// Objetivo: deixar o Joris VER como um MCP funciona, sem tocar em SAP nenhum.
// Ele expõe tools que SIMULAM as operações do ecossistema adt. Cada tool
// recebe { conexao?, ...args } e devolve um resultado JSON — o mesmo contrato
// que, no futuro, chamaria o adt-client de verdade por dentro.
//
// Este protótipo usa o SDK oficial @modelcontextprotocol/sdk com transporte
// stdio: o cliente (opencode/claude) inicia este processo e conversa por
// stdin/stdout em JSON-RPC. O schema dos argumentos usa Zod (exigência do SDK).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'adt-tools (prototipo)', version: '0.0.1' });

// "Catalogo" das capacidades — aqui é onde o oraculo consultaria as fontes da
// lib. No protótipo é uma tabela fixa; no real, viria do registro MODULOS/TYPES
// do adt-client + docs de cobertura.
const CAPACIDADES = {
  'table':   { veredito: 'AGENTE',   receita: 'adt-objetos § tabela',   origem: 'modulo table' },
  'class':   { veredito: 'AGENTE',   receita: 'adt-objetos § classe + teste', origem: 'modulo class' },
  'interface':{ veredito: 'AGENTE',  receita: 'adt-objetos § interface', origem: 'modulo interface' },
  'tran':    { veredito: 'AGENTE (não provado via ADT)', receita: 'receita-tran.md (driver)', origem: 'tran.mjs' },
  'view':    { veredito: 'AGENTE',   receita: 'receita-view-classica.md', origem: 'view.mjs' },
  'sm30':    { veredito: 'AGENTE',   receita: 'receita-tobj-sm30.md', origem: 'sm30.mjs' },
  'shlp':    { veredito: 'MANUAL (hoje)', receita: null, origem: 'sem canal (só SE11)' },
};

// Tool 1 — capacidade: "consigo fazer X?"  (o oraculo)
server.tool(
  'adt_capacidade',
  { tipo: z.string().describe('tipo/código TADIR ou tarefa (ex: table, tran, view)') },
  async ({ tipo }) => {
    const c = CAPACIDADES[tipo];
    if (!c) {
      // Sem fonte que decida → MANUAL hoje + registra lacuna (como a skill manda).
      return { content: [{ type: 'text', text: JSON.stringify({
        veredito: 'MANUAL (hoje)',
        motivo: `sem fonte que decida "${tipo}" no catálogo atual`,
        lacunaRegistrada: true,
      }, null, 2) }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify({ ...c, lacunaRegistrada: false }, null, 2) }] };
  },
);

// Tool 2 — conectar (simulado). No real: dataPreview/discovery do adt-client.
server.tool(
  'adt_conectar',
  {
    sistema: z.string(),
    mandante: z.string(),
  },
  async ({ sistema, mandante }) => {
    return { content: [{ type: 'text', text: JSON.stringify({
      ok: true,
      sessao: `sessao-simulada-${sistema}-${mandante}`,
      validaAte: '30min',
      nota: 'PROTÓTIPO — conexão simulada, sem rede SAP',
    }, null, 2) }] };
  },
);

// Tool 3 — criar tabela (simulado). No real: deploySource do adt-client.
server.tool(
  'adt_criar_tabela',
  {
    conexao: z.string().describe('identificador da sessão vinda de adt_conectar'),
    nome: z.string(),
    campos: z.array(z.string()).describe('ex: ["c1", "c2", "ce"]'),
  },
  async ({ nome, campos }) => {
    const col = (campos || []).map((c) => ({ campo: c, dominio: null }));
    return { content: [{ type: 'text', text: JSON.stringify({
      ok: true,
      criado: nome.toUpperCase(),
      campos: col,
      deploy: 'ativado (simulado)',
      teste: 'ABAP Unit verde (simulado — prova por outra LUW)',
    }, null, 2) }] };
  },
);

// Inicia o transporte stdio.
const transport = new StdioServerTransport();
await server.connect(transport);
