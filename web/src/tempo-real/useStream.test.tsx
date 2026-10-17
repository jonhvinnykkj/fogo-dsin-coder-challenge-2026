import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alerta, EstadoSimulacao, EventoFogo, Indicadores } from '../../../shared/modelos';
import { chaves, type MapaCentral } from '../api/consultas';
import { useStream } from './useStream';

/** EventSource falso: o teste decide quando a conexão abre, cai ou recebe um evento. */
class EventSourceFalso {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instancias: EventSourceFalso[] = [];

  readonly url: string;
  readyState = EventSourceFalso.CONNECTING;
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
    this.readyState = EventSourceFalso.CLOSED;
  }

  // ---- comandos do teste ----
  abrir(): void {
    this.readyState = EventSourceFalso.OPEN;
    this.disparar(new Event('open'));
  }

  /** `desistiu` = o navegador fechou de vez (ex.: proxy respondeu 502); senão ele mesmo tenta de novo. */
  falhar(desistiu = false): void {
    this.readyState = desistiu ? EventSourceFalso.CLOSED : EventSourceFalso.CONNECTING;
    this.disparar(new Event('error'));
  }

  emitir(nome: string, dados: unknown): void {
    this.disparar(new MessageEvent(nome, { data: JSON.stringify(dados) }));
  }

  private disparar(e: Event): void {
    for (const fn of this.ouvintes.get(e.type) ?? []) fn(e);
  }
}

const ultima = () => EventSourceFalso.instancias.at(-1)!;

function alerta(id: number, extra: Partial<Alerta> = {}): Alerta {
  return {
    id,
    tipo: 'falha',
    criticidade: 'alta',
    titulo: `Alerta ${id}`,
    descricao: 'Radar sem leituras no horário de pico',
    criadoEm: '2026-10-17T15:00:00.000Z',
    ...extra,
  };
}

const INDICADORES: Indicadores = {
  totalEquipamentos: 350, operacionais: 300, indisponiveis: 30, naoInstalados: 10, desativados: 10, disponibilidadePct: 90.9,
  agentesEmAtividade: 40, agentesTotal: 80, alertasAbertos: 12, alertasCriticosAbertos: 2, manutencaoImediata: 5, manutencaoProxima7d: 9,
};

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useStream(), { wrapper });
  return { qc, ...hook };
}

