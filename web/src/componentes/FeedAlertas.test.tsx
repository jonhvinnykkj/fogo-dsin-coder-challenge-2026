// Feed de alertas da Central: críticos primeiro, ações com o id certo, clique centraliza o mapa e alerta crítico novo avisa.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alerta } from '../../../shared/modelos';
import { FeedAlertas } from './FeedAlertas';

const AGORA = new Date('2026-10-17T15:00:00.000Z');

const alerta = (id: number, criticidade: Alerta['criticidade'], titulo: string, minutosAtras: number, extra: Partial<Alerta> = {}): Alerta => ({
  id,
  tipo: 'acidente',
  criticidade,
  titulo,
  descricao: `Descrição de ${titulo}`,
  bairroId: 1,
  lat: -22.21,
  lng: -49.95,
  criadoEm: new Date(AGORA.getTime() - minutosAtras * 60_000).toISOString(),
  ...extra,
});

// Ordem da API (mais recente primeiro): baixa, crítica, alta.
const TRES = [
  alerta(11, 'baixa', 'Painel sem mensagem', 2),
  alerta(12, 'critica', 'Alagamento na Avenida Tiradentes', 9),
  alerta(13, 'alta', 'Acidente em Cascata', 4),
];

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
let fetchFalso: ReturnType<typeof vi.fn>;

function comConsultas(filhos: ReactNode, qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return <QueryClientProvider client={qc}>{filhos}</QueryClientProvider>;
}

beforeEach(() => {
  fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
    const id = Number(/\/api\/alertas\/(\d+)\//.exec(String(url))?.[1]);
    const original = TRES.find((a) => a.id === id) ?? TRES[0]!;
    if (init?.method === 'PATCH' && String(url).endsWith('/resolver')) return json({ ...original, resolvidoEm: AGORA.toISOString() });
    if (init?.method === 'PATCH' && String(url).endsWith('/reconhecer')) return json({ ...original, reconhecidoEm: AGORA.toISOString() });
    return json({ erro: 'inesperado' }, 500);
  });
  vi.stubGlobal('fetch', fetchFalso);
});

afterEach(() => vi.unstubAllGlobals());

describe('FeedAlertas', () => {
  it('mostra o alerta crítico primeiro (mesmo sendo o mais velho), com "há X min"; abaixo, do mais novo para o mais velho', () => {
    render(comConsultas(<FeedAlertas alertas={TRES} agora={AGORA} />));
    const itens = screen.getAllByRole('listitem');
    expect(itens).toHaveLength(3);
    expect(itens[0]).toHaveTextContent('Alagamento na Avenida Tiradentes');
    expect(itens[0]).toHaveTextContent('Crítica');
    expect(itens[0]).toHaveTextContent('há 9 min');
    expect(itens[1]).toHaveTextContent('Painel sem mensagem'); // baixa, há 2 min
    expect(itens[2]).toHaveTextContent('Acidente em Cascata'); // alta, há 4 min
  });

  it('"Resolver" chama a mutação com o id do alerta daquele item', async () => {
    const u = userEvent.setup();
    render(comConsultas(<FeedAlertas alertas={TRES} agora={AGORA} />));
    const doAcidente = screen.getAllByRole('listitem').find((i) => i.textContent?.includes('Acidente em Cascata'))!;
    await u.click(within(doAcidente).getByRole('button', { name: 'Resolver' }));
    await waitFor(() => expect(fetchFalso).toHaveBeenCalledTimes(1));
    const [url, init] = fetchFalso.mock.calls[0]!;
    expect(url).toBe('/api/alertas/13/resolver');
    expect((init as RequestInit).method).toBe('PATCH');
  });

  it('"Reconhecer" usa o id certo e some do alerta já reconhecido', async () => {
    const u = userEvent.setup();
    const reconhecido = alerta(14, 'media', 'Congestionamento no Centro', 1, { reconhecidoEm: AGORA.toISOString() });
    render(comConsultas(<FeedAlertas alertas={[...TRES, reconhecido]} agora={AGORA} />));
    const itens = screen.getAllByRole('listitem');
    expect(itens[1]).toHaveTextContent('Congestionamento no Centro'); // o mais novo abaixo do crítico
    expect(within(itens[1]!).queryByRole('button', { name: 'Reconhecer' })).not.toBeInTheDocument();
    expect(itens[1]).toHaveTextContent('Reconhecido');
    await u.click(within(itens[0]!).getByRole('button', { name: 'Reconhecer' }));
    await waitFor(() => expect(fetchFalso).toHaveBeenCalledTimes(1));
    expect(fetchFalso.mock.calls[0]![0]).toBe('/api/alertas/12/reconhecer');
  });

  it('clicar no alerta pede para centralizar o mapa nele', async () => {
    const u = userEvent.setup();
    const onSelecionar = vi.fn();
    render(comConsultas(<FeedAlertas alertas={TRES} agora={AGORA} onSelecionar={onSelecionar} />));
    await u.click(screen.getByRole('button', { name: /Acidente em Cascata/ }));
    expect(onSelecionar).toHaveBeenCalledWith(expect.objectContaining({ id: 13 }));
  });

  it('alerta crítico que chega depois pisca no feed e avisa uma vez; os da primeira carga não', () => {
    const onNovoCritico = vi.fn();
    const qc = new QueryClient();
    const { rerender } = render(comConsultas(<FeedAlertas alertas={TRES} agora={AGORA} onNovoCritico={onNovoCritico} />, qc));
    expect(onNovoCritico).not.toHaveBeenCalled();

    const novo = alerta(20, 'critica', 'Possível furto: patinete fora de Marília', 0);
    const alta = alerta(21, 'alta', 'Câmera em mau funcionamento', 0);
    rerender(comConsultas(<FeedAlertas alertas={[novo, alta, ...TRES]} agora={AGORA} onNovoCritico={onNovoCritico} />, qc));

    expect(onNovoCritico).toHaveBeenCalledTimes(1);
    expect(onNovoCritico).toHaveBeenCalledWith(expect.objectContaining({ id: 20 }));
    const itens = screen.getAllByRole('listitem');
    expect(itens[0]).toHaveTextContent('Possível furto');
    expect(itens[0]).toHaveAttribute('data-novo', 'true');
    expect(itens.find((i) => i.textContent?.includes('Alagamento'))).toHaveAttribute('data-novo', 'false');

    rerender(comConsultas(<FeedAlertas alertas={[novo, alta, ...TRES]} agora={AGORA} onNovoCritico={onNovoCritico} />, qc));
    expect(onNovoCritico).toHaveBeenCalledTimes(1);
  });
});
