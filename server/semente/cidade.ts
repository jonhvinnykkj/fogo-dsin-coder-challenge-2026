// Cidade sintética de Marília: ~350 equipamentos e ~80 agentes em ruas reais dos 65 bairros (OpenStreetMap).
// Tudo sai de `criarRng(semente)` e do instante `agora`; mesma semente → mesma cidade (posições, séries, tokens).
//
// Distribuição: equipamentos fixos proporcionais à malha de ruas do bairro (todo bairro recebe ao menos um),
// com o Centro concentrando radares, câmeras e semáforos; rotativo (totens e carros de fiscalização) só no Centro;
// patinetes no Centro e em bairros com universidade/comércio; sensores de alagamento nos bairros alagáveis;
// balanças na periferia, em vias principais. Motos e viaturas ficam na base do agente a que estão vinculadas.
import {
  turnoCobreHora, HORARIO_TURNO,
  type CategoriaAgente, type NecessidadeManutencao, type Orgao, type Regiao, type SituacaoAgente, type SituacaoEquipamento, type Turno,
} from '../../shared/dominio';
import { tipoPorId, type TipoEquipamentoId } from '../../shared/tipos-equipamento';
import type { GeoMarilia, PontoNaRua } from '../geo/marilia';
import { instanteLocal, partesLocais, dataLocal } from '../tempo';
import { criarRng, derivarSemente, type Rng } from './aleatorio';
import { CATALOGO_MARCAS, fatorFalhaModelo, type ModeloCatalogo } from './catalogo-marcas';

const DIA = 86_400_000;
const ANO = 365.25 * DIA;

/** Bairros onde o furto de patinete é 3× maior (padrão plantado). */
export const BAIRROS_FURTO_PATINETE: readonly string[] = ['Alto Cafezal', 'Jardim Universitário'];
/** Fora do Centro, a operadora de patinetes cobre estes bairros (universidades, comércio). */
const BAIRROS_PATINETE_FORA_DO_CENTRO = ['Jardim Universitário', 'Fragata', 'Cavalieri', 'Higienópolis', 'Jardim Tropical', 'Jardim California'];

export const QUANTIDADE_POR_TIPO: Record<TipoEquipamentoId, number> = {
  radar: 48, camera: 62, semaforo: 55, patinete: 60, balanca: 4, fiscal_rotativo: 6, cancela: 10, transporte: 32,
  totem_rotativo: 18, moto_agente: 14, viatura: 16, painel_mensagem: 9, sensor_alagamento: 16,
};

const TRANSPORTE_POR_CATEGORIA = { 'táxi': 12, 'mototáxi': 8, escolar: 12 } as const;

/** Dias entre manutenções preventivas, por tipo. */
export const PERIODICIDADE_DIAS: Record<TipoEquipamentoId, number> = {
  radar: 90, camera: 120, semaforo: 60, balanca: 90, cancela: 90, totem_rotativo: 60, painel_mensagem: 180,
  sensor_alagamento: 90, patinete: 30, moto_agente: 60, viatura: 45, transporte: 180, fiscal_rotativo: 60,
};

/** Agentes por região e turno: toda região tem gente em todo turno; a madrugada é o plantão reduzido. */
const ESCALA: Record<Regiao, Record<Turno, number>> = {
  Centro: { manha: 6, tarde: 7, noite: 5, madrugada: 2 },
  Oeste: { manha: 7, tarde: 7, noite: 6, madrugada: 3 },
  Sul: { manha: 6, tarde: 7, noite: 4, madrugada: 2 },
  Leste: { manha: 3, tarde: 3, noite: 2, madrugada: 1 },
  Norte: { manha: 3, tarde: 3, noite: 2, madrugada: 1 },
};

/** Categoria de cada vaga da escala (repetida em ciclo): trânsito de dia, guardas e PM à noite. */
const CATEGORIA_DA_VAGA: Record<Turno, CategoriaAgente[]> = {
  manha: ['agente_transito', 'guarda_municipal', 'agente_transito', 'policial_militar', 'agente_transito', 'guarda_municipal', 'policial_militar'],
  tarde: ['agente_transito', 'guarda_municipal', 'agente_transito', 'policial_militar', 'agente_transito', 'guarda_municipal', 'policial_militar'],
  noite: ['policial_militar', 'guarda_municipal', 'agente_transito', 'policial_militar', 'guarda_municipal', 'policial_militar'],
  madrugada: ['guarda_municipal', 'policial_militar', 'guarda_municipal'],
};

const ORGAO_DA_CATEGORIA: Record<CategoriaAgente, Orgao> = {
  agente_transito: 'Secretaria de Mobilidade Urbana',
  guarda_municipal: 'Guarda Civil Municipal',
  policial_militar: 'Polícia Militar',
};
const PREFIXO_MATRICULA: Record<CategoriaAgente, [string, number]> = {
  agente_transito: ['AT', 1001], guarda_municipal: ['GM', 2001], policial_militar: ['PM', 3001],
};
const NOME_BASE: Record<CategoriaAgente, string> = {
  agente_transito: 'Base do Trânsito', guarda_municipal: 'Base da Guarda', policial_militar: 'Companhia da PM',
};

