// agente.mjs — o provider claudeCode do sandcastle, consertado para Windows sem contêiner.
//
// Medido em 05/09/2026 (sandcastle 0.12.0): `claudeCode().buildPrintCommand` monta
//   claude --print … --model 'claude-opus-5' … -p -
// com `shellEscape` de aspas SIMPLES (POSIX). No `noSandbox()` em Windows o comando vai ao cmd.exe,
// que não conhece aspas simples e entrega `'claude-opus-5'` LITERAL ao claude:
//   "There's an issue with the selected model ('claude-opus-5')" / unrecognized_model {"model":"'opus'"}
// O prompt não sofre (vai por stdin). Só `--model` e `--resume <id>` são escapados — e nenhum dos
// dois carrega aspas ou espaço, então trocar as aspas simples por duplas (que o cmd.exe entende)
// é seguro. Fora do Windows o comando fica como veio.

import { claudeCode } from '@ai-hero/sandcastle';

/** PURO: o comando do sandcastle com as aspas que o cmd.exe entende. */
export function paraCmdExe(command) {
  return command.replace(/'([^'\s"]*)'/g, '"$1"');
}

/** `claudeCode(model, opts)` que funciona no host Windows. */
export function claudeCodeHost(model, opts, { plataforma = process.platform } = {}) {
  const base = claudeCode(model, opts);
  if (plataforma !== 'win32') return base;
  return {
    ...base,
    buildPrintCommand(o) {
      const c = base.buildPrintCommand(o);
      return { ...c, command: paraCmdExe(c.command) };
    },
  };
}
