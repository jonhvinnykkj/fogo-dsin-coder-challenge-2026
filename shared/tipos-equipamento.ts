import { z } from 'zod';
import type { CategoriaAgente, Orgao } from './dominio';

export type TipoEquipamentoId =
  | 'radar' | 'camera' | 'balanca' | 'fiscal_rotativo' | 'cancela' | 'transporte' | 'totem_rotativo'
  | 'patinete' | 'moto_agente' | 'viatura' | 'semaforo' | 'painel_mensagem' | 'sensor_alagamento';

/** Tipos de veículo que um agente pode usar (campo "Moto ou viatura vinculada" do cadastro de agente). */
export const TIPOS_VEICULO_DE_AGENTE: readonly TipoEquipamentoId[] = ['moto_agente', 'viatura'];

/**
 * Que veículo cada categoria de agente usa: agente de trânsito, a moto de agente (da Secretaria de Mobilidade); guarda
 * municipal e policial militar, a viatura (de cada corporação). O órgão do veículo também tem que ser o do agente.
 */
export const VEICULO_DA_CATEGORIA: Record<CategoriaAgente, TipoEquipamentoId> = {
  agente_transito: 'moto_agente',
  guarda_municipal: 'viatura',
  policial_militar: 'viatura',
};

/** Por que o veículo não serve para o agente (texto para o campo), ou `undefined` se serve. */
export function motivoVeiculoIncompativel(
  agente: { categoria: CategoriaAgente; orgao: Orgao },
  veiculo: { tipo: TipoEquipamentoId; orgao: Orgao },
): string | undefined {
  if (veiculo.tipo !== VEICULO_DA_CATEGORIA[agente.categoria]) {
    return agente.categoria === 'agente_transito'
      ? 'Agente de trânsito usa moto de agente, não viatura'
      : 'Guarda municipal e policial militar usam viatura, não moto de agente de trânsito';
  }
  if (veiculo.orgao !== agente.orgao) return `Este veículo é de outro órgão (${veiculo.orgao}); o agente é de ${agente.orgao}`;
  return undefined;
}

/** Unidades que têm singular (valor 1): "1 passageiro", não "1 passageiros". As demais (km, cc, %, t...) não mudam. */
const UNIDADE_NO_SINGULAR: Record<string, string> = { passageiros: 'passageiro', dias: 'dia', graus: 'grau' };

/** Unidade do campo para o valor dado ("passageiros" ou, com 1, "passageiro"). */
export function unidadeParaValor(unidade: string | undefined, valor: number): string | undefined {
  return unidade !== undefined && valor === 1 ? (UNIDADE_NO_SINGULAR[unidade] ?? unidade) : unidade;
}

export interface CampoCaracteristica {
  chave: string;
  rotulo: string;
  /** Orientação do formulário (placeholder/ajuda, ex.: "cartão, Pix"). Nunca aparece na ficha, que usa só o `rotulo`. */
  dica?: string;
  tipo: 'texto' | 'numero' | 'booleano' | 'opcao';
  opcoes?: string[];
  min?: number;
  max?: number;
  unidade?: string;
  obrigatorio: boolean;
}

export interface TipoEquipamento {
  id: TipoEquipamentoId;
  rotulo: string;
  sigla: string;
  movel: boolean;
  /** Nome do componente do Phosphor Icons. */
  icone: string;
  orgaoPadrao: Orgao;
  campos: CampoCaracteristica[];
}

const txt = (chave: string, rotulo: string, obrigatorio = true, dica?: string): CampoCaracteristica => ({
  chave, rotulo, tipo: 'texto', obrigatorio, ...(dica ? { dica } : {}),
});
const num = (chave: string, rotulo: string, min: number, max: number, unidade?: string, obrigatorio = true): CampoCaracteristica => ({
  chave, rotulo, tipo: 'numero', min, max, obrigatorio, ...(unidade ? { unidade } : {}),
});
const bool = (chave: string, rotulo: string, dica?: string): CampoCaracteristica => ({
  chave, rotulo, tipo: 'booleano', obrigatorio: true, ...(dica ? { dica } : {}),
});
const opc = (chave: string, rotulo: string, opcoes: string[], obrigatorio = true): CampoCaracteristica => ({ chave, rotulo, tipo: 'opcao', opcoes, obrigatorio });

const SMU: Orgao = 'Secretaria de Mobilidade Urbana';

