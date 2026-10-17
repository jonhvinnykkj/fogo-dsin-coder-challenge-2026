// Baixa bairros, ruas e limite urbano de Marília-SP do OpenStreetMap (Overpass API).
// Roda uma vez; sem dependências. Uso: node scripts/geo/baixar-osm.mjs
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
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

const CACHE = '/private/tmp/claude-501/-Users-vinnycius/54f0842e-af26-49a7-aa25-e31d3ac1af37/scratchpad/osm-cache'
async function overpass(consulta, rotulo) {
  // cache opcional fora do repositório (só para iterar sem rebaixar)
  const arqCache = `${CACHE}/${rotulo.replace(/\W/g, '_')}-${createHash('md5').update(consulta).digest('hex').slice(0, 8)}.json`
  if (existsSync(arqCache)) {
    console.log(`[${rotulo}] cache`)
    return JSON.parse(readFileSync(arqCache, 'utf8'))
  }
  const maxTentativas = TENTATIVAS_POR_SERVIDOR * SERVIDORES.length
  for (let i = 0; i < maxTentativas; i++) {
    const restante = PRAZO_TOTAL_MS - (Date.now() - inicio)
    if (restante <= 0) break
    const servidor = SERVIDORES[i % SERVIDORES.length]
    const rodada = Math.floor(i / SERVIDORES.length)
    let esperaExtra = 0
    try {
      const r = await fetch(servidor, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(consulta),
        signal: AbortSignal.timeout(Math.min(120_000, restante)),
      })
      if (r.ok) {
        const json = await r.json()
        console.log(`[${rotulo}] ok em ${servidor} (${json.elements.length} elementos)`)
        const res = { json, servidor }
        mkdirSync(CACHE, { recursive: true })
        writeFileSync(arqCache, JSON.stringify(res))
        return res
      }
      console.log(`[${rotulo}] ${servidor} -> HTTP ${r.status}`)
      const ra = Number(r.headers.get('retry-after'))
      if ((r.status === 429 || r.status === 503) && ra > 0) esperaExtra = Math.min(ra * 1000, 60_000)
    } catch (e) {
      console.log(`[${rotulo}] ${servidor} -> ${e.message}`)
    }
    // a cada volta completa pelos servidores, espera 5s, 10s, 20s, 40s... (ou o Retry-After, se maior)
    if (i % SERVIDORES.length === SERVIDORES.length - 1 || esperaExtra) {
      const espera = Math.max(esperaExtra, i % SERVIDORES.length === SERVIDORES.length - 1 ? 5000 * 2 ** rodada : 0)
      console.log(`[${rotulo}] aguardando ${espera / 1000}s`)
      await dormir(Math.min(espera, Math.max(0, PRAZO_TOTAL_MS - (Date.now() - inicio))))
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
const FAIXA_CEP = { Centro: [17500, 17509], Norte: [17510, 17514], Sul: [17515, 17519], Leste: [17520, 17529], Oeste: [17530, 17539] }
function cepAproximado(nome, regiao) {
  let h = 2166136261
  for (const c of nome) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  const [ini, fim] = FAIXA_CEP[regiao]
  return `${ini + (h % (fim - ini + 1))}-${String((h >>> 8) % 1000).padStart(3, '0')}`
}
const limpar = (n) => n.trim().replace(/\s+/g, ' ')
const semAcento = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

// ---------- coleta ----------
const BBOX = '-22.27,-50.00,-22.16,-49.89' // sul,oeste,norte,leste: entorno urbano de Marília
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
console.log(`Município: relação ${cidade.id}`)

consultas.lugares = `[out:json][timeout:90];
area(${areaId})->.m;
(node(area.m)["place"~"^(suburb|neighbourhood|quarter)$"]["name"];
 node(area.m)["place"~"^(city|town)$"]["name"="Marília"];
 way(area.m)["landuse"="residential"]["name"];);
out tags center;`
const lug = await overpass(consultas.lugares, 'bairros')

consultas.ruas = `[out:json][timeout:180];
area(${areaId})->.m;
way(area.m)(${BBOX})["highway"~"^(primary|secondary|tertiary|residential)$"]["name"];
out tags geom;`
const ruasR = await overpass(consultas.ruas, 'ruas')

// ---------- ruas: só a mancha urbana principal ----------
const comprimento = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot((p[0] - pts[i - 1][0]) * mPorGrauLng, (p[1] - pts[i - 1][1]) * mPorGrauLat) : 0), 0)
const densificar = (pts, passo = 100) => {
  const r = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const n = Math.ceil(Math.hypot((pts[i][0] - pts[i - 1][0]) * mPorGrauLng, (pts[i][1] - pts[i - 1][1]) * mPorGrauLat) / passo)
    for (let k = 1; k <= n; k++) r.push([pts[i - 1][0] + ((pts[i][0] - pts[i - 1][0]) * k) / n, pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * k) / n])
  }
  return r
}
const rural = (nome) => /^(estrada|rodovia|rod\.|est\.)\b/.test(semAcento(nome))
const porNome = new Map()
for (const w of ruasR.json.elements) {
  if (!w.geometry || w.geometry.length < 2) continue
  const nome = limpar(w.tags.name)
  if (rural(nome) || w.tags.highway === 'track') continue
  const pts = w.geometry.map((g) => [g.lon, g.lat]).filter(noBbox) // vias que cruzam a caixa vêm inteiras: corta o trecho de fora
  if (pts.length < 2) continue
  const comp = comprimento(pts)
  const atual = porNome.get(nome)
  if (!atual || comp > atual.comp) porNome.set(nome, { nome, tipo: w.tags.highway, pts, comp })
}
// grade de ~300 m; maior componente 8-conectada = cidade
const CEL = 300
const celula = ([lng, lat]) => [Math.floor(((lng - CENTRO.lng) * mPorGrauLng) / CEL), Math.floor(((lat - CENTRO.lat) * mPorGrauLat) / CEL)]
const chaveC = (c) => c[0] + ',' + c[1]
const nomesPorCelula = new Map() // célula só conta como urbana com >= MIN_VIAS vias distintas (6 separa a cidade dos distritos rurais)
for (const v of porNome.values()) for (const p of densificar(v.pts)) {
  const k = chaveC(celula(p))
  if (!nomesPorCelula.has(k)) nomesPorCelula.set(k, new Set())
  nomesPorCelula.get(k).add(v.nome)
}
const MIN_VIAS = Number(process.env.MIN_VIAS ?? 6)
const ocupadas = new Set([...nomesPorCelula].filter(([, n]) => n.size >= MIN_VIAS).map(([k]) => k))
const comp8 = new Map()
let melhor = [], idc = 0
for (const k of ocupadas) {
  if (comp8.has(k)) continue
  const pilha = [k], membros = []
  comp8.set(k, idc)
  while (pilha.length) {
    const cur = pilha.pop(); membros.push(cur)
    const [cx, cy] = cur.split(',').map(Number)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const nk = `${cx + dx},${cy + dy}`
      if (ocupadas.has(nk) && !comp8.has(nk)) { comp8.set(nk, idc); pilha.push(nk) }
    }
  }
  if (membros.length > melhor.length) melhor = membros
  idc++
}
const cidadeCelulas = new Set(melhor)
const ruasKept = [...porNome.values()].filter((v) => {
  const d = densificar(v.pts)
  return d.filter((p) => cidadeCelulas.has(chaveC(celula(p)))).length / d.length > 0.5
})
// pontos que definem a mancha urbana: só dentro da componente principal
const todosPontos = ruasKept.flatMap((v) => v.pts.filter((p) => cidadeCelulas.has(chaveC(celula(p)))))

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
const ruas = [...ruasKept].sort((a, b) => b.comp - a.comp).slice(0, 1500).map((v) => ({ v, pts: v.pts.filter((p) => dentro(p, anel)) })).filter((x) => x.pts.length >= 2).map(({ v, pts }) => ({
  nome: v.nome,
  tipo: v.tipo,
  pontos: simplificar(pts, 30).map(([lng, lat]) => [r5(lng), r5(lat)]),
}))

