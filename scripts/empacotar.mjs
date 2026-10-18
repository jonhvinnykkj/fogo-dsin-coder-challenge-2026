// Gera fogo-dsin-coder-challenge.zip na raiz: só o código-fonte, sem node_modules, dist, bancos, testes gerados e pastas de trabalho.
// Sem dependências nem programa externo (escreve o .zip direto). Falha se passar de 50 MB (limite da entrega).
// Uso: npm run empacotar
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NOME = 'fogo-dsin-coder-challenge'
const SAIDA = join(RAIZ, `${NOME}.zip`)
const LIMITE_BYTES = 50 * 1024 * 1024

// Pastas inteiras que ficam de fora (em qualquer nível).
const PASTAS_FORA = new Set(['node_modules', 'dist', 'test-results', 'playwright-report', '.git', '.superpowers', '.impeccable', '.vscode', '.idea'])
// Caminhos exatos de fora: do projeto do vídeo (video/) só vai o código; renders, gravações de tela e cópias das telas não.
const CAMINHOS_FORA = new Set([join('video', 'out'), join('video', 'public', 'gravacoes'), join('video', 'public', 'telas')])
// Arquivos de fora: lixo do sistema, zips, bancos e qualquer .env (.env, .env.local, .env.production…): o repositório vai ser público.
const arquivoFora = (nome, rel) =>
  nome === '.DS_Store' || nome.endsWith('.zip') || nome === '.env' || nome.startsWith('.env.') || (rel.startsWith(`data${sep}`) && /\.db(-wal|-shm)?$/.test(nome))

function listar(pasta) {
  const achados = []
  for (const item of readdirSync(pasta, { withFileTypes: true })) {
    const completo = join(pasta, item.name)
    const rel = relative(RAIZ, completo)
    if (item.isDirectory()) {
      if (!PASTAS_FORA.has(item.name) && !CAMINHOS_FORA.has(rel)) achados.push(...listar(completo))
    } else if (item.isFile() && !arquivoFora(item.name, rel)) {
      achados.push(rel)
    }
  }
  return achados
}

const TABELA_CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dataDos(d) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const dia = (Math.max(d.getFullYear(), 1980) - 1980 << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { hora, dia }
}

function montarZip(arquivos) {
  const partes = []
  const central = []
  let deslocamento = 0
  for (const rel of arquivos) {
    const dados = readFileSync(join(RAIZ, rel))
    const nome = Buffer.from(`${NOME}/${rel.split(sep).join('/')}`, 'utf8')
    const compactado = deflateRawSync(dados, { level: 9 })
    const usar = compactado.length < dados.length
    const corpo = usar ? compactado : dados
    const { hora, dia } = dataDos(statSync(join(RAIZ, rel)).mtime)
    const crc = crc32(dados)
    const cab = Buffer.alloc(30)
    cab.writeUInt32LE(0x04034b50, 0)
    cab.writeUInt16LE(20, 4)
    cab.writeUInt16LE(0x0800, 6) // nomes em UTF-8
    cab.writeUInt16LE(usar ? 8 : 0, 8)
    cab.writeUInt16LE(hora, 10)
    cab.writeUInt16LE(dia, 12)
    cab.writeUInt32LE(crc, 14)
    cab.writeUInt32LE(corpo.length, 18)
    cab.writeUInt32LE(dados.length, 22)
    cab.writeUInt16LE(nome.length, 26)
    partes.push(cab, nome, corpo)

    const ent = Buffer.alloc(46)
    ent.writeUInt32LE(0x02014b50, 0)
    ent.writeUInt16LE(20, 4)
    ent.writeUInt16LE(20, 6)
    ent.writeUInt16LE(0x0800, 8)
    ent.writeUInt16LE(usar ? 8 : 0, 10)
    ent.writeUInt16LE(hora, 12)
    ent.writeUInt16LE(dia, 14)
    ent.writeUInt32LE(crc, 16)
    ent.writeUInt32LE(corpo.length, 20)
    ent.writeUInt32LE(dados.length, 24)
    ent.writeUInt16LE(nome.length, 28)
    ent.writeUInt32LE(deslocamento, 42)
    central.push(ent, nome)
    deslocamento += cab.length + nome.length + corpo.length
  }
  const tamanhoCentral = central.reduce((s, b) => s + b.length, 0)
  const fim = Buffer.alloc(22)
  fim.writeUInt32LE(0x06054b50, 0)
  fim.writeUInt16LE(arquivos.length, 8)
  fim.writeUInt16LE(arquivos.length, 10)
  fim.writeUInt32LE(tamanhoCentral, 12)
  fim.writeUInt32LE(deslocamento, 16)
  return Buffer.concat([...partes, ...central, fim])
}

const arquivos = listar(RAIZ).sort()
const zip = montarZip(arquivos)
writeFileSync(SAIDA, zip)
const mb = (zip.length / 1024 / 1024).toFixed(2).replace('.', ',')
console.log(`${NOME}.zip: ${arquivos.length} arquivos, ${mb} MB`)
if (zip.length > LIMITE_BYTES) {
  console.error('O pacote passou de 50 MB, o limite da entrega. Confira o que entrou com "unzip -l".')
  process.exit(1)
}
