# Segurança do F.O.G.O.

O F.O.G.O. mostra onde estão guardas e policiais, deixa marcar um equipamento como furtado e recebe telemetria de dispositivos na rua. Nas mãos erradas, isso serve para planejar um furto, apagar uma câmera antes de um crime ou desmontar o cadastro da cidade. Este documento lista cada ameaça, o que fizemos contra ela e onde isso está no código, e diz com franqueza o que ficou de fora.

## Resumo em uma tabela

| Ameaça | Medida | Onde está |
|---|---|---|
| Qualquer pessoa usar a API | Toda rota de `/api` exige sessão, menos saúde, entrada e telemetria (que tem token próprio) | `server/seguranca/plugin.ts` (gancho `onRequest`), `server/seguranca/permissoes.ts` |
| Pessoa logada fazer mais do que deve | Quatro papéis com permissão explícita por rota; rota nova sem regra é recusada a todos (falha fechado) | `server/seguranca/permissoes.ts` e o teste "toda rota de /api registrada tem regra" |
| Agente mudar a situação de outro agente ou mexer no despacho dele | O papel `agente` só altera a situação e usa o Modo Campo do `:id` vinculado ao seu usuário | `SO_O_PROPRIO_AGENTE` em `permissoes.ts` |
| Senha vazar do banco | Só o hash **scrypt** (N=2^14, r=8, p=1) com sal aleatório de 16 bytes; comparação em tempo constante | `server/seguranca/cripto.ts` |
| Adivinhar senha por força bruta | 10 tentativas por minuto por IP na entrada; mensagem igual para usuário inexistente e senha errada, e o mesmo custo de scrypt nos dois casos (o tempo de resposta não revela quem existe) | `plugin.ts` (`onRoute`), `server/rotas/auth.ts` (`HASH_FALSO`) |
| Roubo de sessão por XSS | Cookie `httpOnly` (o JavaScript da página não o lê) + CSP que só executa scripts do próprio servidor | `opcoesDoCookie` e `helmet` em `plugin.ts` |
| Roubo de sessão copiando o banco | O banco guarda só o SHA-256 do valor do cookie | `server/seguranca/usuarios.ts` (`abrirSessao`) |
| Sessão esquecida aberta | Expira em 8 h (um turno); trocar a senha encerra todas as sessões do usuário | `DURACAO_SESSAO_MS`, `definirSenha` |
| Outro site disparar ações com o seu login (CSRF) | Cookie `SameSite=Strict` + escrita com `Origin` de outro site recusada (403) **em toda escrita**, inclusive entrar, demo e sair (só a telemetria, que vem de dispositivo, fica de fora). O `Origin` do Vite (`localhost:5173`) só vale fora de produção e enquanto o servidor não serve a interface | `conferirOrigem` e gancho `preValidation` em `plugin.ts` |
| Embutir a central num iframe (clickjacking) | `frame-ancestors 'none'` e `X-Frame-Options: DENY` | `helmet` em `plugin.ts` |
| Dispositivo falso mandando telemetria | Token por equipamento; o banco guarda só `sha256:<hash>`; comparação em tempo constante; 120 leituras/min por dispositivo; 30 recusas/min por IP (a 31ª e as seguintes dão 429, mesmo com token certo, até a janela esvaziar) | `server/rotas/telemetria.ts`, `cripto.ts` |
| Leitura com valor absurdo estragando a média, o gráfico e a previsão | Cada métrica tem faixa (percentuais 0–100, velocidades 0–300 km/h, contagens 0–100 000…); `1.7e308` não vira `Infinity` na soma. Posição só de equipamento móvel e dentro de Marília; hora com no máximo 6 h de atraso | `server/tempo-real/faixas.ts`, testado contra o simulador e a semente |
| Token de dispositivo vazar do banco | Mesmo copiando o `fogo.db`, ninguém obtém os tokens. Para trocar um: `POST /api/equipamentos/:id/token` (gestor) ou `npm run token -- <código>`, que mostram o token novo **uma vez** | `server/rotas/auditoria.ts`, `scripts/token.ts` |
| Dados pessoais dos agentes (LGPD) | Telefone e matrícula inteiros só para o gestor; os demais papéis veem `(14) •••••-••32` e `AT-••01` | `server/seguranca/protecao.ts` (gancho `preSerialization`) |
| Posição de policiais e guardas | Exata para quem opera; aproximada (~500 m) para "somente consulta", tanto na API quanto no tempo real (SSE). A moto ou viatura vinculada ao agente anda com ele, então recebe o mesmo arredondamento em todo lugar em que aparece (mapa, ficha, listagem, alertas e eventos) | `protegerResposta` e `protegerEvento` em `protecao.ts`, `server/rotas/stream.ts` |
| Tempo real depois de sair do sistema | A conexão SSE fecha na hora da saída (`POST /api/auth/sair`) e, para sessão que vence ou usuário desativado, na próxima conferência (a cada 5 s). Antes de fechar vai o evento `sessao` com `{ "encerrada": true }` | `server/rotas/stream.ts`, `aoEncerrarSessao` em `plugin.ts` |
| Descobrir matrícula ou telefone mascarados por tentativa | A busca de agentes só alcança a matrícula para o gestor; telefone não entra na busca. Matrícula e telefone também não entram em texto livre (histórico, alertas): o relato do Modo Campo cita só o nome | `listarAgentes` (`buscarMatricula`), `server/servicos/campo.ts` |
| "Quem apagou isso?" | Trilha de auditoria: quem, papel, ação, antes e depois do registro, IP e resultado, inclusive tentativas recusadas (com o corpo que se tentou enviar) e entradas com senha errada. Senhas e tokens nunca entram, e um login que não existe não é gravado (senha digitada no campo errado) | `server/seguranca/auditoria.ts`, tela **Auditoria** (só gestor) |
| Inundar o servidor | 600 requisições/min por IP, 30 conexões de tempo real/min, corpo de no máximo 256 KB (413 com mensagem clara; tipo de conteúdo que não é JSON dá 415) | `plugin.ts`, `server/app.ts` |
| Agente relatar problema em equipamento que não está vendo | O relato exige o agente a até 500 m do equipamento (a distância fica no histórico e no alerta) | `reportarProblema` em `server/servicos/campo.ts` |
| Acesso pela rede local | O servidor escuta só em `127.0.0.1` por padrão; o Docker usa `HOST=0.0.0.0` porque o isolamento é do contêiner | `server/index.ts`, `Dockerfile` |
| SQL injection | Todo SQL usa parâmetros (`?`); nomes de tabela na auditoria vêm de uma lista fixa | `server/repositorios/`, `TABELAS` em `auditoria.ts` |
| Entrada malformada | Todo corpo e filtro passa pelo zod antes de chegar ao banco | `shared/schemas.ts` |

