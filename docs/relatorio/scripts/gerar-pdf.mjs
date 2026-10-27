// Gera docs/Relatorio-Tecnico-FOGO.pdf a partir de docs/relatorio/modelo/ (capa.html, corpo.html, estilo.css).
//
// O corpo.html é HTML comum com três marcações próprias, que este script numera e transforma:
//   <figura src="capturas/x.jpg" titulo="…" fonte="…" [classe="celular|meia|alta"] [nota="…"]></figura>
//   <figura svg="diagramas/x.svg" titulo="…" fonte="…"></figura>          (diagrama vetorial)
//   <quadro titulo="…" fonte="…"><table>…</table></quadro>                  (texto, bordas fechadas)
//   <tabela titulo="…" fonte="…"><table>…</table></tabela>                  (números, padrão IBGE)
// e os títulos: <h1> numerado (seção primária), <h2>/<h3> numerados dentro dela; <h1 class="centro"> sem número
// (entra no sumário), <h1 class="centro fora"> sem número e fora do sumário (resumo, listas, o próprio sumário).
//
// Passagens: a primeira gera o PDF e descobre, pelo texto de cada folha (pdftotext), onde caiu cada título e
// cada ilustração; a seguinte preenche sumário e listas (repete até as folhas pararem de mudar). A capa sai num PDF
// à parte (não conta na numeração) e o pypdf junta os dois, com metadados e rótulos de página.
// Uso (na raiz do repositório): node docs/relatorio/scripts/gerar-pdf.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELO = path.join(RAIZ, 'modelo');
const SAIDA = path.resolve(RAIZ, '..', 'Relatorio-Tecnico-FOGO.pdf');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'relatorio-fogo-'));
const REDUZIDAS = path.join(TMP, 'img');
const TITULO_PDF = 'F.O.G.O. – Ferramenta Onisciente de Gestão e Operações: relatório técnico';
const AUTORES = 'João Vinnycius Matos Monteiro Ferreira; Mateus Robers Amaral';

const escapar = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const semTags = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const atributos = (s) => Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

// Capturas em 2× ficam pesadas; para 16 cm de largura, 1700 px dão cerca de 270 ppp.
function reduzir(rel) {
  const origem = path.join(RAIZ, rel);
  const destino = path.join(REDUZIDAS, rel);
  if (fs.existsSync(destino)) return destino;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  try {
    execFileSync('sips', ['-Z', '1700', '-s', 'format', 'jpeg', '-s', 'formatOptions', '72', origem, '--out', destino], { stdio: 'ignore' });
    return destino;
  } catch {
    return origem; // sem o sips (fora do macOS), vai a imagem original
  }
}

function svgEmbutido(rel) {
  const svg = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
  return svg.replace(/<svg([^>]*)>/, (_, a) => `<svg${a.replace(/\s(width|height|style)="[^"]*"/g, '')} width="100%">`);
}

