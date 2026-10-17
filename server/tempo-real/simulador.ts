// Simulador: faz a cidade "acontecer" dentro do próprio servidor, alimentando a MESMA ingestão que um dispositivo real usaria.
//
// A cada tick (2 s reais) ele: anda com os móveis pelas ruas, manda leituras (`ingerirTelemetria`), sorteia falhas e furtos,
// gera ocorrências ao vivo, designa agentes, e agenda reparos e encerramentos. O relógio é o relógio real; a velocidade
// (1×, 10×, 60×) multiplica o deslocamento e a taxa de eventos, não "adianta o tempo".
// Tudo sai de um gerador com semente: mesma semente e mesmo estado inicial dão as mesmas leituras (é o que os testes conferem).
import { HORARIO_TURNO, turnoCobreHora, type CategoriaAgente, type SituacaoAgente, type SituacaoEquipamento, type Turno } from '../../shared/dominio';
import type { Alerta, EstadoSimulacao, Ocorrencia } from '../../shared/modelos';
import type { TipoEquipamentoId } from '../../shared/tipos-equipamento';
import type { ContextoApp } from '../contexto';
import { invalido, conflito, naoEncontrado } from '../erros';
import type { Ponto } from '../../shared/geo';
import { agenteMapaPorId, gravarSituacaoAgente } from '../repositorios/agentes';
import { equipamentoMapaPorId, gravarSituacao } from '../repositorios/equipamentos';
import { encerrarOcorrencia, inserirOcorrencia } from '../repositorios/ocorrencias';
import { criarRng, type Rng } from '../semente/aleatorio';
import { BAIRROS_FURTO_PATINETE, FALHAS } from '../semente/historico';
import { atividadeVeiculo, gerarLeituraHora, tipoDoDia } from '../semente/perfis';
import { montarContexto, SEMENTE_PADRAO } from '../semente/semear';
import { registrarManutencao } from '../servicos/equipamentos';
import { dataLocal, inicioDaHora, partesLocais } from '../tempo';
import { gerarOcorrenciasDaHora, type ContextoHoras, type OcorrenciaGerada } from '../semente/historico';
import {
  CHANCE_FALHA_MUDA, chanceDeFalha, chanceDeFurto, DESCRICOES_INJETADAS, duracaoDaOcorrenciaMs, escalaDeOcorrencias, fracaoDePatinetesEmUso, VELOCIDADE_MS,
} from './eventos-simulados';
import { ingerirTelemetria } from './ingestao';
import { alvoPorId } from './motor-alertas';
import { andar, escolherAlvoPerto, pontoForaDeMarilia } from './movimento';

export const TIPOS_INJETAVEIS = ['furto', 'falha', 'acidente', 'alagamento', 'congestionamento'] as const;
export type TipoInjetavel = (typeof TIPOS_INJETAVEIS)[number];

const TICK_MS = 2000;
const SEGUNDOS_POR_TICK = TICK_MS / 1000;
/** Equipamento parado transmite a cada 15 ticks (30 s); móvel em movimento, a cada tick. */
const PERIODO_PARADO_TICKS = 15;
const VARREDURA_TICKS = 30;
const SITUACOES_TICKS = 5;
const RECARGA_TICKS = 120;
const MOVEIS: readonly TipoEquipamentoId[] = ['patinete', 'moto_agente', 'viatura', 'transporte', 'fiscal_rotativo'];
const CATEGORIAS_QUE_ATENDEM: Record<'acidente' | 'congestionamento', readonly CategoriaAgente[]> = {
  acidente: ['agente_transito', 'policial_militar'],
  congestionamento: ['agente_transito'],
};
const VELOCIDADES = [1, 10, 60] as const;

interface EqSim {
  id: number;
  codigo: string;
  tipo: TipoEquipamentoId;
  situacao: SituacaoEquipamento;
  bairroId: number;
  bairroIndice: number;
  escala: number;
  fatorRisco: number;
  turnos?: Turno[];
  categoria?: string;
  bairroQuente: boolean;
  movel: boolean;
  lat: number;
  lng: number;
  alvo?: Ponto | undefined;
  destino?: Ponto | undefined;
  viagem: number;
  emMovimento: boolean;
}

