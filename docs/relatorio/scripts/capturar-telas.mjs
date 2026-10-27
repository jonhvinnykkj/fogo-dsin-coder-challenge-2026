// Captura as telas do F.O.G.O. para o relatório técnico (JPEG qualidade 85, tema claro, exceto a Sala de controle).
//
// - Computador: 1440×900 a 2× (captura da janela; fullPage só onde indicado).
// - Celular (Modo Campo): contexto separado, 390×844 a 3×, toque, user agent de iPhone.
// - Reaproveita as soluções do video/scripts/gravar.mjs: entrar pelo botão de papel, liberar o agente do celular e a
//   interceptação de /api/simulacao/eventos que põe o acidente injetado ao lado do agente do celular.
// - Salva também, em docs/relatorio/dados/, o JSON cru da API (sessão de gestor, mesmo banco das capturas).
//
// Uso (instância própria, banco novo, nunca a 3333 do usuário), a partir da raiz do repositório:
//   PORT=3397 FOGO_DB=/caminho/relatorio.db npm start        (em outro terminal)
//   FOGO_URL=http://localhost:3397 node docs/relatorio/scripts/capturar-telas.mjs
//   SO=01,02,10 ...   captura só algumas (pelo prefixo do número); o login é feito antes.
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.FOGO_URL ?? 'http://localhost:3397';
const CAPTURAS = join(RAIZ, 'capturas');
const DADOS = join(RAIZ, 'dados');
mkdirSync(CAPTURAS, { recursive: true });
mkdirSync(DADOS, { recursive: true });

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const SO = process.env.SO ? new Set(process.env.SO.split(',')) : null;
const quer = (n) => !SO || SO.has(n);

const relato = { arquivos: {}, avisos: [], numeros: {} };
const aviso = (m) => {
  console.log('  AVISO:', m);
  relato.avisos.push(m);
};

// ---------- ajudantes (vindos do gravar.mjs) ----------
const botaoPapel = (page, papel) => page.getByRole('button').filter({ has: page.getByText(papel, { exact: true }) });

async function entrarComo(page, papel) {
  await page.goto(BASE + '/entrar');
  await botaoPapel(page, papel).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 15000 });
}

async function sair(page) {
  await page.request.post(BASE + '/api/auth/sair');
}

let agenteId = null;
async function agenteDoCelular(c) {
  if (agenteId === null) agenteId = (await (await c.request.get(BASE + '/api/auth/eu')).json()).usuario.agenteId;
  return agenteId;
}

async function liberarAgente(c) {
  const id = await agenteDoCelular(c);
  const { despacho } = await (await c.request.get(`${BASE}/api/campo/agentes/${id}/despacho`)).json();
  if (despacho) {
    const o = despacho.ocorrencia.id;
    if (!despacho.chegouEm) await c.request.post(`${BASE}/api/campo/agentes/${id}/despachos/${o}/chegada`);
    await c.request.post(`${BASE}/api/campo/agentes/${id}/despachos/${o}/conclusao`);
  }
}

/** Rola a área de conteúdo (main#conteudo; no Boletim e no celular, a página) até o elemento ficar `margem` px do topo. */
async function rolarAte(page, locator, { margem = 24 } = {}) {
  await locator.waitFor({ state: 'attached', timeout: 20000 });
  await locator.evaluate((el, m) => {
    const main = document.getElementById('conteudo') ?? document.scrollingElement;
    const topo = main === document.scrollingElement ? 0 : main.getBoundingClientRect().top;
    main.scrollTop = main.scrollTop + el.getBoundingClientRect().top - topo - m;
  }, margem);
  await esperar(300);
}

