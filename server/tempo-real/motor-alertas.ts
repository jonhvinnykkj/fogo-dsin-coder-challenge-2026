// Motor de alertas: transforma o que acontece (leitura fora do normal, equipamento calado, patinete fora da cidade,
// ocorrência grave…) em alertas legíveis, sem repetir o mesmo problema enquanto ele estiver aberto.
//
// Todo alerta diz o quê, onde (código + logradouro/bairro) e por quê (valor medido × esperado).
// Dedup: cada situação tem uma `chave_dedup` (ex.: `anomalia:12:fluxo`, `sem_sinal:12`, `furto:12`). Se já existe alerta
// ABERTO com a mesma chave, nada novo é criado; depois de resolvido, o problema que voltar abre um alerta novo.
import type { Database } from 'better-sqlite3';
import type { Criticidade, SituacaoEquipamento } from '../../shared/dominio';
import { ROTULO_TIPO_OCORRENCIA } from '../../shared/dominio';
import { dentroDeMarilia } from '../../shared/geo';
import type { Alerta, EventoFogo, Ocorrencia } from '../../shared/modelos';
import { METRICAS_POR_TIPO } from '../../shared/telemetria';
import type { TipoEquipamentoId } from '../../shared/tipos-equipamento';
import { formatarNumero } from '../../shared/formato';
import { inserirAlerta, resolverAlerta, type NovoAlerta } from '../repositorios/alertas';
import { dataLocal, inicioDaHora, partesLocais } from '../tempo';
import { calcularBaseHoraria, detectarAnomalia, type Anomalia, type BaseHoraria } from './anomalias';

/** Sem leitura há mais que isto, equipamento operacional vira alerta `sem_sinal`. */
export const LIMITE_SEM_SINAL_MIN = 15;
/**
 * Anomalia moderada (3 ≤ |z| < 6) só vira alerta na segunda leitura seguida: um desvio de 3 sigmas acontece por acaso em
 * 0,27% das leituras e, com milhares de leituras por minuto, daria alarme falso o tempo todo. Anomalia forte (|z| ≥ 6)
 * e radar sem leituras alertam na hora.
 */
export const Z_ALERTA_IMEDIATO = 6;
/** Anomalia que não se repete há tanto tempo é considerada passada e resolvida sozinha. */
export const RESOLVER_ANOMALIA_APOS_MIN = 30;

const MIN = 60_000;
const OPERANDO: readonly SituacaoEquipamento[] = ['operacional', 'mau_funcionamento'];

const NOME_CURTO: Record<TipoEquipamentoId, string> = {
  radar: 'Radar', camera: 'Câmera', balanca: 'Balança', fiscal_rotativo: 'Veículo fiscal do rotativo', cancela: 'Cancela',
  transporte: 'Veículo de transporte', totem_rotativo: 'Totem do rotativo', patinete: 'Patinete', moto_agente: 'Moto do agente',
  viatura: 'Viatura', semaforo: 'Semáforo', painel_mensagem: 'Painel de mensagem', sensor_alagamento: 'Sensor de alagamento',
};

/** O equipamento como o motor precisa vê-lo: tipo, situação, onde está agora e as características. */
export interface AlvoAlerta {
  id: number;
  codigo: string;
  tipo: TipoEquipamentoId;
  situacao: SituacaoEquipamento;
  bairroId: number;
  bairroNome: string;
  logradouro: string;
  /** Posição atual (telemetria). */
  lat: number;
  lng: number;
  caracteristicas: Record<string, unknown>;
}

interface LinhaAlvo {
  id: number; codigo: string; tipo: TipoEquipamentoId; situacao: SituacaoEquipamento; bairro_id: number; bairro_nome: string;
  logradouro: string; lat_atual: number; lng_atual: number; caracteristicas: string;
}
const SELECT_ALVO = `SELECT e.id, e.codigo, e.tipo, e.situacao, e.bairro_id, b.nome AS bairro_nome, e.logradouro, e.lat_atual, e.lng_atual, e.caracteristicas
  FROM equipamentos e JOIN bairros b ON b.id = e.bairro_id`;