let areaM2 = 0
for (let i = 0; i < anel.length - 1; i++) areaM2 += (anel[i][0] * mPorGrauLng) * (anel[i + 1][1] * mPorGrauLat) - (anel[i + 1][0] * mPorGrauLng) * (anel[i][1] * mPorGrauLat)
const areaKm2 = Math.abs(areaM2) / 2 / 1e6

// ---------- bairros ----------
const NEGADOS = /(condominio|residencial|conjunto|resort|boulevard|village|loteamento|terras de|silenzio|recanto)/
const PARECE_BAIRRO = /^(jardim|jd\b|vila|parque|bairro|nucleo|chacara|alto|santa|santo|sao|cidade|distrito)/
const pontosRuas = ruasKept.map((v) => densificar(v.pts))
const ruasPerto = (lat, lng) => pontosRuas.filter((pts) => pts.some((p) => Math.hypot((p[0] - lng) * mPorGrauLng, (p[1] - lat) * mPorGrauLat) <= 400)).length
const lugares = lug.json.elements
  .map((e) => ({ nome: limpar(e.tags.name), lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon, nodo: e.type === 'node', cidade: e.tags.place === 'city' || e.tags.place === 'town' }))
  .filter((l) => l.lat != null)
const cidadeNo = lugares.find((l) => l.cidade)
const candidatos = lugares.filter((l) => !l.cidade).sort((a, b) => Number(b.nodo) - Number(a.nodo)) // nós place=* primeiro
const vistos = new Set()
const bairros = []
const descartes = { fora: [], semRua: [], condominio: [], naoBairro: [] }
let doLanduse = 0
const incluir = (l, regiao) => {
  vistos.add(semAcento(l.nome))
  if (!l.nodo) doLanduse++
  bairros.push({ nome: l.nome, regiao, lat: r5(l.lat), lng: r5(l.lng), cep: cepAproximado(l.nome, regiao) })
}
for (const l of candidatos) {
  const chave = semAcento(l.nome)
  if (vistos.has(chave)) continue
  if (NEGADOS.test(chave)) { descartes.condominio.push(l.nome); continue }
  if (!l.nodo && !PARECE_BAIRRO.test(chave)) { descartes.naoBairro.push(l.nome); continue }
  if (!dentro([l.lng, l.lat], anel)) { descartes.fora.push(l.nome); continue }
  if (chave !== 'centro' && ruasPerto(l.lat, l.lng) < 2) { descartes.semRua.push(l.nome); continue }
  incluir(l, chave === 'centro' ? 'Centro' : regiaoDe(l.lat, l.lng))
}
let centroDe = 'nó OSM place com name=Centro'
if (!vistos.has('centro')) {
  if (!cidadeNo) throw new Error('Sem nó "Centro" nem nó place=city "Marília" no OSM')
  incluir({ nome: 'Centro', lat: cidadeNo.lat, lng: cidadeNo.lng, nodo: true }, 'Centro')
  centroDe = `criado nas coordenadas do nó OSM place=${'city'} "Marília" (centro histórico)`
}
bairros.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
const nos = bairros.length - doLanduse

