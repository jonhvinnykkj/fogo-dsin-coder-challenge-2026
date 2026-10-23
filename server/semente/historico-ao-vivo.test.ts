// Ao vivo, cada chamada do simulador representa só um pedaço da hora (`escala`, um tick de 2 s): somadas ao longo da hora,
// as ocorrências têm de bater com o ritmo do histórico, inclusive nas janelas de entrada e saída das escolas.
import { describe, expect, it } from 'vitest';
import { cidadeSemeada } from '../preditivo/test-helpers';
import { instanteLocal } from '../tempo';
import { criarRng } from './aleatorio';
import { gerarOcorrenciasDaHora } from './historico';
import { montarContexto, SEMENTE_PADRAO } from './semear';

describe('ocorrências ao vivo', () => {
  it('na saída das escolas, uma hora em pedaços gera os acidentes leves de uma hora, não um pedaço = uma hora', () => {
    const cidade = cidadeSemeada();
    const hora = instanteLocal('2026-10-14', 17); // quarta-feira, janela das 17 h às 18 h
    const { ctx } = montarContexto(cidade.db, cidade.geo, SEMENTE_PADRAO, hora);
    const rng = criarRng(7);
    // 60 pedaços de 1 minuto (o tick de 2 s a 60×): a mesma hora com bem menos chamadas, para o teste não estourar o tempo.
    const pedacos = 60;
    let leves = 0;
    for (let i = 0; i < pedacos; i++) {
      const geradas = gerarOcorrenciasDaHora({ ...ctx, agora: new Date(hora.getTime() + i * 60_000) }, hora, [], { rng, escala: 1 / pedacos });
      leves += geradas.filter((g) => g.tipo === 'acidente' && g.gravidade === 1 && /escola/i.test(g.descricao)).length;
    }
    // Esperado: 0,1 por escola por hora, poucos no total. Sem a escala, cada pedaço gerava uma hora inteira (~70 aqui).
    expect(leves).toBeLessThan(15);
  });
});
