import { beforeAll, describe, expect, it } from 'vitest';
import type { Database } from 'better-sqlite3';
import type { Turno } from '../../shared/dominio';
import { instanteLocal } from '../tempo';
import { criarCtxDeTeste } from '../test/ctx';
import { recomendarReforco, respostaReforco } from './reforco';
import { AGORA_PREDITIVO, bairroPorNome, cidadeSemeada } from './test-helpers';

const HORA = 3_600_000;
const DIA = 24 * HORA;

function inserirAgentes(db: Database, bairroId: number, turno: Turno, quantidade: number, prefixo: string): void {
  const b = db.prepare('SELECT lat, lng FROM bairros WHERE id = ?').get(bairroId) as { lat: number; lng: number };
  const ins = db.prepare(
    `INSERT INTO agentes (nome, matricula, categoria, orgao, situacao, turno, base_logradouro, base_bairro_id, lat, lng, lat_atual, lng_atual, criado_em, atualizado_em)
     VALUES (?, ?, 'agente_transito', 'Secretaria de Mobilidade Urbana', 'em_servico', ?, 'Rua', ?, ?, ?, ?, ?, 'x', 'x')`,
  );
  for (let i = 0; i < quantidade; i++) ins.run(`Agente ${prefixo}${i}`, `${prefixo}-${i}`, turno, bairroId, b.lat, b.lng, b.lat, b.lng);
}

/** Ocorrências históricas a cada `intervaloH` horas nas 8 semanas antes de agora. */
function inserirHistorico(db: Database, bairroId: number, intervaloH: number): void {
  const ins = db.prepare(
    "INSERT INTO ocorrencias (tipo, gravidade, bairro_id, lat, lng, inicio, descricao, chuva, origem) VALUES ('seguranca', 2, ?, -22.2, -49.9, ?, '', 0, 'historico')",
  );
  const fim = AGORA_PREDITIVO.getTime();
  db.transaction(() => {
    for (let t = fim - 56 * DIA; t < fim; t += intervaloH * HORA) ins.run(bairroId, new Date(t + 10 * 60_000).toISOString());
  })();
}

describe('recomendarReforco', () => {
  it('Centro com muita ocorrência e 2 agentes, Sul com pouca e 10 agentes no mesmo turno: manda gente do Sul para o Centro', () => {
    const ctx = criarCtxDeTeste({ agora: AGORA_PREDITIVO });
    const centro = bairroPorNome(ctx.db, 'Centro');
    const fragata = bairroPorNome(ctx.db, 'Fragata'); // região Sul
    inserirHistorico(ctx.db, centro, 1);
    inserirHistorico(ctx.db, fragata, 24);
    inserirAgentes(ctx.db, centro, 'tarde', 2, 'C');
    inserirAgentes(ctx.db, fragata, 'tarde', 10, 'S');

    const recs = recomendarReforco(ctx.db, { agora: AGORA_PREDITIVO, horas: 24 });
    expect(recs.length).toBeGreaterThan(0);
    const [primeira] = recs;
    expect(primeira).toMatchObject({ regiaoOrigem: 'Sul', regiaoDestino: 'Centro' });
    expect(primeira!.quantidade).toBeGreaterThanOrEqual(1);
    expect(primeira!.quantidade).toBeLessThanOrEqual(9); // a origem nunca fica sem ninguém
    expect(primeira!.cargaPorAgenteDepois).toBeLessThan(primeira!.cargaPorAgenteAntes);
    // Quinta: o turno da tarde vai das 14 h às 22 h (hora de São Paulo).
    expect(primeira!.inicio).toBe(instanteLocal('2026-10-15', 14).toISOString());
    expect(primeira!.fim).toBe(instanteLocal('2026-10-15', 22).toISOString());
    expect(primeira!.motivo).toMatch(/Centro/);
    expect(primeira!.motivo).toMatch(/Zona Sul/);
    // Nenhum outro turno tem agentes escalados: nada a mover neles.
    expect(recs.every((r) => r.inicio === primeira!.inicio)).toBe(true);
  });

  describe('na cidade semeada', () => {
    let recs: ReturnType<typeof recomendarReforco>;
    beforeAll(() => {
      recs = recomendarReforco(cidadeSemeada().db, { agora: AGORA_PREDITIVO, horas: 24 });
    }, 120_000);

    it('no máximo 3 recomendações por turno, todas aliviando o destino, dentro das próximas 24 h', () => {
      const porTurno = new Map<string, number>();
      for (const r of recs) {
        porTurno.set(r.inicio, (porTurno.get(r.inicio) ?? 0) + 1);
        expect(r.regiaoOrigem).not.toBe(r.regiaoDestino);
        expect(r.quantidade).toBeGreaterThanOrEqual(1);
        expect(r.cargaPorAgenteDepois).toBeLessThan(r.cargaPorAgenteAntes);
        expect(Date.parse(r.inicio)).toBeGreaterThanOrEqual(AGORA_PREDITIVO.getTime());
        expect(Date.parse(r.fim)).toBeLessThanOrEqual(AGORA_PREDITIVO.getTime() + 24 * HORA);
        expect(Date.parse(r.fim)).toBeGreaterThan(Date.parse(r.inicio));
      }
      for (const n of porTurno.values()) expect(n).toBeLessThanOrEqual(3);
    });

    it('a resposta da rota traz a explicação para o gestor', () => {
      const r = respostaReforco(cidadeSemeada().db, { agora: AGORA_PREDITIVO, horas: 24 });
      expect(r.recomendacoes).toEqual(recs);
      expect(r.explicacao.dadosUsados.length).toBeGreaterThan(0);
      expect(r.explicacao.comoAjuda.length).toBeGreaterThan(20);
    });
  });
});