interface AgSim {
  id: number;
  categoria: CategoriaAgente;
  turno: Turno;
  situacao: SituacaoAgente;
  baseLat: number;
  baseLng: number;
  bairroIndice: number;
  equipamentoId?: number;
  lat: number;
  lng: number;
  alvo?: Ponto | undefined;
  destino?: Ponto | undefined;
}

interface OcorrenciaAberta {
  id: number;
  fimEm: number;
  agenteId?: number;
}

interface Reparo {
  equipamentoId: number;
  etapa: 'equipe' | 'conclusao';
  em: number;
}

export interface OpcoesSimulador {
  semente?: number;
}

export class Simulador {
  private readonly rng: Rng;
  private readonly semente: number;
  private velocidade: EstadoSimulacao['velocidade'] = 1;
  private pausado = false;
  private temporizador: NodeJS.Timeout | undefined;

  private tick = 0;
  private sincronizar = true;
  private ctxHoras: ContextoHoras | undefined;
  private equipamentos: EqSim[] = [];
  private agentes: AgSim[] = [];
  private readonly mudos = new Set<number>();
  private readonly abertas: OcorrenciaAberta[] = [];
  private reparos: Reparo[] = [];
  private horaLocalAnterior: number | undefined;

  constructor(private readonly ctx: ContextoApp, opcoes: OpcoesSimulador = {}) {
    this.semente = opcoes.semente ?? SEMENTE_PADRAO;
    this.rng = criarRng(this.semente);
  }

  // ---- Controle ----------------------------------------------------------------------------------------------

  iniciar(): void {
    if (this.temporizador) return;
    this.temporizador = setInterval(() => {
      try {
        this.passo();
      } catch (erro) {
        console.error('Simulador: erro no passo', erro);
      }
    }, TICK_MS);
    this.temporizador.unref?.();
  }

  parar(): void {
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = undefined;
  }

  estado(): EstadoSimulacao {
    return { velocidade: this.velocidade, pausado: this.pausado, relogio: this.ctx.relogio.agora().toISOString() };
  }

  definir(mudanca: { velocidade?: EstadoSimulacao['velocidade']; pausado?: boolean }): EstadoSimulacao {
    if (mudanca.velocidade !== undefined) {
      if (!VELOCIDADES.includes(mudanca.velocidade)) throw invalido('Velocidade inválida: use 1, 10 ou 60');
      this.velocidade = mudanca.velocidade;
    }
    if (mudanca.pausado !== undefined) {
      // Ao retomar, todo mundo transmite de uma vez: depois de uma pausa ninguém pode parecer "sem sinal".
      if (this.pausado && !mudanca.pausado) this.sincronizar = true;
      this.pausado = mudanca.pausado;
    }
    const estado = this.estado();
    this.ctx.barramento.emitir({ tipo: 'simulacao', dados: estado });
    return estado;
  }

  // ---- Um tick ------------------------------------------------------------------------------------------------

  /** Um tick da simulação (o temporizador chama a cada 2 s; os testes chamam direto). */
  passo(): void {
    if (this.pausado) return;
    const agora = this.ctx.relogio.agora();
    this.tick++;
    if (!this.ctxHoras || this.tick % RECARGA_TICKS === 0) this.carregar(agora);
    else if (this.tick % SITUACOES_TICKS === 0) this.atualizarSituacoes();

    const sincronizando = this.sincronizar;
    this.virarHora(agora);
    this.moverEquipamentos(agora);
    this.moverAgentes(agora);
    this.enviarLeituras(agora, sincronizando);
    this.sincronizar = false;
    this.sortearFalhasEFurtos(agora);
    this.gerarOcorrenciasAoVivo(agora);
    this.cumprirAgenda(agora);
    if (sincronizando || this.tick % VARREDURA_TICKS === 0) this.ctx.motor.varrer(agora);
    this.ctx.barramento.descarregarPosicoes();
  }

  // ---- Estado em memória ---------------------------------------------------------------------------------------

