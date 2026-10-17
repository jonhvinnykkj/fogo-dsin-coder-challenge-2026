// Perfis horários/semanais da cidade e a leitura de telemetria de uma hora.
//
// Usado pelo histórico sintético (Tarefa 5) e, na Tarefa 6, pelo simulador e pela linha de base das anomalias:
// se o simulador chamar `gerarLeituraHora` com o mesmo `bairroFator` (= `fatorLocalEquipamento(equipamento)`),
// as leituras ao vivo seguem o mesmo "normal" do histórico e só fogem dele quando algo de fato falha.
// Os nomes das métricas vêm de `shared/telemetria.ts`; nenhum outro arquivo inventa chaves.
//
// Contexto da leitura (`ContextoLeitura`): `chuva`, `falhando` e `bairroFator` são obrigatórios; os opcionais
// refinam a leitura quando quem chama sabe mais:
//   - `onlineMin` (0–60): minutos conectado na hora; vira a métrica `online` (%) e escala as contagens.
//     Padrão: 60 (ou ~15 se falhando).
//   - `atividade` (0–1): fração da hora em operação para veículos (turno do agente, horário escolar…).
//     Padrão: `atividadeVeiculo(tipo, hora)` sem turno/categoria.
//   - `chuvaMm`: chuva do dia em mm (sobe o nível do sensor de alagamento). Padrão: 15 mm se `chuva`.
import { turnoCobreHora, type Regiao, type Turno } from '../../shared/dominio';
import type { TipoEquipamentoId } from '../../shared/tipos-equipamento';
import { partesLocais, type PartesLocais } from '../tempo';
import { derivarSemente, type Rng } from './aleatorio';

export type TipoDia = 'util' | 'sabado' | 'domingo';

export const tipoDoDia = (diaSemana: number): TipoDia => (diaSemana === 0 ? 'domingo' : diaSemana === 6 ? 'sabado' : 'util');

/** Trânsito relativo por hora local (1 = hora comum de dia útil). Picos 7–9 h e 17–19 h nos dias úteis. */
export const PERFIL_TRAFEGO: Record<TipoDia, readonly number[]> = {
  //      0     1     2     3     4     5     6     7     8     9    10    11    12    13    14    15    16    17    18    19    20    21    22    23
  util: [0.15, 0.10, 0.08, 0.08, 0.12, 0.35, 0.85, 2.40, 2.30, 1.15, 0.95, 1.00, 1.10, 1.00, 0.95, 1.00, 1.25, 2.40, 2.30, 1.20, 0.80, 0.60, 0.40, 0.25],
  sabado: [0.35, 0.30, 0.22, 0.15, 0.12, 0.18, 0.35, 0.55, 0.75, 0.95, 1.10, 1.20, 1.20, 1.10, 1.00, 0.95, 0.95, 0.95, 0.90, 0.85, 0.75, 0.65, 0.55, 0.45],
  domingo: [0.40, 0.35, 0.28, 0.18, 0.12, 0.12, 0.20, 0.30, 0.45, 0.60, 0.75, 0.85, 0.90, 0.85, 0.80, 0.80, 0.80, 0.80, 0.80, 0.70, 0.60, 0.50, 0.40, 0.30],
};

/** Ocorrências de segurança e furto por hora local (todos os dias): sobem à noite, pico entre 20 h e 2 h. */
export const PERFIL_SEGURANCA: readonly number[] =
  [1.6, 1.4, 1.1, 0.8, 0.5, 0.3, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.8, 0.8, 0.8, 0.8, 0.9, 1.0, 1.2, 1.4, 1.7, 1.9, 2.0, 1.9];

/** Uso de patinetes por hora local: deslocamento nos dias úteis, lazer à tarde no fim de semana. */
export const PERFIL_PATINETE: Record<TipoDia, readonly number[]> = {
  util: [0.10, 0.05, 0.03, 0.02, 0.02, 0.05, 0.30, 1.20, 1.40, 0.80, 0.70, 0.90, 1.10, 0.90, 0.80, 0.90, 1.10, 1.60, 1.80, 1.40, 1.00, 0.70, 0.40, 0.20],
  sabado: [0.30, 0.20, 0.10, 0.05, 0.03, 0.03, 0.10, 0.30, 0.60, 0.90, 1.20, 1.40, 1.40, 1.40, 1.50, 1.60, 1.60, 1.60, 1.50, 1.30, 1.10, 0.90, 0.70, 0.50],
  domingo: [0.30, 0.20, 0.10, 0.05, 0.03, 0.03, 0.08, 0.20, 0.50, 0.90, 1.30, 1.50, 1.50, 1.50, 1.60, 1.70, 1.70, 1.60, 1.40, 1.10, 0.80, 0.60, 0.40, 0.30],
};

