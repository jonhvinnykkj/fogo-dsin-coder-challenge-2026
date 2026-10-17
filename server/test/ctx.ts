// Fábrica de contexto para testes do servidor (reutilizada pelas Tarefas 5 em diante).
//
// Abre um banco SQLite em memória, roda `migrar`, insere os bairros de `carregarGeo()` e devolve um
// `ContextoApp` com relógio fixo. Cada chamada cria um banco novo e isolado; só a geografia
// (cara de calcular) é compartilhada entre as chamadas.
import { abrirBanco } from '../db/conexao';
import { migrar } from '../db/migrar';
import { inserirBairros } from '../repositorios/bairros';
import { carregarGeo, type GeoMarilia } from '../geo/marilia';
import type { ContextoApp, Relogio } from '../contexto';
import { Barramento } from '../tempo-real/barramento';
import { MotorAlertas } from '../tempo-real/motor-alertas';

export const AGORA_PADRAO = '2026-10-17T15:00:00.000Z';

/** Relógio fixo que o teste pode avançar com `definir`. */
export interface RelogioDeTeste extends Relogio {
  definir(quando: Date | string): void;
}

export function criarRelogioDeTeste(inicio: Date | string = AGORA_PADRAO): RelogioDeTeste {
  let atual = new Date(inicio);
  return {
    agora: () => new Date(atual),
    definir(quando) {
      atual = new Date(quando);
    },
  };
}

export interface OpcoesCtxDeTeste {
  /** Hora inicial do relógio (padrão: 2026-10-17T15:00:00Z). */
  agora?: Date | string;
  /** Substitui o relógio inteiro. */
  relogio?: Relogio;
  geo?: GeoMarilia;
}

export type CtxDeTeste = ContextoApp & { relogio: Relogio | RelogioDeTeste };

let geoCompartilhado: GeoMarilia | undefined;

export function criarCtxDeTeste(opcoes: OpcoesCtxDeTeste = {}): CtxDeTeste {
  const geo = opcoes.geo ?? (geoCompartilhado ??= carregarGeo());
  const db = abrirBanco(':memory:');
  migrar(db);
  inserirBairros(db, geo);
  const relogio = opcoes.relogio ?? criarRelogioDeTeste(opcoes.agora);
  const barramento = new Barramento();
  return { db, barramento, motor: new MotorAlertas({ db, barramento, relogio }), relogio, geo };
}
