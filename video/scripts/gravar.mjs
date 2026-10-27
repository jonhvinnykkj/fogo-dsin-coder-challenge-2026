// Grava o F.O.G.O. de verdade, cena por cena, para o vídeo de demonstração.
//
// - Chromium do Playwright (o da raiz do app) em 1920×1080, tema "Sala de controle" ligado desde o início.
// - Um 2º contexto é o celular do agente (390×844, 2×, toque): as cenas do Modo Campo gravam a Central e o celular
//   AO MESMO TEMPO (<cena>.mp4 e <cena>-celular.mp4, 780×1688), para o vídeo mostrar as duas pontas lado a lado.
// - Captura pelo CDP (Page.startScreencast, JPEG 92, todo quadro) com o horário de cada quadro; o ffmpeg monta
//   cada cena a 30 fps respeitando esses horários. Fica bem mais nítido que o recordVideo do Playwright.
// - Um cursor desenhado na página (seta + anel laranja no clique) anda com curva, sem teleporte; no celular, o toque
//   aparece como um círculo claro no ponto tocado.
// - Tudo exige login: a 1ª cena entra como Gestor pelo botão do modo demonstração; o celular entra como Agente.
// - Salva em public/gravacoes/dados/ os JSONs da API que alimentam os números grandes do vídeo.
//
// Uso (com o app rodando numa instância própria e banco novo, nunca a 3333 do usuário):
//   FOGO_URL=http://localhost:3396 node scripts/gravar.mjs            grava todas as cenas
//   FOGO_URL=http://localhost:3396 SECO=1 node scripts/gravar.mjs     ensaio: só tira uma foto no fim de cada cena
//   CENAS=cen-geral,cen-acidente ...                                   só algumas cenas (o login é feito sem gravar)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.FOGO_URL ?? 'http://localhost:3396';
const SECO = process.env.SECO === '1';
const SO = process.env.CENAS ? new Set(process.env.CENAS.split(',')) : null;
const SAIDA = join(RAIZ, 'public', 'gravacoes');
const DADOS = join(SAIDA, 'dados');
const FOTOS = process.env.FOTOS ?? join(SAIDA, 'ensaio');
const TMP = join(SAIDA, '.quadros');
mkdirSync(DADOS, { recursive: true });
if (SECO) mkdirSync(FOTOS, { recursive: true });

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- cursor desenhado na página ----------
function instalarCursor() {
  const instalar = () => {
    if (document.getElementById('cursor-video')) return;
    const estilo = document.createElement('style');
    estilo.textContent = `
      #cursor-video{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-200px,-200px);filter:drop-shadow(0 2px 3px rgb(0 0 0 / .45))}
      .clique-video{position:fixed;z-index:2147483646;pointer-events:none;width:16px;height:16px;margin:-8px 0 0 -8px;border:4px solid #F04A00;border-radius:50%;animation:clique-video .55s cubic-bezier(.16,1,.3,1) forwards}
      @keyframes clique-video{from{transform:scale(.4);opacity:1}to{transform:scale(3.6);opacity:0}}`;
    document.documentElement.appendChild(estilo);
    const c = document.createElement('div');
    c.id = 'cursor-video';
    c.innerHTML =
      '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M4.5 2.5v16.2l4.3-4.1 3 6.6 3-1.3-3-6.5h6.1z" fill="#fff" stroke="#1E1E1F" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    const pos = window.__cursorVideo ?? { x: -200, y: -200 };
    c.style.transform = `translate(${pos.x - 6}px, ${pos.y - 3}px)`;
    window.addEventListener('mousemove', (e) => {
      window.__cursorVideo = { x: e.clientX, y: e.clientY };
      c.style.transform = `translate(${e.clientX - 6}px, ${e.clientY - 3}px)`;
    }, true);
    window.__cliqueVideo = (x, y) => {
      const a = document.createElement('div');
      a.className = 'clique-video';
      a.style.left = `${x}px`;
      a.style.top = `${y}px`;
      document.documentElement.appendChild(a);
      setTimeout(() => a.remove(), 700);
    };
    window.addEventListener('mousedown', (e) => window.__cliqueVideo(e.clientX, e.clientY), true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', instalar);
  else instalar();
}

// ---------- toque no celular ----------
function instalarToque() {
  const instalar = () => {
    if (document.getElementById('toque-video-estilo')) return;
    const estilo = document.createElement('style');
    estilo.id = 'toque-video-estilo';
    estilo.textContent = `
      .toque-video{position:fixed;z-index:2147483647;pointer-events:none;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgb(255 255 255 / .5);border:2px solid rgb(255 255 255 / .85);box-shadow:0 2px 10px rgb(0 0 0 / .35);animation:toque-video .62s cubic-bezier(.16,1,.3,1) forwards}
      @keyframes toque-video{0%{transform:scale(.55);opacity:0}18%{transform:scale(1);opacity:1}55%{transform:scale(1);opacity:1}100%{transform:scale(1.25);opacity:0}}`;
    document.documentElement.appendChild(estilo);
    window.__toqueVideo = (x, y) => {
      const a = document.createElement('div');
      a.className = 'toque-video';
      a.style.left = `${x}px`;
      a.style.top = `${y}px`;
      document.documentElement.appendChild(a);
      setTimeout(() => a.remove(), 700);
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', instalar);
  else instalar();
}

/** Rola até o elemento (se ele não estiver inteiro na tela) e toca no centro dele, mostrando o círculo do toque. */
async function tocar(page, locator, { depois = 600, margem = 140 } = {}) {
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  const caixa = await locator.boundingBox();
  const altura = page.viewportSize().height;
  if (!caixa || caixa.y < 70 || caixa.y + caixa.height > altura - 40) await rolarAte(page, locator, { margem, ms: 700 });
  const c = await centro(locator);
  await page.evaluate(({ x, y }) => window.__toqueVideo?.(x, y), c);
  await esperar(150);
  await page.touchscreen.tap(c.x, c.y);
  await esperar(depois);
}

// ---------- ações com cursor ----------
let pos = { x: 960, y: 600 };

async function mover(page, x, y, ms = 650) {
  const passos = Math.max(10, Math.round(ms / 16));
  const { x: x0, y: y0 } = pos;
  for (let i = 1; i <= passos; i++) {
    const t = i / passos;
    const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    await page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
    await esperar(14);
  }
  pos = { x, y };
}

async function centro(locator) {
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  const caixa = await locator.boundingBox();
  if (!caixa) throw new Error('Elemento sem caixa na tela');
  return { x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 };
}

async function clicar(page, locator, { ms = 650, depois = 500, dx = 0, dy = 0 } = {}) {
  const c = await centro(locator);
  await mover(page, c.x + dx, c.y + dy, ms);
  await esperar(160);
  await page.mouse.down();
  await esperar(70);
  await page.mouse.up();
  await esperar(depois);
}

/** Select nativo: o menu do sistema não aparece na captura, então mostramos o cursor e o anel e trocamos o valor. */
async function escolher(page, locator, valor, { depois = 700 } = {}) {
  const c = await centro(locator);
  await mover(page, c.x, c.y);
  await esperar(160);
  await page.evaluate(({ x, y }) => window.__cliqueVideo?.(x, y), c);
  await esperar(260);
  await locator.selectOption({ label: valor });
  await esperar(depois);
}

async function digitar(page, locator, texto, { atraso = 95, depois = 500 } = {}) {
  await clicar(page, locator, { depois: 200 });
  await page.keyboard.type(texto, { delay: atraso });
  await esperar(depois);
}

/** Rola a área de conteúdo (main#conteudo; fora do app, como no Boletim e no celular, a própria página) com curva até
 *  o elemento ficar a `margem` px do topo. */
async function rolarAte(page, locator, { margem = 96, ms = 1100 } = {}) {
  await locator.waitFor({ state: 'attached', timeout: 15000 });
  const alvo = await locator.evaluate((el, m) => {
    const main = document.getElementById('conteudo') ?? document.scrollingElement;
    const topo = main === document.scrollingElement ? 0 : main.getBoundingClientRect().top;
    return main.scrollTop + el.getBoundingClientRect().top - topo - m;
  }, margem);
  await page.evaluate(
    ({ alvo, ms }) =>
      new Promise((pronto) => {
        const main = document.getElementById('conteudo') ?? document.scrollingElement;
        const de = main.scrollTop;
        const max = main.scrollHeight - main.clientHeight;
        const ate = Math.max(0, Math.min(max, alvo));
        const t0 = performance.now();
        const passo = (agora) => {
          const t = Math.min(1, (agora - t0) / ms);
          const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
          main.scrollTop = de + (ate - de) * e;
          if (t < 1) requestAnimationFrame(passo);
          else pronto();
        };
        requestAnimationFrame(passo);
      }),
    { alvo, ms },
  );
  await esperar(250);
}

async function salvarJson(page, nome, caminho) {
  const resposta = await page.request.get(BASE + caminho);
  if (!resposta.ok()) throw new Error(`${caminho}: HTTP ${resposta.status()}`);
  const corpo = await resposta.json();
  writeFileSync(join(DADOS, `${nome}.json`), JSON.stringify({ caminho, salvoEm: new Date().toISOString(), dados: corpo }, null, 1));
  return corpo;
}

// ---------- gravação por CDP ----------
function criarGravador(cdp, { largura = 1920, altura = 1080, sufixo = '' } = {}) {
  let ativo = null;
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    if (!ativo) return;
    const n = ativo.quadros.length;
    const arquivo = join(ativo.pasta, `${String(n).padStart(6, '0')}.jpg`);
    ativo.quadros.push({ arquivo, t: metadata.timestamp, chegou: Date.now() / 1000 });
    ativo.escritas.push(writeFile(arquivo, Buffer.from(data, 'base64')));
  });
  return {
    async comecar(cena) {
      const nome = cena + sufixo;
      const pasta = join(TMP, nome);
      rmSync(pasta, { recursive: true, force: true });
      mkdirSync(pasta, { recursive: true });
      ativo = { nome, pasta, quadros: [], escritas: [], inicio: Date.now() / 1000 };
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: largura, maxHeight: altura, everyNthFrame: 1 });
    },
    /** `fim` comum às duas gravações de uma cena com Central e celular (o ffmpeg da 1ª demora e trava o Node). */
    async parar(fim = Date.now() / 1000) {
      await cdp.send('Page.stopScreencast');
      const g = ativo;
      ativo = null;
      await Promise.all(g.escritas);
      // Os quadros podem chegar fora de ordem, e o 1º de uma página parada traz a hora da última pintura (às vezes
      // segundos antes de começar a gravar). Fica: o último quadro pintado até o início, valendo desde o início, e os
      // seguintes até o fim. Assim Central e celular gravados juntos têm o mesmo começo e o mesmo fim.
      g.quadros.sort((a, b) => a.t - b.t);
      if (process.env.DEPURAR) console.log(`  [${g.nome}] inicio ${g.inicio.toFixed(3)} fim ${fim.toFixed(3)} (${(fim - g.inicio).toFixed(2)} s) · 1º ${g.quadros[0]?.t.toFixed(3)} último ${g.quadros.at(-1)?.t.toFixed(3)} · chegada 1º ${g.quadros[0]?.chegou?.toFixed(3)} · ${g.quadros.length} quadros`);
      const antes = g.quadros.filter((q) => q.t <= g.inicio).length;
      g.quadros = g.quadros.slice(Math.max(0, antes - 1)).filter((q) => q.t <= fim);
      if (g.quadros.length < 2) throw new Error(`Cena ${g.nome}: só ${g.quadros.length} quadro(s)`);
      g.quadros[0].t = g.inicio;
      // Uma entrada por quadro de saída (30 por segundo), com o último quadro capturado até aquele instante. Com uma
      // duração longa no último quadro, o concat do ffmpeg a contava duas vezes (5 s parados viravam 10 s).
      const linhas = ['ffconcat version 1.0'];
      const total = Math.max(2, Math.round((fim - g.inicio) * 30));
      for (let k = 0, j = 0; k < total; k++) {
        const instante = g.inicio + k / 30;
        while (j + 1 < g.quadros.length && g.quadros[j + 1].t <= instante) j++;
        linhas.push(`file '${g.quadros[j].arquivo}'`, 'duration 0.033333');
      }
      const lista = join(g.pasta, 'lista.txt');
      writeFileSync(lista, linhas.join('\n'));
      const destino = join(SAIDA, `${g.nome}.mp4`);
      execFileSync('ffmpeg', [
        '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lista,
        '-vf', 'fps=30,scale=in_range=full:out_range=tv,format=yuv420p',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-color_range', 'tv', '-movflags', '+faststart', destino,
      ]);
      rmSync(g.pasta, { recursive: true, force: true });
      const duracao = g.quadros.at(-1).t - g.quadros[0].t;
      console.log(`  ${g.nome}.mp4: ${g.quadros.length} quadros capturados em ${duracao.toFixed(1)} s (${(g.quadros.length / Math.max(duracao, 0.1)).toFixed(1)} q/s)`);
    },
  };
}