  private carregar(agora: Date): void {
    const { ctx: horas, equipamentos: fatos } = montarContexto(this.ctx.db, this.ctx.geo, this.semente, agora);
    this.ctxHoras = horas;
    const indicePorBairro = new Map(horas.bairros.map((b) => [b.id, b.indice]));
    const fatoPorId = new Map(fatos.map((f) => [f.id, f]));
    const antes = new Map(this.equipamentos.map((e) => [e.id, e]));
    const linhas = this.ctx.db.prepare(`SELECT e.id, e.codigo, e.tipo, e.situacao, e.bairro_id, e.lat_atual, e.lng_atual, b.nome AS bairro_nome
      FROM equipamentos e JOIN bairros b ON b.id = e.bairro_id ORDER BY e.id`).all() as {
      id: number; codigo: string; tipo: TipoEquipamentoId; situacao: SituacaoEquipamento; bairro_id: number; lat_atual: number; lng_atual: number; bairro_nome: string;
    }[];
    this.equipamentos = linhas.map((l) => {
      const f = fatoPorId.get(l.id);
      const ant = antes.get(l.id);
      return {
        id: l.id, codigo: l.codigo, tipo: l.tipo, situacao: l.situacao, bairroId: l.bairro_id, bairroIndice: indicePorBairro.get(l.bairro_id) ?? -1,
        escala: f?.escala ?? 1, fatorRisco: f?.fatorRisco ?? 1, ...(f?.turnos && { turnos: f.turnos }), ...(f?.categoria && { categoria: f.categoria }),
        bairroQuente: l.tipo === 'patinete' && BAIRROS_FURTO_PATINETE.includes(l.bairro_nome), movel: MOVEIS.includes(l.tipo),
        lat: ant?.lat ?? l.lat_atual, lng: ant?.lng ?? l.lng_atual, alvo: ant?.alvo, destino: ant?.destino, viagem: ant?.viagem ?? 0, emMovimento: ant?.emMovimento ?? false,
      };
    });

    const antesAg = new Map(this.agentes.map((a) => [a.id, a]));
    const ags = this.ctx.db.prepare(`SELECT a.id, a.categoria, a.turno, a.situacao, a.lat, a.lng, a.lat_atual, a.lng_atual, a.base_bairro_id, a.equipamento_id
      FROM agentes a ORDER BY a.id`).all() as {
      id: number; categoria: CategoriaAgente; turno: Turno; situacao: SituacaoAgente; lat: number; lng: number; lat_atual: number; lng_atual: number; base_bairro_id: number; equipamento_id: number | null;
    }[];
    this.agentes = ags.map((a) => {
      const ant = antesAg.get(a.id);
      return {
        id: a.id, categoria: a.categoria, turno: a.turno, situacao: a.situacao, baseLat: a.lat, baseLng: a.lng, bairroIndice: indicePorBairro.get(a.base_bairro_id) ?? -1,
        ...(a.equipamento_id !== null && { equipamentoId: a.equipamento_id }), lat: ant?.lat ?? a.lat_atual, lng: ant?.lng ?? a.lng_atual, alvo: ant?.alvo, destino: ant?.destino,
      };
    });
  }

  /** Pega do banco a situação atual (a tela pode ter mudado um equipamento ou agente enquanto o simulador roda). */
  private atualizarSituacoes(): void {
    const eq = new Map((this.ctx.db.prepare('SELECT id, situacao FROM equipamentos').all() as { id: number; situacao: SituacaoEquipamento }[]).map((l) => [l.id, l.situacao]));
    for (const e of this.equipamentos) e.situacao = eq.get(e.id) ?? e.situacao;
    const ag = new Map((this.ctx.db.prepare('SELECT id, situacao FROM agentes').all() as { id: number; situacao: SituacaoAgente }[]).map((l) => [l.id, l.situacao]));
    for (const a of this.agentes) a.situacao = ag.get(a.id) ?? a.situacao;
  }


  private garantirCarregado(agora: Date): void {
    if (!this.ctxHoras) this.carregar(agora);
  }

  // ---- Turnos, movimento e leituras ---------------------------------------------------------------------------