const paraAlvo = (l: LinhaAlvo): AlvoAlerta => ({
  id: l.id, codigo: l.codigo, tipo: l.tipo, situacao: l.situacao, bairroId: l.bairro_id, bairroNome: l.bairro_nome, logradouro: l.logradouro,
  lat: l.lat_atual, lng: l.lng_atual, caracteristicas: JSON.parse(l.caracteristicas) as Record<string, unknown>,
});
export function alvoPorId(db: Database, id: number): AlvoAlerta | undefined {
  const l = db.prepare(`${SELECT_ALVO} WHERE e.id = ?`).get(id) as LinhaAlvo | undefined;
  return l && paraAlvo(l);
}
export function alvoPorCodigo(db: Database, codigo: string): AlvoAlerta | undefined {
  const l = db.prepare(`${SELECT_ALVO} WHERE e.codigo = ?`).get(codigo) as LinhaAlvo | undefined;
  return l && paraAlvo(l);
}

const radarSemLeituras = (alvo: AlvoAlerta, a: Anomalia) => alvo.tipo === 'radar' && a.metrica === 'fluxo' && a.valor <= Math.max(3, a.esperado * 0.05);
const onde = (a: AlvoAlerta) => `${a.logradouro}, ${a.bairroNome}`;
const quem = (a: AlvoAlerta) => `${NOME_CURTO[a.tipo]} ${a.codigo}`;
const diaMesAno = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
const ehPico = (hora: number, diaSemana: number) => diaSemana >= 1 && diaSemana <= 5 && ((hora >= 7 && hora < 9) || (hora >= 17 && hora < 19));

export class MotorAlertas {
  private readonly bases = new Map<string, BaseHoraria>();
  /** Última vez (ms) em que cada chave de anomalia foi vista; serve para resolver a que parou de acontecer. */
  private readonly vistas = new Map<string, number>();
  /** Quantas leituras seguidas confirmaram cada anomalia (chave → contagem); zera quando a leitura volta ao normal. */
  private readonly suspeitas = new Map<string, number>();

  constructor(private readonly ctx: { db: Database; barramento: { emitir(e: EventoFogo): void }; relogio: { agora(): Date } }) {}

  private get db(): Database {
    return this.ctx.db;
  }

  /** Cria o alerta, a menos que já exista um aberto com a mesma chave. Devolve o alerta novo ou `null`. */
  registrar(alerta: NovoAlerta): Alerta | null {
    if (alerta.chaveDedup) {
      this.vistas.set(alerta.chaveDedup, Date.parse(alerta.criadoEm));
      const aberto = this.db.prepare('SELECT id FROM alertas WHERE chave_dedup = ? AND resolvido_em IS NULL LIMIT 1').get(alerta.chaveDedup);
      if (aberto) return null;
    }
    const criado = inserirAlerta(this.db, alerta);
    this.ctx.barramento.emitir({ tipo: 'alerta', dados: criado });
    return criado;
  }

  /** Resolve os alertas abertos com essa chave (e avisa a tela). */
  resolverPorChave(chave: string, quando: Date = this.ctx.relogio.agora()): void {
    const abertos = this.db.prepare('SELECT id FROM alertas WHERE chave_dedup = ? AND resolvido_em IS NULL').all(chave) as { id: number }[];
    this.resolverIds(abertos.map((a) => a.id), quando);
    this.vistas.delete(chave);
  }

  /** Depois do reparo: some o que dizia respeito à falha (sem sinal, leitura fora do normal, falha). */
  resolverDoEquipamento(equipamentoId: number, quando: Date = this.ctx.relogio.agora()): void {
    const abertos = this.db.prepare(
      "SELECT id, chave_dedup FROM alertas WHERE equipamento_id = ? AND resolvido_em IS NULL AND tipo IN ('sem_sinal', 'anomalia_leitura', 'falha_equipamento')",
    ).all(equipamentoId) as { id: number; chave_dedup: string | null }[];
    this.resolverIds(abertos.map((a) => a.id), quando);
    for (const a of abertos) if (a.chave_dedup) this.vistas.delete(a.chave_dedup);
  }

  private resolverIds(ids: number[], quando: Date): void {
    for (const id of ids) {
      const resolvido = resolverAlerta(this.db, id, quando.toISOString());
      if (resolvido) this.ctx.barramento.emitir({ tipo: 'alerta', dados: resolvido });
    }
  }

