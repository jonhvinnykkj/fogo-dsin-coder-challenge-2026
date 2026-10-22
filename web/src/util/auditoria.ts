// Texto da trilha de auditoria para gente: o servidor grava as colunas do banco ("situacao: em_servico → pausa", "bairro_id: 44");
// aqui viram rótulo e valor de domínio ("Situação: Em serviço → Em pausa", "Bairro: Centro").
import {
  ROTULO_CATEGORIA_AGENTE, ROTULO_NECESSIDADE_MANUTENCAO, ROTULO_SITUACAO, ROTULO_SITUACAO_AGENTE, ROTULO_TURNO,
} from '../../../shared/dominio';
import { formatarDataHora } from '../../../shared/formato';
import type { RegistroAuditoria } from '../../../shared/seguranca';
import { TIPOS_EQUIPAMENTO } from '../../../shared/tipos-equipamento';
import { formatarDia } from './datas';

/** Entidades que a API de auditoria aceita como filtro, com o nome que a pessoa reconhece. */
export const ENTIDADES_AUDITORIA = [
  { valor: 'equipamentos', rotulo: 'Equipamentos' },
  { valor: 'agentes', rotulo: 'Agentes' },
  { valor: 'alertas', rotulo: 'Alertas' },
  { valor: 'simulacao', rotulo: 'Simulação' },
  { valor: 'auth', rotulo: 'Acesso (entrar e sair)' },
] as const;

const ROTULO_CAMPO: Record<string, string> = {
  situacao: 'Situação',
  tipo: 'Tipo',
  numero_serie: 'Número de série',
  marca: 'Marca',
  modelo: 'Modelo',
  orgao: 'Órgão',
  cep: 'CEP',
  logradouro: 'Endereço',
  referencia: 'Referência',
  bairro_id: 'Bairro',
  cidade: 'Cidade',
  uf: 'UF',
  lat: 'Latitude',
  lng: 'Longitude',
  manutencao_necessidade: 'Necessidade de manutenção',
  manutencao_periodicidade_dias: 'Periodicidade da manutenção (dias)',
  ultima_manutencao: 'Última manutenção',
  proxima_manutencao: 'Próxima manutenção',
  proxima_manutencao_historico: 'Próxima manutenção (histórico)',
  caracteristicas: 'Características',
  instalado_em: 'Instalado em',
  nome: 'Nome',
  matricula: 'Matrícula',
  categoria: 'Categoria',
  turno: 'Turno',
  base_logradouro: 'Base',
  base_bairro_id: 'Bairro da base',
  equipamento_id: 'Veículo vinculado',
  telefone: 'Telefone',
  velocidade: 'Velocidade',
  pausado: 'Pausada',
};

/** Campos que o sistema mexe sozinho (carimbos e posição ao vivo): não são decisão de ninguém. */
const CAMPOS_TECNICOS = new Set(['id', 'atualizado_em', 'criado_em', 'ultimo_sinal_em', 'lat_atual', 'lng_atual']);

export const rotuloDoCampo = (campo: string): string =>
  ROTULO_CAMPO[campo] ?? campo.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());

const ROTULO_TIPO = new Map<string, string>(TIPOS_EQUIPAMENTO.map((t) => [t.id, t.rotulo]));
const ISO_COM_HORA = /^\d{4}-\d{2}-\d{2}T/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Valor de um campo no texto de domínio. `entidade` decide de qual lista sai o rótulo de "situacao". */
export function valorLegivel(entidade: string | null, campo: string, valor: unknown, nomesBairros: ReadonlyMap<number, string> = new Map()): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  const texto = String(valor);
  const buscar = <T extends string>(tabela: Record<T, string>) => (tabela as Record<string, string>)[texto] ?? texto;
  switch (campo) {
    case 'situacao': return entidade === 'agentes' ? buscar(ROTULO_SITUACAO_AGENTE) : buscar(ROTULO_SITUACAO);
    case 'categoria': return buscar(ROTULO_CATEGORIA_AGENTE);
    case 'turno': return buscar(ROTULO_TURNO);
    case 'manutencao_necessidade': return buscar(ROTULO_NECESSIDADE_MANUTENCAO);
    case 'tipo': return ROTULO_TIPO.get(texto) ?? texto;
    case 'bairro_id':
    case 'base_bairro_id': return nomesBairros.get(Number(valor)) ?? `Bairro ${texto}`;
    case 'equipamento_id': return `Equipamento #${texto}`;
    case 'velocidade': return `${texto}×`;
    default:
  }
  if (ISO_COM_HORA.test(texto)) return formatarDataHora(texto);
  if (DATA.test(texto)) return formatarDia(texto);
  return texto;
}

export interface MudancaLegivel {
  campo: string;
  de: string;
  para: string;
}

/** Só os campos que mudaram entre antes e depois, já com rótulo e valor de domínio. */
export function mudancasLegiveis(r: Pick<RegistroAuditoria, 'entidade' | 'antes' | 'depois'>, nomesBairros?: ReadonlyMap<number, string>): MudancaLegivel[] {
  if (!r.antes || !r.depois || typeof r.antes !== 'object' || typeof r.depois !== 'object') return [];
  const antes = r.antes as Record<string, unknown>;
  const depois = r.depois as Record<string, unknown>;
  return Object.keys(depois)
    .filter((c) => !CAMPOS_TECNICOS.has(c) && JSON.stringify(antes[c]) !== JSON.stringify(depois[c]))
    .map((c) => ({
      campo: rotuloDoCampo(c),
      de: valorLegivel(r.entidade, c, antes[c], nomesBairros),
      para: valorLegivel(r.entidade, c, depois[c], nomesBairros),
    }));
}