// ---------- validação antes de gravar ----------
const ruasJson = JSON.stringify(ruas)
const falhas = []
const exigir = (c, m) => { if (!c) falhas.push(m) }
exigir(bairros.length >= 30, `bairros ${bairros.length} < 30`)
exigir(ruas.length >= 200, `ruas ${ruas.length} < 200`)
exigir(bairros.every((b) => dentro([b.lng, b.lat], anel)), 'centro de bairro fora do limite')
exigir(new Set(bairros.map((b) => semAcento(b.nome))).size === bairros.length, 'nomes de bairro repetidos')
exigir(Buffer.byteLength(ruasJson) <= 1.5 * 1024 * 1024, 'ruas.json > 1,5 MB')
exigir(bairros.every((b) => { const n = Number(b.cep.replace('-', '')); return n >= 17500000 && n <= 17539999 }), 'CEP fora da faixa')
exigir(ruas.every((r) => r.pontos.length >= 2 && r.pontos.length <= 30), 'via com pontos fora de 2..30')
exigir(areaKm2 >= 20 && areaKm2 <= 100, `área do limite ${areaKm2.toFixed(1)} km² fora de 20..100`)
exigir(bairros.some((b) => b.nome === 'Centro'), 'sem bairro Centro')
console.log(`bairros: ${bairros.length} (${nos} place, ${doLanduse} landuse) | ruas: ${ruas.length} | limite: ${anel.length} vértices, ${areaKm2.toFixed(1)} km²`)
console.log('descartes:', Object.fromEntries(Object.entries(descartes).map(([k, v]) => [k, v.length])))
if (falhas.length) {
  console.error('VALIDAÇÃO FALHOU, nada foi gravado:\n- ' + falhas.join('\n- '))
  process.exit(1)
}

