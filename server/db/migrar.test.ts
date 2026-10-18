import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrar } from './migrar';

describe('migrar: cidade/UF', () => {
  it('banco antigo, sem cidade e uf, ganha as colunas e lê Marília/SP', () => {
    const db = new Database(':memory:');
    // Forma antiga: o esquema atual sem as duas colunas.
    const antigo = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')
      .split('\n')
      .filter((l) => !/^\s*(cidade|uf)\s+TEXT NOT NULL DEFAULT/.test(l))
      .join('\n');
    db.exec(antigo);
    const colunas = () => (db.prepare("PRAGMA table_info('equipamentos')").all() as { name: string }[]).map((c) => c.name);
    expect(colunas()).not.toContain('cidade');
    db.prepare("INSERT INTO bairros (nome, regiao, lat, lng, cep, poligono) VALUES ('Centro', 'Centro', -22.2, -49.9, '17500-000', '{}')").run();
    db.prepare(
      `INSERT INTO equipamentos (codigo, tipo, numero_serie, marca, modelo, orgao, situacao, cep, logradouro, bairro_id, lat, lng, lat_atual, lng_atual, token_dispositivo, criado_em, atualizado_em)
       VALUES ('FOGO-RAD-0001', 'radar', 'SN-1', 'M', 'X', 'O', 'operacional', '17500-000', 'Rua A', 1, -22.2, -49.9, -22.2, -49.9, 't', 'agora', 'agora')`,
    ).run();

    migrar(db);

    expect(colunas()).toEqual(expect.arrayContaining(['cidade', 'uf']));
    expect(db.prepare('SELECT cidade, uf FROM equipamentos').get()).toEqual({ cidade: 'Marília', uf: 'SP' });
    migrar(db); // segunda partida não quebra
    db.close();
  });
});
