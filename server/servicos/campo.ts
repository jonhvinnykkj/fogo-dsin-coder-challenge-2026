// Regras do Modo Campo: o agente vê o próprio despacho, registra chegada e conclusão, vê os equipamentos perto dele e
// relata problemas. O relato passa pelo mesmo caminho da tela do gestor (mudarSituacao + motor de alertas).
import {
  SITUACAO_DO_PROBLEMA, type Despacho, type EquipamentoProximo, type ReporteCampo, type ResultadoReporte,
} from '../../shared/campo';
import { distanciaMetros, type Ponto } from '../../shared/geo';
import type { Agente, Ocorrencia } from '../../shared/modelos';
import type { ContextoApp } from '../contexto';
import { conflito, invalido, naoEncontrado } from '../erros';
import type { GeoMarilia } from '../geo/marilia';
import { agenteMapaPorId, agentePorId, gravarSituacaoAgente } from '../repositorios/agentes';
import * as repo from '../repositorios/campo';
import { equipamentoPorId } from '../repositorios/equipamentos';
import { encerrarOcorrencia, ocorrenciaPorId } from '../repositorios/ocorrencias';
import { alvoPorId } from '../tempo-real/motor-alertas';
import { mudarSituacao } from './equipamentos';

/** Mais longe que isso da rua mais próxima, o local não ganha nome de rua. */
const RUA_ATE_METROS = 300;

function exigirAgente(ctx: ContextoApp, id: number): Agente {
  const a = agentePorId(ctx.db, id);
  if (!a) throw naoEncontrado('Agente');
  return a;
}

/** Ocorrência aberta para a qual ESTE agente foi despachado; qualquer outra coisa é 404. */
function exigirDespacho(ctx: ContextoApp, agenteId: number, ocorrenciaId: number): Ocorrencia {
  exigirAgente(ctx, agenteId);
  const o = ocorrenciaPorId(ctx.db, ocorrenciaId);
  if (!o || o.agenteId !== agenteId || o.fim !== undefined) throw naoEncontrado('Despacho');
  return o;
}

const posicaoDoAgente = (a: Agente): Ponto => ({ lat: a.latAtual, lng: a.lngAtual });

/** Nome da rua com o ponto mais próximo do local (as ruas reais de Marília, do OpenStreetMap). */
export function ruaMaisProxima(geo: GeoMarilia, local: Ponto): string | null {
  let melhor: string | null = null;
  let menor = RUA_ATE_METROS;
  for (const rua of geo.ruas) {
    for (const [lat, lng] of rua.pontos) {
      const d = distanciaMetros(local, { lat, lng });
      if (d < menor) {
        menor = d;
        melhor = rua.nome;
      }
    }
  }
  return melhor;
}

function montarDespacho(ctx: ContextoApp, agente: Agente, o: Ocorrencia): Despacho {
  const bairro = ctx.db.prepare('SELECT nome FROM bairros WHERE id = ?').get(o.bairroId) as { nome: string } | undefined;
  const chegouEm = repo.chegadaDaOcorrencia(ctx.db, o.id);
  return {
    ocorrencia: o,
    bairroNome: bairro?.nome ?? '',
    logradouro: ruaMaisProxima(ctx.geo, o),
    distanciaMetros: Math.round(distanciaMetros(posicaoDoAgente(agente), o)),
    ...(chegouEm && { chegouEm }),
  };
}

export function despachoDoAgente(ctx: ContextoApp, agenteId: number): Despacho | null {
  const agente = exigirAgente(ctx, agenteId);
  const o = repo.despachoAbertoDoAgente(ctx.db, agenteId);
  return o ? montarDespacho(ctx, agente, o) : null;
}

export function registrarChegadaAoLocal(ctx: ContextoApp, agenteId: number, ocorrenciaId: number): Despacho {
  const o = exigirDespacho(ctx, agenteId, ocorrenciaId);
  if (repo.chegadaDaOcorrencia(ctx.db, o.id)) throw conflito('A chegada a este local já foi registrada');
  repo.registrarChegada(ctx.db, o.id, agenteId, ctx.relogio.agora().toISOString());
  return montarDespacho(ctx, exigirAgente(ctx, agenteId), o);
}

/**
 * O agente encerra a ocorrência: grava o fim, devolve o agente ao serviço e fecha o alerta dela como resolução manual
 * (foi uma pessoa). O simulador esquece a ocorrência na hora, senão manteria o agente preso ao local até o fim que sorteou.
 */
