// Modo Campo: escolher quem sou, trocar a situação, atender o despacho, relatar problema e receber despacho ao vivo.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAVE_AGENTE_CAMPO } from '../campo/agenteSalvo';
import Campo from './Campo';

/** EventSource falso: o teste decide quando chega um evento. Como no /api/stream, `data` é o evento inteiro (`{ tipo, dados }`). */
class EventSourceFalso {
  static instancias: EventSourceFalso[] = [];
  readonly url: string;
  readyState = 0;
  private readonly ouvintes = new Map<string, Set<(e: Event) => void>>();
  constructor(url: string) {
    this.url = url;
    EventSourceFalso.instancias.push(this);
  }
  addEventListener(tipo: string, fn: (e: Event) => void): void {
    if (!this.ouvintes.has(tipo)) this.ouvintes.set(tipo, new Set());
    this.ouvintes.get(tipo)!.add(fn);
  }
  removeEventListener(tipo: string, fn: (e: Event) => void): void {
    this.ouvintes.get(tipo)?.delete(fn);
  }
  close(): void {
    this.readyState = 2;
  }
  abrir(): void {
    this.readyState = 1;
    for (const fn of this.ouvintes.get('open') ?? []) fn(new Event('open'));
  }
  emitir(nome: string, dados: unknown): void {
    for (const fn of this.ouvintes.get(nome) ?? []) fn(new MessageEvent(nome, { data: JSON.stringify(dados) }));
  }
}

const ANA = {
  id: 7, nome: 'Ana Souza', matricula: 'AT-1007', categoria: 'agente_transito', orgao: 'Secretaria de Mobilidade Urbana', situacao: 'em_servico',
  turno: 'tarde', baseLogradouro: 'Rua Paraíba', baseBairroId: 1, baseBairroNome: 'Centro', regiao: 'Centro', lat: -22.2138, lng: -49.9508,
  latAtual: -22.2138, lngAtual: -49.9508, ultimoSinalEm: null, criadoEm: '2026-10-01T10:00:00.000Z', atualizadoEm: '2026-10-01T10:00:00.000Z', ocorrencias: [],
};
const BRUNO = { ...ANA, id: 8, nome: 'Bruno Lima', matricula: 'GM-2008', categoria: 'guarda_municipal' };
const OCORRENCIA = {
  id: 55, tipo: 'acidente', gravidade: 4, bairroId: 1, lat: -22.2048, lng: -49.9508, inicio: new Date(Date.now() - 4 * 60_000).toISOString(),
  agenteId: 7, descricao: 'Colisão entre carro e moto', chuva: false, origem: 'injetado',
};
const DESPACHO = { ocorrencia: OCORRENCIA, bairroNome: 'Centro', logradouro: 'Rua Paraíba', distanciaMetros: 1234 };
const CAMERA = {
  id: 9, codigo: 'FOGO-CAM-0009', tipo: 'camera', situacao: 'operacional', logradouro: 'Avenida Sampaio Vidal', referencia: 'nº 181',
  bairroNome: 'Centro', lat: -22.2128, lng: -49.9508, distanciaMetros: 110,
};

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
let fetchFalso: ReturnType<typeof vi.fn>;
let despachoAtual: typeof DESPACHO | (typeof DESPACHO & { chegouEm: string }) | null;
const chamadas = (metodo: string, trecho = '') =>
  fetchFalso.mock.calls.filter(([url, init]) => ((init as RequestInit | undefined)?.method ?? 'GET') === metodo && String(url).includes(trecho));
