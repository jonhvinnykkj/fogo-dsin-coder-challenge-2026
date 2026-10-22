// Entrada e saída do sistema. A sessão vive num cookie httpOnly; o banco guarda só o hash dele.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PAPEIS, type ModoAcesso, type UsuarioSessao } from '../../shared/seguranca';
import { ErroApi } from '../erros';
import { registrar } from '../seguranca/auditoria';
import { conferirSenha, gerarHashSenha } from '../seguranca/cripto';
import { COOKIE_SESSAO, opcoesDoCookie } from '../seguranca/plugin';
import { abrirSessao, credenciaisPorLogin, encerrarSessao, usuarioDemoDoPapel } from '../seguranca/usuarios';

const tags = ['Acesso'];

export const entradaSchema = z.object({
  login: z.string({ required_error: 'Informe o usuário' }).trim().min(1, 'Informe o usuário').max(60),
  senha: z.string({ required_error: 'Informe a senha' }).min(1, 'Informe a senha').max(200),
});
export const demoSchema = z.object({
  papel: z.enum(PAPEIS, { errorMap: () => ({ message: `Papel: use ${PAPEIS.join(', ')}` }) }),
});

// Usuário inexistente também paga o custo do scrypt: o tempo de resposta não revela quais logins existem.
const HASH_FALSO = gerarHashSenha('senha-que-ninguem-usa');
const RECUSADA = 'Usuário ou senha incorretos';

export async function rotasAuth(app: FastifyInstance): Promise<void> {
  const db = app.ctx.db;
  const agoraIso = () => app.ctx.relogio.agora().toISOString();

  const anotar = (req: FastifyRequest, chave: string, status: number, usuario: UsuarioSessao | undefined, dados?: unknown) =>
    registrar(db, {
      em: agoraIso(), usuarioId: usuario?.id ?? null, login: usuario?.login ?? null, papel: usuario?.papel ?? null,
      chave, rota: chave.split(' ')[1]!, entidadeId: null, status, dados, ip: req.ip,
    });

  const iniciarSessao = (req: FastifyRequest, reply: FastifyReply, usuario: UsuarioSessao) => {
    const token = abrirSessao(db, usuario.id, req.ip);
    reply.setCookie(COOKIE_SESSAO, token, opcoesDoCookie(app, req));
    return usuario;
  };

  app.get('/api/auth/modo', {
    schema: { tags, summary: 'Modo de acesso (demonstração ou não), para a tela de entrada' },
  }, async (): Promise<ModoAcesso> => ({ demo: app.seguranca.demo }));

  app.post('/api/auth/entrar', {
    schema: {
      tags,
      summary: 'Entra com usuário e senha',
      description: 'Corpo: { login, senha }. Abre uma sessão de 8 h no cookie httpOnly `fogo_sessao`. Limite: 10 tentativas por minuto por IP.',
    },
  }, async (req, reply) => {
    const { login, senha } = entradaSchema.parse(req.body);
    const credenciais = credenciaisPorLogin(db, login);
    const confere = await conferirSenha(senha, credenciais?.senhaHash ?? HASH_FALSO);
    if (!credenciais || !confere) {
      // Quem errou a senha de um usuário que existe fica na trilha com o login dele (ficou claro quem foi alvo). Um login que não
      // existe NÃO é gravado: quem digita a senha no campo de usuário por engano deixaria a senha escrita na auditoria.
      const { senhaHash: _hash, ...alvo } = credenciais ?? {};
      anotar(req, 'POST /api/auth/entrar', 401, credenciais ? (alvo as UsuarioSessao) : undefined);
      throw new ErroApi(401, RECUSADA);
    }
    const { senhaHash: _omitida, ...usuario } = credenciais;
    anotar(req, 'POST /api/auth/entrar', 200, usuario);
    return iniciarSessao(req, reply, usuario);
  });

  app.post('/api/auth/demo', {
    schema: {
      tags,
      summary: 'Entrada com um clique (só no modo demonstração)',
      description: 'Corpo: { papel: gestor|operador|agente|leitura }. Fora do modo demonstração (FOGO_DEMO=0) responde 404.',
    },
  }, async (req, reply) => {
    if (!app.seguranca.demo) throw new ErroApi(404, 'Rota não encontrada');
    const { papel } = demoSchema.parse(req.body);
    const usuario = usuarioDemoDoPapel(db, papel);
    if (!usuario) throw new ErroApi(404, 'Não há usuário de demonstração para este papel');
    anotar(req, 'POST /api/auth/demo', 200, usuario);
    return iniciarSessao(req, reply, usuario);
  });

  app.post('/api/auth/sair', { schema: { tags, summary: 'Encerra a sessão' } }, async (req, reply) => {
    const token = req.cookies[COOKIE_SESSAO];
    if (token) {
      encerrarSessao(db, token);
      app.seguranca.avisarSessaoEncerrada(token); // o tempo real fecha a conexão desta sessão na hora
    }
    if (req.usuario) anotar(req, 'POST /api/auth/sair', 204, req.usuario);
    reply.clearCookie(COOKIE_SESSAO, { path: '/' });
    return reply.code(204).send();
  });

  // Sem sessão responde 200 com `usuario: null` (e não 401): é a pergunta que a interface faz ao abrir, não um erro.
  app.get('/api/auth/eu', { schema: { tags, summary: 'Quem está logado: { usuario } (null sem sessão)' } }, async (req) => ({ usuario: req.usuario ?? null }));
}
