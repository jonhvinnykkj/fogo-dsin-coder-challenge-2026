import { z } from 'zod';
import type { Orgao } from './dominio';

export type TipoEquipamentoId =
  | 'radar' | 'camera' | 'balanca' | 'fiscal_rotativo' | 'cancela' | 'transporte' | 'totem_rotativo'
  | 'patinete' | 'moto_agente' | 'viatura' | 'semaforo' | 'painel_mensagem' | 'sensor_alagamento';

export interface CampoCaracteristica {
  chave: string;
  rotulo: string;
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

const txt = (chave: string, rotulo: string, obrigatorio = true): CampoCaracteristica => ({ chave, rotulo, tipo: 'texto', obrigatorio });
const num = (chave: string, rotulo: string, min: number, max: number, unidade?: string, obrigatorio = true): CampoCaracteristica => ({
  chave, rotulo, tipo: 'numero', min, max, obrigatorio, ...(unidade ? { unidade } : {}),
});
const bool = (chave: string, rotulo: string): CampoCaracteristica => ({ chave, rotulo, tipo: 'booleano', obrigatorio: true });
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
      bool('colorida', 'Imagem colorida (desmarcado = preto e branco)'),
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
      txt('meiosPagamento', 'Meios de pagamento (ex.: cartão, Pix)'),
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
      txt('tamanho', 'Tamanho (ex.: 3 × 1 m)'),
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
    s = z.string(obrig).trim().min(c.obrigatorio ? 1 : 0, `Informe: ${c.rotulo}`);
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