// ---- Montagem do corpo ----
function montarCorpo(paginas) {
  let html = fs.readFileSync(path.join(MODELO, 'corpo.html'), 'utf8');
  const ilustracoes = { figura: [], quadro: [], tabela: [] };
  const nome = { figura: 'Figura', quadro: 'Quadro', tabela: 'Tabela' };
  const titulo = (tipo, n, a) => `<div class="titulo">${nome[tipo]} ${n} – ${a.titulo}</div>`;
  const rodape = (a) => `<div class="fonte">Fonte: ${a.fonte}</div>${a.nota ? `<div class="nota">Nota: ${a.nota}</div>` : ''}`;

  // Figuras, quadros e tabelas na ordem em que aparecem (numeração própria de cada tipo).
  html = html.replace(/<figura\s([^>]*?)\s*>\s*<\/figura>|<(quadro|tabela)\s([^>]*)>([\s\S]*?)<\/\2>/g, (_, aFig, tipoTab, aTab, miolo) => {
    const tipo = aFig !== undefined ? 'figura' : tipoTab;
    const a = atributos(aFig ?? aTab);
    const n = ilustracoes[tipo].length + 1;
    const id = `${tipo}-${n}`;
    ilustracoes[tipo].push({ id, n, titulo: semTags(a.titulo) });
    // Quadro de até 14 linhas fica inteiro numa folha (não deixa uma linha sozinha na seguinte).
    const curto = tipo === 'quadro' && (miolo.match(/<tr/g) ?? []).length <= 14 ? ' mantem' : '';
    if (tipo !== 'figura') return `<div class="ilustracao ${tipo}${curto}" id="${id}">${titulo(tipo, n, a)}${miolo}${rodape(a)}</div>`;
    const corpo = a.svg ? svgEmbutido(a.svg) : `<img src="file://${reduzir(a.src)}" class="${a.classe ?? ''}" alt="${escapar(semTags(a.titulo))}">`;
    return `<div class="ilustracao figura${a.svg ? ` svg ${a.classe ?? ''}` : ''}" id="${id}">${titulo(tipo, n, a)}${corpo}${rodape(a)}</div>`;
  });

  // Títulos: numeração progressiva (NBR 6024) e entradas do sumário.
  const sumario = [];
  let n1 = 0, n2 = 0, n3 = 0, dentroNumerada = false;
  html = html.replace(/<h([123])(?:\s+class="([^"]*)")?>([\s\S]*?)<\/h\1>/g, (_, nivel, classe = '', texto) => {
    const centro = /\bcentro\b/.test(classe);
    const fora = /\bfora\b/.test(classe);
    let ind = '';
    if (nivel === '1') {
      dentroNumerada = !centro;
      if (!centro) { n1++; n2 = 0; n3 = 0; ind = String(n1); }
    } else if (dentroNumerada && nivel === '2') { n2++; n3 = 0; ind = `${n1}.${n2}`; }
    else if (dentroNumerada && nivel === '3') { n3++; ind = `${n1}.${n2}.${n3}`; }
    const id = `s-${sumario.length + 1}`;
    if (!fora) sumario.push({ id, nivel: Number(nivel), ind, texto: semTags(texto), pos: centro });
    const num = ind ? `<span class="num">${ind}</span>` : '';
    return `<h${nivel} id="${id}"${classe ? ` class="${classe}"` : ''}>${num}${texto}</h${nivel}>`;
  });

  const pg = (id) => paginas[id] ?? '';
  const itemLista = (tipo, i) => `<li><span class="rotulo">${nome[tipo]} ${i.n} – ${escapar(i.titulo)}</span><span class="pontos"></span><span class="pg">${pg(i.id)}</span></li>`;
  for (const tipo of ['figura', 'quadro', 'tabela']) {
    html = html.replace(`<!-- LISTA:${tipo} -->`, `<ol class="lista ilustracoes">${ilustracoes[tipo].map((i) => itemLista(tipo, i)).join('')}</ol>`);
  }
  const itensSumario = sumario.map((s) => {
    const classe = s.pos ? 'pos' : `n${s.nivel}`;
    return `<li class="${classe}"><span class="ind">${s.ind}</span><span class="rotulo">${escapar(s.texto)}</span><span class="pontos"></span><span class="pg">${pg(s.id)}</span></li>`;
  });
  html = html.replace('<!-- SUMARIO -->', `<ol class="lista sumario">${itensSumario.join('')}</ol>`);
  return { html, sumario, ilustracoes };
}

function documento(miolo) {
  const css = fs.readFileSync(path.join(MODELO, 'estilo.css'), 'utf8');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${TITULO_PDF}</title>`
    + `<base href="file://${RAIZ}/"><style>${css}</style></head><body>${miolo}</body></html>`;
}

async function imprimir(page, html, destino) {
  const arquivo = path.join(TMP, `${path.basename(destino, '.pdf')}.html`);
  fs.writeFileSync(arquivo, html);
  await page.goto(`file://${arquivo}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: destino, preferCSSPageSize: true, printBackground: true, outline: true, tagged: true });
}