  private base(alvo: AlvoAlerta, em: Date): BaseHoraria {
    const p = partesLocais(em);
    const diaUtil = p.diaSemana >= 1 && p.diaSemana <= 5;
    const chave = `${alvo.id}|${diaUtil ? 1 : p.diaSemana}|${p.hora}`;
    let base = this.bases.get(chave);
    if (!base) {
      base = calcularBaseHoraria(this.db, alvo.id, diaUtil, p.hora, { antes: inicioDaHora(em), diaSemana: p.diaSemana });
      if (this.bases.size > 50_000) this.bases.clear();
      this.bases.set(chave, base);
    }
    return base;
  }

  private alertaDeAnomalia(alvo: AlvoAlerta, a: Anomalia, em: Date): NovoAlerta {
    const p = partesLocais(em);
    const metrica = METRICAS_POR_TIPO[alvo.tipo].find((m) => m.chave === a.metrica)!;
    const semLeituras = radarSemLeituras(alvo, a);
    const criticidade: Criticidade = semLeituras && ehPico(p.hora, p.diaSemana) ? 'alta' : 'media';
    const titulo = semLeituras
      ? `${quem(alvo)} sem leituras às ${p.hora}h`
      : `${quem(alvo)}: ${metrica.rotulo.toLowerCase()} ${a.valor < a.esperado ? 'abaixo' : 'acima'} do normal às ${p.hora}h`;
    return {
      tipo: 'anomalia_leitura', criticidade, titulo, descricao: `${quem(alvo)} (${onde(alvo)}). ${a.explicacao}.`,
      equipamentoId: alvo.id, bairroId: alvo.bairroId, lat: alvo.lat, lng: alvo.lng, criadoEm: em.toISOString(), chaveDedup: `anomalia:${alvo.id}:${a.metrica}`,
    };
  }

  /**
   * Regras sobre uma leitura recém-chegada: patinete fora de Marília, sensor acima da altura de alerta e leitura fora
   * do normal do horário. Só avalia equipamento operando. Devolve só os alertas novos.
   */
  avaliarLeitura(alvo: AlvoAlerta, metricas: Record<string, number | boolean>, em: Date, posicao?: { lat: number; lng: number }): Alerta[] {
    if (!OPERANDO.includes(alvo.situacao)) return [];
    const criados: Alerta[] = [];
    const emitido = (a: NovoAlerta) => {
      const c = this.registrar(a);
      if (c) criados.push(c);
    };
    const pos = posicao ?? { lat: alvo.lat, lng: alvo.lng };
    const base = { equipamentoId: alvo.id, bairroId: alvo.bairroId, criadoEm: em.toISOString() };

    if (alvo.tipo === 'patinete' && !dentroDeMarilia(pos.lat, pos.lng)) emitido(this.alertaDeFurtoPatinete(alvo, pos, em));

    let alagando = false;
    if (alvo.tipo === 'sensor_alagamento' && typeof metricas.nivelCm === 'number') {
      const altura = Number(alvo.caracteristicas.alturaAlertaCm);
      if (Number.isFinite(altura) && metricas.nivelCm > altura) {
        alagando = true;
        emitido({
          ...base, tipo: 'alagamento', criticidade: 'critica', lat: alvo.lat, lng: alvo.lng, chaveDedup: `alagamento:${alvo.id}`,
          titulo: `Alagamento em ${alvo.bairroNome}: ${alvo.codigo} acima da altura de alerta`,
          descricao: `${quem(alvo)} (${onde(alvo)}) mediu ${formatarNumero(metricas.nivelCm, 1)} cm de água, acima da altura de alerta de ${formatarNumero(altura, 0)} cm.`,
        });
      } else if (Number.isFinite(altura)) {
        this.resolverPorChave(`alagamento:${alvo.id}`, em);
      }
    }

    if (!alagando) {
      const anomalia = detectarAnomalia(this.base(alvo, em), metricas, alvo.tipo);
      const prefixo = `anomalia:${alvo.id}:`;
      const chave = anomalia ? `${prefixo}${anomalia.metrica}` : undefined;
      for (const k of this.suspeitas.keys()) if (k.startsWith(prefixo) && k !== chave) this.suspeitas.delete(k);
      if (anomalia && chave) {
        const seguidas = (this.suspeitas.get(chave) ?? 0) + 1;
        this.suspeitas.set(chave, seguidas);
        if (seguidas >= 2 || Math.abs(anomalia.z) >= Z_ALERTA_IMEDIATO || radarSemLeituras(alvo, anomalia)) emitido(this.alertaDeAnomalia(alvo, anomalia, em));
      }
    }
    return criados;
  }