const corpo = (c: unknown[]) => JSON.parse(String((c[1] as RequestInit).body)) as unknown;

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/campo']}>
        <Campo />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  EventSourceFalso.instancias = [];
  vi.stubGlobal('EventSource', EventSourceFalso);
  Object.defineProperty(navigator, 'vibrate', { value: vi.fn(() => true), configurable: true });
  despachoAtual = null;
  fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const metodo = init?.method ?? 'GET';
    if (metodo === 'GET' && u.startsWith('/api/agentes?')) return json({ itens: [ANA, BRUNO], total: 2, pagina: 1, porPagina: 100 });
    if (metodo === 'GET' && u === '/api/agentes/7') return json(ANA);
    if (metodo === 'PATCH' && u === '/api/agentes/7/situacao') return json({ ...ANA, situacao: 'pausa' });
    if (metodo === 'GET' && u === '/api/campo/agentes/7/despacho') return json({ despacho: despachoAtual });
    if (metodo === 'GET' && u.startsWith('/api/campo/agentes/7/equipamentos-proximos')) return json([CAMERA]);
    if (metodo === 'POST' && u === '/api/campo/agentes/7/despachos/55/chegada') {
      despachoAtual = { ...DESPACHO, chegouEm: new Date().toISOString() };
      return json(despachoAtual);
    }
    if (metodo === 'POST' && u === '/api/campo/agentes/7/despachos/55/conclusao') {
      despachoAtual = null;
      return json({ ...OCORRENCIA, fim: new Date().toISOString() });
    }
    if (metodo === 'POST' && u === '/api/campo/agentes/7/reportes') {
      return json({ equipamento: { ...CAMERA, situacao: 'furtado' }, alerta: { id: 1, tipo: 'furto_suspeito', criticidade: 'critica' } }, 201);
    }
    return json({ erro: `Chamada inesperada: ${metodo} ${u}` }, 500);
  });
  vi.stubGlobal('fetch', fetchFalso);
});

afterEach(() => vi.unstubAllGlobals());