const NOMES = ['Ana', 'Beatriz', 'Bruna', 'Camila', 'Carla', 'Daniela', 'Fernanda', 'Gabriela', 'Juliana', 'Larissa', 'Letícia',
  'Mariana', 'Patrícia', 'Renata', 'Tatiane', 'Vanessa', 'Adriano', 'André', 'Bruno', 'Carlos', 'Diego', 'Eduardo', 'Fábio', 'Felipe',
  'Gustavo', 'Henrique', 'João', 'José', 'Leandro', 'Lucas', 'Marcelo', 'Marcos', 'Paulo', 'Rafael', 'Ricardo', 'Rodrigo', 'Thiago',
  'Vinícius', 'Wagner', 'Wellington'];
const SOBRENOMES = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Ferreira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento',
  'Carvalho', 'Gomes', 'Martins', 'Araújo', 'Ribeiro', 'Barbosa', 'Rocha', 'Dias', 'Moreira', 'Cardoso', 'Teixeira', 'Mendes', 'Nogueira',
  'Pavan', 'Zanoni', 'Bertolucci', 'Tanaka', 'Nakamura', 'Yamamoto'];
const ESTABELECIMENTOS = ['ao Mercado do Tio', 'à Padaria Pão Nosso', 'à UBS do bairro', 'à Igreja Matriz', 'ao Supermercado Central',
  'à Farmácia Popular', 'ao Ginásio de Esportes', 'à Lotérica', 'à Praça da Fonte', 'ao Posto de Combustível', 'à Feira Livre',
  'ao Terminal Urbano', 'à Academia ao ar livre', 'ao Pronto Atendimento'];
const ESCOLAS = ['EMEF Monteiro Lobato', 'EE Professora Ana Rosa', 'EMEI Cecília Meireles', 'EE Dom Pedro II', 'EMEF Santos Dumont',
  'Colégio Vinicius de Moraes', 'EMEF Tarsila do Amaral', 'EE Professor Paulo Freire', 'EMEF Cora Coralina', 'EE Rui Barbosa',
  'EMEF Anita Garibaldi', 'EE Machado de Assis'];
const OPERADORAS_PATINETE = ['Roda Leve', 'Patinete Já'];
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface BairroCidade {
  indice: number;
  id: number;
  nome: string;
  regiao: Regiao;
  cep: string;
  /** Metros de rua (do JSON do OSM) dentro do bairro. */
  comprimento: number;
  /** Metros de avenida/via principal dentro do bairro. */
  principal: number;
}

export interface EquipamentoCidade {
  tipo: TipoEquipamentoId;
  codigo: string;
  numeroSerie: string;
  marca: string;
  modelo: string;
  confiabilidade: number;
  orgao: Orgao;
  bairro: BairroCidade;
  cep: string;
  logradouro: string;
  referencia: string;
  lat: number;
  lng: number;
  latAtual: number;
  lngAtual: number;
  caracteristicas: Record<string, unknown>;
  instaladoEm: Date | null;
  criadoEm: Date;
  token: string;
  situacao: SituacaoEquipamento;
  necessidade: NecessidadeManutencao;
  periodicidadeDias: number | null;
  /** Pula as preventivas a partir de uma data (gera manutenção atrasada). */
  negligente: boolean;
  /** Operacional com pedido de manutenção imediata (inspeção). */
  inspecaoImediata: boolean;
  /** Índice do agente vinculado (motos e viaturas). */
  agente?: number;
}

export interface AgenteCidade {
  nome: string;
  matricula: string;
  categoria: CategoriaAgente;
  orgao: Orgao;
  turno: Turno;
  regiao: Regiao;
  bairro: BairroCidade;
  baseLogradouro: string;
  lat: number;
  lng: number;
  latAtual: number;
  lngAtual: number;
  situacao: SituacaoAgente;
  ultimoSinalEm: Date;
  telefone: string;
  criadoEm: Date;
  /** Índice do equipamento (moto/viatura) vinculado. */
  equipamento?: number;
}

export interface Cidade {
  bairros: BairroCidade[];
  equipamentos: EquipamentoCidade[];
  agentes: AgenteCidade[];
}

// ---------------------------------------------------------------------------------------------------------------
// Medidas da malha de ruas (puras: dependem só da geografia; usadas também pelo histórico)

const VIAS_PRINCIPAIS = new Set(['primary', 'secondary', 'tertiary']);
const K = Math.cos((-22.2139 * Math.PI) / 180);
const cacheRuas = new WeakMap<GeoMarilia, { comprimento: number[]; principal: number[] }>();

