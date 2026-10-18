// Grava o F.O.G.O. de verdade, cena por cena, para o vídeo de demonstração.
//
// - Chromium do Playwright (o da raiz do app) em 1920×1080, tema "Sala de controle" ligado desde o início.
// - Captura pelo CDP (Page.startScreencast, JPEG 92, todo quadro) com o horário de cada quadro; o ffmpeg monta
//   cada cena a 30 fps respeitando esses horários. Fica bem mais nítido que o recordVideo do Playwright.
// - Um cursor desenhado na página (seta + anel laranja no clique) anda com curva, sem teleporte.
// - Salva em public/gravacoes/dados/ os JSONs da API que alimentam os números grandes do vídeo.
//
// Uso (com o app rodando numa instância própria, nunca a 3333 do usuário):
//   FOGO_URL=http://localhost:3396 node scripts/gravar.mjs            grava todas as cenas
//   FOGO_URL=http://localhost:3396 SECO=1 node scripts/gravar.mjs     ensaio: só tira uma foto no fim de cada cena
//   CENAS=cen-geral,cen-acidente ...                                   só algumas cenas
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

/** Rola a área de conteúdo (main#conteudo) com curva até o elemento ficar a `margem` px do topo. */
async function rolarAte(page, locator, { margem = 96, ms = 1100 } = {}) {
  await locator.waitFor({ state: 'attached', timeout: 15000 });
  const alvo = await locator.evaluate((el, m) => {
    const main = document.getElementById('conteudo');
    return main.scrollTop + el.getBoundingClientRect().top - main.getBoundingClientRect().top - m;
  }, margem);
  await page.evaluate(
    ({ alvo, ms }) =>
      new Promise((pronto) => {
        const main = document.getElementById('conteudo');
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
  const corpo = await resposta.json();
  writeFileSync(join(DADOS, `${nome}.json`), JSON.stringify({ caminho, salvoEm: new Date().toISOString(), dados: corpo }, null, 1));
  return corpo;
}

// ---------- gravação por CDP ----------
function criarGravador(cdp) {
  let ativo = null;
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    if (!ativo) return;
    const n = ativo.quadros.length;
    const arquivo = join(ativo.pasta, `${String(n).padStart(6, '0')}.jpg`);
    ativo.quadros.push({ arquivo, t: metadata.timestamp });
    ativo.escritas.push(writeFile(arquivo, Buffer.from(data, 'base64')));
  });
  return {
    async comecar(nome) {
      const pasta = join(TMP, nome);
      rmSync(pasta, { recursive: true, force: true });
      mkdirSync(pasta, { recursive: true });
      ativo = { nome, pasta, quadros: [], escritas: [] };
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
    },
    async parar() {
      const fim = Date.now() / 1000;
      await cdp.send('Page.stopScreencast');
      const g = ativo;
      ativo = null;
      await Promise.all(g.escritas);
      if (g.quadros.length < 2) throw new Error(`Cena ${g.nome}: só ${g.quadros.length} quadro(s)`);
      const linhas = ['ffconcat version 1.0'];
      g.quadros.forEach((q, i) => {
        const prox = i + 1 < g.quadros.length ? g.quadros[i + 1].t : Math.max(fim, q.t + 1 / 30);
        linhas.push(`file '${q.arquivo}'`, `duration ${Math.max(0.001, prox - q.t).toFixed(4)}`);
      });
      linhas.push(`file '${g.quadros.at(-1).arquivo}'`);
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

// ---------- roteiro ----------
const roteiro = [
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
const contexto = await navegador.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
await contexto.addInitScript(() => {
  try {
    if (!sessionStorage.getItem('video:tema-ok')) {
      localStorage.setItem('fogo:tema', 'escuro');
      sessionStorage.setItem('video:tema-ok', '1');
    }
  } catch {
    /* sem armazenamento */
  }
});
await contexto.addInitScript(instalarCursor);
const page = await contexto.newPage();
const cdp = await contexto.newCDPSession(page);
const gravador = criarGravador(cdp);

await salvarJson(page, 'indicadores-inicio', '/api/central/indicadores');
await salvarJson(page, 'tipos-equipamento', '/api/tipos-equipamento');
await salvarJson(page, 'agentes', '/api/agentes?limite=1');
await salvarJson(page, 'equipamentos', '/api/equipamentos?limite=1');

for (const cena of roteiro) {
  if (SO && !SO.has(cena.nome)) continue;
  console.log(`cena ${cena.nome}`);
  if (cena.preparar) await cena.preparar(page);
  await page.mouse.move(pos.x, pos.y);
  if (SECO) {
    await cena.gravar(page);
    await page.screenshot({ path: join(FOTOS, `${cena.nome}.png`) });
  } else {
    await gravador.comecar(cena.nome);
    await esperar(150);
    await page.mouse.move(pos.x + 1, pos.y);
    await cena.gravar(page);
    await esperar(300);
    await gravador.parar();
  }
  if (cena.depois) await cena.depois(page);
}

await navegador.close();
rmSync(TMP, { recursive: true, force: true });

// duração de cada gravação: a sincronia com a narração usa para saber até onde dá para esticar um plano
const clipes = {};
for (const arquivo of readdirSync(SAIDA).filter((a) => a.endsWith('.mp4')).sort()) {
  const segundos = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(SAIDA, arquivo)], { encoding: 'utf8' });
  clipes[arquivo.replace(/\.mp4$/, '')] = Number(Number(segundos).toFixed(3));
}
writeFileSync(join(DADOS, 'clipes.json'), JSON.stringify({ caminho: 'ffprobe das gravações', dados: clipes }, null, 1));
console.log('pronto');
