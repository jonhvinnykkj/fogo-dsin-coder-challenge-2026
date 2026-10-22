import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tokenDispositivoConfere } from '../server/seguranca/cripto';
import { gerarNovoToken } from './token';

let pasta: string;
let caminho: string;

beforeAll(() => {
  pasta = mkdtempSync(join(tmpdir(), 'fogo-token-'));
  caminho = join(pasta, 'teste.db');
  const db = new Database(caminho);
  db.exec('CREATE TABLE equipamentos (id INTEGER PRIMARY KEY, codigo TEXT, tipo TEXT, token_dispositivo TEXT)');
  db.prepare('INSERT INTO equipamentos (codigo, tipo, token_dispositivo) VALUES (?, ?, ?)').run('FOGO-RAD-0001', 'radar', 'sha256:antigo');
  db.close();
});
afterAll(() => rmSync(pasta, { recursive: true, force: true }));

const guardado = () => {
  const db = new Database(caminho, { readonly: true });
  try {
    return (db.prepare("SELECT token_dispositivo AS t FROM equipamentos WHERE codigo = 'FOGO-RAD-0001'").get() as { t: string }).t;
  } finally {
    db.close();
  }
};

describe('gerarNovoToken', () => {
  it('gera um token novo, aceitando minúsculas e espaços, e grava só o hash dele', () => {
    const gerado = gerarNovoToken(caminho, 'fogo-rad-0001 ');
    expect(gerado).toMatchObject({ codigo: 'FOGO-RAD-0001', tipo: 'radar' });
    expect(gerado!.token).toMatch(/^[0-9a-f]{32}$/);
    expect(guardado()).not.toContain(gerado!.token);
    expect(tokenDispositivoConfere(gerado!.token, guardado())).toBe(true);
  });

  it('o token anterior deixa de valer', () => {
    const primeiro = gerarNovoToken(caminho, 'FOGO-RAD-0001')!.token;
    gerarNovoToken(caminho, 'FOGO-RAD-0001');
    expect(tokenDispositivoConfere(primeiro, guardado())).toBe(false);
  });

  it('devolve null para código que não existe', () => {
    expect(gerarNovoToken(caminho, 'FOGO-RAD-9999')).toBeNull();
  });

  it('falha com clareza se o banco não existe (não cria arquivo vazio)', () => {
    expect(() => gerarNovoToken(join(pasta, 'nao-existe.db'), 'FOGO-RAD-0001')).toThrow();
  });
});