  private alertaDeFurtoPatinete(alvo: AlvoAlerta, pos: { lat: number; lng: number }, em: Date): NovoAlerta {
    return {
      tipo: 'furto_suspeito', criticidade: 'critica', equipamentoId: alvo.id, bairroId: alvo.bairroId, lat: pos.lat, lng: pos.lng, criadoEm: em.toISOString(),
      chaveDedup: `furto:${alvo.id}`,
      titulo: `Possível furto: ${quem(alvo)} fora de Marília`,
      descricao: `${quem(alvo)} (base em ${onde(alvo)}) transmitiu posição fora do limite do município (${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}).`,
    };
  }

  /** Furto de equipamento que não é patinete (não tem rastreio que saia da cidade): o alerta vem do relato. */
  alertarFurto(alvo: AlvoAlerta, em: Date, detalhe: string): Alerta | null {
    return this.registrar({
      tipo: 'furto_suspeito', criticidade: 'critica', equipamentoId: alvo.id, bairroId: alvo.bairroId, lat: alvo.lat, lng: alvo.lng, criadoEm: em.toISOString(),
      chaveDedup: `furto:${alvo.id}`, titulo: `Possível furto: ${quem(alvo)}`, descricao: `${quem(alvo)} (${onde(alvo)}): ${detalhe}.`,
    });
  }

  alertarFalha(alvo: AlvoAlerta, em: Date, sintoma: string): Alerta | null {
    return this.registrar({
      tipo: 'falha_equipamento', criticidade: 'alta', equipamentoId: alvo.id, bairroId: alvo.bairroId, lat: alvo.lat, lng: alvo.lng, criadoEm: em.toISOString(),
      chaveDedup: `falha:${alvo.id}`, titulo: `${quem(alvo)} em mau funcionamento`, descricao: `${quem(alvo)} (${onde(alvo)}) falhou: ${sintoma}.`,
    });
  }

  /** Acidente (alta; crítica se gravidade 4), congestionamento (média) e alagamento (crítica) viram alerta; o resto não. */
  alertarOcorrencia(o: Ocorrencia, bairroNome: string, em: Date): Alerta | null {
    const criticidade: Criticidade | undefined =
      o.tipo === 'acidente' ? (o.gravidade === 4 ? 'critica' : 'alta') : o.tipo === 'congestionamento' ? 'media' : o.tipo === 'alagamento' ? 'critica' : undefined;
    if (!criticidade) return null;
    return this.registrar({
      tipo: o.tipo, criticidade, bairroId: o.bairroId, lat: o.lat, lng: o.lng, criadoEm: em.toISOString(), chaveDedup: `ocorrencia:${o.id}`,
      ...(o.equipamentoId !== undefined && { equipamentoId: o.equipamentoId }),
      ...(o.agenteId !== undefined && { agenteId: o.agenteId }),
      titulo: `${ROTULO_TIPO_OCORRENCIA[o.tipo]} em ${bairroNome}`,
      descricao: `${o.descricao}. Gravidade ${o.gravidade} de 4, em ${bairroNome}.`,
    });
  }