  /** Na virada da hora, quem começa o turno entra em serviço e quem termina sai (volta para a base). */
  private virarHora(agora: Date): void {
    const hora = partesLocais(agora).hora;
    const anterior = this.horaLocalAnterior;
    this.horaLocalAnterior = hora;
    if (anterior === undefined || anterior === hora) return;
    for (const a of this.agentes) {
      const h = HORARIO_TURNO[a.turno];
      if (h.inicio === hora && a.situacao === 'fora_de_servico') this.mudarSituacaoAgente(a, 'em_servico', agora);
      else if (h.fim === hora && (a.situacao === 'em_servico' || a.situacao === 'em_ocorrencia') && !turnoCobreHora(a.turno, hora)) {
        a.lat = a.baseLat;
        a.lng = a.baseLng;
        a.alvo = a.destino = undefined;
        this.ctx.db.prepare('UPDATE agentes SET lat_atual = ?, lng_atual = ? WHERE id = ?').run(a.lat, a.lng, a.id);
        this.mudarSituacaoAgente(a, 'fora_de_servico', agora);
        this.abertas.filter((o) => o.agenteId === a.id).forEach((o) => delete o.agenteId);
      }
    }
  }

  private moverEquipamentos(agora: Date): void {
    const p = partesLocais(agora);
    const mm = this.ctxHoras!.chuvaMm(p.data);
    for (const e of this.equipamentos) {
      if (!e.movel) continue;
      e.emMovimento = false;
      if (e.situacao !== 'operacional' || this.mudos.has(e.id) || e.bairroIndice < 0) continue;
      if (e.destino) {
        e.emMovimento = true;
      } else if (e.tipo === 'patinete') {
        if (e.viagem > 0) e.viagem--;
        else if (this.rng.chance(fracaoDePatinetesEmUso(tipoDoDia(p.diaSemana), p.hora, e.escala, mm > 0) / 55)) e.viagem = this.rng.int(20, 90);
        e.emMovimento = e.viagem > 0;
      } else {
        const atividade = atividadeVeiculo(e.tipo, agora, { ...(e.categoria && { categoria: e.categoria }), ...(e.turnos && { turnos: e.turnos }) });
        e.emMovimento = atividade >= 0.05 && this.rng.chance(Math.min(1, atividade + 0.1));
      }
      if (!e.emMovimento) continue;
      const metros = VELOCIDADE_MS[e.tipo === 'patinete' ? 'patinete' : 'veiculo'] * SEGUNDOS_POR_TICK * this.velocidade;
      this.andarOuChegar(e, metros, () => escolherAlvoPerto(this.ctx.geo, this.rng, e.bairroIndice, e));
    }
  }

  /** Com destino fixo (ocorrência) vai até lá e para; sem destino, vaga pelas ruas. */
  private andarOuChegar(m: { lat: number; lng: number; alvo?: Ponto | undefined; destino?: Ponto | undefined }, metros: number, vagar: () => Ponto): void {
    if (m.destino) {
      m.alvo = m.destino;
      andar(m, metros, () => m.destino!);
    } else {
      andar(m, metros, vagar);
    }
  }

  private moverAgentes(agora: Date): void {
    const iso = agora.toISOString();
    const veiculo = new Map(this.equipamentos.map((e) => [e.id, e]));
    const atualizar = this.ctx.db.prepare('UPDATE agentes SET lat_atual = ?, lng_atual = ?, ultimo_sinal_em = ? WHERE id = ?');
    for (const a of this.agentes) {
      if (a.situacao !== 'em_servico' && a.situacao !== 'em_ocorrencia') continue;
      const antes = { lat: a.lat, lng: a.lng };
      const v = a.equipamentoId !== undefined ? veiculo.get(a.equipamentoId) : undefined;
      if (v && v.movel && v.situacao === 'operacional') {
        a.lat = v.lat;
        a.lng = v.lng;
      } else if (a.bairroIndice >= 0) {
        const metros = VELOCIDADE_MS.agente * SEGUNDOS_POR_TICK * this.velocidade;
        this.andarOuChegar(a, metros, () => escolherAlvoPerto(this.ctx.geo, this.rng, a.bairroIndice, { lat: a.baseLat, lng: a.baseLng }, 500));
      }
      if (a.lat !== antes.lat || a.lng !== antes.lng) {
        atualizar.run(a.lat, a.lng, iso, a.id);
        this.ctx.barramento.registrarPosicao({ tipo: 'agente', id: a.id, lat: a.lat, lng: a.lng });
      }
    }
  }

