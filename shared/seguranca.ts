// Papéis de acesso e o que cada um pode fazer. Servidor (autorização) e interface (esconder botões) leem daqui.

export const PAPEIS = ['gestor', 'operador', 'agente', 'leitura'] as const;
export type Papel = (typeof PAPEIS)[number];

export const ROTULO_PAPEL: Record<Papel, string> = {
  gestor: 'Gestor',
  operador: 'Operador da central',
  agente: 'Agente em campo',
  leitura: 'Somente consulta',
};

export const DESCRICAO_PAPEL: Record<Papel, string> = {
  gestor: 'Tudo: cadastro, exclusão, simulação e auditoria',
  operador: 'Opera a central: alertas, situação e manutenção',
  agente: 'Consulta e muda a própria situação',
  leitura: 'Só consulta; posição dos agentes aproximada',
};

/** Ações que a interface usa para mostrar ou esconder controles. O servidor confere de novo em cada rota. */
export type Acao = 'cadastrar' | 'excluir' | 'operar' | 'simular' | 'auditar' | 'verDadosPessoais' | 'verPosicaoExata';

const PERMISSOES: Record<Acao, readonly Papel[]> = {
  cadastrar: ['gestor'],
  excluir: ['gestor'],
  simular: ['gestor'],
  auditar: ['gestor'],
  verDadosPessoais: ['gestor'],
  operar: ['gestor', 'operador'],
  verPosicaoExata: ['gestor', 'operador', 'agente'],
};

export function pode(papel: Papel | undefined, acao: Acao): boolean {
  return papel !== undefined && PERMISSOES[acao].includes(papel);
}

/** Usuário da sessão, como a API devolve (sem senha). */
export interface UsuarioSessao {
  id: number;
  login: string;
  nome: string;
  papel: Papel;
  /** Agente vinculado (papel "agente"): só pode mudar a própria situação. */
  agenteId: number | null;
}

export interface ModoAcesso {
  /** Modo demonstração: a tela de entrada mostra botões de entrada rápida por papel. */
  demo: boolean;
}

export interface RegistroAuditoria {
  id: number;
  em: string;
  login: string | null;
  papel: Papel | null;
  acao: string;
  metodo: string;
  rota: string;
  entidade: string | null;
  entidadeId: number | null;
  status: number;
  antes: unknown;
  depois: unknown;
  dados: unknown;
  ip: string | null;
}