  /**
   * Varredura periódica: equipamento operacional sem sinal há mais de 15 min, manutenção atrasada, patinete fora do
   * município. Também resolve o que deixou de valer (sinal que voltou, manutenção feita, anomalia que não se repete).
   */
  varrer(agora: Date): Alerta[] {
    const criados: Alerta[] = [];
    const emitido = (a: NovoAlerta) => {
      const c = this.registrar(a);
      if (c) criados.push(c);
    };
    const iso = agora.toISOString();
    const corte = new Date(agora.getTime() - LIMITE_SEM_SINAL_MIN * MIN).toISOString();

    // Sem sinal.
    const calados = this.db.prepare(`${SELECT_ALVO} WHERE e.situacao = 'operacional' AND e.ultimo_sinal_em IS NOT NULL AND e.ultimo_sinal_em < ?`).all(corte) as LinhaAlvo[];
    for (const l of calados) {
      const alvo = paraAlvo(l);
      const ultimo = (this.db.prepare('SELECT ultimo_sinal_em AS u FROM equipamentos WHERE id = ?').get(alvo.id) as { u: string }).u;
      const minutos = Math.round((agora.getTime() - Date.parse(ultimo)) / MIN);
      const p = partesLocais(new Date(ultimo));
      emitido({
        tipo: 'sem_sinal', criticidade: 'alta', equipamentoId: alvo.id, bairroId: alvo.bairroId, lat: alvo.lat, lng: alvo.lng, criadoEm: iso, chaveDedup: `sem_sinal:${alvo.id}`,
        titulo: `${quem(alvo)} sem sinal`,
        descricao: `${quem(alvo)} (${onde(alvo)}) está operacional mas não envia leituras há ${minutos} min (último sinal às ${String(p.hora).padStart(2, '0')}:${String(p.minuto).padStart(2, '0')}).`,
      });
    }
    this.resolverIds(
      (this.db.prepare(`SELECT a.id FROM alertas a JOIN equipamentos e ON e.id = a.equipamento_id
        WHERE a.tipo = 'sem_sinal' AND a.resolvido_em IS NULL AND (e.situacao <> 'operacional' OR e.ultimo_sinal_em >= ?)`).all(corte) as { id: number }[]).map((a) => a.id),
      agora,
    );

    // Manutenção atrasada (mesmo critério do painel de manutenção).
    const hoje = dataLocal(agora);
    const atrasados = this.db.prepare(`${SELECT_ALVO} WHERE e.situacao NOT IN ('desativado', 'nao_instalado') AND e.manutencao_necessidade <> 'imediata'
      AND e.proxima_manutencao IS NOT NULL AND e.proxima_manutencao < ?`).all(hoje) as LinhaAlvo[];
    for (const l of atrasados) {
      const alvo = paraAlvo(l);
      const proxima = (this.db.prepare('SELECT proxima_manutencao AS p FROM equipamentos WHERE id = ?').get(alvo.id) as { p: string }).p;
      const dias = diasEntre(proxima, hoje);
      emitido({
        tipo: 'manutencao_atrasada', criticidade: 'media', equipamentoId: alvo.id, bairroId: alvo.bairroId, lat: alvo.lat, lng: alvo.lng, criadoEm: iso, chaveDedup: `manutencao:${alvo.id}`,
        titulo: `${quem(alvo)} com manutenção atrasada`,
        descricao: `${quem(alvo)} (${onde(alvo)}) tinha manutenção prevista para ${diaMesAno(proxima)}, atrasada há ${dias} ${dias === 1 ? 'dia' : 'dias'}.`,
      });
    }
    this.resolverIds(
      (this.db.prepare(`SELECT a.id FROM alertas a JOIN equipamentos e ON e.id = a.equipamento_id
        WHERE a.tipo = 'manutencao_atrasada' AND a.resolvido_em IS NULL AND NOT (e.situacao NOT IN ('desativado', 'nao_instalado')
          AND e.manutencao_necessidade <> 'imediata' AND e.proxima_manutencao IS NOT NULL AND e.proxima_manutencao < ?)`).all(hoje) as { id: number }[]).map((a) => a.id),
      agora,
    );

    // Patinete fora do município.
    const patinetes = this.db.prepare(`${SELECT_ALVO} WHERE e.tipo = 'patinete' AND e.situacao IN ('operacional', 'mau_funcionamento')`).all() as LinhaAlvo[];
    for (const l of patinetes) {
      const alvo = paraAlvo(l);
      if (!dentroDeMarilia(alvo.lat, alvo.lng)) emitido(this.alertaDeFurtoPatinete(alvo, alvo, agora));
    }

    // Anomalia que não se repete há 30 min já passou.
    const anomalias = this.db.prepare("SELECT id, chave_dedup, criado_em FROM alertas WHERE tipo = 'anomalia_leitura' AND resolvido_em IS NULL").all() as { id: number; chave_dedup: string | null; criado_em: string }[];
    const passadas = anomalias.filter((a) => agora.getTime() - (this.vistas.get(a.chave_dedup ?? '') ?? Date.parse(a.criado_em)) >= RESOLVER_ANOMALIA_APOS_MIN * MIN);
    this.resolverIds(passadas.map((a) => a.id), agora);
    for (const a of passadas) if (a.chave_dedup) this.vistas.delete(a.chave_dedup);

    return criados;
  }
}