// ---------- login ----------
/** Botão de um papel na tela de entrada (o nome acessível junta etiqueta, papel e descrição; o papel vem em negrito). */
const botaoPapel = (page, papel) => page.getByRole('button').filter({ has: page.getByText(papel, { exact: true }) });

/** Entra sem gravar (usado quando só algumas cenas são gravadas, e para trocar de papel entre cenas). */
async function entrarComo(page, papel) {
  await page.goto(BASE + '/entrar');
  await botaoPapel(page, papel).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 15000 });
}

async function sair(page) {
  await page.request.post(BASE + '/api/auth/sair');
}

/** O agente do celular (o usuário "agente" do modo demonstração) e o equipamento mais perto dele. */
let agenteId = null;
async function agenteDoCelular(c) {
  if (agenteId === null) agenteId = (await (await c.request.get(BASE + '/api/auth/eu')).json()).usuario.agenteId;
  return agenteId;
}

/** Deixa o agente livre e em serviço antes do despacho: o simulador manda agentes o tempo todo. */
async function liberarAgente(c) {
  const id = await agenteDoCelular(c);
  const { despacho } = await (await c.request.get(`${BASE}/api/campo/agentes/${id}/despacho`)).json();
  if (despacho) {
    const o = despacho.ocorrencia.id;
    if (!despacho.chegouEm) await c.request.post(`${BASE}/api/campo/agentes/${id}/despachos/${o}/chegada`);
    await c.request.post(`${BASE}/api/campo/agentes/${id}/despachos/${o}/conclusao`);
  }
}

