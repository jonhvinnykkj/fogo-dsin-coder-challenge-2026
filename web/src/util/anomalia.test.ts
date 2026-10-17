// "Esperado × medido" de um alerta de anomalia, lido da descrição que o servidor escreve (server/tempo-real/anomalias.ts).
import { describe, expect, it } from 'vitest';
import { lerAnomalia } from './anomalia';

describe('lerAnomalia', () => {
  it('lê métrica, medido, esperado, unidade e sentido de um radar zerado', () => {
    const d = 'Radar FOGO-RAD-0010 (Rua Augusto Manzon, Vila Operária da Alimentação II). Fluxo de veículos: 0 veículos/h, abaixo do normal para o horário: 258 veículos/h (variação habitual de 11,0, em 8 dias parecidos).';
    expect(lerAnomalia(d)).toEqual({
      metrica: 'Fluxo de veículos',
      medido: '0',
      esperado: '258',
      unidade: 'veículos/h',
      sentido: 'abaixo',
      variacao: '11,0',
      dias: 8,
    });
  });

  it('aceita decimais com vírgula, "%" e acima do normal', () => {
    expect(lerAnomalia('Patinete FOGO-PAT-0057 (Rua Bahia, Centro). Bateria: 6,9 %, abaixo do normal para o horário: 38,4 % (variação habitual de 8,7, em 6 dias parecidos).'))
      .toMatchObject({ metrica: 'Bateria', medido: '6,9', esperado: '38,4', unidade: '%', sentido: 'abaixo', dias: 6 });
    expect(lerAnomalia('Radar FOGO-RAD-0047 (Avenida Fernando Botelho Vilela, Jardim Domingos de Leo). Infrações registradas: 5 infrações/h, acima do normal para o horário: 1,3 infrações/h (variação habitual de 0,9, em 8 dias parecidos).'))
      .toMatchObject({ metrica: 'Infrações registradas', medido: '5', esperado: '1,3', unidade: 'infrações/h', sentido: 'acima' });
  });

  it('texto fora do formato devolve null (a tela mostra a descrição inteira)', () => {
    expect(lerAnomalia('Leitura estranha no equipamento.')).toBeNull();
  });
});
