// Boletim do dia: a cidade numa folha (dados das rotas da Central, Previsões e Manutenção), impressão e CSV.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hojeIso } from '../util/datas';
import Boletim from './Boletim';

/** "aaaa-mm-dd" a `n` dias de hoje (São Paulo). */
const dia = (n: number) => {
  const [a, m, d] = hojeIso().split('-').map(Number);
  return new Date(Date.UTC(a!, m! - 1, d! + n)).toISOString().slice(0, 10);
};

const EQ = {
  id: 7, codigo: 'FOGO-RAD-0007', tipo: 'radar', numeroSerie: 'SN-7', marca: 'Perkons', modelo: 'SC-400', orgao: 'Secretaria de Mobilidade Urbana',
  situacao: 'operacional', cep: '17500-000', logradouro: 'Avenida Sampaio Vidal', referencia: '', cidade: 'Marília', uf: 'SP', bairroId: 1, bairroNome: 'Centro',
  regiao: 'Centro', lat: -22.2138, lng: -49.9508, latAtual: -22.2138, lngAtual: -49.9508, manutencaoNecessidade: 'agendada', proximaManutencao: dia(-3),
  caracteristicas: {}, ultimoSinalEm: null, criadoEm: '2026-10-01T10:00:00.000Z', atualizadoEm: '2026-10-01T10:00:00.000Z',
};

const RESPOSTAS: Record<string, unknown> = {
  '/api/central/indicadores': {
    totalEquipamentos: 350, operacionais: 287, indisponiveis: 42, naoInstalados: 11, desativados: 10, disponibilidadePct: 87.2,
    agentesEmAtividade: 20, agentesTotal: 80, alertasAbertos: 30, alertasCriticosAbertos: 2, manutencaoImediata: 28, manutencaoProxima7d: 24,
  },
  '/api/central/regioes': [
    { regiao: 'Centro', indice: 78, nivel: 'critico', motivos: ['Maior pressão: Centro (índice 78)', '5 equipamentos indisponíveis'], bairros: [] },
    { regiao: 'Leste', indice: 9, nivel: 'normal', motivos: ['Sem pendências agora'], bairros: [] },
  ],
  '/api/alertas': [
    { id: 1, tipo: 'acidente', criticidade: 'critica', titulo: 'Acidente em Centro', descricao: 'Colisão. Gravidade 4 de 4, em Centro.', bairroId: 1, criadoEm: new Date().toISOString() },
  ],
  '/api/manutencao/painel': {
    atrasadas: [{ ...EQ, codigo: 'FOGO-SEM-0032', tipo: 'semaforo' }],
    imediatas: [{ ...EQ, codigo: 'FOGO-ALG-0006', tipo: 'sensor_alagamento', manutencaoNecessidade: 'imediata' }],
    proximos7: [{ ...EQ, codigo: 'FOGO-MOT-0003', tipo: 'moto_agente', proximaManutencao: dia(2) }],
    proximos30: [{ ...EQ, codigo: 'FOGO-ALG-0014', tipo: 'sensor_alagamento', proximaManutencao: dia(20) }],
  },
  '/api/previsoes/resumo': {
    geradoEm: new Date().toISOString(),
    indiceBairros: [{ bairroId: 1, nome: 'Centro', indice: 100, nivel: 'critico' }, { bairroId: 2, nome: 'Banzato', indice: 86, nivel: 'critico' }],
    recomendacoes: [{ titulo: 'Reforce o patrulhamento no bairro Centro (segunda à tarde)', detalhe: 'O bairro Centro deve ter 32 ocorrências.', fonte: 'risco', prioridade: 'alta' }],
    explicacao: {},
  },
  '/api/previsoes/risco': {
    geradoEm: new Date().toISOString(), horas: 24, granularidadeHoras: 1, explicacao: {},
    celulas: [
      { bairroId: 1, inicio: '2026-10-20T01:00:00.000Z', taxaEsperada: 2.3, indice: 100, nivel: 'critico', fatores: [{ nome: 'Bairro com histórico alto', peso: 6.59 }] },
      { bairroId: 2, inicio: '2026-10-19T21:00:00.000Z', taxaEsperada: 1.2, indice: 60, nivel: 'alto', fatores: [] },
    ],
  },
  '/api/previsoes/reforco': {
    geradoEm: new Date().toISOString(), horas: 24, explicacao: {},
    recomendacoes: [{
      regiaoOrigem: 'Leste', regiaoDestino: 'Centro', quantidade: 1, inicio: '2026-10-19T17:00:00.000Z', fim: '2026-10-20T01:00:00.000Z',
      cargaPorAgenteAntes: 6.4, cargaPorAgenteDepois: 5.6, motivo: 'A região Centro deve ter 45,0 ocorrências.',
    }],
  },
  '/api/previsoes/falhas': {
    geradoEm: new Date().toISOString(), explicacao: {},
    itens: Array.from({ length: 12 }, (_, i) => ({
      equipamentoId: 100 + i, codigo: `FOGO-CAM-${String(i + 1).padStart(4, '0')}`, tipo: 'camera', marca: 'Vigilux', modelo: 'VX-200', bairroNome: 'Centro',
      probabilidade: i === 0 ? 0.999 : 0.95 - i * 0.05, fatores: [{ nome: 'Modelo pouco confiável (Vigilux VX-200)', contribuicao: 1.76 }],
    })),
  },
};

