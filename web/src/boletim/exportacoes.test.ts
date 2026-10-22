import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agente, Equipamento, PainelManutencao } from '../../../shared/modelos';
import { buscarTodas, csvAgentes, csvEquipamentos, csvManutencoesPendentes, nomeDoArquivo } from './exportacoes';

const EQ: Equipamento = {
  id: 7, codigo: 'FOGO-RAD-0007', tipo: 'radar', numeroSerie: 'SN-7', marca: 'Perkons', modelo: 'SC-400', orgao: 'Secretaria de Mobilidade Urbana',
  situacao: 'mau_funcionamento', cep: '17500-000', logradouro: 'Avenida Sampaio Vidal', referencia: 'oposto ao nº 181', cidade: 'Marília', uf: 'SP',
  bairroId: 1, bairroNome: 'Centro', regiao: 'Centro', lat: -22.2138, lng: -49.9508, latAtual: -22.2138, lngAtual: -49.9508,
  manutencaoNecessidade: 'periodica', manutencaoPeriodicidadeDias: 90, ultimaManutencao: '2026-08-01', proximaManutencao: '2026-10-30',
  caracteristicas: {}, instaladoEm: '2022-12-02', ultimoSinalEm: '2026-10-19T13:05:00.000Z', criadoEm: '2022-11-26T10:00:00.000Z', atualizadoEm: '2026-10-19T13:05:00.000Z',
};

const AG: Agente = {
  id: 3, nome: 'Ana Souza', matricula: 'AT-1007', categoria: 'agente_transito', orgao: 'Secretaria de Mobilidade Urbana', situacao: 'em_servico',
  turno: 'tarde', baseLogradouro: 'Rua Paraíba', baseBairroId: 1, baseBairroNome: 'Centro', regiao: 'Centro', lat: -22.2138, lng: -49.9508,
  latAtual: -22.2138, lngAtual: -49.9508, telefone: '(14) 3402-0000', ultimoSinalEm: null, criadoEm: '2026-10-01T10:00:00.000Z', atualizadoEm: '2026-10-01T10:00:00.000Z',
};

const linhas = (csv: string) => csv.replace(/^﻿/, '').split('\r\n').filter(Boolean);

describe('csvEquipamentos', () => {
  it('cabeçalho e linha com rótulos em português, datas dd/mm/aaaa (sem cair no dia anterior) e coordenadas com vírgula', () => {
    const [cabecalho, linha] = linhas(csvEquipamentos([EQ]));
    expect(cabecalho).toBe('Código;Tipo;Nº de série;Marca;Modelo;Órgão;Situação;CEP;Logradouro;Referência;Bairro;Região;Cidade/UF;Latitude;Longitude;'
      + 'Necessidade de manutenção;Periodicidade (dias);Última manutenção;Próxima manutenção;Instalado em;Último sinal');
    expect(linha).toBe('FOGO-RAD-0007;Radar de fiscalização;SN-7;Perkons;SC-400;Secretaria de Mobilidade Urbana;Mau funcionamento;17500-000;'
      + 'Avenida Sampaio Vidal;oposto ao nº 181;Centro;Centro;Marília/SP;-22,213800;-49,950800;Periódica;90;01/08/2026;30/10/2026;02/12/2022;19/10/2026 10:05');
  });

  it('campos opcionais ausentes ficam vazios', () => {
    const semManutencao: Equipamento = { ...EQ, manutencaoNecessidade: 'nenhuma', ultimoSinalEm: null };
    delete semManutencao.manutencaoPeriodicidadeDias;
    delete semManutencao.ultimaManutencao;
    delete semManutencao.proximaManutencao;
    delete semManutencao.instaladoEm;
    expect(linhas(csvEquipamentos([semManutencao]))[1]).toMatch(/;Nenhuma;;;;;$/);
  });
});