export const TIPOS_EQUIPAMENTO: TipoEquipamento[] = [
  {
    id: 'radar', rotulo: 'Radar de fiscalização', sigla: 'RAD', movel: false, icone: 'Camera', orgaoPadrao: SMU,
    campos: [
      opc('modalidade', 'Modalidade', ['velocidade', 'avanço de semáforo', 'conversão proibida', 'retorno proibido', 'parada sobre faixa']),
      num('velocidadeMaxima', 'Velocidade máxima', 10, 120, 'km/h', false),
      num('faixas', 'Faixas monitoradas', 1, 6),
      txt('sentido', 'Sentido'),
    ],
  },
  {
    id: 'camera', rotulo: 'Câmera de videomonitoramento', sigla: 'CAM', movel: false, icone: 'VideoCamera', orgaoPadrao: 'Guarda Civil Municipal',
    campos: [
      opc('resolucao', 'Resolução', ['720p', '1080p', '4K']),
      bool('visaoNoturna', 'Visão noturna'),
      bool('colorida', 'Imagem colorida', 'Desmarcado = preto e branco'),
      bool('ptz', 'Movimento PTZ'),
      num('angulo', 'Ângulo de visão', 10, 360, 'graus'),
      num('armazenamentoDias', 'Armazenamento', 1, 365, 'dias'),
    ],
  },
  {
    id: 'balanca', rotulo: 'Balança de caminhão', sigla: 'BAL', movel: false, icone: 'Scales', orgaoPadrao: SMU,
    campos: [
      num('capacidadeT', 'Capacidade', 1, 200, 't'),
      num('toleranciaPct', 'Tolerância', 0, 20, '%'),
      num('eixosLidos', 'Eixos lidos', 2, 9),
    ],
  },
  {
    id: 'fiscal_rotativo', rotulo: 'Veículo de fiscalização do rotativo', sigla: 'FIS', movel: true, icone: 'Car', orgaoPadrao: 'Concessionária do Rotativo',
    campos: [
      num('autonomiaKm', 'Autonomia', 10, 500, 'km'),
      num('camerasOcr', 'Câmeras de leitura de placa', 1, 8),
      txt('rota', 'Rota de patrulha'),
    ],
  },
  {
    id: 'cancela', rotulo: 'Cancela automatizada', sigla: 'CAN', movel: false, icone: 'Barricade', orgaoPadrao: SMU,
    campos: [
      opc('tipoAcesso', 'Tipo de acesso', ['tag', 'ticket', 'placa']),
      opc('local', 'Local', ['estacionamento', 'terminal']),
    ],
  },
  {
    id: 'transporte', rotulo: 'Veículo de transporte cadastrado', sigla: 'TRA', movel: true, icone: 'Taxi', orgaoPadrao: SMU,
    campos: [
      opc('categoria', 'Categoria', ['táxi', 'mototáxi', 'escolar']),
      txt('placa', 'Placa'),
      num('capacidade', 'Capacidade', 1, 60, 'passageiros'),
      txt('permissionario', 'Permissionário'),
    ],
  },
  {
    id: 'totem_rotativo', rotulo: 'Totem de autoatendimento do rotativo', sigla: 'TOT', movel: false, icone: 'Cardholder', orgaoPadrao: 'Concessionária do Rotativo',
    campos: [
      txt('meiosPagamento', 'Meios de pagamento', true, 'Ex.: cartão, Pix'),
      bool('impressora', 'Possui impressora'),
      bool('telaAcessivel', 'Tela acessível'),
    ],
  },
  {
    id: 'patinete', rotulo: 'Patinete elétrico compartilhado', sigla: 'PAT', movel: true, icone: 'PersonSimpleBike', orgaoPadrao: 'Operadora de Patinetes',
    campos: [
      txt('operadora', 'Operadora'),
      num('autonomiaKm', 'Autonomia', 5, 100, 'km'),
      num('bateriaPct', 'Bateria', 0, 100, '%'),
    ],
  },
  {
    id: 'moto_agente', rotulo: 'Moto de agente de trânsito', sigla: 'MOT', movel: true, icone: 'Motorcycle', orgaoPadrao: SMU,
    campos: [
      txt('placa', 'Placa'),
      num('cilindrada', 'Cilindrada', 50, 1200, 'cc'),
    ],
  },
  {
    id: 'viatura', rotulo: 'Viatura (Guarda Municipal ou PM)', sigla: 'VTR', movel: true, icone: 'Siren', orgaoPadrao: 'Guarda Civil Municipal',
    campos: [
      txt('placa', 'Placa'),
      opc('orgaoViatura', 'Órgão', ['Guarda Civil Municipal', 'Polícia Militar']),
      txt('prefixo', 'Prefixo'),
    ],
  },
  {
    id: 'semaforo', rotulo: 'Semáforo inteligente', sigla: 'SEM', movel: false, icone: 'TrafficSignal', orgaoPadrao: SMU,
    campos: [
      num('fases', 'Fases', 2, 8),
      bool('botoeira', 'Botoeira para pedestre'),
      bool('sincronizado', 'Sincronizado com a rede'),
    ],
  },
  {
    id: 'painel_mensagem', rotulo: 'Painel de mensagem variável', sigla: 'PMV', movel: false, icone: 'Monitor', orgaoPadrao: SMU,
    campos: [
      txt('tamanho', 'Tamanho', true, 'Ex.: 3 × 1 m'),
      opc('cores', 'Cores', ['monocromático', 'colorido']),
    ],
  },
  {
    id: 'sensor_alagamento', rotulo: 'Sensor de alagamento', sigla: 'ALG', movel: false, icone: 'Drop', orgaoPadrao: 'Defesa Civil',
    campos: [
      num('alturaAlertaCm', 'Altura de alerta', 1, 300, 'cm'),
    ],
  },
];