  private lerEquipamento(e: EqSim, agora: Date): Record<string, number> {
    const mm = this.ctxHoras!.chuvaMm(partesLocais(agora).data);
    return gerarLeituraHora(e.tipo, agora, this.rng, {
      chuva: mm > 0, chuvaMm: mm, falhando: e.situacao === 'mau_funcionamento', bairroFator: e.escala,
      atividade: atividadeVeiculo(e.tipo, agora, { ...(e.categoria && { categoria: e.categoria }), ...(e.turnos && { turnos: e.turnos }) }),
    });
  }

  /** Manda uma leitura pelo MESMO caminho de um dispositivo real. Móveis levam a posição. */
  private enviar(e: EqSim, agora: Date, extra: { metricas?: Record<string, number>; posicao?: Ponto } = {}): Alerta[] {
    const posicao = extra.posicao ?? (e.movel ? { lat: e.lat, lng: e.lng } : undefined);
    return ingerirTelemetria(this.ctx, { codigo: e.codigo, em: agora.toISOString(), metricas: extra.metricas ?? this.lerEquipamento(e, agora), ...(posicao && posicao) }).alertas;
  }

  private enviarLeituras(agora: Date, todos: boolean): void {
    this.equipamentos.forEach((e, i) => {
      if (e.situacao !== 'operacional' && e.situacao !== 'mau_funcionamento') return;
      if (this.mudos.has(e.id)) return;
      if (todos || e.emMovimento || (this.tick + i) % PERIODO_PARADO_TICKS === 0) this.enviar(e, agora);
    });
  }

  // ---- Falhas, furtos e reparos --------------------------------------------------------------------------------

  private sortearFalhasEFurtos(agora: Date): void {
    for (const e of this.equipamentos) {
      if (e.situacao !== 'operacional') continue;
      if (this.rng.chance(chanceDeFalha(e.tipo, e.fatorRisco, SEGUNDOS_POR_TICK, this.velocidade))) {
        this.provocarFalha(e, agora);
      } else if (e.tipo === 'patinete' && this.rng.chance(chanceDeFurto(e.bairroQuente, SEGUNDOS_POR_TICK, this.velocidade))) {
        this.provocarFurto(e, agora, 'tempo_real');
      }
    }
  }

  private mudarSituacao(e: EqSim, para: SituacaoEquipamento, motivo: string, agora: Date): void {
    gravarSituacao(this.ctx.db, e.id, e.situacao, para, motivo, agora.toISOString());
    e.situacao = para;
    const mapa = equipamentoMapaPorId(this.ctx.db, e.id, dataLocal(agora));
    if (mapa) this.ctx.barramento.emitir({ tipo: 'equipamento', dados: mapa });
  }

  private mudarSituacaoAgente(a: AgSim, para: SituacaoAgente, agora: Date): void {
    gravarSituacaoAgente(this.ctx.db, a.id, para, agora.toISOString());
    a.situacao = para;
    const mapa = agenteMapaPorId(this.ctx.db, a.id);
    if (mapa) this.ctx.barramento.emitir({ tipo: 'agente', dados: mapa });
  }

  private provocarFalha(e: EqSim, agora: Date): Alerta[] {
    if (e.situacao !== 'operacional') return [];
    const sintoma = this.rng.escolher(FALHAS[e.tipo]).sintoma;
    this.mudarSituacao(e, 'mau_funcionamento', `Falha detectada pela telemetria: ${sintoma}`, agora);
    const mudo = this.rng.chance(CHANCE_FALHA_MUDA);
    if (mudo) this.mudos.add(e.id);
    const alertas: Alerta[] = [];
    const falha = this.ctx.motor.alertarFalha(alvoPorId(this.ctx.db, e.id)!, agora, sintoma);
    if (falha) alertas.push(falha);
    // Quem não ficou mudo continua transmitindo, agora com o sintoma da falha (a anomalia aparece sozinha).
    if (!mudo) alertas.push(...this.enviar(e, agora));
    this.reparos.push({ equipamentoId: e.id, etapa: 'equipe', em: agora.getTime() + (this.rng.int(120, 300) * 1000) / this.velocidade });
    return alertas;
  }