## Papéis

| Papel | Pode | Não pode |
|---|---|---|
| **Gestor** | Tudo: cadastrar, editar e excluir equipamentos e agentes, controlar a simulação, gerar token de dispositivo, ver a auditoria e os dados pessoais completos | — |
| **Operador da central** | Ver tudo, reconhecer e resolver alertas, mudar a situação de equipamentos e agentes, registrar manutenção, abrir o Modo Campo de qualquer agente | Cadastrar, excluir, mexer na simulação, ver telefone e matrícula completos |
| **Agente em campo** | Ver tudo, mudar a **própria** situação e usar o **próprio** Modo Campo (despacho, chegada, conclusão e relato de problema); ao entrar, vai direto para ele | O resto das escritas; o Modo Campo de outro agente |
| **Somente consulta** | Ver painéis, previsões, cadastros e o Boletim do dia | Qualquer escrita e o Modo Campo; vê a posição dos agentes só de forma aproximada |

A interface esconde o que o papel não pode usar, mas isso é só conforto: **quem decide é o servidor**, rota por rota. Um teste chama cada rota sensível com cada papel e confere o 403.

## Auditoria do Modo Campo

Cada ação do Modo Campo registra antes e depois **da coisa que mudou**, não do agente da URL:

| Ação | Entidade na trilha | Antes e depois |
|---|---|---|
| "Cheguei" | `ocorrencias`, com o id da ocorrência | a ocorrência com `chegou_em` (nulo antes, a hora depois) |
| Concluir | `ocorrencias`, com o id da ocorrência | a ocorrência com `fim` (nulo antes, a hora depois) |
| Relatar problema | `equipamentos`, com o id do equipamento relatado | o equipamento (situação antes e depois) |

O agente da URL vai em `dados.agenteId`. Para poder gravar o corpo mesmo nas recusas, a checagem de papel e de `Origin` roda depois da leitura do corpo (`preValidation`): o 403 de quem tentou, por exemplo, relatar um furto sem permissão chega à trilha com o `equipamentoId` e o texto que enviou. Sem sessão (401) continua sem registro e sem ler o corpo.

## Telemetria: o que um dispositivo pode mandar