async function rolarAoTopo(page) {
  await page.evaluate(() => {
    const main = document.getElementById('conteudo') ?? document.scrollingElement;
    main.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await esperar(200);
}

// ---------- espera de tela "pronta" ----------
/** Sem "Carregando…", sem aria-busy, sem esqueleto e com todos os blocos do mapa carregados. */
async function quieto(page, { mapa = true, ms = 30000 } = {}) {
  try {
    await page.waitForFunction(
      ({ mapa }) => {
        if (document.querySelector('[aria-busy="true"]')) return false;
        if (/Carregando/.test(document.body.innerText)) return false;
        if (document.querySelector('[class*="esqueleto" i], [class*="skeleton" i]')) return false;
        if (mapa) {
          const tiles = [...document.querySelectorAll('.leaflet-tile')];
          if (tiles.some((t) => !t.classList.contains('leaflet-tile-loaded') || !(t.naturalWidth > 0))) return false;
        }
        return true;
      },
      { mapa },
      { timeout: ms, polling: 200 },
    );
  } catch {
    aviso(`tela não ficou quieta em ${ms / 1000} s (${page.url()})`);
  }
  await esperar(900); // fade-in dos blocos e animações curtas
  try {
    await page.mouse.move(0, 0);
  } catch {
    /* celular sem mouse */
  }
}

/** Tira a foto (JPEG 85; baixa a qualidade só se passar de ~900 KB). */
async function foto(alvo, nome, { inteira = false, elemento = null, pagina = alvo, mapa = true } = {}) {
  if (!quer(nome.slice(0, 2))) return;
  await quieto(pagina, { mapa });
  const arquivo = join(CAPTURAS, `${nome}.jpg`);
  for (const qualidade of [85, 80, 75, 70, 65]) {
    const opcoes = { path: arquivo, type: 'jpeg', quality: qualidade, animations: 'disabled' };
    if (elemento) await elemento.screenshot(opcoes);
    else await alvo.screenshot({ ...opcoes, fullPage: inteira });
    const kb = Math.round(statSync(arquivo).size / 1024);
    relato.arquivos[nome] = { kb, qualidade };
    if (kb <= 900) {
      console.log(`  ${nome}.jpg  ${kb} KB (q${qualidade})`);
      return;
    }
  }
  aviso(`${nome}.jpg passou de 900 KB mesmo com qualidade reduzida`);
}

/** Página inteira de uma tela do app (a rolagem é do main#conteudo): estica a janela até caber tudo, fotografa e devolve. */
async function fotoInteira(page, nome, tamanhoOriginal) {
  if (!quer(nome.slice(0, 2))) return;
  const total = await page.evaluate(() => {
    const main = document.getElementById('conteudo');
    if (!main) return null;
    return main.scrollHeight + main.getBoundingClientRect().top;
  });
  if (total && total > tamanhoOriginal.height) {
    await page.setViewportSize({ width: tamanhoOriginal.width, height: Math.min(Math.ceil(total), 8000) });
    await esperar(800);
  }
  await foto(page, nome, { inteira: true });
  await page.setViewportSize(tamanhoOriginal);
  await esperar(500);
}

async function salvarJson(page, nome, caminho) {
  const r = await page.request.get(BASE + caminho);
  if (!r.ok()) throw new Error(`${caminho}: HTTP ${r.status()}`);
  const corpo = await r.json();
  writeFileSync(join(DADOS, `${nome}.json`), JSON.stringify(corpo, null, 1));
  return corpo;
}

// ---------- navegadores ----------
const DESK = { width: 1440, height: 900 };
const comum = { locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light', acceptDownloads: true };
const navegador = await chromium.launch({ args: ['--hide-scrollbars'] });
const contexto = await navegador.newContext({ ...comum, viewport: DESK, deviceScaleFactor: 2 });
const page = await contexto.newPage();

const navegadorCelular = await chromium.launch({ args: ['--hide-scrollbars'] });
const contextoCelular = await navegadorCelular.newContext({
  ...comum,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
});
const celular = await contextoCelular.newPage();

// Tema claro garantido (o padrão); a Sala de controle é ligada só na captura 33.
const claro = () => {
  try {
    localStorage.setItem('fogo:tema', 'claro');
  } catch {
    /* sem armazenamento */
  }
};

/** Tapa o toque no celular, com rolagem se preciso. */
async function tocar(c, locator, { depois = 600 } = {}) {
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  await locator.scrollIntoViewIfNeeded();
  await esperar(150);
  await locator.tap();
  await esperar(depois);
}

const regiaoMapa = (p) => p.getByRole('region', { name: /Mapa ao vivo de Marília/ });
const indicadores = (p) => p.getByRole('region', { name: 'Indicadores da cidade' });

async function abrirCentral(p) {
  await p.goto(BASE + '/');
  await indicadores(p).waitFor();
  await esperar(3500);
  await quieto(p);
}

try {
  // ============ 01 entrar ============
  await page.goto(BASE + '/entrar');
  await page.evaluate(claro);
  await botaoPapel(page, 'Gestor').waitFor();
  await esperar(800);
  await foto(page, '01-entrar', { mapa: false });

  // ============ Central como Gestor ============
  await botaoPapel(page, 'Gestor').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 15000 });
  await indicadores(page).waitFor();
  await esperar(5000);

  // simulação em 1×
  const um = page.getByRole('button', { name: '1×' });
  if (await um.count()) {
    if ((await um.getAttribute('aria-pressed')) !== 'true') await um.click();
  }

  await abrirCentral(page);
  await foto(page, '02-central');
  relato.numeros.indicadoresDaCentral02 = await salvarJson(page, 'central-indicadores-tela-02', '/api/central/indicadores');

  // 03 filtros
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await esperar(900);
  await foto(page, '03-central-filtros');
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await esperar(500);

  // 08 legenda
  const botaoLegenda = page.getByRole('button', { name: /Legenda/ }).first();
  if (await botaoLegenda.count()) {
    await botaoLegenda.click();
    await esperar(700);
    await foto(page, '08-legenda');
    const fechar = page.getByRole('region', { name: 'Legenda do mapa' }).getByRole('button').first();
    if (await fechar.count()) await fechar.click();
    await esperar(400);
  } else aviso('08: sem botão de legenda');

  // 07 regiões
  await page.getByRole('tab', { name: /Regiões/ }).click();
  await esperar(900);
  const abrirRegiao = page.locator('#painel-regioes [aria-expanded="false"]').first();
  if (await abrirRegiao.count()) {
    await abrirRegiao.click().catch(() => {});
    await esperar(700);
  }
  await foto(page, '07-central-regioes');
  relato.numeros.regioes07 = await salvarJson(page, 'central-regioes-tela-07', '/api/central/regioes');
  await page.getByRole('tab', { name: /Alertas/ }).click();
  await esperar(400);

  // 05 ficha do equipamento (câmera ou radar, dentro da área visível do mapa)
  async function marcadorVisivel(filtro) {
    const mapa = regiaoMapa(page);
    const caixa = await mapa.boundingBox();
    const marcadores = mapa.locator(filtro);
    const n = await marcadores.count();
    for (let i = 0; i < n; i++) {
      const b = await marcadores.nth(i).boundingBox();
      if (b && b.x > caixa.x + 120 && b.x < caixa.x + caixa.width - 120 && b.y > caixa.y + 120 && b.y < caixa.y + caixa.height - 140) {
        return marcadores.nth(i);
      }
    }
    return n ? marcadores.first() : null;
  }
  const fecharFicha = async () => {
    const f = page.getByRole('complementary', { name: /Ficha/ }).getByRole('button', { name: /Fechar/ });
    if (await f.count()) await f.first().click().catch(() => {});
    else {
      const g = page.getByRole('button', { name: /Fechar ficha|Fechar/ }).first();
      if (await g.count()) await g.click().catch(() => {});
    }
    await esperar(500);
  };

  const eq = await marcadorVisivel('.leaflet-marker-icon[title^="FOGO-CAM-"], .leaflet-marker-icon[title^="FOGO-RAD-"]');
  if (eq) {
    await eq.click({ force: true });
    await page.getByRole('heading', { name: /FOGO-/ }).first().waitFor({ timeout: 8000 }).catch(() => {});
    await esperar(1500);
    await foto(page, '05-central-ficha');
    await fecharFicha();
  } else aviso('05: nenhum marcador de câmera/radar achado no mapa');

  // 06 ficha do agente
  const ag = await marcadorVisivel('.leaflet-marker-icon[title*="agente de trânsito" i], .leaflet-marker-icon[title*="guarda municipal" i], .leaflet-marker-icon[title*="policial militar" i]');
  if (ag) {
    await ag.click({ force: true });
    await page.getByRole('region', { name: 'Ficha do agente' }).waitFor({ timeout: 8000 }).catch(() => aviso('06: ficha do agente não abriu'));
    await esperar(1500);
    await foto(page, '06-central-ficha-agente');
    await fecharFicha();
  } else aviso('06: nenhum marcador de agente achado no mapa');

  // ============ celular: login e painel ============
  await celular.goto(BASE + '/entrar');
  await celular.evaluate(claro);
  await botaoPapel(celular, 'Agente em campo').tap();
  await celular.getByRole('heading', { name: 'Minha situação' }).waitFor({ timeout: 15000 });
  await esperar(2000);
  await liberarAgente(celular);
  const idAgente = await agenteDoCelular(celular);
  relato.numeros.agenteDoCelular = idAgente;
  await celular.reload();
  await celular.getByRole('heading', { name: 'Minha situação' }).waitFor();
  await esperar(1500);
  await celular.evaluate(() => window.scrollTo(0, 0));
  await foto(celular, '40-campo-painel', { mapa: false });

  // ============ 04 acidente injetado (a Central) ============
  await abrirCentral(page);
  await page.getByRole('button', { name: 'Injetar evento' }).click();
  await esperar(500);
  await page.getByRole('list', { name: 'Evento para injetar na cidade' }).getByRole('button', { name: /Acidente/ }).click();
  await esperar(500);
  // o mapa voa sozinho até o acidente; espera o alerta e a câmera assentarem
  const alerta = page.getByText(/Acidente em /).first();
  await alerta.waitFor({ timeout: 10000 }).catch(() => aviso('04: alerta "Acidente em" não apareceu'));
  await esperar(6000);
  await foto(page, '04-central-acidente');
  relato.numeros.alertaAcidente04 = ((await alerta.textContent().catch(() => '')) ?? '').trim();
  relato.numeros.indicadoresAcidente04 = await salvarJson(page, 'central-indicadores-tela-04', '/api/central/indicadores');

  // ============ 41/42 despacho chegando no celular ============
  // o acidente injetado nasce ao lado do agente do celular (mesma interceptação do gravar.mjs)
  await liberarAgente(celular);
  const proximos = await (await celular.request.get(`${BASE}/api/campo/agentes/${idAgente}/equipamentos-proximos`)).json();
  const alvo = (proximos.itens ?? proximos)[0];
  await page.route('**/api/simulacao/eventos', async (rota) => {
    const corpo = JSON.parse(rota.request().postData() ?? '{}');
    if (corpo.tipo === 'acidente') corpo.alvoId = alvo.id;
    await rota.continue({ postData: JSON.stringify(corpo) });
  });
  await abrirCentral(page);
  await celular.evaluate(() => window.scrollTo(0, 0));
  await celular.getByRole('heading', { name: 'Despacho', exact: true }).waitFor();
  // o simulador mexe nos agentes o tempo todo: se outro agente ficar mais perto do ponto, tenta de novo (até 5 vezes)
  let despachou = false;
  for (let tentativa = 1; tentativa <= 5 && !despachou; tentativa++) {
    await liberarAgente(celular);
    await page.getByRole('button', { name: 'Injetar evento' }).click();
    await esperar(500);
    await page.getByRole('list', { name: 'Evento para injetar na cidade' }).getByRole('button', { name: /Acidente/ }).click();
    despachou = await celular.getByText('Novo despacho!').waitFor({ timeout: 9000 }).then(() => true, () => false);
    if (!despachou) {
      aviso(`41: o despacho não chegou ao celular na tentativa ${tentativa}; nova injeção`);
      await esperar(4000);
    }
  }
  if (!despachou) throw new Error('41: o despacho nunca chegou ao celular');
  await celular.getByText('Acidente', { exact: true }).waitFor({ timeout: 3000 });
  relato.numeros.despacho41 = (await salvarJson(celular, 'campo-despacho-tela-41', `/api/campo/agentes/${idAgente}/despacho`)).despacho ?? null;
  await esperar(1500); // o destaque do cartão assenta, o mapa da Central voa até o ponto
  await celular.evaluate(() => window.scrollTo(0, 0));
  await foto(celular, '41-campo-despacho', { mapa: false });
  await esperar(2500); // o mapa da Central chega ao local
  await foto(page, '42-central-despacho');
  await page.unroute('**/api/simulacao/eventos');

  // ============ 43 chegada ============
  await tocar(celular, celular.getByRole('button', { name: 'Cheguei ao local' }), { depois: 1800 });
  await celular.evaluate(() => window.scrollTo(0, 0));
  await celular.getByRole('button', { name: 'Concluir ocorrência' }).waitFor({ timeout: 8000 });
  await foto(celular, '43-campo-chegada', { mapa: false });

  // ============ 44 relato ============
  // conclui a ocorrência (como o agente faria), mantém o agente no local do equipamento e abre o relato
  await tocar(celular, celular.getByRole('button', { name: 'Concluir ocorrência' }), { depois: 1500 });
  await celular.getByRole('heading', { name: 'Perto de mim' }).waitFor();
  const botoes = celular.getByRole('button', { name: /^Relatar problema em / });
  await botoes.first().waitFor({ timeout: 8000 });
  await tocar(celular, botoes.first(), { depois: 900 });
  await tocar(celular, celular.getByRole('radio', { name: 'Mau funcionamento' }), { depois: 500 });
  const obs = celular.getByRole('textbox', { name: /Observação/ });
  await tocar(celular, obs, { depois: 300 });
  await celular.keyboard.type('Não liga desde cedo.', { delay: 40 });
  await esperar(600);
  await celular.evaluate(() => document.activeElement?.blur?.());
  await foto(celular, '44-campo-relato', { mapa: false });
  const enviar = celular.getByRole('button', { name: 'Enviar relato' });
  if (await enviar.count()) await enviar.tap().catch(() => {});
  await esperar(1500);

  // ============ Equipamentos ============
  await page.goto(BASE + '/equipamentos');
  await page.locator('tbody tr').nth(9).waitFor();
  await esperar(500);
  await page.getByRole('combobox', { name: 'Tipo' }).selectOption({ label: 'Radar de fiscalização' });
  await esperar(800);
  await page.getByRole('searchbox', { name: 'Buscar equipamentos' }).fill('Avenida');
  await esperar(1500);
  await foto(page, '10-equipamentos', { mapa: false });

  // 11 formulário novo
  await page.goto(BASE + '/equipamentos/novo');
  const tipo = page.getByRole('combobox', { name: 'Tipo de equipamento' });
  await tipo.waitFor();
  await tipo.selectOption({ label: 'Câmera de videomonitoramento' });
  await esperar(1500);
  await fotoInteira(page, '11-equipamento-novo', DESK);

  // 12 ficha completa (câmera operacional, com linha do tempo e telemetria)
  const lista = await (await page.request.get(BASE + '/api/equipamentos?tipo=camera_videomonitoramento&situacao=operacional&limite=5')).json().catch(() => null);
  let idEq = lista?.itens?.[0]?.id;
  if (!idEq) {
    const geral = await (await page.request.get(BASE + '/api/equipamentos?limite=30')).json();
    idEq = (geral.itens ?? []).find((e) => e.situacao === 'operacional' && /CAM|RAD/.test(e.codigo))?.id ?? geral.itens[0].id;
  }
  relato.numeros.equipamentoFicha = idEq;
  await page.goto(`${BASE}/equipamentos/${idEq}`);
  await page.getByRole('region', { name: 'Características do tipo' }).waitFor();
  await page.getByRole('region', { name: /Telemetria/ }).waitFor();
  await esperar(2500);
  await fotoInteira(page, '12-equipamento-ficha', DESK);

  // ============ Agentes ============
  await page.goto(BASE + '/agentes');
  await page.locator('tbody tr').nth(9).waitFor();
  await esperar(500);
  await foto(page, '13-agentes', { mapa: false });

  const ficha = page.locator('tbody tr').first().getByRole('link').first();
  await ficha.click();
  await page.waitForURL(/\/agentes\/\d+/);
  await esperar(2500);
  await fotoInteira(page, '14-agente-ficha', DESK);

  // ============ Manutenção e alertas ============
  await page.goto(BASE + '/manutencao');
  await page.getByRole('heading', { level: 2 }).first().waitFor();
  await esperar(1000);
  await foto(page, '15-manutencao', { mapa: false });

  await page.goto(BASE + '/alertas');
  await page.getByRole('list', { name: /Alertas, críticos primeiro/ }).waitFor().catch(() => {});
  await esperar(1200);
  await foto(page, '16-alertas', { mapa: false });

  // ============ Previsões ============
  await page.goto(BASE + '/previsoes');
  await page.getByRole('region', { name: 'Resumo do dia' }).waitFor();
  await page.getByRole('region', { name: 'Índice de risco do dia' }).waitFor({ timeout: 60000 });
  await esperar(1500);
  await foto(page, '20-previsoes-resumo');

  const secao = (nome) => page.getByRole('region', { name: nome });
  await rolarAte(page, secao('Risco nas próximas 24 horas'));
  await esperar(2000);
  await foto(page, '21-previsoes-risco');

  await rolarAte(page, secao('Próximos 7 dias'));
  await page.getByRole('gridcell').first().waitFor({ timeout: 60000 });
  await esperar(1200);
  await foto(page, '22-previsoes-semana');

  await rolarAte(page, secao('Quanto o modelo acertou'));
  await esperar(1500);
  await foto(page, '23-previsoes-acerto');

  await rolarAte(page, secao('Reforço de agentes'));
  await esperar(1000);
  await foto(page, '24-previsoes-reforco');

  await rolarAte(page, secao('Falhas prováveis'));
  await esperar(1000);
  await foto(page, '25-previsoes-falhas');

  // Tendências é comprida (disponibilidade por tipo, patinetes e falhas por modelo): janela mais alta só nesta captura
  await page.setViewportSize({ width: DESK.width, height: 2300 });
  await esperar(800);
  await rolarAte(page, secao('Tendências'));
  await esperar(2500);
  await foto(page, '26-previsoes-tendencias');
  await page.setViewportSize(DESK);
  await esperar(500);

  // 27 um cartão "O que prevê / Dados usados / Como ajuda"
  const cartao = secao('Reforço de agentes').getByRole('region', { name: 'Como esta previsão funciona' });
  const cartaoAlvo = (await cartao.count()) ? cartao.first() : page.getByRole('region', { name: 'Como esta previsão funciona' }).first();
  await cartaoAlvo.scrollIntoViewIfNeeded();
  await esperar(500);
  await foto(page, '27-previsoes-explicacao', { elemento: cartaoAlvo });

  // ============ Boletim ============
  await page.goto(BASE + '/boletim');
  await page.getByRole('heading', { name: 'Boletim do dia' }).waitFor();
  await page.getByRole('heading', { name: 'Maior chance de falha em 7 dias' }).waitFor({ timeout: 60000 });
  await esperar(2500);
  await foto(page, '30-boletim');
  if (quer('30')) await foto(page, '30-boletim-inteiro', { inteira: true });

  // ============ Dados crus (sessão de gestor, mesmo banco) ============
  if (quer('99')) {
    const rotas = {
      'central-indicadores': '/api/central/indicadores',
      'central-regioes': '/api/central/regioes',
      'previsoes-resumo': '/api/previsoes/resumo',
      'previsoes-backtest': '/api/previsoes/backtest',
      'previsoes-reforco': '/api/previsoes/reforco',
      'previsoes-falhas': '/api/previsoes/falhas',
      'previsoes-tendencias': '/api/previsoes/tendencias',
      'previsoes-risco': '/api/previsoes/risco',
      'tipos-equipamento': '/api/tipos-equipamento',
      'auditoria-5': '/api/auditoria?limite=5',
      saude: '/api/saude',
    };
    for (const [nome, caminho] of Object.entries(rotas)) await salvarJson(page, nome, caminho);
    const eqs = await (await page.request.get(BASE + '/api/equipamentos?limite=1')).json();
    const ags = await (await page.request.get(BASE + '/api/agentes?limite=1')).json();
    const bairros = await (await page.request.get(BASE + '/api/bairros')).json();
    const alertasAbertos = await (await page.request.get(BASE + '/api/central/indicadores')).json();
    const alertas = await (await page.request.get(BASE + '/api/alertas?abertos=1&limite=1')).json().catch(() => null);
    const contagens = {
      equipamentos: eqs.total ?? eqs.itens?.length,
      agentes: ags.total ?? ags.itens?.length,
      bairros: (bairros.itens ?? bairros).length,
      alertasAbertos: alertas?.total ?? alertasAbertos.alertasAbertos ?? null,
      observacao: 'alertasAbertos: total devolvido por /api/alertas?abertos=1 (ou, se a rota não filtrar, o campo dos indicadores)',
    };
    writeFileSync(join(DADOS, 'contagens.json'), JSON.stringify(contagens, null, 1));
    relato.numeros.contagens = contagens;
    const agora = new Date();
    writeFileSync(
      join(DADOS, 'captura.json'),
      JSON.stringify(
        {
          capturadoEm: agora.toISOString(),
          dataHoraSaoPaulo: agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
          url: BASE,
        },
        null,
        1,
      ),
    );
  }

  // ============ 32 consulta, recusa 403, 31 auditoria ============
  await sair(page);
  await entrarComo(page, 'Somente consulta');
  await indicadores(page).waitFor();
  await page.goto(BASE + '/agentes');
  await page.locator('tbody tr').nth(9).waitFor();
  await esperar(600);
  await foto(page, '32-consulta-agentes', { mapa: false });
  const recusa = await page.evaluate(async () => {
    const r = await fetch('/api/equipamentos/1', { method: 'DELETE' });
    return { status: r.status, corpo: await r.text() };
  });
  relato.numeros.tentativaDelete = recusa;
  console.log('  DELETE como consulta ->', recusa.status);

  await sair(page);
  await entrarComo(page, 'Gestor');
  await page.goto(BASE + '/auditoria');
  await page.locator('tbody tr').nth(5).waitFor();
  await esperar(1200);
  await foto(page, '31-auditoria', { mapa: false });

  // ============ 33 Sala de controle ============
  await abrirCentral(page);
  await page.getByRole('button', { name: 'Sala de controle' }).click();
  await esperar(1500);
  await foto(page, '33-sala-de-controle');
  await page.getByRole('button', { name: 'Sala de controle' }).click();
  await esperar(500);
  await page.evaluate(claro);

  // ============ 34 Swagger ============
  await page.goto(BASE + '/api/docs');
  await page.locator('.swagger-ui, .opblock, #swagger-ui').first().waitFor({ timeout: 20000 }).catch(() => aviso('34: Swagger não carregou'));
  await esperar(2500);
  await foto(page, '34-swagger', { mapa: false });
} finally {
  writeFileSync(join(DADOS, '_relato-da-captura.json'), JSON.stringify(relato, null, 1));
  await navegador.close();
  await navegadorCelular.close();
}
console.log('pronto');