  private provocarFurto(e: EqSim, agora: Date, origem: Ocorrencia['origem']): Alerta[] {
    if (e.situacao !== 'operacional') return [];
    const alertas: Alerta[] = [];
    const local = { lat: e.lat, lng: e.lng };
    if (e.tipo === 'patinete') {
      // Levado para fora da cidade: a última leitura já chega de lá e o motor percebe pelo caminho normal.
      const fora = pontoForaDeMarilia(e, this.rng);
      alertas.push(...this.enviar(e, agora, { posicao: fora }));
      e.lat = fora.lat;
      e.lng = fora.lng;
    } else {
      const a = this.ctx.motor.alertarFurto(alvoPorId(this.ctx.db, e.id)!, agora, 'desaparecimento comunicado pela equipe de rua');
      if (a) alertas.push(a);
    }
    this.mudarSituacao(e, 'furtado', 'Furto suspeito detectado pela central', agora);
    e.emMovimento = false;
    e.destino = e.alvo = undefined;
    this.registrarOcorrencia(
      { tipo: 'furto_vandalismo', gravidade: 2, bairroId: e.bairroId, ...local, equipamentoId: e.id, descricao: `Furto de ${e.tipo === 'patinete' ? 'patinete' : 'equipamento'} ${e.codigo}`, origem },
      agora, { alertar: false },
    );
    return alertas;
  }

  private cumprirAgenda(agora: Date): void {
    const agoraMs = agora.getTime();
    // Ocorrências que terminaram: encerra e libera o agente.
    for (let i = this.abertas.length - 1; i >= 0; i--) {
      const o = this.abertas[i]!;
      if (o.fimEm > agoraMs) continue;
      this.abertas.splice(i, 1);
      const fechada = encerrarOcorrencia(this.ctx.db, o.id, agora.toISOString());
      if (fechada) this.ctx.barramento.emitir({ tipo: 'ocorrencia', dados: fechada });
      if (o.agenteId !== undefined) this.liberarAgente(o.agenteId, agora);
    }
    // Reparos: equipe a caminho, depois conclusão.
    const restantes: Reparo[] = [];
    for (const r of this.reparos) {
      if (r.em > agoraMs) { restantes.push(r); continue; }
      const e = this.equipamentos.find((x) => x.id === r.equipamentoId);
      if (!e || e.situacao !== (r.etapa === 'equipe' ? 'mau_funcionamento' : 'em_manutencao')) continue; // alguém mexeu pela tela: desiste
      if (r.etapa === 'equipe') {
        this.mudarSituacao(e, 'em_manutencao', 'Equipe de manutenção em atendimento', agora);
        restantes.push({ equipamentoId: e.id, etapa: 'conclusao', em: agoraMs + (this.rng.int(120, 360) * 1000) / this.velocidade });
      } else {
        const sintoma = this.rng.escolher(FALHAS[e.tipo]).acao;
        registrarManutencao(this.ctx, e.id, { tipo: 'corretiva', descricao: `Reparo concluído: ${sintoma}`, concluidaEm: agora.toISOString() });
        e.situacao = 'operacional';
        this.mudos.delete(e.id);
        this.ctx.motor.resolverDoEquipamento(e.id, agora);
        const mapa = equipamentoMapaPorId(this.ctx.db, e.id, dataLocal(agora));
        if (mapa) this.ctx.barramento.emitir({ tipo: 'equipamento', dados: mapa });
      }
    }
    this.reparos = restantes;
  }

  // ---- Ocorrências ----------------------------------------------------------------------------------------------

  private gerarOcorrenciasAoVivo(agora: Date): void {
    const escala = escalaDeOcorrencias(SEGUNDOS_POR_TICK, this.velocidade);
    const geradas = gerarOcorrenciasDaHora({ ...this.ctxHoras!, agora }, inicioDaHora(agora), [], { rng: this.rng, escala });
    for (const g of geradas) this.registrarOcorrenciaGerada(g, agora);
  }

  private registrarOcorrenciaGerada(g: OcorrenciaGerada, agora: Date): void {
    this.registrarOcorrencia(
      { tipo: g.tipo, gravidade: g.gravidade as 1 | 2 | 3 | 4, bairroId: g.bairroId, lat: g.lat, lng: g.lng, ...(g.equipamentoId !== null && { equipamentoId: g.equipamentoId }),
        descricao: g.descricao, chuva: g.chuva, origem: 'tempo_real' },
      agora, { alertar: true, agenteSugerido: g.agenteId ?? undefined },
    );
  }