export function concluirDespacho(ctx: ContextoApp, agenteId: number, ocorrenciaId: number): Ocorrencia {
  const o = exigirDespacho(ctx, agenteId, ocorrenciaId);
  if (!repo.chegadaDaOcorrencia(ctx.db, o.id)) throw invalido('Registre a chegada ao local antes de concluir');
  const agora = ctx.relogio.agora();
  const iso = agora.toISOString();
  let fechada: Ocorrencia | undefined;
  ctx.db.transaction(() => {
    fechada = encerrarOcorrencia(ctx.db, o.id, iso);
    gravarSituacaoAgente(ctx.db, agenteId, 'em_servico', iso);
  })();
  ctx.simulador?.esquecerOcorrencia(o.id);
  ctx.simulador?.recarregar();
  ctx.barramento.emitir({ tipo: 'ocorrencia', dados: fechada! });
  ctx.motor.resolverPorChave(`ocorrencia:${o.id}`, agora, 'manual');
  const mapa = agenteMapaPorId(ctx.db, agenteId);
  if (mapa) ctx.barramento.emitir({ tipo: 'agente', dados: mapa });
  return fechada!;
}

function paraProximo(l: repo.LinhaEquipamentoNaRua, de: Ponto): EquipamentoProximo {
  return {
    id: l.id, codigo: l.codigo, tipo: l.tipo, situacao: l.situacao, logradouro: l.logradouro, referencia: l.referencia, bairroNome: l.bairro_nome,
    lat: l.lat_atual, lng: l.lng_atual, distanciaMetros: Math.round(distanciaMetros(de, { lat: l.lat_atual, lng: l.lng_atual })),
  };
}

/**
 * Os `limite` equipamentos na rua mais próximos da posição atual do agente (a dos móveis vem da telemetria).
 * O veículo vinculado ao próprio agente fica de fora: ele anda junto (0 m) e não é "perto de mim", é a condução dele.
 */
export function equipamentosProximos(ctx: ContextoApp, agenteId: number, limite: number): EquipamentoProximo[] {
  const agente = exigirAgente(ctx, agenteId);
  const de = posicaoDoAgente(agente);
  return repo.equipamentosNaRua(ctx.db)
    .filter((l) => l.id !== agente.equipamentoId)
    .map((l) => paraProximo(l, de))
    .sort((a, b) => a.distanciaMetros - b.distanciaMetros || a.id - b.id)
    .slice(0, limite);
}

/**
 * Relato do agente na rua. A situação muda pelo mesmo serviço da tela do gestor (histórico com quem relatou) e o alerta
 * sai do motor (falha ou furto), que não duplica um alerta igual ainda aberto.
 */
export function reportarProblema(ctx: ContextoApp, agenteId: number, r: ReporteCampo): ResultadoReporte {
  const agente = exigirAgente(ctx, agenteId);
  const eq = equipamentoPorId(ctx.db, r.equipamentoId);
  if (!eq) throw naoEncontrado('Equipamento');
  if (eq.situacao === 'desativado' || eq.situacao === 'nao_instalado') throw invalido('Este equipamento não está em operação na rua');
  if (eq.situacao === 'furtado' && r.problema !== 'furtado') {
    throw invalido('Este equipamento consta como furtado. Se ele foi encontrado, registre a recuperação na ficha do equipamento');
  }

  const quem = `${agente.nome} (${agente.matricula})`;
  const observacao = r.observacao.replace(/[.\s]+$/, '');
  const detalhe = `relatado em campo por ${quem}${observacao ? `: ${observacao}` : ''}`;
  const situacao = SITUACAO_DO_PROBLEMA[r.problema];
  if (eq.situacao !== situacao) {
    const motivo = { mau_funcionamento: 'Mau funcionamento', furtado: 'Furto', vandalizado: 'Vandalismo' }[r.problema];
    mudarSituacao(ctx, eq.id, { situacao, motivo: `${motivo} ${detalhe}` });
  }

  const agora = ctx.relogio.agora();
  const alvo = alvoPorId(ctx.db, eq.id)!;
  const alerta = r.problema === 'furtado'
    ? ctx.motor.alertarFurto(alvo, agora, detalhe)
    : ctx.motor.alertarFalha(alvo, agora, r.problema === 'vandalizado' ? `vandalismo ${detalhe}` : detalhe);

  return { equipamento: paraProximo(repo.equipamentoNaRuaPorId(ctx.db, eq.id)!, posicaoDoAgente(agente)), alerta };
}
