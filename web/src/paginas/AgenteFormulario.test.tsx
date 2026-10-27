// Formulário de agente: máscara do telefone, órgãos de agente e veículo que serve à categoria e ao órgão escolhidos.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgenteFormulario from './AgenteFormulario';

vi.mock('../mapa/SeletorPontoMapa', () => ({ SeletorPontoMapa: () => <div data-testid="seletor-mapa" /> }));

const base = { situacao: 'operacional', cep: '17500-000', logradouro: 'Rua A', referencia: '', bairroId: 1, bairroNome: 'Centro', regiao: 'Centro', lat: -22.2, lng: -49.9, latAtual: -22.2, lngAtual: -49.9, ultimoSinalEm: null, criadoEm: '', atualizadoEm: '', manutencaoNecessidade: 'nenhuma', caracteristicas: {}, cidade: 'Marília', uf: 'SP' };
const MOTO = { ...base, id: 1, codigo: 'FOGO-MOT-0001', tipo: 'moto_agente', marca: 'Honda', modelo: 'CG', orgao: 'Secretaria de Mobilidade Urbana' };
const VTR_GCM = { ...base, id: 2, codigo: 'FOGO-VTR-0001', tipo: 'viatura', marca: 'Fiat', modelo: 'Toro', orgao: 'Guarda Civil Municipal' };
const VTR_PM = { ...base, id: 3, codigo: 'FOGO-VTR-0002', tipo: 'viatura', marca: 'Chevrolet', modelo: 'S10', orgao: 'Polícia Militar' };

const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200 });
const pagina = (itens: unknown[]) => ({ itens, total: itens.length, pagina: 1, porPagina: 100 });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (u.startsWith('/api/bairros')) return json([]);
    if (u.includes('tipo=moto_agente')) return json(pagina([MOTO]));
    if (u.includes('tipo=viatura')) return json(pagina([VTR_GCM, VTR_PM]));
    if (u.startsWith('/api/agentes')) return json(pagina([]));
    return new Response('{}', { status: 500 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><AgenteFormulario /></MemoryRouter></QueryClientProvider>);
}
const opcoesDe = (rotulo: string) => within(screen.getByLabelText(rotulo)).getAllByRole('option').map((o) => o.textContent);

describe('AgenteFormulario', () => {
  it('o telefone ganha a máscara ao digitar e ignora letras', async () => {
    const u = userEvent.setup();
    renderizar();
    const campo = screen.getByLabelText(/Telefone/);
    await u.type(campo, '14a99999-0000');
    expect(campo).toHaveValue('(14) 99999-0000');
    await u.clear(campo);
    await u.type(campo, '1434331234');
    expect(campo).toHaveValue('(14) 3433-1234');
  });

  it('telefone incompleto é recusado no campo, sem chamar a API', async () => {
    const u = userEvent.setup();
    renderizar();
    await u.type(screen.getByLabelText(/Telefone/), '123');
    await u.click(screen.getByRole('button', { name: 'Cadastrar agente' }));
    expect(await screen.findByText(/Telefone inválido/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Telefone/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('o órgão só oferece os órgãos que têm agente (sem Defesa Civil, concessionária ou operadora)', () => {
    renderizar();
    expect(opcoesDe('Órgão')).toEqual(['Escolha o órgão…', 'Secretaria de Mobilidade Urbana', 'Guarda Civil Municipal', 'Polícia Militar']);
  });

  it('o veículo oferecido serve à categoria e ao órgão: PM só vê viatura da PM; trânsito só vê moto', async () => {
    const u = userEvent.setup();
    renderizar();
    await screen.findByText(/Carregando|Escolha o bairro/);
    await u.selectOptions(screen.getByLabelText('Categoria'), 'Policial militar');
    expect(screen.getByLabelText('Órgão')).toHaveValue('Polícia Militar');
    const veiculo = () => within(screen.getByLabelText(/Moto ou viatura vinculada/)).getAllByRole('option').map((o) => o.textContent);
    await vi.waitFor(() => expect(veiculo()).toEqual(['Sem veículo', 'FOGO-VTR-0002 · Chevrolet S10']));

    await u.selectOptions(screen.getByLabelText('Categoria'), 'Agente de trânsito');
    await vi.waitFor(() => expect(veiculo()).toEqual(['Sem veículo', 'FOGO-MOT-0001 · Honda CG']));
  });

  it('trocar a categoria tira o veículo que deixou de servir', async () => {
    const u = userEvent.setup();
    renderizar();
    await u.selectOptions(screen.getByLabelText('Categoria'), 'Policial militar');
    await vi.waitFor(() => expect(within(screen.getByLabelText(/Moto ou viatura vinculada/)).getAllByRole('option')).toHaveLength(2));
    await u.selectOptions(screen.getByLabelText(/Moto ou viatura vinculada/), 'FOGO-VTR-0002 · Chevrolet S10');
    expect(screen.getByLabelText(/Moto ou viatura vinculada/)).toHaveValue('3');
    await u.selectOptions(screen.getByLabelText('Categoria'), 'Agente de trânsito');
    await vi.waitFor(() => expect(screen.getByLabelText(/Moto ou viatura vinculada/)).toHaveValue(''));
  });
});