/** Singular e plural de cada tipo, para frases como "2 câmeras indisponíveis". Tipado: tipo novo no catálogo obriga a completar. */
export const NOME_DO_TIPO: Record<TipoEquipamentoId, [string, string]> = {
  radar: ['radar', 'radares'],
  camera: ['câmera', 'câmeras'],
  balanca: ['balança', 'balanças'],
  fiscal_rotativo: ['veículo de fiscalização do rotativo', 'veículos de fiscalização do rotativo'],
  cancela: ['cancela', 'cancelas'],
  transporte: ['veículo de transporte', 'veículos de transporte'],
  totem_rotativo: ['totem do rotativo', 'totens do rotativo'],
  patinete: ['patinete', 'patinetes'],
  moto_agente: ['moto de agente', 'motos de agente'],
  viatura: ['viatura', 'viaturas'],
  semaforo: ['semáforo', 'semáforos'],
  painel_mensagem: ['painel de mensagem', 'painéis de mensagem'],
  sensor_alagamento: ['sensor de alagamento', 'sensores de alagamento'],
};

const POR_ID = new Map(TIPOS_EQUIPAMENTO.map((t) => [t.id, t]));

export function tipoPorId(id: TipoEquipamentoId): TipoEquipamento {
  const t = POR_ID.get(id);
  if (!t) throw new Error(`Tipo de equipamento desconhecido: ${id}`);
  return t;
}

function schemaCampo(c: CampoCaracteristica): z.ZodTypeAny {
  let s: z.ZodTypeAny;
  const obrig = { required_error: `Informe: ${c.rotulo}` };
  if (c.tipo === 'texto') {
    s = z
      .string(obrig)
      .trim()
      .min(c.obrigatorio ? 1 : 0, `Informe: ${c.rotulo}`)
      .max(120, `${c.rotulo}: no máximo 120 letras`)
      .refine((v) => !/\p{Cc}/u.test(v), `${c.rotulo}: o texto tem caracteres inválidos (de controle)`);
  } else if (c.tipo === 'numero') {
    const faixa = `${c.min} a ${c.max}${c.unidade ? ' ' + c.unidade : ''}`;
    s = z
      .number({ ...obrig, invalid_type_error: `${c.rotulo} precisa ser um número` })
      .min(c.min ?? -Infinity, `${c.rotulo} precisa ficar entre ${faixa}`)
      .max(c.max ?? Infinity, `${c.rotulo} precisa ficar entre ${faixa}`);
  } else if (c.tipo === 'booleano') {
    s = z.boolean({ ...obrig, invalid_type_error: `${c.rotulo}: responda sim ou não` });
  } else {
    s = z.enum(c.opcoes as [string, ...string[]], { errorMap: () => ({ message: `${c.rotulo}: escolha ${c.opcoes!.join(', ')}` }) });
  }
  return c.obrigatorio ? s : s.optional();
}

const CACHE = new Map<TipoEquipamentoId, z.ZodType<Record<string, unknown>>>();

/** Schema das características particulares de um tipo (chaves desconhecidas são recusadas). */
export function schemaCaracteristicas(id: TipoEquipamentoId): z.ZodType<Record<string, unknown>> {
  let s = CACHE.get(id);
  if (!s) {
    const forma: Record<string, z.ZodTypeAny> = {};
    for (const c of tipoPorId(id).campos) forma[c.chave] = schemaCampo(c);
    s = z.object(forma).strict() as unknown as z.ZodType<Record<string, unknown>>;
    CACHE.set(id, s);
  }
  return s;
}