const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200 });
let fetchFalso: ReturnType<typeof vi.fn>;

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/boletim']}>
        <Boletim />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchFalso = vi.fn(async (url: string) => {
    const u = String(url);
    const caminho = u.split('?')[0]!;
    if (caminho === '/api/equipamentos') return json({ itens: [EQ], total: 1, pagina: 1, porPagina: 100 });
    if (caminho === '/api/agentes') return json({ itens: [], total: 0, pagina: 1, porPagina: 100 });
    if (caminho in RESPOSTAS) return json(RESPOSTAS[caminho]);
    return new Response(JSON.stringify({ erro: `Chamada inesperada: ${u}` }), { status: 500 });
  });
  vi.stubGlobal('fetch', fetchFalso);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const secao = (nome: string) => screen.findByRole('region', { name: nome });

describe('Boletim do dia', () => {
  it('cabeçalho com data e hora de emissão e o resumo do dia', async () => {
    renderizar();
    expect(screen.getByRole('heading', { level: 1, name: 'Boletim do dia' })).toBeInTheDocument();
    expect(screen.getByText(/emitido às \d{2}:\d{2}/)).toBeInTheDocument();
    const resumo = await secao('Resumo do dia');
    expect(await within(resumo).findByText('Reforce o patrulhamento no bairro Centro (segunda à tarde)')).toBeInTheDocument();
  });

  it('os 6 indicadores da Central, com a formatação brasileira', async () => {
    renderizar();
    const ind = await secao('Indicadores');
    expect(await within(ind).findByText('87,2%')).toBeInTheDocument();
    for (const rotulo of ['Equipamentos', 'Operacionais', 'Indisponíveis', 'Disponibilidade', 'Agentes em atividade', 'Alertas críticos']) {
      expect(within(ind).getByText(rotulo)).toBeInTheDocument();
    }
    expect(within(ind).getByText('de 80 cadastrados')).toBeInTheDocument();
  });

  it('regiões com o nível e os 5 bairros de maior risco com o porquê', async () => {
    renderizar();
    const regioes = await secao('Situação das regiões');
    expect(await within(regioes).findByText('Região Centro')).toBeInTheDocument();
    expect(within(regioes).getByText('Crítico')).toBeInTheDocument();
    expect(within(regioes).getByText('Zona Leste')).toBeInTheDocument();

    const bairros = await secao('Bairros de maior risco nas próximas 24 h');
    expect(await within(bairros).findByText('Bairro com histórico alto ×6,59')).toBeInTheDocument();
    expect(within(bairros).getByText('Segue o normal do bairro')).toBeInTheDocument();
    expect(within(bairros).getByText(/pico às 22h/)).toBeInTheDocument();
  });

  it('alertas críticos abertos, manutenção vencida ou da semana e os 10 de maior chance de falha', async () => {
    renderizar();
    const alertas = await secao('Alertas críticos abertos');
    expect(await within(alertas).findByText('Acidente em Centro')).toBeInTheDocument();
    expect(fetchFalso.mock.calls.some(([u]) => /\/api\/alertas\?.*criticidade=critica/.test(String(u)) && /status=abertos/.test(String(u)))).toBe(true);

    const manut = await secao('Manutenção vencida ou nos próximos 7 dias');
    expect(await within(manut).findByText('FOGO-SEM-0032')).toBeInTheDocument();
    expect(within(manut).getByText('venceu há 3 dias')).toBeInTheDocument();
    expect(within(manut).getByText('FOGO-MOT-0003')).toBeInTheDocument();
    expect(within(manut).getByText('em 2 dias')).toBeInTheDocument();
    expect(within(manut).queryByText('FOGO-ALG-0014')).not.toBeInTheDocument(); // 30 dias fica fora da folha

    const falhas = await secao('Maior chance de falha em 7 dias');
    expect(await within(falhas).findByText('FOGO-CAM-0010')).toBeInTheDocument();
    expect(within(falhas).queryByText('FOGO-CAM-0011')).not.toBeInTheDocument();
    expect(within(falhas).getByText('mais de 99%')).toBeInTheDocument();
  });

  it('a recomendação de reforço de agentes', async () => {
    renderizar();
    const reforco = await secao('Reforço de agentes');
    expect(await within(reforco).findByText(/Mover 1 agente da Zona Leste para a Região Centro, das 14h às 22h/)).toBeInTheDocument();
  });

  it('"Imprimir / Salvar PDF" abre a impressão do navegador', async () => {
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => {});
    const u = userEvent.setup();
    renderizar();
    await u.click(screen.getByRole('button', { name: 'Imprimir / Salvar PDF' }));
    expect(imprimir).toHaveBeenCalledTimes(1);
  });

  it('"Inventário de equipamentos" baixa um CSV com BOM e ";", gerado no navegador', async () => {
    const blobs: Blob[] = [];
    const criarUrl = vi.fn((b: Blob) => { blobs.push(b); return 'blob:boletim'; });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: criarUrl, revokeObjectURL: vi.fn() }));
    const baixados: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { baixados.push(this.download); });
    const u = userEvent.setup();
    renderizar();

    await u.click(screen.getByRole('button', { name: /Inventário de equipamentos/ }));
    await waitFor(() => expect(criarUrl).toHaveBeenCalledTimes(1));
    expect(baixados[0]).toMatch(/^fogo-equipamentos-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(blobs[0]!.type).toBe('text/csv;charset=utf-8');
    // ignoreBOM: true mantém o BOM no texto (o padrão o descartaria e o teste não veria se ele está lá).
    const texto = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await blobs[0]!.arrayBuffer());
    expect(texto.startsWith('﻿Código;Tipo;Nº de série')).toBe(true);
    expect(texto).toContain('FOGO-RAD-0007;Radar de fiscalização');
  });
});