/** Bateria média esperada do patinete por hora local (a operadora troca baterias a partir das 22 h). */
export const BATERIA_PATINETE: readonly number[] =
  [70, 85, 93, 96, 97, 97, 96, 92, 86, 82, 78, 74, 70, 66, 62, 58, 54, 49, 44, 40, 37, 35, 40, 55];

/** Intensidade da chuva por hora local num dia chuvoso: temporais de fim de tarde no interior paulista. */
export const PERFIL_TEMPESTADE: readonly number[] =
  [0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.10, 0.15, 0.25, 0.50, 1.00, 1.40, 1.60, 1.50, 1.20, 0.90, 0.60, 0.35, 0.20, 0.10];

export const soma = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);

export function fatorTrafego(hora: Date): number {
  const p = partesLocais(hora);
  return PERFIL_TRAFEGO[tipoDoDia(p.diaSemana)][p.hora]!;
}

export function fatorSeguranca(hora: Date): number {
  return PERFIL_SEGURANCA[partesLocais(hora).hora]!;
}

/** Zona Azul (rotativo): segunda a sexta das 8 h às 18 h, sábado das 8 h às 13 h. */
export function horarioRotativo(p: PartesLocais): boolean {
  if (p.diaSemana >= 1 && p.diaSemana <= 5) return p.hora >= 8 && p.hora < 18;
  return p.diaSemana === 6 && p.hora >= 8 && p.hora < 13;
}

/** Janelas de entrada e saída das escolas (dias úteis), em minutos do dia: 6:30–7:30, 11:30–13:30 e 17–18 h. */
export const JANELAS_ESCOLARES: readonly [number, number][] = [[390, 450], [690, 810], [1020, 1080]];

/** Minutos da hora local `p.hora` que caem numa janela escolar (0 a 60). Fim de semana: 0. */
export function minutosEscolaresNaHora(p: PartesLocais): { inicio: number; fim: number }[] {
  if (p.diaSemana === 0 || p.diaSemana === 6) return [];
  const a = p.hora * 60;
  const b = a + 60;
  const trechos: { inicio: number; fim: number }[] = [];
  for (const [ji, jf] of JANELAS_ESCOLARES) {
    const i = Math.max(a, ji);
    const f = Math.min(b, jf);
    if (f > i) trechos.push({ inicio: i - a, fim: f - a });
  }
  return trechos;
}

const BASE_REGIAO: Record<Regiao, number> = { Centro: 1.45, Oeste: 1.0, Sul: 1.0, Leste: 0.9, Norte: 0.85 };

/**
 * Escala do "movimento" de um equipamento (fluxo do radar, uso do patinete…), estável e sem estado:
 * região × avenida × variação própria derivada do id. O simulador usa a mesma função.
 */
export function fatorLocalEquipamento(e: { id: number; regiao: Regiao; logradouro?: string }): number {
  const proprio = 0.75 + 0.5 * (derivarSemente(0, 'equipamento', e.id) / 4294967296);
  const avenida = e.logradouro?.startsWith('Avenida') ? 1.25 : 1;
  return Math.round(BASE_REGIAO[e.regiao] * proprio * avenida * 1000) / 1000;
}

/** Leituras por minuto conectado (fixos a cada minuto, veículos a cada 30 s, sensor a cada 5 min). */
export const LEITURAS_POR_MINUTO: Record<TipoEquipamentoId, number> = {
  radar: 1, camera: 1, balanca: 1, fiscal_rotativo: 2, cancela: 1, transporte: 2, totem_rotativo: 1,
  patinete: 0.5, moto_agente: 2, viatura: 2, semaforo: 1, painel_mensagem: 0.5, sensor_alagamento: 0.2,
};

/** Fração da hora em que um veículo está rodando (0 a 1). Fixos: 1. */
export function atividadeVeiculo(
  tipo: TipoEquipamentoId,
  hora: Date,
  opcoes: { categoria?: string; turnos?: readonly Turno[] } = {},
): number {
  const p = partesLocais(hora);
  switch (tipo) {
    case 'moto_agente':
    case 'viatura':
      if (!opcoes.turnos || opcoes.turnos.length === 0) return 0.5;
      return opcoes.turnos.some((t) => turnoCobreHora(t, p.hora)) ? 0.85 : 0.03;
    case 'transporte': {
      if (opcoes.categoria === 'escolar') {
        const util = p.diaSemana >= 1 && p.diaSemana <= 5;
        return util && [6, 7, 11, 12, 13, 17].includes(p.hora) ? 0.85 : 0.03;
      }
      if (p.hora < 6) return 0.08;
      return Math.min(0.85, 0.25 + 0.25 * PERFIL_TRAFEGO[tipoDoDia(p.diaSemana)][p.hora]!);
    }
    case 'fiscal_rotativo':
      return horarioRotativo(p) ? 0.9 : 0;
    default:
      return 1;
  }
}

