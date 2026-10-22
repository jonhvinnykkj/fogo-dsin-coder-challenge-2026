// Ao vivo, cada chamada do simulador representa só um pedaço da hora (`escala`, um tick de 2 s): somadas ao longo da hora,
// as ocorrências têm de bater com o ritmo do histórico, inclusive nas janelas de entrada e saída das escolas.
import { describe, expect, it } from 'vitest';
import { cidadeSemeada } from '../preditivo/test-helpers';
import { instanteLocal } from '../tempo';
import { criarRng } from './aleatorio';
import { gerarOcorrenciasDaHora } from './historico';
import { montarContexto, SEMENTE_PADRAO } from './semear';

describe('ocorrências ao vivo', () => {
  it('na saída das escolas, uma hora de ticks de 2 s gera os acidentes leves de uma hora, não de 1.800 horas', () => {
    const cidade = cidadeSemeada();
    const hora = instanteLocal('2026-10-14', 17); // quarta-feira, janela das 17 h às 18 h
    const { ctx } = montarContexto(cidade.db, cidade.geo, SEMENTE_PADRAO, hora);
    const rng = criarRng(7);
    const ticks = 1800; // 1 hora a 1×
    let leves = 0;
    for (let i = 0; i < ticks; i++) {
      const geradas = gerarOcorrenciasDaHora({ ...ctx, agora: new Date(hora.getTime() + i * 2000) }, hora, [], { rng, escala: 2 / 3600 });
      leves += geradas.filter((g) => g.tipo === 'acidente' && g.gravidade === 1 && /escola/i.test(g.descricao)).length;
    }
    // Esperado: 0,1 por escola por hora; com as escolas da semente, poucos por hora. Antes, cada tick gerava uma hora inteira.
    expect(leves).toBeLessThan(15);
  });
});
