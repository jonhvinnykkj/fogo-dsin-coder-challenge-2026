// Semente do banco: cidade sintética + 60 dias de histórico (semear) e completar o histórico até "agora"
// quando o servidor fica desligado por um tempo (preencherLacuna). Inserção em massa numa transação única,
// com statements preparados próprios (os repositórios do cadastro gravam item a item e seriam lentos aqui).
import type { Database, Statement } from 'better-sqlite3';
import { turnoCobreHora, type CategoriaAgente, type Regiao, type SituacaoEquipamento, type Turno } from '../../shared/dominio';
import { distanciaMetros } from '../../shared/geo';
import type { TipoEquipamentoId } from '../../shared/tipos-equipamento';
import type { GeoMarilia } from '../geo/marilia';
import { contarBairros, inserirBairros } from '../repositorios/bairros';
import { dataLocal, inicioDaHora, partesLocais, somarDias } from '../tempo';
import { criarRng, derivarSemente } from './aleatorio';
import { confiabilidadeDoModelo } from './catalogo-marcas';
import { BAIRROS_FURTO_PATINETE, bairrosAlagaveis, fimDoUltimoTurno, gerarCidade, pesoOcorrenciaBairros } from './cidade';
import {
  chuvaDoDia, construirLinhaDoTempo, DIAS_HISTORICO, DIAS_PREVISAO, ESTADO, fatorRiscoEquipamento, gerarOcorrenciasDaHora, linhaTelemetria, previsaoDeChuva,
  type ContextoHoras, type EquipamentoHist, type EquipamentoLigado, type EscolaHist, type EstadoHora, type FurtoPendente, type LinhaDoTempo,
} from './historico';
import { fatorLocalEquipamento } from './perfis';

export const SEMENTE_PADRAO = 2026;

const HORA = 3_600_000;
const DIA = 24 * HORA;

export interface OpcoesSemente {
  agora: Date;
  semente: number;
  geo: GeoMarilia;
}

export interface ResultadoSemente {
  criado: boolean;
  equipamentos: number;
  agentes: number;
  ocorrencias: number;
  leiturasTelemetria: number;
}

const contar = (db: Database, tabela: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get() as { n: number }).n;
const iso = (d: Date | null) => (d ? d.toISOString() : null);

function gravarHistoricoAte(db: Database, ultimaHora: Date): void {
  db.prepare("INSERT INTO meta (chave, valor) VALUES ('historico_ate', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").run(ultimaHora.toISOString());
}

/**
 * Cria cidade e histórico num banco sem equipamentos. Com equipamentos já cadastrados, não faz nada (reiniciar
 * não duplica). Também não semeia se já houver agentes, para não colidir com matrículas cadastradas à mão.
 */
