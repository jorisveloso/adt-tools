// adt-note — aplicação/gerenciamento de notas SAP (migrado de sap-note).
// O CLI vive em tools/notas.mjs: `node tools/notas.mjs validar <nota> --sistema <alias>`.
// Depende de adt-client (local, workspace:*) para os canais de leitura (readTable / adobeFormInfo).
export const PACOTE = 'adt-note';
export const descricao = 'leitor e verificador de notas SAP aplicadas — valida por medição se a nota já foi aplicada no sistema-alvo';