  /**
   * Grava a ocorrência, avisa a tela, abre alerta (se o tipo pede e `alertar`) e manda um agente. O agente vem de
   * `agenteSugerido` (o gerador sorteia um de turno na região) ou, nas injetadas, é o mais próximo da categoria certa.
   */
  private registrarOcorrencia(
    o: { tipo: Ocorrencia['tipo']; gravidade: 1 | 2 | 3 | 4; bairroId: number; lat: number; lng: number; equipamentoId?: number; descricao: string; chuva?: boolean; origem: Ocorrencia['origem'] },
    agora: Date,
    opcoes: { alertar: boolean; agenteSugerido?: number | undefined; procurarAgente?: boolean },
  ): { ocorrencia: Ocorrencia; alerta: Alerta | null } {
    const agente = this.escolherAgente(o, opcoes);
    const mm = this.ctxHoras ? this.ctxHoras.chuvaMm(partesLocais(agora).data) : 0;
    const criada = inserirOcorrencia(this.ctx.db, {
      tipo: o.tipo, gravidade: o.gravidade, bairroId: o.bairroId, lat: o.lat, lng: o.lng, inicio: agora.toISOString(),
      ...(o.equipamentoId !== undefined && { equipamentoId: o.equipamentoId }), ...(agente && { agenteId: agente.id }),
      descricao: o.descricao, chuva: o.chuva ?? mm > 0, origem: o.origem,
    });
    this.ctx.barramento.emitir({ tipo: 'ocorrencia', dados: criada });
    const minutos = this.rng.int(10, 40);
    this.abertas.push({ id: criada.id, fimEm: agora.getTime() + duracaoDaOcorrenciaMs(o.tipo, minutos, this.velocidade), ...(agente && { agenteId: agente.id }) });
    if (agente) this.enviarAgente(agente, { lat: o.lat, lng: o.lng }, agora);
    const alerta = opcoes.alertar ? this.ctx.motor.alertarOcorrencia(criada, this.nomeDoBairro(o.bairroId), agora) : null;
    return { ocorrencia: criada, alerta };
  }

  private nomeDoBairro(id: number): string {
    return (this.ctx.db.prepare('SELECT nome FROM bairros WHERE id = ?').get(id) as { nome: string } | undefined)?.nome ?? 'bairro';
  }

  private escolherAgente(
    o: { tipo: Ocorrencia['tipo']; lat: number; lng: number },
    opcoes: { agenteSugerido?: number | undefined; procurarAgente?: boolean },
  ): AgSim | undefined {
    const livre = (a: AgSim) => a.situacao === 'em_servico' && !this.abertas.some((x) => x.agenteId === a.id);
    if (opcoes.agenteSugerido !== undefined) {
      const a = this.agentes.find((x) => x.id === opcoes.agenteSugerido);
      return a && livre(a) ? a : undefined;
    }
    if (!opcoes.procurarAgente || (o.tipo !== 'acidente' && o.tipo !== 'congestionamento')) return undefined;
    const aptos = this.agentes.filter((a) => livre(a) && CATEGORIAS_QUE_ATENDEM[o.tipo as 'acidente' | 'congestionamento'].includes(a.categoria));
    let melhor: AgSim | undefined;
    let menor = Infinity;
    for (const a of aptos) {
      const d = (a.lat - o.lat) ** 2 + (a.lng - o.lng) ** 2;
      if (d < menor) { menor = d; melhor = a; }
    }
    return melhor;
  }

  /** O agente (e o veículo dele) segue para o local da ocorrência. */
  private enviarAgente(a: AgSim, destino: Ponto, agora: Date): void {
    this.mudarSituacaoAgente(a, 'em_ocorrencia', agora);
    a.destino = destino;
    const v = a.equipamentoId !== undefined ? this.equipamentos.find((e) => e.id === a.equipamentoId) : undefined;
    if (v && v.movel) v.destino = destino;
  }

  private liberarAgente(id: number, agora: Date): void {
    const a = this.agentes.find((x) => x.id === id);
    if (!a || a.situacao !== 'em_ocorrencia') return;
    a.destino = a.alvo = undefined;
    const v = a.equipamentoId !== undefined ? this.equipamentos.find((e) => e.id === a.equipamentoId) : undefined;
    if (v) v.destino = v.alvo = undefined;
    this.mudarSituacaoAgente(a, 'em_servico', agora);
  }

