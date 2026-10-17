import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buscarToken } from './token';

let pasta: string;
let caminho: string;

beforeAll(() => {
  pasta = mkdtempSync(join(tmpdir(), 'fogo-token-'));
  caminho = join(pasta, 'teste.db');
  const db = new Database(caminho);
  db.exec('CREATE TABLE equipamentos (codigo TEXT, tipo TEXT, token_dispositivo TEXT)');
  db.prepare('INSERT INTO equipamentos VALUES (?, ?, ?)').run('FOGO-RAD-0001', 'radar', 'abc123');
  db.close();
});
afterAll(() => rmSync(pasta, { recursive: true, force: true }));

describe('buscarToken', () => {
  it('devolve o token do equipamento, aceitando minúsculas e espaços', () => {
    expect(buscarToken(caminho, 'fogo-rad-0001 ')).toEqual({ codigo: 'FOGO-RAD-0001', tipo: 'radar', token: 'abc123' });
  });

  it('devolve null para código que não existe', () => {
    expect(buscarToken(caminho, 'FOGO-RAD-9999')).toBeNull();
  });

  it('falha com clareza se o banco não existe (não cria arquivo vazio)', () => {
    expect(() => buscarToken(join(pasta, 'nao-existe.db'), 'FOGO-RAD-0001')).toThrow();
  });
});