export function medirRuas(geo: GeoMarilia): { comprimento: number[]; principal: number[] } {
  let m = cacheRuas.get(geo);
  if (m) return m;
  const comprimento = geo.bairros.map(() => 0);
  const principal = geo.bairros.map(() => 0);
  for (const r of geo.ruas) {
    for (let i = 0; i + 1 < r.pontos.length; i++) {
      const [la, lo] = r.pontos[i]!;
      const [lb, lob] = r.pontos[i + 1]!;
      const metros = Math.hypot((lob - lo) * K, lb - la) * 111_320;
      const b = geo.bairroDoPonto((la + lb) / 2, (lo + lob) / 2);
      comprimento[b]! += metros;
      if (VIAS_PRINCIPAIS.has(r.tipo)) principal[b]! += metros;
    }
  }
  m = { comprimento, principal };
  cacheRuas.set(geo, m);
  return m;
}

const FATOR_REGIAO_OCORRENCIA: Record<Regiao, number> = { Centro: 3, Oeste: 1, Sul: 1, Leste: 0.9, Norte: 0.8 };

/**
 * Peso de cada bairro (soma 1) na taxa de ocorrências: malha de ruas^0,6 × região (Centro 3×) × variação própria
 * (lognormal, σ = 0,35). Alguns bairros ficam claramente acima dos outros, como numa cidade de verdade.
 */
export function pesoOcorrenciaBairros(geo: GeoMarilia, semente: number): number[] {
  const { comprimento } = medirRuas(geo);
  const ordenado = [...comprimento].sort((x, y) => x - y);
  const mediana = ordenado[Math.floor(ordenado.length / 2)]!;
  const rng = criarRng(derivarSemente(semente, 'peso-bairros'));
  const pesos = geo.bairros.map((b, i) =>
    Math.pow(Math.max(comprimento[i]!, 300) / mediana, 0.6) * FATOR_REGIAO_OCORRENCIA[b.regiao] * Math.exp(rng.normal(0, 0.35)) * (b.nome === 'Centro' ? 1.5 : 1));
  const total = pesos.reduce((s, p) => s + p, 0);
  return pesos.map((p) => p / total);
}

/** Índices dos 10 bairros alagáveis (fora do Centro), sorteados pela semente. */
export function bairrosAlagaveis(geo: GeoMarilia, semente: number): Set<number> {
  const rng = criarRng(derivarSemente(semente, 'alagaveis'));
  const { comprimento } = medirRuas(geo);
  const candidatos = geo.bairros.map((b, i) => ({ b, i })).filter((x) => x.b.regiao !== 'Centro');
  const escolhidos = new Set<number>();
  while (escolhidos.size < 10) escolhidos.add(rng.ponderado(candidatos.filter((c) => !escolhidos.has(c.i)), (c) => comprimento[c.i]!).i);
  return escolhidos;
}

// ---------------------------------------------------------------------------------------------------------------

const digitos = (rng: Rng, n: number) => {
  let s = '';
  for (let i = 0; i < n; i++) s += rng.int(0, 9);
  return s;
};
const placaMercosul = (rng: Rng) =>
  `${LETRAS[rng.int(0, 25)]}${LETRAS[rng.int(0, 25)]}${LETRAS[rng.int(0, 25)]}${rng.int(0, 9)}${LETRAS[rng.int(0, 25)]}${digitos(rng, 2)}`;
const nomePessoa = (rng: Rng) => `${rng.escolher(NOMES)} ${rng.escolher(SOBRENOMES)} ${rng.escolher(SOBRENOMES)}`;

/** Divide `total` pelas porcentagens com o método do maior resto (soma exata). */
function distribuir<K extends string>(total: number, pcts: [K, number][]): Record<K, number> {
  const brutos = pcts.map(([k, p]) => ({ k, v: (total * p) / 100 }));
  const saida = Object.fromEntries(brutos.map((b) => [b.k, Math.floor(b.v)])) as Record<K, number>;
  let resto = total - brutos.reduce((s, b) => s + Math.floor(b.v), 0);
  for (const b of [...brutos].sort((x, y) => (y.v % 1) - (x.v % 1))) {
    if (resto-- <= 0) break;
    saida[b.k] += 1;
  }
  return saida;
}

export interface OpcoesCidade {
  semente: number;
  agora: Date;
}