  // ---- Injeção manual (botão "simular evento") ---------------------------------------------------------------------

  /**
   * Dispara um evento na hora e devolve os alertas que ele gerou. `alvoId` é o equipamento alvo (furto, falha, alagamento)
   * ou o equipamento de referência do local (acidente, congestionamento); sem ele, o simulador escolhe.
   */
  injetar(tipo: TipoInjetavel, alvoId?: number): Alerta[] {
    const agora = this.ctx.relogio.agora();
    this.garantirCarregado(agora);
    const alvo = alvoId === undefined ? undefined : this.equipamentos.find((e) => e.id === alvoId);
    if (alvoId !== undefined && !alvo) throw naoEncontrado('Equipamento');
    const sortear = (tipos: readonly TipoEquipamentoId[] | undefined) => {
      const lista = this.equipamentos.filter((e) => e.situacao === 'operacional' && (!tipos || tipos.includes(e.tipo)));
      return lista.length ? this.rng.escolher(lista) : undefined;
    };

    switch (tipo) {
      case 'furto': {
        const e = alvo ?? sortear(['patinete']);
        if (!e) throw conflito('Não há patinete operacional para simular o furto');
        if (e.situacao !== 'operacional') throw conflito(`${e.codigo} não está operacional; só equipamento em operação pode ser furtado`);
        return this.provocarFurto(e, agora, 'injetado');
      }
      case 'falha': {
        const e = alvo ?? sortear(undefined);
        if (!e) throw conflito('Não há equipamento operacional para falhar');
        return this.provocarFalha(e, agora);
      }
      case 'alagamento': {
        if (alvo && alvo.tipo !== 'sensor_alagamento') throw invalido('O alvo do alagamento precisa ser um sensor de alagamento');
        const sensor = alvo ?? sortear(['sensor_alagamento']);
        const alvoMotor = sensor ? alvoPorId(this.ctx.db, sensor.id) : undefined;
        const altura = Number(alvoMotor?.caracteristicas.alturaAlertaCm);
        const base = sensor ? { bairroId: sensor.bairroId, lat: sensor.lat, lng: sensor.lng, equipamentoId: sensor.id } : { ...this.pontoSorteado(), };
        const { alerta } = this.registrarOcorrencia(
          { tipo: 'alagamento', gravidade: 3, ...base, descricao: this.rng.escolher(DESCRICOES_INJETADAS.alagamento), origem: 'injetado' },
          agora, { alertar: !(sensor && sensor.situacao === 'operacional' && Number.isFinite(altura)) },
        );
        if (sensor && sensor.situacao === 'operacional' && Number.isFinite(altura)) {
          // A água sobe no sensor: a leitura vai pelo caminho normal e o motor decide o alerta.
          return this.enviar(sensor, agora, { metricas: { nivelCm: Math.round(altura * 1.4 * 10) / 10 } });
        }
        return alerta ? [alerta] : [];
      }
      case 'acidente':
      case 'congestionamento': {
        const ref = alvo;
        const base = ref ? { bairroId: ref.bairroId, lat: ref.lat, lng: ref.lng, equipamentoId: ref.id } : this.pontoSorteado();
        const gravidade = Number(this.rng.peso(tipo === 'acidente' ? { 2: 0.5, 3: 0.35, 4: 0.15 } : { 1: 0.3, 2: 0.5, 3: 0.2 })) as 1 | 2 | 3 | 4;
        const descricao = this.rng.escolher(DESCRICOES_INJETADAS[tipo]);
        const { alerta } = this.registrarOcorrencia(
          { tipo, gravidade, ...base, descricao: ref ? `${descricao} (próximo a ${ref.codigo})` : descricao, origem: 'injetado' },
          agora, { alertar: true, procurarAgente: true },
        );
        return alerta ? [alerta] : [];
      }
    }
  }

  /** Um ponto de rua em bairro sorteado, para eventos sem equipamento de referência. */
  private pontoSorteado(): { bairroId: number; lat: number; lng: number } {
    const bairro = this.rng.escolher(this.ctxHoras!.bairros);
    const p = this.ctx.geo.pontoAleatorioNaRua(this.rng, bairro.indice);
    return { bairroId: bairro.id, lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 };
  }
}
