// Baixa bairros, ruas e limite urbano de Marília-SP do OpenStreetMap (Overpass API).
// Roda uma vez; sem dependências. Uso: node scripts/geo/baixar-osm.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SAIDA = {
  bairros: resolve(RAIZ, 'server/geo/dados/bairros.json'),
  ruas: resolve(RAIZ, 'server/geo/dados/ruas.json'),
  limite: resolve(RAIZ, 'shared/limite-marilia.json'),
  fonte: resolve(RAIZ, 'server/geo/dados/FONTE.md'),
}
const CENTRO = { lat: -22.2139, lng: -49.9458 }
const SERVIDORES = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const UA = 'fogo-dsin-coder-challenge/1.0 (estudo)'
const TENTATIVAS_POR_SERVIDOR = 6
const PRAZO_TOTAL_MS = 15 * 60 * 1000
const inicio = Date.now()
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

async function overpass(consulta, rotulo) {
  const maxTentativas = TENTATIVAS_POR_SERVIDOR * SERVIDORES.length
  for (let i = 0; i < maxTentativas; i++) {
    if (Date.now() - inicio > PRAZO_TOTAL_MS) break
    const servidor = SERVIDORES[i % SERVIDORES.length]
    const rodada = Math.floor(i / SERVIDORES.length)
    try {
      const r = await fetch(servidor, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(consulta),
        signal: AbortSignal.timeout(120_000),
      })
      if (r.ok) {
        const json = await r.json()
        console.log(`[${rotulo}] ok em ${servidor} (${json.elements.length} elementos)`)
        return { json, servidor }
      }
      console.log(`[${rotulo}] ${servidor} -> HTTP ${r.status}`)
    } catch (e) {
      console.log(`[${rotulo}] ${servidor} -> ${e.message}`)
    }
    // a cada volta completa pelos servidores, espera 5s, 10s, 20s, 40s...
    if (i % SERVIDORES.length === SERVIDORES.length - 1) {
      const espera = 5000 * 2 ** rodada
      console.log(`[${rotulo}] aguardando ${espera / 1000}s`)
      await dormir(espera)
    }
  }
  throw new Error(`Overpass indisponível para "${rotulo}"`)
}

// ---------- geometria ----------
const mPorGrauLat = 111_320
const mPorGrauLng = 111_320 * Math.cos((CENTRO.lat * Math.PI) / 180)
const r5 = (n) => Math.round(n * 1e5) / 1e5

function simplificar(pts, max) {
  // Douglas-Peucker com tolerância crescente até caber em `max` pontos
  const dp = (p, tol) => {
    if (p.length < 3) return p
    const [a, b] = [p[0], p[p.length - 1]]
    let dmax = 0, idx = 0
    for (let i = 1; i < p.length - 1; i++) {
      const d = distSeg(p[i], a, b)
      if (d > dmax) { dmax = d; idx = i }
    }
    if (dmax <= tol) return [a, b]
    return [...dp(p.slice(0, idx + 1), tol).slice(0, -1), ...dp(p.slice(idx), tol)]
  }
  let tol = 0.5
  let r = dp(pts, tol)
  while (r.length > max) { tol *= 1.5; r = dp(pts, tol) }
  return r
}
function distSeg(p, a, b) {
  const x = (q) => (q[0] - a[0]) * mPorGrauLng, y = (q) => (q[1] - a[1]) * mPorGrauLat
  const [px, py, bx, by] = [x(p), y(p), x(b), y(b)]
  const l2 = bx * bx + by * by
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / l2))
  return Math.hypot(px - t * bx, py - t * by)
}
function envoltoria(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const baixo = []
  for (const q of p) { while (baixo.length >= 2 && cr(baixo.at(-2), baixo.at(-1), q) <= 0) baixo.pop(); baixo.push(q) }
  const cima = []
  for (const q of [...p].reverse()) { while (cima.length >= 2 && cr(cima.at(-2), cima.at(-1), q) <= 0) cima.pop(); cima.push(q) }
  return [...baixo.slice(0, -1), ...cima.slice(0, -1)]
}
function dentro(pt, anel) {
  let d = false
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i], [xj, yj] = anel[j]
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) d = !d
  }
  return d
}
function regiaoDe(lat, lng) {
  const dy = (lat - CENTRO.lat) * mPorGrauLat, dx = (lng - CENTRO.lng) * mPorGrauLng
  if (Math.hypot(dx, dy) <= 1200) return 'Centro'
  return Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'Norte' : 'Sul') : dx > 0 ? 'Leste' : 'Oeste'
}
function cepAproximado(nome) {
  let h = 2166136261
  for (const c of nome) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  const prefixo = 17500 + (h % 40)
  const sufixo = String((h >>> 8) % 1000).padStart(3, '0')
  return `${prefixo}-${sufixo}`
}
const semAcento = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