describe('Modo Campo', () => {
  it('sem agente escolhido pergunta quem é; a escolha fica guardada no aparelho', async () => {
    const u = userEvent.setup();
    renderizar();
    expect(await screen.findByRole('heading', { name: 'Quem é você?' })).toBeInTheDocument();
    await u.click(await screen.findByRole('button', { name: /Ana Souza/ }));
    expect(localStorage.getItem(CHAVE_AGENTE_CAMPO)).toBe('7');
    expect(await screen.findByRole('heading', { name: 'Ana Souza' })).toBeInTheDocument();
  });

  it('"Trocar agente" esquece a escolha e volta para a lista', async () => {
    localStorage.setItem(CHAVE_AGENTE_CAMPO, '7');
    const u = userEvent.setup();
    renderizar();
    await u.click(await screen.findByRole('button', { name: 'Trocar agente' }));
    expect(await screen.findByRole('heading', { name: 'Quem é você?' })).toBeInTheDocument();
    expect(localStorage.getItem(CHAVE_AGENTE_CAMPO)).toBeNull();
  });

  it('troca a situação com os botões grandes, pela rota PATCH que já existe', async () => {
    localStorage.setItem(CHAVE_AGENTE_CAMPO, '7');
    const u = userEvent.setup();
    renderizar();
    const grupo = await screen.findByRole('group', { name: 'Minha situação' });
    expect(within(grupo).getByRole('button', { name: 'Em serviço' })).toHaveAttribute('aria-pressed', 'true');
    await u.click(within(grupo).getByRole('button', { name: 'Em pausa' }));
    await waitFor(() => expect(chamadas('PATCH', '/api/agentes/7/situacao')).toHaveLength(1));
    expect(corpo(chamadas('PATCH')[0]!)).toEqual({ situacao: 'pausa' });
  });

  it('mostra o despacho com endereço e distância; "Cheguei" e depois "Concluir"', async () => {
    localStorage.setItem(CHAVE_AGENTE_CAMPO, '7');
    despachoAtual = DESPACHO;
    const u = userEvent.setup();
    renderizar();
    const cartao = await screen.findByRole('region', { name: 'Despacho' });
    expect(await within(cartao).findByText('Acidente')).toBeInTheDocument();
    expect(within(cartao).getByText('Rua Paraíba · Centro')).toBeInTheDocument();
    expect(within(cartao).getByText('a 1,2 km de você')).toBeInTheDocument();
    expect(within(cartao).getByText('Colisão entre carro e moto')).toBeInTheDocument();
    expect(within(cartao).queryByRole('button', { name: 'Concluir ocorrência' })).not.toBeInTheDocument();

    await u.click(within(cartao).getByRole('button', { name: 'Cheguei ao local' }));
    await waitFor(() => expect(chamadas('POST', '/despachos/55/chegada')).toHaveLength(1));
    await u.click(await within(cartao).findByRole('button', { name: 'Concluir ocorrência' }));
    await waitFor(() => expect(chamadas('POST', '/despachos/55/conclusao')).toHaveLength(1));
    expect(await within(cartao).findByText('Nenhum despacho agora')).toBeInTheDocument();
  });

  it('lista os equipamentos perto e relata um problema com observação', async () => {
    localStorage.setItem(CHAVE_AGENTE_CAMPO, '7');
    const u = userEvent.setup();
    renderizar();
    const lista = await screen.findByRole('region', { name: 'Perto de mim' });
    expect(await within(lista).findByText('FOGO-CAM-0009')).toBeInTheDocument();
    expect(within(lista).getByText('110 m')).toBeInTheDocument();

    await u.click(within(lista).getByRole('button', { name: 'Relatar problema em FOGO-CAM-0009' }));
    await u.click(screen.getByRole('radio', { name: 'Furtado' }));
    await u.type(screen.getByLabelText(/Observação/), 'Só restou o suporte no poste');
    await u.click(screen.getByRole('button', { name: 'Enviar relato' }));

    await waitFor(() => expect(chamadas('POST', '/reportes')).toHaveLength(1));
    expect(corpo(chamadas('POST', '/reportes')[0]!)).toEqual({ equipamentoId: 9, problema: 'furtado', observacao: 'Só restou o suporte no poste' });
    expect(await screen.findByText(/FOGO-CAM-0009 agora está como Furtado/)).toBeInTheDocument();
  });

  it('relato sem escolher o problema não é enviado', async () => {
    localStorage.setItem(CHAVE_AGENTE_CAMPO, '7');
    const u = userEvent.setup();
    renderizar();
    await u.click(await screen.findByRole('button', { name: 'Relatar problema em FOGO-CAM-0009' }));
    await u.click(screen.getByRole('button', { name: 'Enviar relato' }));
    expect(await screen.findByText('Escolha o problema')).toBeInTheDocument();
    expect(chamadas('POST', '/reportes')).toHaveLength(0);
  });

  it('despacho novo para este agente chega pelo /api/stream: destaque e vibração; de outro agente, nada', async () => {
    localStorage.setItem(CHAVE_AGENTE_CAMPO, '7');
    renderizar();
    expect(await screen.findByText('Nenhum despacho agora')).toBeInTheDocument();
    const fonte = EventSourceFalso.instancias.find((f) => f.url === '/api/stream');
    expect(fonte).toBeDefined();

    act(() => fonte!.emitir('ocorrencia', { tipo: 'ocorrencia', dados: { ...OCORRENCIA, id: 60, agenteId: 8 } }));
    expect(screen.queryByText('Novo despacho!')).not.toBeInTheDocument();
    expect(navigator.vibrate).not.toHaveBeenCalled();

    despachoAtual = DESPACHO;
    act(() => fonte!.emitir('ocorrencia', { tipo: 'ocorrencia', dados: OCORRENCIA }));
    expect(await screen.findByText('Novo despacho!')).toBeInTheDocument();
    expect(navigator.vibrate).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Colisão entre carro e moto')).toBeInTheDocument();

    // O mesmo despacho repetido (ex.: reconexão) não vibra de novo.
    act(() => fonte!.emitir('ocorrencia', { tipo: 'ocorrencia', dados: OCORRENCIA }));
    expect(navigator.vibrate).toHaveBeenCalledTimes(1);
  });
});