// ---------- roteiro ----------
// Cada cena recebe (página da Central, { d: Central, c: celular }). `grava` diz quem é gravado: 'd' (padrão), 'c' ou 'dc'.
const roteiro = [
  {
    nome: 'entrar',
    preparar: async (page) => {
      // aquece o cache (blocos do mapa e a tela da Central) para o mapa não aparecer cinza logo depois do login
      await entrarComo(page, 'Gestor');
      await page.getByRole('region', { name: 'Indicadores da cidade' }).waitFor();
      await page.waitForTimeout(5000);
      await sair(page);
      await page.goto(BASE + '/entrar');
      await botaoPapel(page, 'Gestor').waitFor();
      await page.waitForTimeout(1500);
    },
    gravar: async (page) => {
      await mover(page, 960, 300, 600);
      for (const papel of ['Somente consulta', 'Agente em campo', 'Operador da central']) {
        const c = await centro(botaoPapel(page, papel));
        await mover(page, c.x + 90, c.y, 420);
        await esperar(260);
      }
      await clicar(page, botaoPapel(page, 'Gestor'), { depois: 200 });
      await page.getByRole('region', { name: 'Indicadores da cidade' }).waitFor();
      await mover(page, 1500, 140, 900);
      await esperar(2600);
    },
    depois: async (page) => {
      await salvarJson(page, 'indicadores-inicio', '/api/central/indicadores');
      await salvarJson(page, 'tipos-equipamento', '/api/tipos-equipamento');
      await salvarJson(page, 'agentes', '/api/agentes?limite=1');
      await salvarJson(page, 'equipamentos', '/api/equipamentos?limite=1');
    },
  },
  {
    nome: 'inv-lista',
    preparar: async (page) => {
      await page.goto(BASE + '/equipamentos');
      await page.locator('tbody tr').nth(9).waitFor();
    },
    gravar: async (page) => {
      await mover(page, 1100, 420, 500);
      await escolher(page, page.getByRole('combobox', { name: 'Tipo' }), 'Radar de fiscalização', { depois: 800 });
      await escolher(page, page.getByRole('combobox', { name: 'Região' }), 'Centro', { depois: 800 });
      await digitar(page, page.getByRole('searchbox', { name: 'Buscar equipamentos' }), 'Avenida', { depois: 1100 });
      await mover(page, 900, 470, 700);
      await esperar(500);
      await clicar(page, page.locator('tbody tr', { hasText: 'Operacional' }).first().getByRole('link').first(), { depois: 150 });
    },
  },
  {
    nome: 'inv-ficha',
    preparar: async (page) => {
      await page.getByRole('region', { name: 'Características do tipo' }).waitFor();
      await page.waitForTimeout(2500); // blocos do minimapa
    },
    gravar: async (page) => {
      await mover(page, 700, 330, 500);
      await esperar(900);
      await rolarAte(page, page.getByRole('region', { name: 'Características do tipo' }), { ms: 1300 });
      await mover(page, 900, 300, 600);
      await esperar(1300);
      await rolarAte(page, page.getByRole('region', { name: /Telemetria/ }), { ms: 1100 });
      await mover(page, 1100, 420, 700);
      await esperar(1500);
      await rolarAte(page, page.getByRole('region', { name: 'Manutenções' }), { ms: 1000 });
      await esperar(1300);
    },
  },
  {
    nome: 'inv-novo',
    preparar: async (page) => {
      await page.goto(BASE + '/equipamentos/novo');
      await page.getByRole('combobox', { name: 'Tipo de equipamento' }).waitFor();
      await page.waitForTimeout(600);
    },
    gravar: async (page) => {
      await escolher(page, page.getByRole('combobox', { name: 'Tipo de equipamento' }), 'Câmera de videomonitoramento', { depois: 700 });
      await rolarAte(page, page.getByRole('region', { name: 'Localização' }), { ms: 900, margem: 40 });
      await digitar(page, page.getByRole('textbox', { name: 'CEP' }), '17500020', { depois: 1300 });
      await digitar(page, page.getByRole('textbox', { name: 'Referência (opcional)' }), 'em frente à praça', { atraso: 70, depois: 400 });
      const cidade = await centro(page.getByRole('textbox', { name: 'Cidade/UF' }));
      await mover(page, cidade.x - 60, cidade.y, 600);
      await esperar(700);
      const mapa = page.getByRole('region', { name: 'Mapa para escolher o ponto' });
      await rolarAte(page, mapa, { ms: 900, margem: 160 });
      await clicar(page, mapa, { dx: 40, dy: 10, depois: 1300 });
      const caracteristicas = page.getByRole('region', { name: /Características/ });
      await rolarAte(page, caracteristicas, { ms: 1000, margem: 120 });
      const noturna = caracteristicas.getByRole('checkbox').first();
      if (await noturna.count()) await clicar(page, noturna, { depois: 600 });
      const resolucao = caracteristicas.getByRole('combobox').first();
      if (await resolucao.count()) {
        const opcoes = await resolucao.locator('option').allTextContents();
        await escolher(page, resolucao, opcoes.at(-1), { depois: 900 });
      }
      await esperar(700);
    },
  },
  {
    nome: 'inv-agentes',
    preparar: async (page) => {
      await page.goto(BASE + '/agentes');
      await page.locator('tbody tr').nth(9).waitFor();
      await page.waitForTimeout(500);
    },
    gravar: async (page) => {
      await mover(page, 900, 380, 600);
      await esperar(500);
      await mover(page, 1000, 620, 1400);
      await esperar(900);
    },
  },
  {
    nome: 'cen-geral',
    preparar: async (page) => {
      await page.goto(BASE + '/');
      await page.getByRole('region', { name: 'Indicadores da cidade' }).waitFor();
      await page.waitForTimeout(3500);
    },
    gravar: async (page) => {
      await mover(page, 380, 120, 700);
      await mover(page, 1500, 120, 1500);
      await esperar(300);
      await mover(page, 1720, 420, 900);
      await esperar(1200);
    },
  },
  {
    nome: 'cen-acidente',
    preparar: async (page) => {
      await page.getByRole('button', { name: 'Injetar evento' }).waitFor();
    },
    gravar: async (page) => {
      await clicar(page, page.getByRole('button', { name: 'Injetar evento' }), { depois: 700 });
      await clicar(page, page.getByRole('list', { name: 'Evento para injetar na cidade' }).getByRole('button', { name: /Acidente/ }), { depois: 200 });
      // o mapa voa sozinho até o acidente; o cursor sai de cima do mapa para não abrir a dica dos bairros
      await mover(page, 1720, 300, 900);
      await esperar(6500);
    },
    depois: async (page) => {
      await salvarJson(page, 'central-indicadores', '/api/central/indicadores');
      await salvarJson(page, 'central-regioes', '/api/central/regioes');
    },
  },
  {
    nome: 'cen-ficha',
    gravar: async (page) => {
      const mapa = page.getByRole('region', { name: /Mapa ao vivo de Marília/ });
      const caixa = await mapa.boundingBox();
      const marcadores = mapa.getByRole('button', { name: /^FOGO-(RAD|CAM|SEM|BAL)-\d+, / });
      let alvo = null;
      for (let i = 0; i < (await marcadores.count()); i++) {
        const b = await marcadores.nth(i).boundingBox();
        if (b && b.x > caixa.x + 80 && b.x < caixa.x + caixa.width - 80 && b.y > caixa.y + 80 && b.y < caixa.y + caixa.height - 120) {
          alvo = marcadores.nth(i);
          break;
        }
      }
      if (!alvo) alvo = marcadores.first();
      await clicar(page, alvo, { depois: 700 });
      await mover(page, 1720, 560, 900);
      await esperar(3000);
    },
  },
  {
    nome: 'cen-filtro',
    preparar: async (page) => {
      const fechar = page.getByRole('button', { name: /Fechar ficha|Fechar/ }).first();
      if (await fechar.count()) await fechar.click().catch(() => {});
      await page.goto(BASE + '/');
      await page.getByRole('region', { name: 'Indicadores da cidade' }).waitFor();
      await page.waitForTimeout(2500);
    },
    gravar: async (page) => {
      await clicar(page, page.getByRole('button', { name: 'Filtros', exact: true }), { depois: 800 });
      const situacao = page.getByRole('group', { name: 'Situação' });
      if (await situacao.count()) {
        await clicar(page, situacao.getByRole('button', { name: /Furtado/ }), { depois: 700 });
        await clicar(page, situacao.getByRole('button', { name: /Mau funcionamento/ }), { depois: 1800 });
      } else {
        await esperar(1500);
      }
      await mover(page, 1720, 520, 900);
      await esperar(1800);
    },
  },
  {
    nome: 'cen-regioes',
    preparar: async (page) => {
      await page.goto(BASE + '/');
      await page.getByRole('region', { name: 'Indicadores da cidade' }).waitFor();
      await page.waitForTimeout(2500);
    },
    gravar: async (page) => {
      await clicar(page, page.getByRole('tab', { name: /Regiões/ }), { depois: 900 });
      await mover(page, 1700, 520, 900);
      await esperar(2600);
    },
  },
  {
    nome: 'cen-60x',
    gravar: async (page) => {
      await clicar(page, page.getByRole('tab', { name: /Alertas/ }), { depois: 400 });
      await clicar(page, page.getByRole('button', { name: '60×' }), { depois: 7000 });
    },
  },
  {
    nome: 'cen-calor',
    gravar: async (page) => {
      await clicar(page, page.getByRole('button', { name: 'Calor de ocorrências' }), { depois: 4200 });
    },
    depois: async (page) => {
      await page.getByRole('button', { name: '1×' }).click();
      await page.getByRole('button', { name: 'Calor de ocorrências' }).click();
    },
  },
  // ---------- Modo Campo: o celular do agente ----------
  {
    nome: 'campo-entrar',
    grava: 'c',
    preparar: async (_d, { c }) => {
      // o simulador despacha agentes o tempo todo: entra sem gravar, libera o agente e sai, para o painel abrir limpo;
      // a visita também deixa a tela do Campo em cache (sem ela, o toque mostra "Carregando…" por segundos)
      await entrarComo(c, 'Agente em campo');
      await c.getByRole('heading', { name: 'Minha situação' }).waitFor();
      await c.waitForTimeout(1500);
      await liberarAgente(c);
      await sair(c);
      await c.goto(BASE + '/entrar');
      await botaoPapel(c, 'Agente em campo').waitFor();
      await c.waitForTimeout(1200);
    },
    gravar: async (_d, { c }) => {
      // 1º plano do capítulo: a tela de entrada fica no monitor da abertura (~5,4 s) antes do toque
      await esperar(5400);
      await tocar(c, botaoPapel(c, 'Agente em campo'), { depois: 200 });
      await c.getByRole('heading', { name: 'Minha situação' }).waitFor();
      await esperar(4800);
    },
  },
  {
    nome: 'campo-situacao',
    grava: 'c',
    gravar: async (_d, { c }) => {
      const grupo = c.getByRole('group', { name: 'Minha situação' });
      await esperar(400);
      await tocar(c, grupo.getByRole('button', { name: 'Em pausa' }), { depois: 1500 });
      await tocar(c, grupo.getByRole('button', { name: 'Em serviço' }), { depois: 1600 });
    },
  },
  {
    nome: 'campo-despacho',
    grava: 'dc',
    preparar: async (page, { c }) => {
      await liberarAgente(c);
      const id = await agenteDoCelular(c);
      const proximos = await salvarJson(c, 'campo-proximos', `/api/campo/agentes/${id}/equipamentos-proximos`);
      const alvo = (proximos.itens ?? proximos)[0];
      // o acidente injetado pela Central nasce ao lado do agente do celular, para o despacho ir para ele
      await page.route('**/api/simulacao/eventos', async (rota) => {
        const corpo = JSON.parse(rota.request().postData() ?? '{}');
        if (corpo.tipo === 'acidente') corpo.alvoId = alvo.id;
        await rota.continue({ postData: JSON.stringify(corpo) });
      });
      await page.goto(BASE + '/');
      await page.getByRole('region', { name: 'Indicadores da cidade' }).waitFor();
      await page.waitForTimeout(2500);
      await c.evaluate(() => window.scrollTo(0, 0));
      await c.getByRole('heading', { name: 'Despacho', exact: true }).waitFor();
      await c.waitForTimeout(800);
    },
    gravar: async (page, { c }) => {
      await liberarAgente(c); // de novo: o simulador pode ter despachado o agente enquanto a Central carregava
      await clicar(page, page.getByRole('button', { name: 'Injetar evento' }), { depois: 700 });
      await clicar(page, page.getByRole('list', { name: 'Evento para injetar na cidade' }).getByRole('button', { name: /Acidente/ }), { depois: 200 });
      // o cursor para na linha "N críticos · N abertos", sem passar por cima do alerta novo
      await mover(page, 1640, 231, 900);
      await c.getByText('Novo despacho!').waitFor({ timeout: 10000 });
      await c.getByText('Acidente', { exact: true }).waitFor({ timeout: 3000 }); // o despacho é o acidente injetado
      // a distância na hora do despacho (segundos depois o agente já chegou e ela vira 0 m)
      await salvarJson(c, 'campo-despacho', `/api/campo/agentes/${await agenteDoCelular(c)}/despacho`);
      await esperar(5100);
    },
    depois: async (page) => {
      await page.unroute('**/api/simulacao/eventos');
    },
  },
  {
    nome: 'campo-chegada',
    grava: 'dc',
    gravar: async (page, { c }) => {
      await esperar(500);
      await tocar(c, c.getByRole('button', { name: 'Cheguei ao local' }), { depois: 1800 });
      await tocar(c, c.getByRole('button', { name: 'Concluir ocorrência' }), { depois: 3800 });
    },
  },
  {
    nome: 'campo-relato',
    grava: 'dc',
    gravar: async (page, { c }) => {
      await esperar(400);
      await rolarAte(c, c.getByRole('heading', { name: 'Perto de mim' }), { margem: 80, ms: 1000 });
      await esperar(700);
      const botoes = c.getByRole('button', { name: /^Relatar problema em FOGO-(RAD|SEM|CAM|PMV|CAN)-/ });
      const botao = (await botoes.count()) ? botoes.first() : c.getByRole('button', { name: /^Relatar problema em / }).first();
      await tocar(c, botao, { depois: 900 });
      await tocar(c, c.getByRole('radio', { name: 'Mau funcionamento' }), { depois: 500 });
      await tocar(c, c.getByRole('textbox', { name: /Observação/ }), { depois: 300 });
      await c.keyboard.type('Não liga desde cedo.', { delay: 85 });
      await esperar(500);
      await tocar(c, c.getByRole('button', { name: 'Enviar relato' }), { depois: 900 });
      // a confirmação aparece no topo de "Perto de mim"
      await rolarAte(c, c.getByRole('heading', { name: 'Perto de mim' }), { margem: 80, ms: 800 });
      await esperar(2800);
    },
    depois: async (page) => {
      await salvarJson(page, 'central-indicadores-campo', '/api/central/indicadores');
    },
  },
  {
    nome: 'prev-resumo',
    preparar: async (page) => {
      await page.goto(BASE + '/previsoes');
      await page.getByRole('region', { name: 'Resumo do dia' }).waitFor();
      await page.getByRole('region', { name: 'Índice de risco do dia' }).waitFor({ timeout: 60000 });
      await page.waitForTimeout(1500);
      await salvarJson(page, 'previsoes-backtest', '/api/previsoes/backtest');
      await salvarJson(page, 'previsoes-semana', '/api/previsoes/risco?horas=168');
      await salvarJson(page, 'bairros', '/api/bairros');
      await salvarJson(page, 'previsoes-resumo', '/api/previsoes/resumo');
    },
    gravar: async (page) => {
      await mover(page, 600, 420, 700);
      await mover(page, 640, 760, 1500);
      await esperar(400);
      const card = page.getByRole('region', { name: 'Resumo do dia' }).getByRole('region', { name: 'Como esta previsão funciona' });
      const c = await centro(card);
      await mover(page, c.x, c.y - 60, 1000);
      await esperar(1600);
    },
  },
  {
    nome: 'prev-risco',
    gravar: async (page) => {
      await rolarAte(page, page.getByRole('region', { name: 'Risco nas próximas 24 horas' }), { ms: 1200, margem: 24 });
      await clicar(page, page.getByRole('button', { name: 'Tocar' }), { depois: 400 });
      await mover(page, 900, 500, 1000);
      await esperar(5200);
    },
  },
  {
    nome: 'prev-semana',
    gravar: async (page) => {
      await rolarAte(page, page.getByRole('region', { name: 'Próximos 7 dias' }), { ms: 1200, margem: 24 });
      await page.getByRole('gridcell').first().waitFor({ timeout: 60000 });
      await esperar(500);
      const celulas = page.getByRole('gridcell', { name: /muito alto|alto/ });
      const celula = (await celulas.count()) ? celulas.nth(Math.min(6, (await celulas.count()) - 1)) : page.getByRole('gridcell').nth(40);
      await clicar(page, celula, { depois: 900 });
      await mover(page, pos.x + 120, pos.y + 160, 900);
      await esperar(2800);
    },
  },
  {
    nome: 'prev-acertou',
    gravar: async (page) => {
      await rolarAte(page, page.getByRole('region', { name: 'Quanto o modelo acertou' }), { ms: 1300, margem: 24 });
      await mover(page, 700, 330, 900);
      await esperar(900);
      const grafico = page.getByRole('img', { name: /Erro por dia/ });
      const g = await centro(grafico);
      await mover(page, g.x + 120, g.y, 1000);
      await esperar(2200);
    },
  },
  {
    nome: 'prev-reforco',
    gravar: async (page) => {
      await rolarAte(page, page.getByRole('region', { name: 'Reforço de agentes' }), { ms: 1200, margem: 24 });
      await mover(page, 760, 420, 900);
      await esperar(2600);
    },
  },
  {
    nome: 'prev-falhas',
    gravar: async (page) => {
      await rolarAte(page, page.getByRole('region', { name: 'Falhas prováveis' }), { ms: 1200, margem: 24 });
      await mover(page, 900, 460, 900);
      await esperar(2600);
    },
  },
  // ---------- Boletim do dia, papéis e auditoria ----------
  {
    nome: 'boletim',
    preparar: async (page) => {
      await page.goto(BASE + '/boletim');
      await page.getByRole('heading', { name: 'Boletim do dia' }).waitFor();
      await page.getByRole('heading', { name: 'Maior chance de falha em 7 dias' }).waitFor({ timeout: 60000 });
      await page.waitForTimeout(2500);
    },
    gravar: async (page) => {
      // 1º plano do capítulo: a folha fica no topo enquanto o monitor da abertura abre (~5,4 s)
      await esperar(5000);
      const imprimir = await centro(page.getByRole('button', { name: 'Imprimir / Salvar PDF' }));
      await mover(page, imprimir.x, imprimir.y, 800);
      await esperar(1400);
      await mover(page, 1500, 560, 700);
      for (const titulo of ['Situação das regiões', 'Bairros de maior risco nas próximas 24 h', 'Alertas críticos abertos', 'Manutenção vencida ou nos próximos 7 dias', 'Maior chance de falha em 7 dias']) {
        await rolarAte(page, page.getByRole('heading', { name: titulo }), { margem: 90, ms: 1100 });
        await esperar(1000);
      }
    },
    depois: async (page) => {
      await salvarJson(page, 'central-indicadores-boletim', '/api/central/indicadores');
    },
  },
  {
    nome: 'boletim-csv',
    preparar: async (page) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(600);
    },
    gravar: async (page) => {
      const grupo = page.getByRole('group', { name: 'Exportar CSV' });
      await mover(page, (await centro(grupo)).x, (await centro(grupo)).y + 60, 700);
      await esperar(500);
      const espera = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
      await clicar(page, grupo.getByRole('button').first(), { depois: 400 });
      await espera;
      await esperar(1800);
    },
  },
  {
    nome: 'consulta',
    preparar: async (page) => {
      await sair(page);
      await page.goto(BASE + '/entrar');
      await botaoPapel(page, 'Somente consulta').waitFor();
      await page.waitForTimeout(1200);
    },
    gravar: async (page) => {
      await clicar(page, botaoPapel(page, 'Somente consulta'), { depois: 200 });
      await page.getByRole('region', { name: 'Indicadores da cidade' }).waitFor();
      await esperar(1500);
      await clicar(page, page.getByRole('link', { name: 'Agentes', exact: true }).first(), { depois: 300 });
      await page.locator('tbody tr').nth(9).waitFor();
      await esperar(600);
      await mover(page, 1200, 360, 900);
      await mover(page, 1250, 640, 1400);
      await esperar(1600);
    },
  },
  {
    nome: 'auditoria',
    preparar: async (page) => {
      await sair(page);
      await entrarComo(page, 'Gestor');
      await page.goto(BASE + '/auditoria');
      await page.locator('tbody tr').nth(5).waitFor();
      await page.waitForTimeout(1200);
    },
    gravar: async (page) => {
      await mover(page, 900, 360, 700);
      await esperar(900);
      await mover(page, 1000, 700, 2200);
      await esperar(2600);
    },
    depois: async (page) => {
      await salvarJson(page, 'auditoria', '/api/auditoria?limite=1');
    },
  },
  {
    nome: 'tema',
    preparar: async (page) => {
      await page.goto(BASE + '/');
      await page.getByRole('region', { name: 'Indicadores da cidade' }).waitFor();
      await page.waitForTimeout(2500);
    },
    gravar: async (page) => {
      await clicar(page, page.getByRole('button', { name: 'Sala de controle' }), { depois: 2600 });
    },
  },
];