// ---------- coleta ----------
const BBOX = '-22.27,-50.00,-22.16,-49.89' // sul,oeste,norte,leste: mancha urbana de Marília
const [B_S, B_W, B_N, B_E] = BBOX.split(',').map(Number)
const noBbox = ([lng, lat]) => lat >= B_S && lat <= B_N && lng >= B_W && lng <= B_E
const consultas = {}

consultas.limite = `[out:json][timeout:60];
rel["boundary"="administrative"]["admin_level"="8"]["name"="Marília"](-23,-51,-21,-49);
out tags bb;`
const lim = await overpass(consultas.limite, 'município')
const cands = lim.json.elements.filter((e) => e.tags?.name === 'Marília')
const cidade = cands.find((e) => e.bounds && CENTRO.lat >= e.bounds.minlat && CENTRO.lat <= e.bounds.maxlat && CENTRO.lng >= e.bounds.minlon && CENTRO.lng <= e.bounds.maxlon)
if (!cidade) throw new Error('Relação do município de Marília não encontrada')
const areaId = 3600000000 + cidade.id
console.log(`Município: relação ${cidade.id} (${JSON.stringify(cidade.tags['IBGE:GEOCODIGO'] ?? cidade.tags['ref:IBGE'] ?? '')})`)

consultas.lugares = `[out:json][timeout:90];
area(${areaId})->.m;
(node(area.m)["place"~"^(suburb|neighbourhood|quarter)$"]["name"];
 way(area.m)["landuse"="residential"]["name"];);
out tags center;`
const lug = await overpass(consultas.lugares, 'bairros')

consultas.ruas = `[out:json][timeout:180];
area(${areaId})->.m;
way(area.m)(${BBOX})["highway"~"^(primary|secondary|tertiary|residential)$"]["name"];
out tags geom;`
const ruasR = await overpass(consultas.ruas, 'ruas')

// ---------- ruas ----------
const porNome = new Map()
for (const w of ruasR.json.elements) {
  if (!w.geometry || w.geometry.length < 2) continue
  const nome = w.tags.name.trim()
  const pts = w.geometry.map((g) => [g.lon, g.lat]).filter(noBbox) // vias que cruzam a caixa vêm inteiras do Overpass: corta o trecho rural
  if (pts.length < 2) continue
  const comp = pts.reduce((s, p, i) => (i ? s + Math.hypot((p[0] - pts[i - 1][0]) * mPorGrauLng, (p[1] - pts[i - 1][1]) * mPorGrauLat) : 0), 0)
  const atual = porNome.get(nome)
  if (!atual || comp > atual.comp) porNome.set(nome, { nome, tipo: w.tags.highway, pts, comp })
}
let ruas = [...porNome.values()].sort((a, b) => b.comp - a.comp).slice(0, 1500).map((v) => ({
  nome: v.nome,
  tipo: v.tipo,
  pontos: simplificar(v.pts, 30).map(([lng, lat]) => [r5(lng), r5(lat)]),
}))
// todos os pontos de TODAS as vias coletadas definem a mancha urbana
const todosPontos = [...porNome.values()].flatMap((v) => v.pts)

