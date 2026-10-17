// As previsões aprendem só com o histórico: falhas, quedas de sinal e mudanças de situação geradas pela simulação ao vivo
// (depois de meta.historico_ate + 1 h) não entram na previsão de falhas, nas tendências nem no resumo.
import type { Database } from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import type { RespostaFalhas, Tendencias } from '../../shared/modelos';
import type { ContextoApp } from '../contexto';
import { criarRelogioDeTeste } from '../test/ctx';
import { Barramento } from '../tempo-real/barramento';
import { MotorAlertas } from '../tempo-real/motor-alertas';
import { Simulador } from '../tempo-real/simulador';
import { preencherLacuna, SEMENTE_PADRAO } from '../semente/semear';
import { fimDosDados } from './base';
import { respostaFalhas } from './falhas';
import { calcularTendencias } from './tendencias';
import { AGORA_PREDITIVO, cidadeSemeada, copiaDaCidade } from './test-helpers';

/** 50 minutos depois do fim do histórico: a simulação roda nesse intervalo e as previsões são pedidas para este instante. */
const CONSULTA = new Date(AGORA_PREDITIVO.getTime() + 50 * 60_000);

let db: Database;
let antes: { falhas: RespostaFalhas; tendencias: Tendencias };
let falhasAoVivo: number;
let tocados: Set<number>;

beforeAll(() => {
  db = copiaDaCidade();
  antes = { falhas: respostaFalhas(db, { agora: CONSULTA }), tendencias: calcularTendencias(db, { agora: CONSULTA }) };

  const relogio = criarRelogioDeTeste(AGORA_PREDITIVO);
  const barramento = new Barramento();
  const ctx: ContextoApp = { db, barramento, motor: new MotorAlertas({ db, barramento, relogio }), relogio, geo: cidadeSemeada().geo };
  const sim = new Simulador(ctx, { semente: 9 });
  ctx.simulador = sim;
  sim.definir({ velocidade: 60 });
  const operacionais = (db.prepare("SELECT id FROM equipamentos WHERE situacao = 'operacional' ORDER BY id LIMIT 30").all() as { id: number }[]).map((l) => l.id);
  for (let i = 0; i < 300; i++) { // 10 minutos reais a 60×
    relogio.definir(new Date(relogio.agora().getTime() + 2000));
    sim.passo();
    if (i % 10 === 0 && operacionais.length) sim.injetar('falha', operacionais.pop()!); // mais 30 falhas pelo botão
  }
  const fim = new Date(fimDosDados(db, CONSULTA)).toISOString();
  falhasAoVivo = (db.prepare("SELECT COUNT(*) AS n FROM historico_situacao WHERE para = 'mau_funcionamento' AND em >= ?").get(fim) as { n: number }).n;
  tocados = new Set((db.prepare('SELECT DISTINCT equipamento_id AS id FROM historico_situacao WHERE em >= ?').all(fim) as { id: number }[]).map((l) => l.id));
}, 120_000);

describe('previsões × simulação ao vivo', () => {
  it('a simulação gerou falhas de verdade depois do fim do histórico', () => {
    expect(falhasAoVivo).toBeGreaterThanOrEqual(30);
  });

  it('previsão de falhas: totais e teste retroativo iguais; quem a simulação não tocou mantém a mesma chance', () => {
    const depois = respostaFalhas(db, { agora: CONSULTA });
    expect(depois.explicacao.dadosUsados).toEqual(antes.falhas.explicacao.dadosUsados);
    expect(depois.explicacao.confiabilidade).toEqual(antes.falhas.explicacao.confiabilidade);
    const antesPorId = new Map(antes.falhas.itens.map((r) => [r.equipamentoId, r]));
    const intocados = depois.itens.filter((r) => !tocados.has(r.equipamentoId));
    expect(intocados.length).toBeGreaterThan(100);
    for (const r of intocados) expect(r).toEqual(antesPorId.get(r.equipamentoId));
  });

  it('tendências: disponibilidade, uso de patinetes e falhas por modelo não mudam', () => {
    expect(calcularTendencias(db, { agora: CONSULTA })).toEqual(antes.tendencias);
  });

  // Ao reiniciar, preencherLacuna completa o histórico até a nova hora e o fim dos dados anda para depois da sessão ao vivo.
  // As mudanças de situação gravadas ao vivo continuam fora porque levam origem 'ao_vivo'. (Fica por último: grava no banco.)
  it('depois de reiniciar, as falhas da simulação continuam fora: mesmos números de um banco que não simulou nada', () => {
    const reinicio = new Date(AGORA_PREDITIVO.getTime() + 3 * 3_600_000);
    const referencia = copiaDaCidade();
    for (const base of [db, referencia]) preencherLacuna(base, { agora: reinicio, semente: SEMENTE_PADRAO, geo: cidadeSemeada().geo });
    expect(fimDosDados(db, reinicio)).toBeGreaterThan(CONSULTA.getTime()); // a sessão ao vivo agora está antes do fim dos dados
    const comSimulacao = respostaFalhas(db, { agora: reinicio });
    const semSimulacao = respostaFalhas(referencia, { agora: reinicio });
    expect(comSimulacao.explicacao.dadosUsados[0]).toBe(semSimulacao.explicacao.dadosUsados[0]); // "N falhas registradas nos últimos 60 dias"
    const ocorridas = (r: RespostaFalhas) => r.explicacao.confiabilidade.find((c) => c.metrica.startsWith('Falhas que aconteceram'))!.valor;
    expect(ocorridas(comSimulacao)).toBe(ocorridas(semSimulacao));
    expect(calcularTendencias(db, { agora: reinicio }).falhasPorModelo).toEqual(calcularTendencias(referencia, { agora: reinicio }).falhasPorModelo);
    referencia.close();
  }, 60_000);
});