// ---------- execução ----------
const navegador = await chromium.launch({ args: ['--hide-scrollbars'] });
const temaEscuro = () => {
  try {
    if (!sessionStorage.getItem('video:tema-ok')) {
      localStorage.setItem('fogo:tema', 'escuro');
      sessionStorage.setItem('video:tema-ok', '1');
    }
  } catch {
    /* sem armazenamento */
  }
};
const comum = { locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', acceptDownloads: true };
const contexto = await navegador.newContext({ ...comum, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await contexto.addInitScript(temaEscuro);
await contexto.addInitScript(instalarCursor);
const page = await contexto.newPage();
const gravador = criarGravador(await contexto.newCDPSession(page));

// navegador próprio para o celular: só com a escala forçada o screencast entrega 780×1688 (sem ela, 390×844)
const navegadorCelular = await chromium.launch({ args: ['--hide-scrollbars', '--force-device-scale-factor=2'] });
const contextoCelular = await navegadorCelular.newContext({
  ...comum,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
});
await contextoCelular.addInitScript(temaEscuro);
await contextoCelular.addInitScript(instalarToque);
const celular = await contextoCelular.newPage();
const gravadorCelular = criarGravador(await contextoCelular.newCDPSession(celular), { largura: 780, altura: 1688, sufixo: '-celular' });

// Gravando só algumas cenas: entra sem gravar (Gestor na Central; o celular, se alguma cena do Modo Campo vier depois do login dele).
if (SO && !SO.has('entrar')) {
  await entrarComo(page, 'Gestor');
  await roteiro.find((c) => c.nome === 'entrar').depois(page);
}
if (SO && !SO.has('campo-entrar') && roteiro.some((c) => SO.has(c.nome) && c.nome.startsWith('campo-'))) await entrarComo(celular, 'Agente em campo');

const paginas = { d: page, c: celular };
for (const cena of roteiro) {
  if (SO && !SO.has(cena.nome)) continue;
  console.log(`cena ${cena.nome}`);
  const grava = cena.grava ?? 'd';
  if (cena.preparar) await cena.preparar(page, paginas);
  await page.mouse.move(pos.x, pos.y);
  if (SECO) {
    await cena.gravar(page, paginas);
    if (grava.includes('d')) await page.screenshot({ path: join(FOTOS, `${cena.nome}.png`) });
    if (grava.includes('c')) await celular.screenshot({ path: join(FOTOS, `${cena.nome}-celular.png`) });
  } else {
    if (grava.includes('d')) await gravador.comecar(cena.nome);
    if (grava.includes('c')) await gravadorCelular.comecar(cena.nome);
    await esperar(150);
    await page.mouse.move(pos.x + 1, pos.y);
    await cena.gravar(page, paginas);
    await esperar(300);
    const fim = Date.now() / 1000;
    if (grava.includes('d')) await gravador.parar(fim);
    if (grava.includes('c')) await gravadorCelular.parar(fim);
  }
  if (cena.depois) await cena.depois(page, paginas);
}

await navegador.close();
await navegadorCelular.close();
rmSync(TMP, { recursive: true, force: true });

// duração de cada gravação: a sincronia com a narração usa para saber até onde dá para esticar um plano
const clipes = {};
for (const arquivo of readdirSync(SAIDA).filter((a) => a.endsWith('.mp4')).sort()) {
  const segundos = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(SAIDA, arquivo)], { encoding: 'utf8' });
  clipes[arquivo.replace(/\.mp4$/, '')] = Number(Number(segundos).toFixed(3));
}
writeFileSync(join(DADOS, 'clipes.json'), JSON.stringify({ caminho: 'ffprobe das gravações', dados: clipes }, null, 1));
console.log('pronto');