// ---------- limite: envoltória convexa + 300 m ----------
const casco = envoltoria(todosPontos)
const inflado = []
for (const [lng, lat] of casco) {
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * 2 * Math.PI
    inflado.push([lng + (300 * Math.cos(a)) / mPorGrauLng, lat + (300 * Math.sin(a)) / mPorGrauLat])
  }
}
const anel = envoltoria(inflado).map(([lng, lat]) => [r5(lng), r5(lat)])
anel.push(anel[0])
const limite = { type: 'Polygon', coordinates: [anel] }

// ---------- bairros ----------
const vistos = new Set()
const bairros = []
const descartados = []
const lugares = lug.json.elements
  .map((e) => ({ nome: e.tags.name.trim(), lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon, nodo: e.type === 'node' }))
  .filter((l) => l.lat != null)
  .sort((a, b) => Number(b.nodo) - Number(a.nodo)) // nós place=* têm prioridade sobre landuse
let doLanduse = 0
for (const l of lugares) {
  const chave = semAcento(l.nome)
  if (vistos.has(chave)) continue
  if (!dentro([l.lng, l.lat], anel)) { descartados.push(l.nome); continue }
  vistos.add(chave)
  if (!l.nodo) doLanduse++
  bairros.push({ nome: l.nome, regiao: regiaoDe(l.lat, l.lng), lat: r5(l.lat), lng: r5(l.lng), cep: cepAproximado(l.nome) })
}
bairros.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

// ---------- gravação ----------
for (const f of [SAIDA.bairros, SAIDA.ruas, SAIDA.limite]) mkdirSync(dirname(f), { recursive: true })
writeFileSync(SAIDA.bairros, JSON.stringify(bairros, null, 2) + '\n')
writeFileSync(SAIDA.ruas, JSON.stringify(ruas))
writeFileSync(SAIDA.limite, JSON.stringify(limite))

const nos = bairros.length - doLanduse
const data = new Date().toISOString().slice(0, 10)
writeFileSync(SAIDA.fonte, `# Fonte dos dados geográficos de Marília-SP

- **Origem:** © colaboradores do OpenStreetMap, licença ODbL (https://www.openstreetmap.org/copyright).
- **Coleta:** ${data}, via Overpass API (servidores consultados: ${[...new Set([lim.servidor, lug.servidor, ruasR.servidor])].join(', ')}), pelo script \`scripts/geo/baixar-osm.mjs\`.
- **Município:** relação OSM ${cidade.id} (\`admin_level=8\`, \`name=Marília\`, estado de São Paulo), escolhida por conter o centro da cidade (-22,2139; -49,9458).

## O que há em cada arquivo

- \`bairros.json\` — ${bairros.length} bairros: ${nos} de nós \`place=suburb|neighbourhood|quarter\` e ${doLanduse} de áreas \`landuse=residential\` com \`name\` (complemento, usando o ponto central da área). Nomes repetidos (sem considerar acento/caixa) foram unificados. Só entram bairros dentro do limite urbano${descartados.length ? ` (${descartados.length} fora dele foram descartados)` : ''}.
  - \`regiao\`: quadrante em relação ao centro; até 1,2 km do centro = \`Centro\`.
  - \`cep\`: **aproximado** — número plausível da faixa 17500-000…17539-999 gerado a partir do nome; não é o CEP oficial do bairro.
- \`ruas.json\` — ${ruas.length} vias nomeadas (\`highway\` = primary, secondary, tertiary, residential) no entorno urbano; por nome, fica a maior via do OSM, simplificada (Douglas-Peucker) a no máximo 30 pontos, 5 casas decimais, \`[lng, lat]\`.
- \`shared/limite-marilia.json\` — **envoltória convexa das vias urbanas coletadas com folga de 300 m** (não é o perímetro administrativo do município, que é grande e rural). Polígono simples, anel único e fechado, \`[lng, lat]\`.

## Consultas (Overpass QL)

\`\`\`
${consultas.limite}

${consultas.lugares}

${consultas.ruas}
\`\`\`
`)

console.log(`bairros: ${bairros.length} (${nos} place, ${doLanduse} landuse), ruas: ${ruas.length}, limite: ${anel.length} vértices, descartados: ${descartados.length}`)