export interface ContextoLeitura {
  chuva: boolean;
  falhando: boolean;
  bairroFator: number;
  onlineMin?: number;
  atividade?: number;
  chuvaMm?: number;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const limitar = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

/**
 * Médias de uma hora de telemetria do tipo (chaves de `METRICAS_POR_TIPO`). Contagens são o total da hora.
 * `falhando` produz o sintoma típico da falha (radar zerado, câmera sem quadros, semáforo com falhas de fase…).
 */
export function gerarLeituraHora(tipo: TipoEquipamentoId, hora: Date, rng: Rng, ctx: ContextoLeitura): Record<string, number> {
  const p = partesLocais(hora);
  const td = tipoDoDia(p.diaSemana);
  const trafego = PERFIL_TRAFEGO[td][p.hora]!;
  const onlineMin = limitar(ctx.onlineMin ?? (ctx.falhando ? 15 : 60), 0, 60);
  const fracao = onlineMin / 60;
  const online = r1(fracao * 100);
  const f = ctx.bairroFator;

  switch (tipo) {
    case 'radar': {
      if (ctx.falhando) return { fluxo: rng.int(0, 3), velocidadeMedia: 0, infracoes: 0 };
      const esperado = 300 * f * trafego * (ctx.chuva ? 0.92 : 1);
      const fluxo = Math.max(0, Math.round(rng.normal(esperado, esperado * 0.08) * fracao));
      const lentidao = 14 * Math.max(0, trafego - 1) * Math.min(1.5, f);
      const livre = trafego < 0.4 ? 58 : 52;
      const velocidadeMedia = r1(limitar(rng.normal(livre - lentidao - (ctx.chuva ? 6 : 0), 2.5), 8, 75));
      return { fluxo, velocidadeMedia, infracoes: rng.poisson(fluxo * 0.008) };
    }
    case 'camera':
      return { online, fps: ctx.falhando ? r1(rng.entre(0, 6)) : online > 0 ? r1(limitar(rng.normal(24, 1.2), 0, 30)) : 0 };
    case 'balanca': {
      if (ctx.falhando) return { pesagens: 0, excessoPeso: 0 };
      const pesagens = rng.poisson(28 * f * (0.35 + 0.65 * Math.min(1.5, trafego)) * fracao);
      return { pesagens, excessoPeso: rng.poisson(pesagens * 0.05) };
    }
    case 'fiscal_rotativo': {
      const atividade = ctx.atividade ?? atividadeVeiculo(tipo, hora);
      const kmRodados = r1(atividade * rng.entre(9, 14) * fracao);
      return { placasLidas: ctx.falhando ? 0 : rng.poisson(300 * atividade * f * fracao), kmRodados };
    }
    case 'cancela':
      return { aberturas: ctx.falhando ? 0 : rng.poisson(40 * f * trafego * fracao) };
    case 'transporte':
    case 'moto_agente':
    case 'viatura': {
      const atividade = ctx.atividade ?? atividadeVeiculo(tipo, hora);
      if (ctx.falhando || atividade < 0.05) return { velocidade: 0, kmRodados: 0 };
      const velocidade = r1(limitar(rng.normal(30 - (ctx.chuva ? 4 : 0) - 6 * Math.max(0, trafego - 1), 4), 5, 60));
      return { velocidade, kmRodados: r1(velocidade * atividade * rng.entre(0.35, 0.6) * fracao) };
    }
    case 'totem_rotativo':
      return {
        transacoes: ctx.falhando ? 0 : rng.poisson((horarioRotativo(p) ? 12 * f * trafego : 0.2) * fracao),
        online,
      };
    case 'patinete': {
      if (ctx.falhando) return { bateria: r1(rng.entre(0, 8)), emUso: 0 };
      const uso = 16 * PERFIL_PATINETE[td][p.hora]! * f * (ctx.chuva ? 0.45 : 1);
      const emUso = r1(limitar(rng.normal(uso, 3), 0, 90) * fracao);
      const bateria = r1(limitar(rng.normal(BATERIA_PATINETE[p.hora]! - 0.3 * (emUso - 15), 5), 3, 100));
      return { bateria, emUso };
    }
    case 'semaforo':
      return { online, falhasFase: ctx.falhando ? rng.poisson(5) : rng.poisson(0.02) };
    case 'painel_mensagem':
      return { online };
    case 'sensor_alagamento': {
      if (ctx.falhando) return { nivelCm: 0 };
      const chuvaMm = ctx.chuva ? (ctx.chuvaMm ?? 15) : 0;
      const nivel = rng.entre(0.5, 3) + chuvaMm * 1.5 * PERFIL_TEMPESTADE[p.hora]! * f * rng.entre(0.8, 1.2);
      return { nivelCm: r1(nivel) };
    }
  }
}