beforeEach(() => {
  EventSourceFalso.instancias = [];
  vi.stubGlobal('EventSource', EventSourceFalso);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useStream', () => {
  it('abre /api/stream uma vez e fecha ao desmontar', () => {
    const { unmount } = montar();
    expect(EventSourceFalso.instancias).toHaveLength(1);
    expect(ultima().url).toBe('/api/stream');
    unmount();
    expect(ultima().readyState).toBe(EventSourceFalso.CLOSED);
  });

  it('evento `alerta` entra no topo da lista de alertas em cache e vira o último evento', () => {
    const { qc, result } = montar();
    qc.setQueryData(chaves.alertas(), [alerta(1)]);

    const evento: EventoFogo = { tipo: 'alerta', dados: alerta(2, { criticidade: 'critica' }) };
    act(() => {
      ultima().abrir();
      ultima().emitir('alerta', evento);
    });

    expect(qc.getQueryData<Alerta[]>(chaves.alertas())?.map((a) => a.id)).toEqual([2, 1]);
    expect(result.current.ultimoEvento).toEqual(evento);
  });

  it('alerta já em cache é atualizado no lugar; resolvido sai da lista de abertos', () => {
    const { qc } = montar();
    qc.setQueryData(chaves.alertas(), [alerta(2), alerta(1)]);

    act(() => {
      ultima().abrir();
      ultima().emitir('alerta', { tipo: 'alerta', dados: alerta(1, { reconhecidoEm: '2026-10-17T15:05:00.000Z' }) });
    });
    expect(qc.getQueryData<Alerta[]>(chaves.alertas())?.find((a) => a.id === 1)?.reconhecidoEm).toBe('2026-10-17T15:05:00.000Z');

    act(() => ultima().emitir('alerta', { tipo: 'alerta', dados: alerta(2, { resolvidoEm: '2026-10-17T15:06:00.000Z' }) }));
    expect(qc.getQueryData<Alerta[]>(chaves.alertas())?.map((a) => a.id)).toEqual([1]);
  });

  it('erro seguido de reabertura: conectado vai a false e volta a true, e a tela ressincroniza (mapa, indicadores, alertas, regiões)', () => {
    const { qc, result } = montar();
    const invalidar = vi.spyOn(qc, 'invalidateQueries');

    act(() => ultima().abrir());
    expect(result.current.conectado).toBe(true);
    expect(invalidar).not.toHaveBeenCalled(); // primeira abertura: nada a ressincronizar

    act(() => ultima().falhar());
    expect(result.current.conectado).toBe(false);

    act(() => ultima().abrir());
    expect(result.current.conectado).toBe(true);
    const chavesInvalidadas = invalidar.mock.calls.map(([filtro]) => filtro?.queryKey);
    expect(chavesInvalidadas).toEqual(expect.arrayContaining([['mapa'], ['indicadores'], ['alertas'], ['regioes']]));
  });

  it('se o navegador desiste da conexão (servidor fora do ar), abre outra sozinho e ressincroniza ao conectar', () => {
    vi.useFakeTimers();
    const { qc, result } = montar();
    const invalidar = vi.spyOn(qc, 'invalidateQueries');

    act(() => ultima().abrir());
    act(() => ultima().falhar(true));
    expect(result.current.conectado).toBe(false);
    expect(EventSourceFalso.instancias).toHaveLength(1);

    act(() => vi.advanceTimersByTime(3000));
    expect(EventSourceFalso.instancias).toHaveLength(2);

    act(() => ultima().abrir());
    expect(result.current.conectado).toBe(true);
    expect(invalidar.mock.calls.map(([f]) => f?.queryKey)).toEqual(expect.arrayContaining([['mapa'], ['indicadores'], ['alertas'], ['regioes']]));
  });

  it('conexão muda (notebook dormiu): sem nenhum evento por 35 s, reabre a conexão', () => {
    vi.useFakeTimers();
    montar();
    act(() => ultima().abrir());
    act(() => vi.advanceTimersByTime(20_000));
    act(() => ultima().emitir('indicadores', { tipo: 'indicadores', dados: INDICADORES }));
    act(() => vi.advanceTimersByTime(20_000));
    expect(EventSourceFalso.instancias).toHaveLength(1); // chegou evento no meio: conexão viva

    act(() => vi.advanceTimersByTime(20_000));
    expect(EventSourceFalso.instancias).toHaveLength(2);
    expect(EventSourceFalso.instancias[0]!.readyState).toBe(EventSourceFalso.CLOSED);
  });

  it('`posicoes` move equipamentos e agentes em todas as variantes do mapa em cache', () => {
    const { qc } = montar();
    const mapa: MapaCentral = {
      equipamentos: [
        { id: 7, codigo: 'FOGO-PAT-0007', tipo: 'patinete', situacao: 'operacional', lat: -22.21, lng: -49.94, bairroId: 1, orgao: 'Operadora de Patinetes', manutencao: 'ok' },
        { id: 8, codigo: 'FOGO-RAD-0008', tipo: 'radar', situacao: 'operacional', lat: -22.22, lng: -49.95, bairroId: 1, orgao: 'Secretaria de Mobilidade Urbana', manutencao: 'ok' },
      ],
      agentes: [{ id: 3, nome: 'Ana', categoria: 'guarda_municipal', situacao: 'em_servico', lat: -22.2, lng: -49.9, bairroId: 1 }],
    };
    qc.setQueryData(chaves.mapa({}), mapa);
    qc.setQueryData(chaves.mapa({ tipo: ['patinete'] }), { equipamentos: [mapa.equipamentos[0]!], agentes: [] });

    act(() => {
      ultima().abrir();
      ultima().emitir('posicoes', {
        tipo: 'posicoes',
        itens: [
          { tipo: 'equipamento', id: 7, lat: -22.25, lng: -49.96 },
          { tipo: 'agente', id: 3, lat: -22.19, lng: -49.93 },
        ],
      });
    });

    const todos = qc.getQueryData<MapaCentral>(chaves.mapa({}))!;
    expect(todos.equipamentos[0]).toMatchObject({ id: 7, lat: -22.25, lng: -49.96 });
    expect(todos.equipamentos[1]).toBe(mapa.equipamentos[1]); // quem não se mexeu continua o mesmo objeto
    expect(todos.agentes[0]).toMatchObject({ id: 3, lat: -22.19, lng: -49.93 });
    expect(qc.getQueryData<MapaCentral>(chaves.mapa({ tipo: ['patinete'] }))!.equipamentos[0]).toMatchObject({ lat: -22.25, lng: -49.96 });
  });

  it('`estado` e `simulacao` atualizam o relógio; `indicadores` atualiza só a variante sem filtros', () => {
    const { qc } = montar();
    const simulacao: EstadoSimulacao = { velocidade: 10, pausado: false, relogio: '2026-10-17T15:00:00.000Z' };
    qc.setQueryData(chaves.indicadores({ regiao: 'Norte' }), { ...INDICADORES, totalEquipamentos: 40 });

    act(() => {
      ultima().abrir();
      ultima().emitir('estado', { simulacao, indicadores: INDICADORES });
    });
    expect(qc.getQueryData(chaves.simulacao())).toEqual(simulacao);
    expect(qc.getQueryData(chaves.indicadores({}))).toEqual(INDICADORES);

    act(() => {
      ultima().emitir('simulacao', { tipo: 'simulacao', dados: { ...simulacao, pausado: true } });
      ultima().emitir('indicadores', { tipo: 'indicadores', dados: { ...INDICADORES, alertasAbertos: 13 } });
    });
    expect(qc.getQueryData<EstadoSimulacao>(chaves.simulacao())?.pausado).toBe(true);
    expect(qc.getQueryData<Indicadores>(chaves.indicadores({}))?.alertasAbertos).toBe(13);
    expect(qc.getQueryData<Indicadores>(chaves.indicadores({ regiao: 'Norte' }))?.totalEquipamentos).toBe(40);
  });
});
