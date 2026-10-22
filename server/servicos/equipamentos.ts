// Regras de negócio do cadastro de equipamentos (as rotas só traduzem HTTP).
import { gerarTokenDispositivo, hashTokenDispositivo } from '../seguranca/cripto';
import { SITUACOES_INICIAIS, ROTULO_SITUACAO, type SituacaoEquipamento } from '../../shared/dominio';
import type { Equipamento, EquipamentoCriado, EquipamentoDetalhe, PainelManutencao, PontoTelemetria } from '../../shared/modelos';
import type { EquipamentoEdicao, EquipamentoInput, FiltrosEquipamento, ManutencaoInput, MudancaSituacao } from '../../shared/schemas';
import { tipoPorId } from '../../shared/tipos-equipamento';
import type { ContextoApp } from '../contexto';
import { conflito, dadosInvalidos, invalido, naoEncontrado } from '../erros';
import { alertasDoEquipamento } from '../repositorios/alertas';
import { bairroExiste, conferirPontoNoBairro } from '../repositorios/bairros';
import * as repo from '../repositorios/equipamentos';
import { concluirManutencao, inserirManutencao, manutencoesDoEquipamento, previstaEmAberto } from '../repositorios/manutencoes';
import { dataLocal, somarDias } from '../tempo';

type Base = Pick<ContextoApp, 'db' | 'relogio' | 'geo'> & Partial<Pick<ContextoApp, 'motor' | 'simulador' | 'barramento'>>;

const agoraIso = (ctx: Base) => ctx.relogio.agora().toISOString();

function exigirEquipamento(ctx: Base, id: number): Equipamento {
  const e = repo.equipamentoPorId(ctx.db, id);
  if (!e) throw naoEncontrado('Equipamento');
  return e;
}

function validarReferencias(ctx: Base, dados: Pick<EquipamentoInput, 'bairroId' | 'numeroSerie' | 'lat' | 'lng'>, ignorarId?: number): void {
  if (!bairroExiste(ctx.db, dados.bairroId)) throw dadosInvalidos({ bairroId: 'Bairro não encontrado' });
  // O bairro escolhido precisa conter o ponto: senão a ficha diz uma região e o marcador aparece em outra.
  const foraDoBairro = conferirPontoNoBairro(ctx.db, ctx.geo, dados.bairroId, dados.lat, dados.lng);
  if (foraDoBairro) throw invalido(foraDoBairro, { bairroId: foraDoBairro });
  if (repo.numeroSerieEmUso(ctx.db, dados.numeroSerie, ignorarId)) {
    throw conflito('Já existe equipamento com este número de série');
  }
}

/**
 * Datas contra o relógio do contexto (a simulação pode acelerar o tempo, então nada de `new Date()` solto):
 * instalar no futuro e "última manutenção" no futuro não existem. (Próxima antes da última é regra do schema.)
 */
function validarDatas(ctx: Base, dados: Pick<EquipamentoInput, 'instaladoEm' | 'ultimaManutencao'>): void {
  const hoje = dataLocal(ctx.relogio.agora());
  const campos: Record<string, string> = {};
  if (dados.instaladoEm && dados.instaladoEm.slice(0, 10) > hoje) campos.instaladoEm = 'A data de instalação não pode estar no futuro';
  if (dados.ultimaManutencao && dados.ultimaManutencao.slice(0, 10) > hoje) campos.ultimaManutencao = 'A última manutenção não pode estar no futuro';
  if (Object.keys(campos).length) throw dadosInvalidos(campos);
}

/** "2026-05-03" -> "03/05/2026" (texto de mensagem; `formatarData` pegaria o dia anterior por causa do fuso). */
const paraDiaBr = (dia: string) => dia.split('-').reverse().join('/');

