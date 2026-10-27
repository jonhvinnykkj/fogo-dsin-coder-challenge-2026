// Converte os diagramas Mermaid (docs/relatorio/diagramas/*.mmd) em SVG, para o relatório usar como figura vetorial.
// O Mermaid vem do jsDelivr numa página do Chromium sem janela; o SVG gerado fica no repositório, então gerar o PDF
// não depende dele. Uso (na raiz do repositório): node docs/relatorio/scripts/diagramas.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'diagramas');
const MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';

// Tons de cinza: o relatório é formal e precisa sair legível impresso em preto e branco.
const TEMA = {
  startOnLoad: false,
  htmlLabels: false,
  theme: 'base',
  fontFamily: 'Arial, Helvetica, sans-serif',
  themeVariables: {
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: '17px',
    primaryColor: '#f2f2f2',
    primaryBorderColor: '#333333',
    primaryTextColor: '#111111',
    secondaryColor: '#e6e6e6',
    tertiaryColor: '#fafafa',
    lineColor: '#333333',
    clusterBkg: '#fafafa',
    clusterBorder: '#888888',
    edgeLabelBackground: '#ffffff',
    actorBkg: '#f2f2f2',
    actorBorder: '#333333',
    signalColor: '#333333',
    noteBkgColor: '#f2f2f2',
  },
  flowchart: { curve: 'basis', padding: 12, htmlLabels: false },
  er: { useMaxWidth: false },
  sequence: { useMaxWidth: false, mirrorActors: false },
};

const navegador = await chromium.launch({ headless: true });
const page = await navegador.newPage();
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
await page.addScriptTag({ url: MERMAID });
await page.evaluate((tema) => window.mermaid.initialize(tema), TEMA);

for (const arquivo of fs.readdirSync(PASTA).filter((f) => f.endsWith('.mmd')).sort()) {
  const fonte = fs.readFileSync(path.join(PASTA, arquivo), 'utf8');
  const nome = path.basename(arquivo, '.mmd');
  const svg = await page.evaluate(async ({ nome, fonte }) => (await window.mermaid.render(`d-${nome}`, fonte)).svg, { nome, fonte });
  fs.writeFileSync(path.join(PASTA, `${nome}.svg`), svg);
  console.log(`${nome}.svg (${Math.round(svg.length / 1024)} KB)`);
}
await navegador.close();
