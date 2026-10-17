// Regras de negócio do cadastro de equipamentos (as rotas só traduzem HTTP).
import { randomBytes } from 'node:crypto';
import type { SituacaoEquipamento } from '../../shared/dominio';
import type { Equipamento, EquipamentoDetalhe, PainelManutencao, PontoTelemetria } from '../../shared/modelos';
import type { EquipamentoInput, FiltrosEquipamento, ManutencaoInput, MudancaSituacao } from '../../shared/schemas';
import { tipoPorId } from '../../shared/tipos-equipamento';
import type { ContextoApp } from '../contexto';
import { conflito, dadosInvalidos, invalido, naoEncontrado } from '../erros';
import { alertasDoEquipamento } from '../repositorios/alertas';
import { bairroExiste } from '../repositorios/bairros';
import * as repo from '../repositorios/equipamentos';
import { inserirManutencao, manutencoesDoEquipamento } from '../repositorios/manutencoes';
import { dataLocal, somarDias } from '../tempo';

type Base = Pick<ContextoApp, 'db' | 'relogio'>;

const agoraIso = (ctx: Base) => ctx.relogio.agora().toISOString();

function exigirEquipamento(ctx: Base, id: number): Equipamento {
  const e = repo.equipamentoPorId(ctx.db, id);
  if (!e) throw naoEncontrado('Equipamento');
  return e;
}

function validarReferencias(ctx: Base, dados: EquipamentoInput, ignorarId?: number): void {
  if (!bairroExiste(ctx.db, dados.bairroId)) throw dadosInvalidos({ bairroId: 'Bairro não encontrado' });
  if (repo.numeroSerieEmUso(ctx.db, dados.numeroSerie, ignorarId)) {
    throw conflito('Já existe equipamento com este número de série');
  }
}

export function detalheDoEquipamento(ctx: Base, id: number): EquipamentoDetalhe {
  const e = exigirEquipamento(ctx, id);
  return {
    ...e,
    historico: repo.historicoDoEquipamento(ctx.db, id),
    manutencoes: manutencoesDoEquipamento(ctx.db, id),
    alertas: alertasDoEquipamento(ctx.db, id),
  };
}

export function listar(ctx: Base, filtros: FiltrosEquipamento) {
  return repo.listarEquipamentos(ctx.db, filtros, dataLocal(ctx.relogio.agora()));
}

export function painel(ctx: Base): PainelManutencao {
  return repo.painelManutencao(ctx.db, dataLocal(ctx.relogio.agora()));
}

export function telemetria(ctx: Base, id: number, horas: number): PontoTelemetria[] {
  exigirEquipamento(ctx, id);
  const desde = new Date(ctx.relogio.agora().getTime() - horas * 3_600_000).toISOString();
  return repo.telemetriaDoEquipamento(ctx.db, id, desde);
}

export function criarEquipamento(ctx: Base, dados: EquipamentoInput): EquipamentoDetalhe {
  validarReferencias(ctx, dados);
  const agora = agoraIso(ctx);
  const id = ctx.db.transaction(() => {
    const sequencial = repo.proximoSequencial(ctx.db, tipoPorId(dados.tipo).sigla);
    const codigo = `FOGO-${tipoPorId(dados.tipo).sigla}-${String(sequencial).padStart(4, '0')}`;
    return repo.inserirEquipamento(ctx.db, dados, { codigo, token: randomBytes(16).toString('hex'), agora });
  })();
  return detalheDoEquipamento(ctx, id);
}

/**
 * Edição pelo formulário. Preserva o que pertence à telemetria e ao fluxo de situação
 * (posição atual, último sinal, situação, código, token): ver `repo.atualizarEquipamento`.
 */
export function atualizarEquipamento(ctx: Base, id: number, dados: EquipamentoInput): EquipamentoDetalhe {
  exigirEquipamento(ctx, id);
  validarReferencias(ctx, dados, id);
  repo.atualizarEquipamento(ctx.db, id, dados, agoraIso(ctx));
  return detalheDoEquipamento(ctx, id);
}

export function mudarSituacao(ctx: Base, id: number, m: MudancaSituacao): EquipamentoDetalhe {
  const atual = exigirEquipamento(ctx, id);
  if (m.situacao === atual.situacao) throw invalido('O equipamento já está nesta situação');
  if (atual.situacao === 'furtado' && m.situacao === 'operacional' && m.recuperado !== true) {
    throw invalido('Registre a recuperação do equipamento antes de voltar a operar');
  }
  repo.gravarSituacao(ctx.db, id, atual.situacao, m.situacao, m.motivo, agoraIso(ctx));
  return detalheDoEquipamento(ctx, id);
}

export function excluirEquipamento(ctx: Base, id: number): void {
  exigirEquipamento(ctx, id);
  if (repo.contarVinculos(ctx.db, id) > 0) {
    throw conflito("Este equipamento tem histórico. Use a situação 'Desativado' em vez de excluir.");
  }
  repo.removerEquipamento(ctx.db, id);
}

const VOLTAM_A_OPERAR: SituacaoEquipamento[] = ['em_manutencao', 'mau_funcionamento'];

export function registrarManutencao(ctx: Base, id: number, m: ManutencaoInput): EquipamentoDetalhe {
  const eq = exigirEquipamento(ctx, id);
  const agora = agoraIso(ctx);
  ctx.db.transaction(() => {
    if (m.concluidaEm) {
      const concluida = new Date(m.concluidaEm);
      if (concluida.getTime() > ctx.relogio.agora().getTime() + 5 * 60_000) {
        throw dadosInvalidos({ concluidaEm: 'A data de conclusão não pode estar no futuro' });
      }
      const concluidaEm = concluida.toISOString();
      const dia = dataLocal(concluida);
      inserirManutencao(ctx.db, { equipamentoId: id, tipo: m.tipo, abertaEm: agora, previstaPara: m.previstaPara, concluidaEm, descricao: m.descricao });
      const periodica = eq.manutencaoNecessidade === 'periodica' && eq.manutencaoPeriodicidadeDias !== undefined;
      repo.gravarManutencaoDoEquipamento(
        ctx.db,
        id,
        periodica
          ? { necessidade: 'periodica', ultima: dia, proxima: somarDias(dia, eq.manutencaoPeriodicidadeDias!) }
          : { necessidade: 'nenhuma', ultima: dia, proxima: null },
        agora,
      );
      if (VOLTAM_A_OPERAR.includes(eq.situacao)) {
        repo.gravarSituacao(ctx.db, id, eq.situacao, 'operacional', 'Manutenção concluída', agora);
      }
    } else {
      const prevista = m.previstaPara!.slice(0, 10);
      inserirManutencao(ctx.db, { equipamentoId: id, tipo: m.tipo, abertaEm: agora, previstaPara: prevista, descricao: m.descricao });
      repo.gravarManutencaoDoEquipamento(
        ctx.db,
        id,
        { necessidade: eq.manutencaoNecessidade === 'periodica' ? 'periodica' : 'agendada', proxima: prevista },
        agora,
      );
    }
  })();
  return detalheDoEquipamento(ctx, id);
}
