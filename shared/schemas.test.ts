import { describe, expect, it } from 'vitest';
import { dataExiste, equipamentoInputSchema, filtrosEquipamentoSchema, mudancaSituacaoSchema } from './schemas';

const valido = {
  tipo: 'radar',
  numeroSerie: 'RAD-0001',
  marca: 'Sensys',
  modelo: 'X1',
  orgao: 'Secretaria de Mobilidade Urbana',
  situacao: 'operacional',
  cep: '17509-020',
  logradouro: 'Avenida Sampaio Vidal',
  referencia: 'nº 181',
  bairroId: 1,
  lat: -22.2139,
  lng: -49.9458,
  manutencaoNecessidade: 'nenhuma',
  caracteristicas: { modalidade: 'velocidade', velocidadeMaxima: 60, faixas: 2, sentido: 'Centro → Bairro' },
};

function erros(r: { success: boolean; error?: { issues: { message: string }[] } }) {
  return r.success ? [] : r.error!.issues.map((i) => i.message);
}

describe('equipamentoInputSchema', () => {
  it('aceita equipamento válido no centro', () => {
    expect(equipamentoInputSchema.safeParse(valido).success).toBe(true);
  });
  it('recusa coordenada fora de Marília', () => {
    const r = equipamentoInputSchema.safeParse({ ...valido, lat: -23.55, lng: -46.63 });
    expect(r.success).toBe(false);
    expect(erros(r).join(' ')).toContain('Marília');
  });
  it('exige próxima manutenção quando agendada', () => {
    expect(equipamentoInputSchema.safeParse({ ...valido, manutencaoNecessidade: 'agendada' }).success).toBe(false);
    expect(
      equipamentoInputSchema.safeParse({ ...valido, manutencaoNecessidade: 'agendada', proximaManutencao: '2026-11-01T00:00:00Z' }).success,
    ).toBe(true);
  });
  it('exige periodicidade quando periódica', () => {
    const base = { ...valido, manutencaoNecessidade: 'periodica', proximaManutencao: '2026-11-01T00:00:00Z' };
    expect(equipamentoInputSchema.safeParse(base).success).toBe(false);
    expect(equipamentoInputSchema.safeParse({ ...base, manutencaoPeriodicidadeDias: 90 }).success).toBe(true);
  });
  it('valida CEP e faixa de Marília', () => {
    expect(equipamentoInputSchema.safeParse({ ...valido, cep: '01310-100' }).success).toBe(false);
    expect(equipamentoInputSchema.safeParse({ ...valido, cep: '17509020' }).success).toBe(true);
    expect(equipamentoInputSchema.safeParse({ ...valido, cep: '17540-000' }).success).toBe(false);
  });
  it('valida as características pelo tipo', () => {
    const r = equipamentoInputSchema.safeParse({ ...valido, caracteristicas: { modalidade: 'velocidade', velocidadeMaxima: 250, faixas: 2, sentido: 'x' } });
    expect(r.success).toBe(false);
  });
  it('mensagem em pt-BR para número de série vazio', () => {
    expect(erros(equipamentoInputSchema.safeParse({ ...valido, numeroSerie: '' }))).toContain('Informe o número de série');
  });
});

describe('outros schemas', () => {
  it('mudancaSituacao exige motivo', () => {
    expect(mudancaSituacaoSchema.safeParse({ situacao: 'furtado', motivo: 'ab' }).success).toBe(false);
    expect(mudancaSituacaoSchema.safeParse({ situacao: 'furtado', motivo: 'B.O. registrado' }).success).toBe(true);
  });
  it('filtros têm paginação padrão e limite', () => {
    const f = filtrosEquipamentoSchema.parse({});
    expect(f.pagina).toBe(1);
    expect(f.porPagina).toBe(25);
    expect(filtrosEquipamentoSchema.safeParse({ porPagina: 101 }).success).toBe(false);
    expect(filtrosEquipamentoSchema.parse({ pagina: '2' }).pagina).toBe(2);
  });
});

describe('datas e campos vazios', () => {
  it('dataExiste: 30/02 e 31/04 não existem, 29/02 só em ano bissexto, e aceita hora depois da data', () => {
    expect(dataExiste('2026-02-30')).toBe(false);
    expect(dataExiste('2026-04-31')).toBe(false);
    expect(dataExiste('2026-02-29')).toBe(false);
    expect(dataExiste('2028-02-29')).toBe(true);
    expect(dataExiste('2026-10-17T12:00:00.000Z')).toBe(true);
    expect(dataExiste('2026-13-01')).toBe(false);
  });
  it('instalação impossível é recusada pelo schema', () => {
    const r = equipamentoInputSchema.safeParse({ ...valido, instaladoEm: '2026-02-30' });
    expect(erros(r)).toContain('Data de instalação: data inválida');
  });
  it('próxima manutenção antes da última é recusada', () => {
    const r = equipamentoInputSchema.safeParse({ ...valido, manutencaoNecessidade: 'agendada', ultimaManutencao: '2026-10-10', proximaManutencao: '2026-10-09' });
    expect(erros(r)).toContain('A próxima manutenção não pode ser anterior à última');
  });
  it('tipo, órgão e CEP vazios têm mensagem própria; valor errado continua "valor inválido"', () => {
    const vazio = equipamentoInputSchema.safeParse({ ...valido, tipo: undefined, orgao: undefined, cep: '' });
    expect(erros(vazio)).toEqual(expect.arrayContaining(['Escolha o tipo', 'Escolha o órgão', 'Informe o CEP']));
    // As telas mostram a primeira mensagem de cada campo: a do CEP vazio é "Informe o CEP", não a do formato.
    expect(vazio.success ? undefined : vazio.error.issues.find((i) => i.path[0] === 'cep')?.message).toBe('Informe o CEP');
    const errado = equipamentoInputSchema.safeParse({ ...valido, tipo: 'x', orgao: 'y' });
    expect(erros(errado)).toEqual(expect.arrayContaining(['Tipo: valor inválido', 'Órgão responsável: valor inválido']));
  });
});