export function semear(db: Database, { agora, semente, geo }: OpcoesSemente): ResultadoSemente {
  if (contar(db, 'equipamentos') > 0 || contar(db, 'agentes') > 0) {
    return { criado: false, equipamentos: 0, agentes: 0, ocorrencias: 0, leiturasTelemetria: 0 };
  }

  return db.transaction((): ResultadoSemente => {
    if (contarBairros(db) === 0) inserirBairros(db, geo);
    const idsBairro = new Map((db.prepare('SELECT id, nome FROM bairros').all() as { id: number; nome: string }[]).map((b) => [b.nome, b.id]));
    const cidade = gerarCidade(geo, idsBairro, { semente, agora });

    const fim = inicioDaHora(agora);
    const janela = { inicio: new Date(fim.getTime() - DIAS_HISTORICO * DIA), horas: DIAS_HISTORICO * 24, agora };

    // Linhas do tempo (as ordens de serviço ganham número em ordem cronológica no fim).
    let os = 0;
    const linhas = cidade.equipamentos.map((e, i) =>
      construirLinhaDoTempo(
        {
          tipo: e.tipo, confiabilidade: e.confiabilidade, instaladoEm: e.instaladoEm, situacao: e.situacao, necessidade: e.necessidade,
          periodicidadeDias: e.periodicidadeDias, negligente: e.negligente, inspecaoImediata: e.inspecaoImediata,
          furtoQuente: e.tipo === 'patinete' && BAIRROS_FURTO_PATINETE.includes(e.bairro.nome),
        },
        janela,
        criarRng(derivarSemente(semente, 'linha', i)),
        () => `§${++os}§`,
      ));
    numerarOrdensDeServico(linhas, partesLocais(agora).data.slice(0, 4));

    const insEquipamento = db.prepare(`INSERT INTO equipamentos (codigo, tipo, numero_serie, marca, modelo, orgao, situacao, cep, logradouro,
        referencia, bairro_id, lat, lng, lat_atual, lng_atual, manutencao_necessidade, manutencao_periodicidade_dias, ultima_manutencao,
        proxima_manutencao, caracteristicas, instalado_em, ultimo_sinal_em, token_dispositivo, criado_em, atualizado_em, proxima_manutencao_historico)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const ids = cidade.equipamentos.map((e, i) => {
      const l = linhas[i]!;
      const periodicidade = l.necessidade === 'nenhuma' || l.necessidade === 'agendada' ? null : e.periodicidadeDias;
      const criado = e.criadoEm;
      const atualizado = l.atualizadoEm && l.atualizadoEm > criado ? l.atualizadoEm : criado;
      const proxima = l.necessidade === 'nenhuma' ? null : l.proximaManutencao;
      return Number(insEquipamento.run(
        e.codigo, e.tipo, e.numeroSerie, e.marca, e.modelo, e.orgao, e.situacao, e.cep, e.logradouro, e.referencia, e.bairro.id,
        e.lat, e.lng, e.latAtual, e.lngAtual, l.necessidade, periodicidade, l.ultimaManutencao, proxima, JSON.stringify(e.caracteristicas),
        e.instaladoEm ? dataLocal(e.instaladoEm) : null, iso(l.ultimoSinalEm), e.token, criado.toISOString(), atualizado.toISOString(), proxima,
      ).lastInsertRowid);
    });

    const insAgente = db.prepare(`INSERT INTO agentes (nome, matricula, categoria, orgao, situacao, turno, base_logradouro, base_bairro_id,
        lat, lng, lat_atual, lng_atual, ultimo_sinal_em, equipamento_id, telefone, criado_em, atualizado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const a of cidade.agentes) {
      insAgente.run(a.nome, a.matricula, a.categoria, a.orgao, a.situacao, a.turno, a.baseLogradouro, a.bairro.id, a.lat, a.lng,
        a.latAtual, a.lngAtual, a.ultimoSinalEm.toISOString(), a.equipamento === undefined ? null : ids[a.equipamento]!, a.telefone,
        a.criadoEm.toISOString(), a.criadoEm.toISOString());
    }

    const insHistorico = db.prepare('INSERT INTO historico_situacao (equipamento_id, de, para, motivo, em) VALUES (?, ?, ?, ?, ?)');
    const insManutencao = db.prepare('INSERT INTO manutencoes (equipamento_id, tipo, aberta_em, prevista_para, concluida_em, descricao) VALUES (?, ?, ?, ?, ?, ?)');
    const furtosPorHora = new Map<number, FurtoPendente[]>();
    linhas.forEach((l, i) => {
      for (const h of l.historico) insHistorico.run(ids[i]!, h.de, h.para, h.motivo, h.em.toISOString());
      for (const m of l.manutencoes) insManutencao.run(ids[i]!, m.tipo, m.abertaEm.toISOString(), m.previstaPara, iso(m.concluidaEm), m.descricao);
      for (const em of l.furtos) {
        const chave = Math.floor(em.getTime() / HORA);
        const lista = furtosPorHora.get(chave) ?? [];
        lista.push({ em, equipamentoId: ids[i]!, codigo: cidade.equipamentos[i]!.codigo, bairroId: cidade.equipamentos[i]!.bairro.id });
        furtosPorHora.set(chave, lista);
      }
    });

    gravarClima(db, semente, janela.inicio, agora);

    const { ctx, equipamentos } = montarContexto(db, geo, semente, agora);
    const linhaPorId = new Map(ids.map((id, i) => [id, linhas[i]!]));
    const estados = equipamentos.map((e) => linhaPorId.get(e.id)!.estados);
    const totais = gerarHoras(db, ctx, equipamentos, janela.inicio, janela.horas, (i, h) => estados[i]![h] as EstadoHora, furtosPorHora);
    gravarHistoricoAte(db, new Date(fim.getTime() - HORA));

    return {
      criado: true,
      equipamentos: ids.length,
      agentes: cidade.agentes.length,
      ocorrencias: totais.ocorrencias,
      leiturasTelemetria: totais.leituras,
    };
  })();
}

/**
 * Gera o histórico da hora seguinte à última registrada até a hora cheia anterior a `agora` (o servidor ficou
 * desligado). Equipamentos e agentes não mudam de situação aqui — isso é trabalho do simulador ao vivo —, mas
 * o último sinal dos ativos vai para "agora" e quem está fora do turno sai de serviço (e vice-versa).
 * Lacunas maiores que 60 dias são cortadas (só os últimos 60 dias são gerados).
 */
export function preencherLacuna(db: Database, { agora, semente, geo }: OpcoesSemente): { horasGeradas: number } {
  completarPrevisoesDeChuva(db, semente); // banco de antes da previsão guardada: preenche uma vez
  // Banco de antes da rodada final (ou equipamento cadastrado pela tela): a próxima manutenção "do histórico" é a de agora.
  db.prepare('UPDATE equipamentos SET proxima_manutencao_historico = proxima_manutencao WHERE proxima_manutencao_historico IS NULL AND proxima_manutencao IS NOT NULL').run();
  if (contar(db, 'equipamentos') === 0) return { horasGeradas: 0 };
  // `historico_ate` marca até onde o HISTÓRICO foi gerado. A telemetria ao vivo grava a hora corrente em telemetria_hora,
  // então MAX(hora) só serve de reserva para bancos antigos, criados antes dessa marca.
  const marcada = (db.prepare("SELECT valor FROM meta WHERE chave = 'historico_ate'").get() as { valor: string } | undefined)?.valor;
  const ultimaTelemetria = marcada ?? (db.prepare('SELECT MAX(hora) AS m FROM telemetria_hora').get() as { m: string | null }).m;
  const ultimaOcorrencia = (db.prepare("SELECT MAX(inicio) AS m FROM ocorrencias WHERE origem = 'historico'").get() as { m: string | null }).m;
  const referencia = ultimaTelemetria ?? ultimaOcorrencia;
  if (!referencia) return { horasGeradas: 0 };

  const fim = inicioDaHora(agora);
  const inicio = new Date(Math.max(inicioDaHora(new Date(referencia)).getTime() + HORA, fim.getTime() - DIAS_HISTORICO * DIA));
  const horas = Math.floor((fim.getTime() - inicio.getTime()) / HORA);
  if (horas < 1) return { horasGeradas: 0 };

  db.transaction(() => {
    gravarClima(db, semente, inicio, agora);
    // Ocorrências antigas que ficaram "em andamento" quando o servidor parou: encerra com 45 min de duração.
    db.prepare(`UPDATE ocorrencias SET fim = strftime('%Y-%m-%dT%H:%M:%fZ', inicio, '+45 minutes')
      WHERE fim IS NULL AND origem = 'historico' AND inicio < ?`).run(new Date(agora.getTime() - 45 * 60_000).toISOString());

    const { ctx, equipamentos } = montarContexto(db, geo, semente, agora);
    const estado: EstadoHora[] = equipamentos.map((e) =>
      e.situacao === 'operacional' ? ESTADO.NORMAL : e.situacao === 'mau_funcionamento' ? ESTADO.FALHANDO : ESTADO.DESLIGADO);
    gerarHoras(db, ctx, equipamentos, inicio, horas, (i) => estado[i]!, new Map());

    // A cidade "continuou funcionando" enquanto o servidor estava desligado.
    const rng = criarRng(derivarSemente(semente, 'sinal', Math.floor(agora.getTime() / HORA)));
    const sinal = db.prepare('UPDATE equipamentos SET ultimo_sinal_em = ? WHERE id = ?');
    for (const e of equipamentos) {
      if (e.situacao === 'operacional' || e.situacao === 'mau_funcionamento') sinal.run(new Date(agora.getTime() - rng.int(5, 90) * 1000).toISOString(), e.id);
    }
    atualizarTurnos(db, agora, rng);
    gravarHistoricoAte(db, new Date(fim.getTime() - HORA));
  })();
  return { horasGeradas: horas };
}

// ---------------------------------------------------------------------------------------------------------------

/** Troca os marcadores §n§ por números de OS em ordem cronológica (OS 2026-00001, …). */
function numerarOrdensDeServico(linhas: LinhaDoTempo[], ano: string): void {
  const quando = new Map<number, number>();
  const ver = (texto: string, ms: number) => {
    const m = /§(\d+)§/.exec(texto);
    if (m) quando.set(Number(m[1]), Math.min(quando.get(Number(m[1])) ?? Infinity, ms));
  };
  for (const l of linhas) {
    for (const h of l.historico) ver(h.motivo, h.em.getTime());
    for (const m of l.manutencoes) ver(m.descricao, m.abertaEm.getTime());
  }
  const numero = new Map([...quando.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([n], i) => [n, `OS ${ano}-${String(i + 1).padStart(5, '0')}`]));
  const trocar = (texto: string) => texto.replace(/§(\d+)§/g, (_, n: string) => numero.get(Number(n)) ?? 'OS');
  for (const l of linhas) {
    for (const h of l.historico) h.motivo = trocar(h.motivo);
    for (const m of l.manutencoes) m.descricao = trocar(m.descricao);
  }
}

/**
 * Chuva do início da janela até 7 dias à frente: a que cai (`chuva_mm`; `previsto` = 1 nos dias que ainda não chegaram) e
 * a previsão do tempo da véspera (`chuva_prevista_mm`, observada + erro, ver previsaoDeChuva). A previsão de um dia,
 * uma vez guardada, não muda. Dias que passaram deixam de ser "previsto".
 */
function gravarClima(db: Database, semente: number, inicio: Date, agora: Date): void {
  const hoje = dataLocal(agora);
  const ultimo = somarDias(hoje, DIAS_PREVISAO);
  const ins = db.prepare(`INSERT INTO clima_dia (data, chuva_mm, previsto, chuva_prevista_mm) VALUES (?, ?, ?, ?)
    ON CONFLICT(data) DO UPDATE SET previsto = excluded.previsto, chuva_prevista_mm = COALESCE(clima_dia.chuva_prevista_mm, excluded.chuva_prevista_mm)`);
  for (let d = dataLocal(inicio); d <= ultimo; d = somarDias(d, 1)) {
    const mm = chuvaDoDia(semente, d);
    ins.run(d, mm, d > hoje ? 1 : 0, previsaoDeChuva(semente, d, mm));
  }
  db.prepare('UPDATE clima_dia SET previsto = 0 WHERE data <= ? AND previsto = 1').run(hoje);
}

/** Dias sem previsão guardada (banco criado antes dela) ganham a previsão determinística a partir da chuva observada. */
export function completarPrevisoesDeChuva(db: Database, semente: number): void {
  const faltando = db.prepare('SELECT data, chuva_mm FROM clima_dia WHERE chuva_prevista_mm IS NULL').all() as { data: string; chuva_mm: number }[];
  if (faltando.length === 0) return;
  const upd = db.prepare('UPDATE clima_dia SET chuva_prevista_mm = ? WHERE data = ?');
  db.transaction(() => {
    for (const d of faltando) upd.run(previsaoDeChuva(semente, d.data, d.chuva_mm), d.data);
  })();
}

export type EquipamentoSim = EquipamentoHist & { situacao: SituacaoEquipamento };

interface LinhaEquipamentoDb {
  id: number;
  codigo: string;
  tipo: TipoEquipamentoId;
  situacao: SituacaoEquipamento;
  bairro_id: number;
  bairro_nome: string;
  regiao: Regiao;
  logradouro: string;
  marca: string;
  modelo: string;
  instalado_em: string | null;
  caracteristicas: string;
  lat: number;
  lng: number;
}

/** Lê do banco o que a geração hora a hora precisa (vale para a semente e para a lacuna). */
export function montarContexto(db: Database, geo: GeoMarilia, semente: number, agora: Date): { ctx: ContextoHoras; equipamentos: EquipamentoSim[] } {
  const pesos = pesoOcorrenciaBairros(geo, semente);
  const alagaveis = bairrosAlagaveis(geo, semente);
  const indiceGeo = new Map(geo.bairros.map((b, i) => [b.nome, i]));
  const bairros = (db.prepare('SELECT id, nome, regiao FROM bairros ORDER BY id').all() as { id: number; nome: string; regiao: Regiao }[])
    .filter((b) => indiceGeo.has(b.nome))
    .map((b) => {
      const indice = indiceGeo.get(b.nome)!;
      return { id: b.id, indice, nome: b.nome, regiao: b.regiao, peso: pesos[indice]!, alagavel: alagaveis.has(indice) };
    });

  const agentes = db.prepare(`SELECT a.id, b.regiao, a.turno, a.categoria, a.equipamento_id FROM agentes a
    JOIN bairros b ON b.id = a.base_bairro_id ORDER BY a.id`).all() as { id: number; regiao: Regiao; turno: Turno; categoria: CategoriaAgente; equipamento_id: number | null }[];
  const turnosDoEquipamento = new Map<number, Turno[]>();
  for (const a of agentes) {
    if (a.equipamento_id === null) continue;
    turnosDoEquipamento.set(a.equipamento_id, [...(turnosDoEquipamento.get(a.equipamento_id) ?? []), a.turno]);
  }

  const linhas = db.prepare(`SELECT e.id, e.codigo, e.tipo, e.situacao, e.bairro_id, b.nome AS bairro_nome, b.regiao, e.logradouro, e.marca, e.modelo,
      e.instalado_em, e.caracteristicas, e.lat, e.lng
    FROM equipamentos e JOIN bairros b ON b.id = e.bairro_id ORDER BY e.id`).all() as LinhaEquipamentoDb[];

  const radaresPorBairro = new Map<number, EquipamentoLigado[]>();
  const sensoresPorBairro = new Map<number, EquipamentoLigado[]>();
  const escolas: EscolaHist[] = [];
  const equipamentos: EquipamentoSim[] = linhas.map((l) => {
    const caracteristicas = JSON.parse(l.caracteristicas) as Record<string, unknown>;
    const ativo = l.situacao !== 'nao_instalado' && l.situacao !== 'desativado';
    if (ativo && (l.tipo === 'radar' || l.tipo === 'sensor_alagamento')) {
      const mapa = l.tipo === 'radar' ? radaresPorBairro : sensoresPorBairro;
      mapa.set(l.bairro_id, [...(mapa.get(l.bairro_id) ?? []), { id: l.id, codigo: l.codigo }]);
    }
    if (l.tipo === 'transporte' && caracteristicas.categoria === 'escolar' && indiceGeo.has(l.bairro_nome)) {
      escolas.push({ equipamentoId: l.id, codigo: l.codigo, bairroId: l.bairro_id, pontos: pontosPertoDaEscola(geo, semente, l, indiceGeo.get(l.bairro_nome)!) });
    }
    const instalado = l.instalado_em ? new Date(`${l.instalado_em}T13:00:00.000Z`) : null;
    return {
      id: l.id,
      tipo: l.tipo,
      situacao: l.situacao,
      escala: fatorLocalEquipamento({ id: l.id, regiao: l.regiao, logradouro: l.logradouro }),
      fatorRisco: fatorRiscoEquipamento(confiabilidadeDoModelo(l.marca, l.modelo), instalado, agora),
      ...(turnosDoEquipamento.has(l.id) && { turnos: turnosDoEquipamento.get(l.id)! }),
      ...(typeof caracteristicas.categoria === 'string' && { categoria: caracteristicas.categoria }),
    };
  });

  const ctx: ContextoHoras = {
    semente, agora, geo, bairros,
    agentes: agentes.map((a) => ({ id: a.id, regiao: a.regiao, turno: a.turno, categoria: a.categoria })),
    escolas, radaresPorBairro, sensoresPorBairro,
    chuvaMm: (data) => chuvaDoDia(semente, data),
  };
  return { ctx, equipamentos };
}

/** A escola é o ponto do transporte escolar; os acidentes caem nela ou em ruas a até ~350 m. */
function pontosPertoDaEscola(geo: GeoMarilia, semente: number, e: { id: number; lat: number; lng: number }, bairroIndice: number) {
  const rng = criarRng(derivarSemente(semente, 'escola', e.id));
  const pontos = [{ lat: e.lat, lng: e.lng }];
  for (let i = 0; i < 16 && pontos.length < 5; i++) {
    const p = geo.pontoAleatorioNaRua(rng, bairroIndice);
    if (distanciaMetros(p, e) < 350) pontos.push({ lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 });
  }
  return pontos;
}

/** Ocorrências e telemetria de `horas` horas a partir de `inicio`. */
function gerarHoras(
  db: Database,
  ctx: ContextoHoras,
  equipamentos: EquipamentoSim[],
  inicio: Date,
  horas: number,
  estadoDe: (indice: number, hora: number) => EstadoHora,
  furtosPorHora: Map<number, FurtoPendente[]>,
): { ocorrencias: number; leituras: number } {
  const insOcorrencia: Statement = db.prepare(`INSERT INTO ocorrencias (tipo, gravidade, bairro_id, lat, lng, inicio, fim, equipamento_id, agente_id,
      descricao, chuva, origem) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'historico')`);
  // Se a telemetria ao vivo já gravou a hora, as métricas dela valem mais que as geradas. Mas o online_min ao vivo é o último
  // minuto coberto: na hora em que o servidor parou (ou ligou) ele fica incompleto, e a hora viraria "sinal fraco" para todo
  // equipamento. A cidade continuou funcionando enquanto o servidor estava desligado: fica o maior dos dois.
  const insTelemetria: Statement = db.prepare(`INSERT INTO telemetria_hora (equipamento_id, hora, leituras, online_min, metricas) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(equipamento_id, hora) DO UPDATE SET online_min = MAX(online_min, excluded.online_min)`);
  const bateria = new Map<number, number>();
  let ocorrencias = 0;
  let leituras = 0;

  for (let h = 0; h < horas; h++) {
    const hora = new Date(inicio.getTime() + h * HORA);
    const indice = Math.floor(hora.getTime() / HORA);
    for (const o of gerarOcorrenciasDaHora(ctx, hora, furtosPorHora.get(indice) ?? [])) {
      insOcorrencia.run(o.tipo, o.gravidade, o.bairroId, o.lat, o.lng, o.inicio.toISOString(), iso(o.fim), o.equipamentoId, o.agenteId, o.descricao, o.chuva ? 1 : 0);
      ocorrencias++;
    }
    const horaIso = hora.toISOString();
    const mm = ctx.chuvaMm(partesLocais(hora).data);
    const rng = criarRng(derivarSemente(ctx.semente, 'telemetria', indice));
    for (let i = 0; i < equipamentos.length; i++) {
      const eq = equipamentos[i]!;
      const linha = linhaTelemetria(eq, hora, estadoDe(i, h), mm, rng);
      if (!linha) continue;
      insTelemetria.run(eq.id, horaIso, linha.leituras, linha.onlineMin, JSON.stringify(linha.metricas));
      leituras++;
      if (eq.tipo === 'patinete' && linha.metricas.bateria !== undefined) bateria.set(eq.id, linha.metricas.bateria);
    }
  }

  // A bateria cadastrada do patinete acompanha a última leitura.
  const lerCaracteristicas = db.prepare('SELECT caracteristicas FROM equipamentos WHERE id = ?');
  const gravarCaracteristicas = db.prepare('UPDATE equipamentos SET caracteristicas = ? WHERE id = ?');
  for (const [id, valor] of bateria) {
    const c = JSON.parse((lerCaracteristicas.get(id) as { caracteristicas: string }).caracteristicas) as Record<string, unknown>;
    gravarCaracteristicas.run(JSON.stringify({ ...c, bateriaPct: Math.round(valor) }), id);
  }
  return { ocorrencias, leituras };
}

/** Quem está no turno em `agora` entra em serviço; quem saiu do turno fica fora de serviço e volta para a base. */
function atualizarTurnos(db: Database, agora: Date, rng: ReturnType<typeof criarRng>): void {
  const hora = partesLocais(agora).hora;
  const agentes = db.prepare('SELECT id, turno, situacao FROM agentes').all() as { id: number; turno: Turno; situacao: string }[];
  const entra = db.prepare("UPDATE agentes SET situacao = 'em_servico', ultimo_sinal_em = ?, atualizado_em = ? WHERE id = ?");
  const sai = db.prepare("UPDATE agentes SET situacao = 'fora_de_servico', lat_atual = lat, lng_atual = lng, ultimo_sinal_em = ?, atualizado_em = ? WHERE id = ?");
  const agoraIso = agora.toISOString();
  for (const a of agentes) {
    const noTurno = turnoCobreHora(a.turno, hora);
    if (noTurno && a.situacao === 'fora_de_servico') entra.run(new Date(agora.getTime() - rng.int(5, 120) * 1000).toISOString(), agoraIso, a.id);
    else if (!noTurno && a.situacao !== 'fora_de_servico') sai.run(fimDoUltimoTurno(a.turno, agora).toISOString(), agoraIso, a.id);
  }
}