/** "2 alertas e 1 manutenção" / "1 ocorrência, 2 alertas e 3 mudanças de situação". */
function descreverVinculos(v: repo.VinculosDoEquipamento): string {
  const partes: [number, string, string][] = [
    [v.alertas, 'alerta', 'alertas'],
    [v.ocorrencias, 'ocorrência', 'ocorrências'],
    [v.manutencoes, 'manutenção', 'manutenções'],
    [v.mudancasDeSituacao, 'mudança de situação', 'mudanças de situação'],
    [v.agentes, 'agente vinculado', 'agentes vinculados'],
  ];
  const textos = partes.filter(([n]) => n > 0).map(([n, um, varios]) => `${n} ${n === 1 ? um : varios}`);
  return textos.length > 1 ? `${textos.slice(0, -1).join(', ')} e ${textos[textos.length - 1]}` : (textos[0] ?? '');
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

/** Cadastra e devolve a ficha com o token do dispositivo (única vez em que ele existe em claro: no banco fica o hash). */
export function criarEquipamento(ctx: Base, dados: EquipamentoInput): EquipamentoCriado {
  if (!(SITUACOES_INICIAIS as readonly SituacaoEquipamento[]).includes(dados.situacao)) {
    const mensagem = `Situação inicial: escolha ${SITUACOES_INICIAIS.map((x) => ROTULO_SITUACAO[x]).join(', ')}. Furtado e desativado só depois, pela ficha, com motivo`;
    throw invalido(mensagem, { situacao: mensagem });
  }
  validarDatas(ctx, dados);
  validarReferencias(ctx, dados);
  const agora = agoraIso(ctx);
  const tokenDispositivo = gerarTokenDispositivo();
  const id = ctx.db.transaction(() => {
    const sequencial = repo.proximoSequencial(ctx.db, tipoPorId(dados.tipo).sigla);
    const codigo = `FOGO-${tipoPorId(dados.tipo).sigla}-${String(sequencial).padStart(4, '0')}`;
    return repo.inserirEquipamento(ctx.db, dados, { codigo, token: hashTokenDispositivo(tokenDispositivo), agora });
  })();
  ctx.simulador?.recarregar(); // já pode receber "Simular falha"
  return { ...detalheDoEquipamento(ctx, id), tokenDispositivo };
}

/**
 * Edição pelo formulário. Preserva o que pertence à telemetria e ao fluxo de situação
 * (posição atual, último sinal, situação, código, token) e, se o grupo de manutenção não veio, as datas de manutenção:
 * ver `repo.atualizarEquipamento`.
 */
export function atualizarEquipamento(ctx: Base, id: number, dados: EquipamentoEdicao): EquipamentoDetalhe {
  const atual = exigirEquipamento(ctx, id);
  // O código FOGO-<SIGLA>-nnnn nasce do tipo: trocá-lo deixaria o código mentindo.
  if (dados.tipo !== atual.tipo) {
    const mensagem = 'O tipo do equipamento não pode ser alterado';
    throw invalido(mensagem, { tipo: mensagem });
  }
  validarDatas(ctx, dados);
  validarReferencias(ctx, dados, id);
  repo.atualizarEquipamento(ctx.db, id, dados, agoraIso(ctx));
  ctx.simulador?.recarregar(); // bairro e ponto-base podem ter mudado
  return detalheDoEquipamento(ctx, id);
}

/**
 * Mudança de situação pela tela (com motivo, vai para o histórico). Além de gravar:
 * - saindo de "furtado" (recuperado ou dado como perdido): a posição atual volta ao ponto cadastrado e o alerta de furto
 *   fecha (resolução manual: foi uma pessoa que registrou);
 * - voltando a "operacional": fecham os alertas da falha (sem sinal, leitura fora do normal, falha);
 * - o simulador relê o equipamento (posição e situação do banco) e, se ele estava calado por uma falha, volta a transmitir.
 */
export function mudarSituacao(ctx: Base, id: number, m: MudancaSituacao): EquipamentoDetalhe {
  const atual = exigirEquipamento(ctx, id);
  if (m.situacao === atual.situacao) throw invalido('O equipamento já está nesta situação');
  // Furtado só sai de lá para qualquer situação "com o órgão" (operacional, em manutenção, não instalado...) se a recuperação
  // foi registrada: senão "Em manutenção" seria um atalho para ressuscitar o equipamento sem ele ter voltado. A única saída
  // sem recuperação é "desativado": é dar o equipamento como perdido (baixa), e ele continua fora de operação.
  if (atual.situacao === 'furtado' && m.situacao !== 'desativado' && m.recuperado !== true) {
    throw invalido('Registre a recuperação do equipamento antes de tirá-lo de "Furtado" (ou desative-o, se foi dado como perdido)');
  }
  const agora = ctx.relogio.agora();
  const saiDoFurto = atual.situacao === 'furtado';
  ctx.db.transaction(() => {
    repo.gravarSituacao(ctx.db, id, atual.situacao, m.situacao, m.motivo, agora.toISOString());
    if (saiDoFurto) repo.voltarParaBase(ctx.db, id);
  })();
  if (saiDoFurto) ctx.motor?.resolverPorChave(`furto:${id}`, agora, 'manual');
  if (m.situacao === 'operacional') ctx.motor?.resolverDoEquipamento(id, agora);
  else ctx.motor?.equipamentoSaiuDeOperacao(id, agora); // fora de operação, "prestes a falhar" deixa de valer na hora
  ctx.simulador?.recarregar();
  const mapa = repo.equipamentoMapaPorId(ctx.db, id, dataLocal(agora));
  if (mapa) ctx.barramento?.emitir({ tipo: 'equipamento', dados: mapa });
  return detalheDoEquipamento(ctx, id);
}

export function excluirEquipamento(ctx: Base, id: number): void {
  exigirEquipamento(ctx, id);
  const vinculos = descreverVinculos(repo.vinculosDoEquipamento(ctx.db, id));
  if (vinculos) throw conflito(`Este equipamento tem ${vinculos}. Use a situação 'Desativado' em vez de excluir.`);
  repo.removerEquipamento(ctx.db, id);
  ctx.simulador?.recarregar(); // sai da memória do simulador antes do próximo uso
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
      // Uma manutenção só vale depois de o equipamento existir e não pode voltar no tempo: `ultima_manutencao` é sobrescrita pela data nova.
      const instalado = eq.instaladoEm?.slice(0, 10);
      if (instalado && dia < instalado) throw dadosInvalidos({ concluidaEm: `A conclusão não pode ser anterior à instalação (${paraDiaBr(instalado)})` });
      const ultima = eq.ultimaManutencao?.slice(0, 10);
      if (ultima && dia < ultima) throw dadosInvalidos({ concluidaEm: `Já há manutenção concluída em ${paraDiaBr(ultima)}: a conclusão não pode ser anterior a ela` });
      // Havia uma do mesmo tipo prevista: é ela que foi feita (não fica "Prevista para…" para sempre ao lado da concluída).
      const prevista = previstaEmAberto(ctx.db, id, m.tipo);
      if (prevista !== undefined) concluirManutencao(ctx.db, prevista, concluidaEm, m.descricao);
      else inserirManutencao(ctx.db, { equipamentoId: id, tipo: m.tipo, abertaEm: agora, previstaPara: m.previstaPara, concluidaEm, descricao: m.descricao });
      // A falha pôs a necessidade em "imediata" sem apagar a periodicidade: depois do reparo a rotina periódica continua.
      const periodica = (eq.manutencaoNecessidade === 'periodica' || eq.manutencaoNecessidade === 'imediata') && eq.manutencaoPeriodicidadeDias !== undefined;
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
      // Uma prevista em aberto do mesmo tipo basta: a segunda vira 409 (a interface mostra a mensagem).
      if (previstaEmAberto(ctx.db, id, m.tipo) !== undefined) throw conflito('Já existe uma manutenção prevista para este equipamento');
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
  // Manutenção concluída fecha o alerta de manutenção atrasada e, se o equipamento voltou a operar, os de falha.
  if (m.concluidaEm) ctx.motor?.resolverPorManutencao(id, VOLTAM_A_OPERAR.includes(eq.situacao), ctx.relogio.agora());
  return detalheDoEquipamento(ctx, id);
}