// Em que folha caiu cada título e cada ilustração (procura a partir da folha seguinte ao sumário).
function localizar(pdf, sumario, ilustracoes) {
  const total = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [pdf], { encoding: 'utf8' }))[1]);
  const norm = (s) => s.replace(/[‐-―]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
  const folhas = [];
  for (let p = 1; p <= total; p++) folhas.push(norm(execFileSync('pdftotext', ['-f', String(p), '-l', String(p), pdf, '-'], { encoding: 'utf8' })));
  // O sumário pode ocupar mais de uma folha: o texto começa na primeira folha depois dele que não é continuação.
  const folhaSumario = folhas.findIndex((t) => t.startsWith('sumário'));
  const inicio = folhaSumario + 2;
  const paginas = {};
  const faltando = [];
  let desde = inicio;
  for (const s of sumario) {
    const alvo = norm(s.ind ? `${s.ind} ${s.texto}` : s.texto);
    const p = folhas.findIndex((t, i) => i + 1 >= desde && t.includes(alvo));
    if (p < 0) { faltando.push(alvo); continue; }
    paginas[s.id] = p + 1;
    desde = p + 1;
  }
  for (const tipo of Object.keys(ilustracoes)) {
    let de = inicio;
    for (const i of ilustracoes[tipo]) {
      const alvo = `${tipo} ${i.n} - `;
      const p = folhas.findIndex((t, k) => k + 1 >= de && t.includes(alvo));
      if (p < 0) { faltando.push(alvo); continue; }
      paginas[i.id] = p + 1;
      de = p + 1;
    }
  }
  return { paginas, total, faltando };
}

fs.mkdirSync(REDUZIDAS, { recursive: true });
const navegador = await chromium.launch({ headless: true });
const page = await navegador.newPage();
const pdfCapa = path.join(TMP, 'capa.pdf');
const pdfCorpo = path.join(TMP, 'corpo.pdf');

await imprimir(page, documento(fs.readFileSync(path.join(MODELO, 'capa.html'), 'utf8')), pdfCapa);
let paginas = {};
let resultado;
for (let passagem = 1; passagem <= 4; passagem++) {
  const montado = montarCorpo(paginas);
  await imprimir(page, documento(montado.html), pdfCorpo);
  resultado = localizar(pdfCorpo, montado.sumario, montado.ilustracoes);
  const mudou = JSON.stringify(resultado.paginas) !== JSON.stringify(paginas);
  paginas = resultado.paginas;
  if (passagem > 1 && !mudou) break;
}
await navegador.close();

// Junta capa + corpo, com metadados e rótulos de página (a capa não tem número; o corpo começa em 1).
execFileSync('python3', ['-c', `
import sys
from pypdf import PdfWriter, PdfReader
capa, corpo, saida, titulo, autores = sys.argv[1:6]
w = PdfWriter()
w.append(PdfReader(capa), import_outline=False)
w.append(PdfReader(corpo))
w.add_metadata({'/Title': titulo, '/Author': autores, '/Subject': 'Relatório técnico (ABNT NBR 10719) do sistema F.O.G.O. – DSIN Coder Challenge 2026', '/Keywords': 'mobilidade urbana; internet das coisas; monitoramento em tempo real; análise preditiva; LGPD'})
w.set_page_label(0, 0, prefix='Capa')
w.set_page_label(1, len(w.pages) - 1, style='/D', start=1)
w.write(saida)
`, pdfCapa, pdfCorpo, SAIDA, TITULO_PDF, AUTORES]);

const tamanho = (fs.statSync(SAIDA).size / 1024 / 1024).toFixed(1);
console.log(`PDF: ${SAIDA}\n${resultado.total + 1} folhas (capa + ${resultado.total}); ${tamanho} MB`);
if (resultado.faltando.length) console.log(`Não achei no PDF: ${resultado.faltando.join(' | ')}`);
if (process.env.MANTER) console.log(`Arquivos de trabalho: ${TMP}`); else fs.rmSync(TMP, { recursive: true, force: true });