export function gerarCidade(geo: GeoMarilia, idsBairro: ReadonlyMap<string, number>, opcoes: OpcoesCidade): Cidade {
  const rng = criarRng(derivarSemente(opcoes.semente, 'cidade'));
  // Sorteios que dependem do instante (quem está no turno, onde está agora, último sinal) têm fio próprio:
  // assim a cidade (códigos, séries, posições, modelos, situações) é a mesma a qualquer hora em que for semeada.
  const rngAgora = criarRng(derivarSemente(opcoes.semente, 'cidade-agora'));
  const agora = opcoes.agora;
  const horaAgora = partesLocais(agora).hora;
  const medidas = medirRuas(geo);
  const alagaveis = bairrosAlagaveis(geo, opcoes.semente);
  const tipoDaVia = new Map(geo.ruas.map((r) => [r.nome, r.tipo]));

  const bairros: BairroCidade[] = geo.bairros.map((b, i) => {
    const id = idsBairro.get(b.nome);
    if (id === undefined) throw new Error(`Bairro "${b.nome}" não está no banco`);
    return { indice: i, id, nome: b.nome, regiao: b.regiao, cep: b.cep, comprimento: medidas.comprimento[i]!, principal: medidas.principal[i]! };
  });
  const porRegiao = (r: Regiao) => bairros.filter((b) => b.regiao === r);
  const bairroDaRegiao = (r: Regiao, fio: Rng = rng) => fio.ponderado(porRegiao(r), (b) => b.comprimento + 200);

  const ponto = (b: BairroCidade, preferirAvenida = false, fio: Rng = rng): PontoNaRua => {
    let p = geo.pontoAleatorioNaRua(fio, b.indice);
    for (let i = 0; preferirAvenida && i < 10 && !VIAS_PRINCIPAIS.has(tipoDaVia.get(p.logradouro) ?? ''); i++) {
      p = geo.pontoAleatorioNaRua(fio, b.indice);
    }
    return { lat: round6(p.lat), lng: round6(p.lng), logradouro: p.logradouro };
  };
  const ruaDoBairro = (b: BairroCidade, exceto: string) => {
    for (let i = 0; i < 6; i++) {
      const p = geo.pontoAleatorioNaRua(rng, b.indice);
      if (p.logradouro !== exceto) return p.logradouro;
    }
    return null;
  };
  const cepDoBairro = (b: BairroCidade) => `${b.cep.slice(0, 5)}-${String(rng.int(0, 999)).padStart(3, '0')}`;

  // ---- Agentes e bases ----
  const bases = new Map<string, { bairro: BairroCidade; ponto: PontoNaRua; logradouro: string }>();
  const baseDe = (regiao: Regiao, categoria: CategoriaAgente) => {
    const chave = `${regiao}|${categoria}`;
    let base = bases.get(chave);
    if (!base) {
      const bairro = regiao === 'Centro' && categoria !== 'policial_militar' ? bairros.find((b) => b.nome === 'Centro')! : bairroDaRegiao(regiao);
      const p = ponto(bairro, true);
      base = { bairro, ponto: p, logradouro: `${p.logradouro}, nº ${rng.int(20, 1800)} (${NOME_BASE[categoria]} — ${regiao === 'Centro' ? 'Centro' : `Zona ${regiao}`})` };
      bases.set(chave, base);
    }
    return base;
  };

  const agentes: AgenteCidade[] = [];
  const sequencia: Record<CategoriaAgente, number> = { agente_transito: 0, guarda_municipal: 0, policial_militar: 0 };
  for (const regiao of ['Centro', 'Oeste', 'Sul', 'Leste', 'Norte'] as Regiao[]) {
    for (const turno of ['manha', 'tarde', 'noite', 'madrugada'] as Turno[]) {
      for (let vaga = 0; vaga < ESCALA[regiao][turno]; vaga++) {
        const categoria = CATEGORIA_DA_VAGA[turno][vaga % CATEGORIA_DA_VAGA[turno].length]!;
        const base = baseDe(regiao, categoria);
        const [prefixo, inicio] = PREFIXO_MATRICULA[categoria];
        const noTurno = turnoCobreHora(turno, horaAgora);
        const situacao: SituacaoAgente = noTurno ? rngAgora.peso({ em_servico: 0.72, em_ocorrencia: 0.18, pausa: 0.1 }) : 'fora_de_servico';
        const atual = noTurno ? ponto(bairroDaRegiao(regiao, rngAgora), false, rngAgora) : base.ponto;
        agentes.push({
          nome: nomePessoa(rng),
          matricula: `${prefixo}-${inicio + sequencia[categoria]++}`,
          categoria,
          orgao: ORGAO_DA_CATEGORIA[categoria],
          turno,
          regiao,
          bairro: base.bairro,
          baseLogradouro: base.logradouro,
          lat: base.ponto.lat,
          lng: base.ponto.lng,
          latAtual: atual.lat,
          lngAtual: atual.lng,
          situacao,
          ultimoSinalEm: noTurno ? new Date(agora.getTime() - rngAgora.int(5, 120) * 1000) : fimDoUltimoTurno(turno, agora),
          telefone: `(14) 9${digitos(rng, 4)}-${digitos(rng, 4)}`,
          criadoEm: new Date(agora.getTime() - rng.int(30, 2500) * DIA),
        });
      }
    }
  }

  // ---- Equipamentos ----
  const equipamentos: EquipamentoCidade[] = [];
  const series = new Set<string>();
  const restante = { ...QUANTIDADE_POR_TIPO };

  const novo = (tipo: TipoEquipamentoId, bairro: BairroCidade, o: { categoria?: 'táxi' | 'mototáxi' | 'escolar'; agente?: number } = {}) => {
    const modelos = CATALOGO_MARCAS[tipo].filter((m) => !o.categoria || m.categoria === o.categoria);
    const modelo = rng.ponderado(modelos, (m) => m.participacao);
    const agente = o.agente === undefined ? undefined : agentes[o.agente]!;
    const preferirAvenida = ['radar', 'semaforo', 'painel_mensagem', 'balanca'].includes(tipo);
    const p = agente ? { lat: agente.lat, lng: agente.lng, logradouro: agente.baseLogradouro.split(',')[0]! } : ponto(bairro, preferirAvenida);
    const anos = idadeAnos(tipo, rng);
    const instaladoEm = instanteLocal(dataLocal(new Date(agora.getTime() - anos * ANO)), 10);
    const anoFabricacao = Number(dataLocal(instaladoEm).slice(0, 4)) - (rng.chance(0.3) ? 1 : 0);
    let numeroSerie = modelo.serie(rng, anoFabricacao);
    while (series.has(numeroSerie)) numeroSerie = modelo.serie(rng, anoFabricacao);
    series.add(numeroSerie);
    const caracteristicas = caracteristicasDe(tipo, modelo, rng, { bairro, agente, centro: bairros.filter((b) => b.regiao === 'Centro'), ruaDoBairro });
    const orgao: Orgao = tipo === 'viatura' ? (caracteristicas.orgaoViatura as Orgao) : tipoPorId(tipo).orgaoPadrao;
    const referencia = agente ? 'pátio da base' : referenciaDe(tipo, p.logradouro, bairro, caracteristicas, rng, ruaDoBairro);
    const e: EquipamentoCidade = {
      tipo, codigo: '', numeroSerie, marca: modelo.marca, modelo: modelo.modelo, confiabilidade: modelo.confiabilidade, orgao,
      bairro: agente ? agente.bairro : bairro, cep: cepDoBairro(agente ? agente.bairro : bairro), logradouro: p.logradouro, referencia,
      lat: p.lat, lng: p.lng, latAtual: p.lat, lngAtual: p.lng, caracteristicas,
      instaladoEm, criadoEm: new Date(instaladoEm.getTime() - rng.int(1, 20) * DIA), token: rng.hex(32),
      situacao: 'operacional', necessidade: 'nenhuma', periodicidadeDias: null, negligente: false, inspecaoImediata: false,
      ...(o.agente !== undefined && { agente: o.agente }),
    };
    equipamentos.push(e);
    restante[tipo] -= 1;
    return e;
  };

  // Presença mínima: um equipamento fixo de vigilância em cada bairro.
  for (const b of rng.embaralhar([...bairros])) {
    const tipo = rng.peso({ camera: restante.camera > 0 ? 0.45 : 0, semaforo: restante.semaforo > 0 ? 0.35 : 0, radar: restante.radar > 0 ? 0.2 : 0 });
    novo(tipo, b);
  }

  const peso = (tipo: TipoEquipamentoId, b: BairroCidade): number => {
    const malha = Math.pow(Math.max(b.comprimento, 200), 0.8);
    const centro = b.regiao === 'Centro';
    const nucleo = b.nome === 'Centro' ? 1.5 : 1;
    switch (tipo) {
      case 'radar':
      case 'semaforo': return malha * (centro ? 3 : 1) * nucleo * (b.principal > 0 ? 1.3 : 1);
      case 'camera': return malha * (centro ? 3.5 : 1) * nucleo;
      case 'painel_mensagem': return b.principal * (centro ? 2 : 1);
      case 'totem_rotativo':
      case 'fiscal_rotativo': return centro ? malha * nucleo : 0;
      case 'cancela': return malha * (centro ? 3 : 0.25);
      case 'patinete': return centro ? 4 : BAIRROS_PATINETE_FORA_DO_CENTRO.includes(b.nome) ? 2.5 : 0;
      case 'balanca': return centro ? 0 : b.principal;
      case 'sensor_alagamento': return alagaveis.has(b.indice) ? 1 : 0;
      default: return malha;
    }
  };

  const FIXOS_E_PATINETES: TipoEquipamentoId[] = ['radar', 'camera', 'semaforo', 'patinete', 'balanca', 'fiscal_rotativo', 'cancela',
    'totem_rotativo', 'painel_mensagem', 'sensor_alagamento'];
  for (const tipo of FIXOS_E_PATINETES) {
    while (restante[tipo] > 0) novo(tipo, rng.ponderado(bairros, (b) => peso(tipo, b)));
  }
  for (const [categoria, qtd] of Object.entries(TRANSPORTE_POR_CATEGORIA) as ['táxi' | 'mototáxi' | 'escolar', number][]) {
    const pesoCategoria = (b: BairroCidade) => {
      const malha = Math.pow(Math.max(b.comprimento, 200), 0.8);
      const centro = b.regiao === 'Centro';
      return categoria === 'táxi' ? malha * (centro ? 4 : 0.4) : categoria === 'mototáxi' ? (centro ? 0 : malha) : malha * (centro ? 0.3 : 1);
    };
    for (let i = 0; i < qtd; i++) novo('transporte', rng.ponderado(bairros, pesoCategoria), { categoria });
  }

  // Motos para agentes de trânsito (de preferência de dia) e viaturas para guardas e PMs.
  const transito = rng.embaralhar(agentes.map((a, i) => ({ a, i })).filter((x) => x.a.categoria === 'agente_transito'))
    .sort((x, y) => Number(['noite', 'madrugada'].includes(x.a.turno)) - Number(['noite', 'madrugada'].includes(y.a.turno)));
  for (const { i } of transito.slice(0, QUANTIDADE_POR_TIPO.moto_agente)) {
    agentes[i]!.equipamento = equipamentos.length;
    novo('moto_agente', agentes[i]!.bairro, { agente: i });
  }
  const policiamento = rng.embaralhar(agentes.map((a, i) => ({ a, i })).filter((x) => x.a.categoria !== 'agente_transito'));
  for (const { i } of policiamento.slice(0, QUANTIDADE_POR_TIPO.viatura)) {
    agentes[i]!.equipamento = equipamentos.length;
    novo('viatura', agentes[i]!.bairro, { agente: i });
  }

  // Códigos FOGO-<SIGLA>-0001 por tipo, em ordem de geração.
  const contagem = new Map<string, number>();
  for (const e of equipamentos) {
    const sigla = tipoPorId(e.tipo).sigla;
    const n = (contagem.get(sigla) ?? 0) + 1;
    contagem.set(sigla, n);
    e.codigo = `FOGO-${sigla}-${String(n).padStart(4, '0')}`;
  }

  atribuirSituacoes(equipamentos, rng);
  planejarManutencao(equipamentos, rng);

  // Posição atual dos móveis.
  for (const e of equipamentos) {
    const ativo = e.situacao === 'operacional' || e.situacao === 'mau_funcionamento';
    if (e.agente !== undefined) {
      const a = agentes[e.agente]!;
      if (ativo && a.situacao !== 'fora_de_servico') {
        e.latAtual = a.latAtual;
        e.lngAtual = a.lngAtual;
      }
    } else if (ativo && (e.tipo === 'patinete' || e.tipo === 'fiscal_rotativo' || (e.tipo === 'transporte' && e.caracteristicas.categoria !== 'escolar'))) {
      const destino = e.tipo === 'fiscal_rotativo' ? bairroDaRegiao('Centro', rngAgora) : e.bairro;
      const p = ponto(destino, false, rngAgora);
      e.latAtual = p.lat;
      e.lngAtual = p.lng;
    }
    if (e.situacao === 'nao_instalado') {
      e.instaladoEm = null;
      e.criadoEm = new Date(agora.getTime() - rngAgora.int(3, 45) * DIA);
    }
  }

  return { bairros, equipamentos, agentes };
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** Fim (instante UTC) do último turno já encerrado antes de `agora`. */
export function fimDoUltimoTurno(turno: Turno, agora: Date): Date {
  const hoje = dataLocal(agora);
  let fim = instanteLocal(hoje, HORARIO_TURNO[turno].fim);
  if (fim.getTime() > agora.getTime()) fim = new Date(fim.getTime() - DIA);
  return fim;
}

function idadeAnos(tipo: TipoEquipamentoId, rng: Rng): number {
  if (rng.chance(0.04)) return rng.entre(5, 55) / 365.25; // instalados durante o histórico
  if (tipo === 'patinete') return rng.entre(0.15, 2);
  if (tipo === 'moto_agente' || tipo === 'viatura' || tipo === 'transporte' || tipo === 'fiscal_rotativo') return rng.entre(0.3, 6);
  return rng.entre(0.4, 8);
}

interface ApoioCaracteristicas {
  bairro: BairroCidade;
  agente: AgenteCidade | undefined;
  centro: BairroCidade[];
  ruaDoBairro: (b: BairroCidade, exceto: string) => string | null;
}

function caracteristicasDe(tipo: TipoEquipamentoId, modelo: ModeloCatalogo, rng: Rng, apoio: ApoioCaracteristicas): Record<string, unknown> {
  const ficha = modelo.ficha ?? {};
  switch (tipo) {
    case 'radar': {
      const modalidade = rng.peso({ velocidade: 0.55, 'avanço de semáforo': 0.2, 'parada sobre faixa': 0.1, 'conversão proibida': 0.1, 'retorno proibido': 0.05 });
      return {
        modalidade,
        ...(modalidade === 'velocidade' && { velocidadeMaxima: rng.escolher([40, 50, 50, 60]) }),
        faixas: rng.int(1, 3),
        sentido: rng.escolher(['Centro → bairro', 'Bairro → Centro', 'Ambos os sentidos', 'Norte → Sul', 'Sul → Norte', 'Leste → Oeste', 'Oeste → Leste']),
      };
    }
    case 'camera':
      return {
        resolucao: ficha.resolucao, visaoNoturna: ficha.visaoNoturna, colorida: ficha.colorida, ptz: ficha.ptz, angulo: ficha.angulo,
        armazenamentoDias: rng.escolher([15, 30, 30, 60]),
      };
    case 'balanca':
      return { capacidadeT: rng.escolher([45, 60, 74, 80]), toleranciaPct: rng.escolher([5, 5, 10]), eixosLidos: rng.int(6, 9) };
    case 'fiscal_rotativo': {
      const b = rng.escolher(apoio.centro);
      const r1 = apoio.ruaDoBairro(b, '') ?? 'Centro';
      const r2 = apoio.ruaDoBairro(b, r1) ?? 'Centro';
      return { autonomiaKm: rng.int(260, 300), camerasOcr: rng.int(2, 4), rota: `Rota ${b.nome} — ${r1} e ${r2}` };
    }
    case 'cancela':
      return { tipoAcesso: rng.peso({ tag: 0.4, ticket: 0.35, placa: 0.25 }), local: rng.peso({ estacionamento: 0.7, terminal: 0.3 }) };
    case 'transporte': {
      const categoria = modelo.categoria ?? 'táxi';
      const capacidade = categoria === 'mototáxi' ? 1 : categoria === 'táxi' ? 4 : modelo.modelo.startsWith('Volare') ? 28 : modelo.modelo.startsWith('Sprinter') ? 20 : 16;
      const permissionario = categoria === 'escolar' ? `Transportes ${rng.escolher(SOBRENOMES)} Ltda.` : nomePessoa(rng);
      return { categoria, placa: placaMercosul(rng), capacidade, permissionario };
    }
    case 'totem_rotativo':
      return { meiosPagamento: rng.escolher(['cartão, Pix', 'cartão, Pix, moedas', 'Pix, cartão por aproximação']), impressora: rng.chance(0.7), telaAcessivel: rng.chance(0.6) };
    case 'patinete':
      return {
        operadora: rng.escolher(OPERADORAS_PATINETE),
        autonomiaKm: modelo.modelo === 'Max G30' ? 65 : modelo.modelo === 'Scooter 4 Pro' ? 55 : 50,
        bateriaPct: rng.int(30, 100),
      };
    case 'moto_agente':
      return { placa: placaMercosul(rng), cilindrada: modelo.modelo.includes('300') ? 300 : 250 };
    case 'viatura': {
      const pm = apoio.agente?.categoria === 'policial_militar';
      return {
        placa: placaMercosul(rng),
        orgaoViatura: pm ? 'Polícia Militar' : 'Guarda Civil Municipal',
        prefixo: pm ? `M-${rng.int(10, 99)}${rng.int(100, 999)}` : `GCM-${String(rng.int(1, 60)).padStart(3, '0')}`,
      };
    }
    case 'semaforo':
      return {
        fases: apoio.bairro.regiao === 'Centro' ? rng.int(2, 5) : rng.int(2, 4),
        botoeira: rng.chance(0.55),
        sincronizado: rng.chance(apoio.bairro.regiao === 'Centro' ? 0.85 : 0.4),
      };
    case 'painel_mensagem':
      return { tamanho: rng.escolher(['3 × 1 m', '4 × 1,5 m', '2 × 0,8 m']), cores: rng.peso({ monocromático: 0.4, colorido: 0.6 }) };
    case 'sensor_alagamento':
      return { alturaAlertaCm: rng.escolher([20, 25, 30, 40, 50]) };
  }
}

function referenciaDe(
  tipo: TipoEquipamentoId,
  logradouro: string,
  bairro: BairroCidade,
  caracteristicas: Record<string, unknown>,
  rng: Rng,
  ruaDoBairro: (b: BairroCidade, exceto: string) => string | null,
): string {
  if (tipo === 'balanca') return `KM ${rng.int(1, 9)} da ${rng.escolher(['SP-294', 'SP-333', 'BR-153'])} (acesso à cidade)`;
  if (tipo === 'transporte' && caracteristicas.categoria === 'escolar') return `em frente à ${rng.escolher(ESCOLAS)}`;
  if (tipo === 'sensor_alagamento' && rng.chance(0.5)) return 'junto à galeria de águas pluviais';
  const n = rng.int(10, 2400);
  const forma = rng.peso({ numero: 0.42, oposto: 0.15, sn: 0.1, esquina: 0.13, emFrente: 0.2 });
  if (forma === 'numero') return `nº ${n}`;
  if (forma === 'oposto') return `oposto ao nº ${n}`;
  if (forma === 'sn') return 'S/N';
  if (forma === 'esquina') {
    const outra = ruaDoBairro(bairro, logradouro);
    if (outra) return `esquina com a ${outra}`;
    return `nº ${n}`;
  }
  return `em frente ${rng.escolher(ESTABELECIMENTOS)}`;
}

/**
 * Máximo de equipamentos indisponíveis (falhando, em manutenção ou furtados) que a semente deixa no mesmo bairro. O índice da
 * Central pesa 12 por indisponível: com 8 no Centro (o bairro com mais equipamentos) o bairro abria em 100 e a cidade parecia
 * em crise na primeira tela. Com 2, a pressão de um bairro só passa dos 30 se houver também alerta ou ocorrências recentes.
 */
export const MAX_INDISPONIVEIS_POR_BAIRRO = 2;
const INDISPONIVEIS: readonly SituacaoEquipamento[] = ['mau_funcionamento', 'em_manutencao', 'furtado'];

function atribuirSituacoes(equipamentos: EquipamentoCidade[], rng: Rng): void {
  const cotas = distribuir(equipamentos.length, [
    ['operacional', 82], ['mau_funcionamento', 6], ['em_manutencao', 4], ['nao_instalado', 3], ['desativado', 3], ['furtado', 2],
  ]);
  const vigiaveis = ['camera', 'totem_rotativo', 'semaforo', 'sensor_alagamento'];
  const peso: Record<Exclude<SituacaoEquipamento, 'operacional'>, (e: EquipamentoCidade) => number> = {
    furtado: (e) => (e.agente !== undefined ? 0 : e.tipo === 'patinete' ? (BAIRROS_FURTO_PATINETE.includes(e.bairro.nome) ? 12 : 3) : vigiaveis.includes(e.tipo) ? 0.5 : 0),
    nao_instalado: (e) => (tipoPorId(e.tipo).movel ? (e.tipo === 'patinete' ? 0.5 : 0) : e.tipo === 'painel_mensagem' || e.tipo === 'sensor_alagamento' ? 1.5 : 1),
    desativado: (e) => (e.agente !== undefined ? 0 : e.tipo === 'transporte' ? 0.6 : e.tipo === 'balanca' ? 0.3 : 1),
    mau_funcionamento: (e) => fatorFalhaModelo(e.confiabilidade),
    em_manutencao: () => 1,
  };
  const livres = new Set(equipamentos.map((_, i) => i));
  const indisponiveisNoBairro = new Map<number, number>();
  for (const situacao of ['furtado', 'nao_instalado', 'desativado', 'mau_funcionamento', 'em_manutencao'] as const) {
    for (let k = 0; k < cotas[situacao]; k++) {
      const candidatos = [...livres].filter((i) => peso[situacao](equipamentos[i]!) > 0);
      if (candidatos.length === 0) break;
      // Bairro que já tem o máximo de indisponíveis só recebe mais se não houver outro lugar (a cota total se mantém).
      const espalhados = INDISPONIVEIS.includes(situacao)
        ? candidatos.filter((i) => (indisponiveisNoBairro.get(equipamentos[i]!.bairro.id) ?? 0) < MAX_INDISPONIVEIS_POR_BAIRRO)
        : candidatos;
      const i = rng.ponderado(espalhados.length ? espalhados : candidatos, (j) => peso[situacao](equipamentos[j]!));
      equipamentos[i]!.situacao = situacao;
      if (INDISPONIVEIS.includes(situacao)) indisponiveisNoBairro.set(equipamentos[i]!.bairro.id, (indisponiveisNoBairro.get(equipamentos[i]!.bairro.id) ?? 0) + 1);
      livres.delete(i);
    }
  }
}

function planejarManutencao(equipamentos: EquipamentoCidade[], rng: Rng): void {
  for (const e of equipamentos) {
    if (e.situacao === 'nao_instalado' || e.situacao === 'desativado') continue;
    const movel = tipoPorId(e.tipo).movel;
    const pPeriodica = e.tipo === 'patinete' ? 0.7 : movel ? 0.9 : 0.8;
    const r = rng.num();
    if (r < pPeriodica) {
      e.necessidade = 'periodica';
      e.periodicidadeDias = PERIODICIDADE_DIAS[e.tipo];
      e.negligente = rng.chance(0.2);
    } else if (r < pPeriodica + 0.1) {
      e.necessidade = 'agendada';
    }
    e.inspecaoImediata = e.situacao === 'operacional' && rng.chance(0.03);
  }
}
