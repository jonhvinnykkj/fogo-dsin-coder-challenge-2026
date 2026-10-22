// Usuários e sessões (SQL puro). As sessões usam o relógio real, não o da simulação: expirar é questão de segurança.
import type { Database } from 'better-sqlite3';
import type { Papel, UsuarioSessao } from '../../shared/seguranca';
import { gerarHashSenha, gerarSenhaAleatoria, gerarTokenSessao, sha256 } from './cripto';

export const DURACAO_SESSAO_MS = 8 * 60 * 60 * 1000; // um turno

interface LinhaUsuario {
  id: number;
  login: string;
  nome: string;
  papel: Papel;
  agente_id: number | null;
}

const paraUsuario = (l: LinhaUsuario): UsuarioSessao => ({ id: l.id, login: l.login, nome: l.nome, papel: l.papel, agenteId: l.agente_id });

export interface NovoUsuario {
  login: string;
  nome: string;
  papel: Papel;
  senha: string;
  agenteId?: number | null;
  demo?: boolean;
}

export function criarUsuario(db: Database, u: NovoUsuario, agora = new Date()): UsuarioSessao {
  const r = db
    .prepare('INSERT INTO usuarios (login, nome, papel, senha_hash, agente_id, demo, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(u.login.trim().toLowerCase(), u.nome, u.papel, gerarHashSenha(u.senha), u.agenteId ?? null, u.demo ? 1 : 0, agora.toISOString());
  return { id: Number(r.lastInsertRowid), login: u.login.trim().toLowerCase(), nome: u.nome, papel: u.papel, agenteId: u.agenteId ?? null };
}

/** Para conferir a senha no login: só usuários ativos. */
export function credenciaisPorLogin(db: Database, login: string): (UsuarioSessao & { senhaHash: string }) | undefined {
  const l = db
    .prepare('SELECT id, login, nome, papel, agente_id, senha_hash FROM usuarios WHERE login = ? AND ativo = 1')
    .get(login.trim().toLowerCase()) as (LinhaUsuario & { senha_hash: string }) | undefined;
  return l && { ...paraUsuario(l), senhaHash: l.senha_hash };
}

export function usuarioDemoDoPapel(db: Database, papel: Papel): UsuarioSessao | undefined {
  const l = db.prepare('SELECT id, login, nome, papel, agente_id FROM usuarios WHERE papel = ? AND demo = 1 AND ativo = 1 ORDER BY id LIMIT 1').get(papel) as
    | LinhaUsuario
    | undefined;
  return l && paraUsuario(l);
}

export function definirSenha(db: Database, login: string, senha: string): boolean {
  const r = db.prepare('UPDATE usuarios SET senha_hash = ? WHERE login = ?').run(gerarHashSenha(senha), login.trim().toLowerCase());
  if (r.changes > 0) encerrarSessoesDoUsuario(db, login);
  return r.changes > 0;
}

// ---- Sessões ----

/** Abre uma sessão e devolve o valor do cookie (o banco guarda só o hash dele). */
export function abrirSessao(db: Database, usuarioId: number, ip: string | null, agora = new Date()): string {
  const token = gerarTokenSessao();
  db.prepare('DELETE FROM sessoes WHERE expira_em <= ?').run(agora.toISOString()); // limpa as vencidas de quebra
  db.prepare('INSERT INTO sessoes (id_hash, usuario_id, criada_em, expira_em, ip) VALUES (?, ?, ?, ?, ?)').run(
    sha256(token), usuarioId, agora.toISOString(), new Date(agora.getTime() + DURACAO_SESSAO_MS).toISOString(), ip,
  );
  return token;
}

/** Usuário dono do cookie, se a sessão existe, não venceu e o usuário continua ativo. */
export function usuarioDaSessao(db: Database, token: string, agora = new Date()): UsuarioSessao | undefined {
  const l = db
    .prepare(`SELECT u.id, u.login, u.nome, u.papel, u.agente_id FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
              WHERE s.id_hash = ? AND s.expira_em > ? AND u.ativo = 1`)
    .get(sha256(token), agora.toISOString()) as LinhaUsuario | undefined;
  return l && paraUsuario(l);
}

export function encerrarSessao(db: Database, token: string): void {
  db.prepare('DELETE FROM sessoes WHERE id_hash = ?').run(sha256(token));
}

function encerrarSessoesDoUsuario(db: Database, login: string): void {
  db.prepare('DELETE FROM sessoes WHERE usuario_id = (SELECT id FROM usuarios WHERE login = ?)').run(login.trim().toLowerCase());
}

// ---- Usuários de demonstração ----

export interface UsuarioCriado {
  login: string;
  papel: Papel;
  senha: string;
}

/**
 * Banco sem nenhum usuário: cria um por papel, com senha aleatória (o terminal mostra uma vez).
 * O usuário "agente" fica vinculado ao primeiro agente em serviço, para o papel ter alguém para representar.
 */
export function garantirUsuariosDemo(db: Database, agora = new Date()): UsuarioCriado[] {
  const total = (db.prepare('SELECT COUNT(*) AS n FROM usuarios').get() as { n: number }).n;
  if (total > 0) return [];
  const agente = db.prepare("SELECT id, nome FROM agentes ORDER BY (situacao = 'em_servico') DESC, id LIMIT 1").get() as
    | { id: number; nome: string }
    | undefined;
  const planos: Omit<NovoUsuario, 'senha'>[] = [
    { login: 'gestor', nome: 'Gestão da operação', papel: 'gestor' },
    { login: 'operador', nome: 'Operação da central', papel: 'operador' },
    { login: 'agente', nome: agente ? agente.nome : 'Agente em campo', papel: 'agente', agenteId: agente?.id ?? null },
    { login: 'consulta', nome: 'Consulta', papel: 'leitura' },
  ];
  const criados: UsuarioCriado[] = [];
  db.transaction(() => {
    for (const p of planos) {
      const senha = gerarSenhaAleatoria();
      criarUsuario(db, { ...p, senha, demo: true }, agora);
      criados.push({ login: p.login, papel: p.papel, senha });
    }
  })();
  return criados;
}
