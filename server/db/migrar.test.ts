import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { garantirImediataNoMauFuncionamento, migrar } from './migrar';

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

describe('migrar: número de série sem diferenciar maiúsculas (D3)', () => {
  const inserir = (db: InstanceType<typeof Database>, serie: string, codigo: string) =>
    db
      .prepare(
        `INSERT INTO equipamentos (codigo, tipo, numero_serie, marca, modelo, orgao, situacao, cep, logradouro, bairro_id, lat, lng, lat_atual, lng_atual, token_dispositivo, criado_em, atualizado_em)
         VALUES (?, 'radar', ?, 'M', 'X', 'O', 'operacional', '17500-000', 'Rua A', 1, -22.2, -49.9, -22.2, -49.9, 't', 'agora', 'agora')`,
      )
      .run(codigo, serie);

  it('banco antigo com "REV-X" e "rev-x" ganha o índice sem perder ninguém, e depois recusa a repetição', () => {
    const db = new Database(':memory:');
    db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')); // como um banco criado antes da regra
    db.prepare("INSERT INTO bairros (nome, regiao, lat, lng, cep, poligono) VALUES ('Centro', 'Centro', -22.2, -49.9, '17500-000', '{}')").run();
    inserir(db, 'REV-X', 'FOGO-RAD-0001');
    inserir(db, 'rev-x', 'FOGO-RAD-0002');

    migrar(db);

    expect((db.prepare('SELECT numero_serie AS s FROM equipamentos ORDER BY id').all() as { s: string }[]).map((l) => l.s)).toEqual(['REV-X', 'rev-x (repetido 2)']);
    expect(() => inserir(db, 'Rev-X', 'FOGO-RAD-0003')).toThrow(/UNIQUE/);
    migrar(db); // segunda partida não renomeia de novo
    expect((db.prepare('SELECT COUNT(*) AS n FROM equipamentos').get() as { n: number }).n).toBe(2);
    expect((db.prepare('SELECT numero_serie AS s FROM equipamentos WHERE id = 2').get() as { s: string }).s).toBe('rev-x (repetido 2)');
    db.close();
  });
});

describe('migrar: mau funcionamento ⇒ manutenção imediata', () => {
  it('banco antigo com equipamento em mau funcionamento sem manutenção imediata é corrigido, uma única vez', () => {
    const db = new Database(':memory:');
    db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
    db.prepare("INSERT INTO bairros (nome, regiao, lat, lng, cep, poligono) VALUES ('Centro', 'Centro', -22.2, -49.9, '17500-000', '{}')").run();
    const inserir = (codigo: string, situacao: string, necessidade: string) =>
      db.prepare(
        `INSERT INTO equipamentos (codigo, tipo, numero_serie, marca, modelo, orgao, situacao, cep, logradouro, bairro_id, lat, lng, lat_atual, lng_atual, manutencao_necessidade, token_dispositivo, criado_em, atualizado_em)
         VALUES (?, 'radar', ?, 'M', 'X', 'O', ?, '17500-000', 'Rua A', 1, -22.2, -49.9, -22.2, -49.9, ?, 't', 'agora', 'agora')`,
      ).run(codigo, `SN-${codigo}`, situacao, necessidade);
    inserir('FOGO-RAD-0001', 'mau_funcionamento', 'nenhuma');
    inserir('FOGO-RAD-0002', 'mau_funcionamento', 'periodica');
    inserir('FOGO-RAD-0003', 'operacional', 'nenhuma');

    migrar(db);

    const necessidades = () => (db.prepare('SELECT manutencao_necessidade AS m FROM equipamentos ORDER BY id').all() as { m: string }[]).map((l) => l.m);
    expect(necessidades()).toEqual(['imediata', 'imediata', 'nenhuma']);
    // Uma escolha feita depois pelo formulário não é desfeita na partida seguinte.
    db.prepare("UPDATE equipamentos SET manutencao_necessidade = 'agendada' WHERE id = 1").run();
    expect(garantirImediataNoMauFuncionamento(db)).toBe(0);
    expect(necessidades()).toEqual(['agendada', 'imediata', 'nenhuma']);
    db.close();
  });
});
