// Regras de negócio do cadastro de agentes.
import type { SituacaoAgente } from '../../shared/dominio';
import type { Agente, AgenteDetalhe } from '../../shared/modelos';
import type { AgenteInput, FiltrosAgente } from '../../shared/schemas';
import type { ContextoApp } from '../contexto';
import { motivoVeiculoIncompativel, TIPOS_VEICULO_DE_AGENTE } from '../../shared/tipos-equipamento';
import { conflito, dadosInvalidos, invalido, naoEncontrado } from '../erros';
import * as repo from '../repositorios/agentes';
import { bairroExiste, conferirPontoNoBairro } from '../repositorios/bairros';
import { equipamentoPorId } from '../repositorios/equipamentos';
import { ocorrenciasDoAgente } from '../repositorios/ocorrencias';

type Base = Pick<ContextoApp, 'db' | 'relogio' | 'geo'> & Partial<Pick<ContextoApp, 'simulador'>>;

const agoraIso = (ctx: Base) => ctx.relogio.agora().toISOString();

function exigirAgente(ctx: Base, id: number): Agente {
  const a = repo.agentePorId(ctx.db, id);
  if (!a) throw naoEncontrado('Agente');
  return a;
}

function validarReferencias(ctx: Base, dados: AgenteInput, ignorarId?: number): void {
  const campos: Record<string, string> = {};
  if (!bairroExiste(ctx.db, dados.baseBairroId)) campos.baseBairroId = 'Bairro não encontrado';
  if (dados.equipamentoId !== undefined) {
    const veiculo = equipamentoPorId(ctx.db, dados.equipamentoId);
    if (!veiculo) campos.equipamentoId = 'Equipamento não encontrado';
    else if (!TIPOS_VEICULO_DE_AGENTE.includes(veiculo.tipo)) campos.equipamentoId = 'Só uma moto de agente ou uma viatura pode ser vinculada a um agente';
    else if (motivoVeiculoIncompativel(dados, veiculo)) campos.equipamentoId = motivoVeiculoIncompativel(dados, veiculo)!;
    else {
      const dono = repo.agenteDoEquipamento(ctx.db, veiculo.id, ignorarId);
      if (dono) campos.equipamentoId = `Este veículo já está vinculado a ${dono.nome}`;
    }
  }
  if (Object.keys(campos).length) throw dadosInvalidos(campos);
  // Mesma regra do equipamento: o ponto da base precisa cair no bairro escolhido.
  const foraDoBairro = conferirPontoNoBairro(ctx.db, ctx.geo, dados.baseBairroId, dados.lat, dados.lng);
  if (foraDoBairro) throw invalido(foraDoBairro, { baseBairroId: foraDoBairro });
  if (repo.matriculaEmUso(ctx.db, dados.matricula, ignorarId)) throw conflito('Já existe agente com esta matrícula');
}

export const listar = (ctx: Base, filtros: FiltrosAgente) => repo.listarAgentes(ctx.db, filtros);

export function detalheDoAgente(ctx: Base, id: number): AgenteDetalhe {
  return { ...exigirAgente(ctx, id), ocorrencias: ocorrenciasDoAgente(ctx.db, id, 20) };
}

// Toda mudança de cadastro avisa o simulador (`recarregar`): ele relê os agentes antes de designar o próximo.

export function criarAgente(ctx: Base, dados: AgenteInput): AgenteDetalhe {
  validarReferencias(ctx, dados);
  const id = repo.inserirAgente(ctx.db, dados, agoraIso(ctx));
  ctx.simulador?.recarregar();
  return detalheDoAgente(ctx, id);
}

export function atualizarAgente(ctx: Base, id: number, dados: AgenteInput): AgenteDetalhe {
  exigirAgente(ctx, id);
  validarReferencias(ctx, dados, id);
  repo.atualizarAgente(ctx.db, id, dados, agoraIso(ctx));
  ctx.simulador?.recarregar();
  return detalheDoAgente(ctx, id);
}

export function mudarSituacaoAgente(ctx: Base, id: number, situacao: SituacaoAgente): AgenteDetalhe {
  exigirAgente(ctx, id);
  repo.gravarSituacaoAgente(ctx.db, id, situacao, agoraIso(ctx));
  ctx.simulador?.recarregar();
  return detalheDoAgente(ctx, id);
}

export function excluirAgente(ctx: Base, id: number): void {
  exigirAgente(ctx, id);
  const v = repo.vinculosDoAgente(ctx.db, id);
  const textos = [
    v.ocorrencias > 0 && `${v.ocorrencias} ${v.ocorrencias === 1 ? 'ocorrência' : 'ocorrências'}`,
    v.alertas > 0 && `${v.alertas} ${v.alertas === 1 ? 'alerta' : 'alertas'}`,
  ].filter(Boolean);
  if (textos.length) throw conflito(`Este agente tem ${textos.join(' e ')}. Use a situação 'Fora de serviço' em vez de excluir.`);
  repo.removerAgente(ctx.db, id);
  ctx.simulador?.recarregar(); // sai da memória do simulador antes da próxima designação
}