// ---------- gravação ----------
for (const f of [SAIDA.bairros, SAIDA.ruas, SAIDA.limite]) mkdirSync(dirname(f), { recursive: true })
writeFileSync(SAIDA.bairros, JSON.stringify(bairros, null, 2) + '\n')
writeFileSync(SAIDA.ruas, ruasJson)
writeFileSync(SAIDA.limite, JSON.stringify(limite))

const data = new Date().toISOString().slice(0, 10)
writeFileSync(SAIDA.fonte, `# Fonte dos dados geográficos de Marília-SP

- **Origem:** © colaboradores do OpenStreetMap, licença ODbL (https://www.openstreetmap.org/copyright).
- **Coleta:** ${data}, via Overpass API (servidores: ${[...new Set([lim.servidor, lug.servidor, ruasR.servidor])].join(', ')}), pelo script \`scripts/geo/baixar-osm.mjs\`.
- **Município:** relação OSM ${cidade.id} (\`admin_level=8\`, \`name=Marília\`, estado de São Paulo), escolhida por conter o centro da cidade (-22,2139; -49,9458).

## O que há em cada arquivo

- \`bairros.json\` — ${bairros.length} bairros: ${nos} de nós \`place=suburb|neighbourhood|quarter\` (base) e ${doLanduse} de áreas \`landuse=residential\` com \`name\` (complemento, ponto central da área), aceitos só se o nome parece bairro (Jardim, Vila, Parque, Bairro, Núcleo, Chácara…) e descartados se contêm Condomínio, Residencial, Conjunto, Resort, Boulevard, Village, Loteamento, Terras de, Silenzio ou Recanto (a lista de exclusão vale também para os nós place). Cada bairro mantido tem ao menos 2 vias coletadas a até 400 m do seu centro (exceto "Centro") e está dentro do limite urbano. Espaços repetidos nos nomes foram normalizados; a grafia do OSM não foi alterada.
  - **Centro:** ${centroDe}.
  - \`regiao\`: quadrante em relação ao centro; até 1,2 km do centro = \`Centro\`.
  - \`cep\`: **aproximado** — número plausível gerado a partir do nome, dentro de uma faixa por região (Centro 17500–17509, Norte 17510–17514, Sul 17515–17519, Leste 17520–17529, Oeste 17530–17539); não é o CEP oficial do bairro.
- \`ruas.json\` — ${ruas.length} vias nomeadas (\`highway\` = primary, secondary, tertiary, residential) da mancha urbana principal; sem estradas/rodovias rurais; por nome fica a maior via do OSM, simplificada (Douglas-Peucker) a no máximo 30 pontos, 5 casas decimais, \`[lng, lat]\`.
- \`shared/limite-marilia.json\` — **envoltória convexa das vias da mancha urbana principal + 300 m** (não é o perímetro administrativo do município, grande e rural). A mancha é a maior componente 8-conectada de uma grade de ~300 m em que cada célula tem ao menos 6 vias distintas (limiar empírico: com 3 a mancha engloba distritos rurais e chega a ~87 km²). Área: **${areaKm2.toFixed(1)} km²**. Polígono simples, anel único e fechado, \`[lng, lat]\`.

## Consultas (Overpass QL)

\`\`\`
${consultas.limite}

${consultas.lugares}

${consultas.ruas}
\`\`\`
`)
console.log('gravado.')