describe('csvAgentes', () => {
  it('cabeçalho e linha com categoria, situação e turno por extenso', () => {
    const [cabecalho, linha] = linhas(csvAgentes([AG]));
    expect(cabecalho).toBe('Nome;Matrícula;Categoria;Órgão;Situação;Turno;Base;Bairro da base;Região;Telefone;Último sinal');
    expect(linha).toBe('Ana Souza;AT-1007;Agente de trânsito;Secretaria de Mobilidade Urbana;Em serviço;Tarde;Rua Paraíba;Centro;Centro;(14) 3402-0000;');
  });
});

describe('csvManutencoesPendentes', () => {
  it('uma linha por equipamento do painel, com o grupo e o prazo contado a partir de hoje', () => {
    const painel: PainelManutencao = {
      atrasadas: [{ ...EQ, codigo: 'FOGO-SEM-0032', tipo: 'semaforo', manutencaoNecessidade: 'agendada', proximaManutencao: '2026-09-15' }],
      imediatas: [{ ...EQ, codigo: 'FOGO-ALG-0006', tipo: 'sensor_alagamento', manutencaoNecessidade: 'imediata', proximaManutencao: '2026-12-03' }],
      proximos7: [{ ...EQ, codigo: 'FOGO-MOT-0003', tipo: 'moto_agente', situacao: 'operacional', proximaManutencao: '2026-10-19' }],
      proximos30: [{ ...EQ, codigo: 'FOGO-ALG-0014', tipo: 'sensor_alagamento', situacao: 'operacional', proximaManutencao: '2026-10-27' }],
    };
    const [cabecalho, ...resto] = linhas(csvManutencoesPendentes(painel, '2026-10-19'));
    expect(cabecalho).toBe('Grupo;Código;Tipo;Situação;Bairro;Logradouro;Necessidade;Próxima manutenção;Prazo');
    expect(resto).toEqual([
      'Atrasada;FOGO-SEM-0032;Semáforo inteligente;Mau funcionamento;Centro;Avenida Sampaio Vidal;Agendada;15/09/2026;venceu há 34 dias',
      'Imediata;FOGO-ALG-0006;Sensor de alagamento;Mau funcionamento;Centro;Avenida Sampaio Vidal;Imediata;03/12/2026;conserto pedido agora',
      'Próximos 7 dias;FOGO-MOT-0003;Moto de agente de trânsito;Operacional;Centro;Avenida Sampaio Vidal;Periódica;19/10/2026;hoje',
      'Próximos 30 dias;FOGO-ALG-0014;Sensor de alagamento;Operacional;Centro;Avenida Sampaio Vidal;Periódica;27/10/2026;em 8 dias',
    ]);
  });
});

describe('buscarTodas', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('percorre as páginas de 100 até juntar o total', async () => {
    const pedidos: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      pedidos.push(String(url));
      const pagina = Number(new URL(String(url), 'http://x').searchParams.get('pagina'));
      const itens = Array.from({ length: pagina < 3 ? 100 : 30 }, (_, i) => ({ id: (pagina - 1) * 100 + i + 1 }));
      return new Response(JSON.stringify({ itens, total: 230, pagina, porPagina: 100 }), { status: 200 });
    }));
    const todos = await buscarTodas<{ id: number }>('/api/equipamentos');
    expect(todos).toHaveLength(230);
    expect(todos.at(-1)).toEqual({ id: 230 });
    expect(pedidos).toEqual(['/api/equipamentos?pagina=1&porPagina=100', '/api/equipamentos?pagina=2&porPagina=100', '/api/equipamentos?pagina=3&porPagina=100']);
  });
});

describe('nomeDoArquivo', () => {
  it('"fogo-<assunto>-<aaaa-mm-dd>.csv" com a data de São Paulo', () => {
    // 01h30 de 20/10 em UTC ainda é 19/10 em São Paulo
    expect(nomeDoArquivo('equipamentos', new Date('2026-10-20T01:30:00.000Z'))).toBe('fogo-equipamentos-2026-10-19.csv');
  });
});
