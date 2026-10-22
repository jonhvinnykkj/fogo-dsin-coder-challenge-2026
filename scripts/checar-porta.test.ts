import { spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { mensagemPortaOcupada, portaLivre } from './checar-porta.mjs';

let ocupante: Server | undefined;
afterEach(() => new Promise<void>((ok) => (ocupante ? ocupante.close(() => ok()) : ok())).then(() => void (ocupante = undefined)));

/** Ocupa uma porta livre qualquer do sistema e devolve o número. */
function ocupar(): Promise<number> {
  return new Promise((ok) => {
    ocupante = createServer().listen({ port: 0, host: '127.0.0.1' }, () => ok((ocupante!.address() as { port: number }).port));
  });
}

describe('portaLivre', () => {
  it('diz que uma porta ocupada não está livre, e que uma solta está', async () => {
    const porta = await ocupar();
    expect(await portaLivre(porta)).toBe(false);
    await new Promise<void>((ok) => ocupante!.close(() => ok()));
    ocupante = undefined;
    expect(await portaLivre(porta)).toBe(true);
  });
});

describe('npm start com a porta ocupada', () => {
  it('avisa na hora, antes do build e da semente, com a mesma mensagem do servidor', async () => {
    const porta = await ocupar();
    const inicio = Date.now();
    const r = spawnSync(process.execPath, ['scripts/checar-porta.mjs'], { env: { ...process.env, PORT: String(porta) }, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr.trim()).toBe(mensagemPortaOcupada(porta));
    expect(Date.now() - inicio).toBeLessThan(5000);
  });

  it('recusa PORT inválida e deixa passar com a porta livre', () => {
    const invalida = spawnSync(process.execPath, ['scripts/checar-porta.mjs'], { env: { ...process.env, PORT: 'abc' }, encoding: 'utf8' });
    expect(invalida.status).toBe(1);
    expect(invalida.stderr).toMatch(/não é uma porta válida/);
    const livre = spawnSync(process.execPath, ['scripts/checar-porta.mjs'], { env: { ...process.env, PORT: '39871' }, encoding: 'utf8' });
    expect(livre.status).toBe(0);
  });
});
