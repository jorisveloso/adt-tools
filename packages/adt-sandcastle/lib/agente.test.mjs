// agente.test.mjs — o conserto das aspas para o cmd.exe é puro; o provider embrulhado preserva o resto.
import { test, expect } from 'vitest';
import { paraCmdExe, claudeCodeHost } from './agente.mjs';

test('paraCmdExe troca as aspas simples do shellEscape por duplas, só em tokens sem espaço', () => {
  expect(paraCmdExe("claude --print --model 'claude-opus-5' --resume 'abc-123' -p -"))
    .toBe('claude --print --model "claude-opus-5" --resume "abc-123" -p -');
  expect(paraCmdExe("echo 'tem espaco aqui'")).toBe("echo 'tem espaco aqui'");
});

test('claudeCodeHost: no Windows o comando sai com aspas duplas; fora dele, intocado', () => {
  const o = { prompt: 'x', dangerouslySkipPermissions: false };
  const win = claudeCodeHost('claude-opus-5', { permissionMode: 'auto' }, { plataforma: 'win32' }).buildPrintCommand(o);
  expect(win.command).toContain('--model "claude-opus-5"');
  expect(win.command).toContain('--permission-mode auto');
  expect(win.command).not.toContain("'");
  expect(win.stdin).toBe('x');
  const nix = claudeCodeHost('claude-opus-5', {}, { plataforma: 'linux' }).buildPrintCommand(o);
  expect(nix.command).toContain("--model 'claude-opus-5'");
});