| Campo | Regra |
|---|---|
| Métricas | `online`, `bateria`, `emUso`: 0 a 100 · `velocidade`, `velocidadeMedia`: 0 a 300 km/h · `kmRodados`: 0 a 1000 · `fps`: 0 a 240 · `nivelCm`: 0 a 1000 · demais contagens por hora: 0 a 100 000. Fora disso, 400 com a faixa na mensagem |
| `lat` e `lng` | Só equipamento móvel (fixo manda a posição do cadastro). Dentro de 15 km do centro de Marília; **patinete** até 200 km, porque a posição fora da cidade é justamente o que dispara o alerta de furto |
| `em` | No máximo 6 h antes do relógio do servidor (leitura do futuro continua valendo "agora") |
| Token inválido | 30 recusas por minuto por IP; depois, 429 |

O teste `server/tempo-real/faixas.test.ts` roda a geração de leituras da semente e do simulador contra essas faixas: se alguém mudar um perfil e ele passar do teto, o teste falha.

## Modo demonstração (para a avaliação rodar de primeira)

Na primeira partida, o servidor cria quatro usuários (`gestor`, `operador`, `agente`, `consulta`) com **senhas aleatórias**, mostradas uma única vez no terminal. Como a avaliação precisa rodar sem configurar nada, o `npm start` sobe em **modo demonstração**: a tela de entrada mostra um botão por papel, que abre a sessão daquele usuário com um clique.

Em produção, desliga-se com `FOGO_DEMO=0`. Aí só usuário e senha funcionam e `POST /api/auth/demo` responde 404. Para trocar uma senha: `npm run senha -- gestor` (gera uma aleatória) ou `npm run senha -- gestor "uma senha longa"`.

| Variável | Padrão | Para que serve |
|---|---|---|
| `FOGO_DEMO` | ligado | `0` desliga a entrada com um clique |
| `HOST` | `127.0.0.1` | `0.0.0.0` expõe na rede (o Docker já usa) |
| `FOGO_COOKIE_SEGURO` | desligado | `1` marca o cookie como `Secure` (atrás de HTTPS) |
| `FOGO_DEV` | desligado | `1` aceita o `Origin` do Vite (`localhost:5173`) mesmo com a pasta `dist/web` presente. Sem ele, o `Origin` do Vite só vale quando `NODE_ENV` não é `production` **e** o servidor não serve a interface compilada |

## O que ficou de fora, e por quê

- **HTTPS próprio.** O servidor fala HTTP. Num ambiente real ele ficaria atrás de um proxy com TLS (nginx, Caddy, balanceador), que também ligaria o HSTS. Com `FOGO_COOKIE_SEGURO=1`, o cookie só trafega por HTTPS.
- **Segundo fator (2FA) e recuperação de senha por e-mail.** Exigiriam serviço externo (e-mail/SMS), e o projeto foi feito para rodar sem nenhum.
- **Cadastro de usuários pela tela.** Os usuários são criados na partida e as senhas são trocadas por script. Uma tela de usuários é o próximo passo natural, e a tabela e as funções já existem.
- **Bloqueio de conta após N erros.** Preferimos o limite por IP: o bloqueio por conta permite que um atacante tranque o gestor de propósito.
- **Assinatura das leituras de telemetria (HMAC com data/hora).** O token protege contra quem não o conhece, mas não contra a repetição de uma leitura capturada no meio do caminho. Num dispositivo real o canal seria TLS (o que já impede a captura); a assinatura com relógio é a evolução.
- **Posição do veículo de agente sem vínculo.** A moto ou a viatura só recebe o arredondamento quando está vinculada a um agente (`agentes.equipamento_id`); uma sem agente é só um equipamento.
- **A conferência de sessão do tempo real é a cada 5 s.** A saída do sistema fecha a conexão na hora; sessão que vence ou usuário desativado, em até 5 s.
- **Limite de recusas de telemetria na memória do processo.** Reiniciar o servidor zera a contagem, e vários servidores atrás de um balanceador teriam uma contagem cada.
- **A auditoria não tem prova de adulteração.** Quem tem acesso ao arquivo do banco pode apagar linhas. Para isso, a trilha teria de ser enviada a um armazenamento só de escrita (WORM) ou encadeada por hash.
- **O modo demonstração é um atalho de propósito.** Ele existe para a comissão avaliar sem precisar de senha. Está documentado, aparece no terminal e se desliga com uma variável.

## Como testar

```bash
npx vitest run server/seguranca   # papéis × rotas, sessão, força bruta, CSRF, LGPD, auditoria, tokens e cabeçalhos
npm run e2e                       # inclui "sem sessão: a tela de entrada aparece e a API recusa"
```

Na mão: entre como **Somente consulta**, abra a ficha de um equipamento (sem botões de ação) e tente `fetch('/api/equipamentos/1', { method: 'DELETE' })` no console do navegador: a resposta é 403. Depois entre como **Gestor** e abra **Auditoria**: a tentativa está lá, marcada como "Recusada (403)".
