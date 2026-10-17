import type { Database } from 'better-sqlite3';
import type { Bairro } from '../../shared/modelos';
import type { Regiao } from '../../shared/dominio';
import type { GeoMarilia } from '../geo/marilia';

interface LinhaBairro {
  id: number;
  nome: string;
  regiao: Regiao;
  lat: number;
  lng: number;
  cep: string;
  poligono: string;
}

const paraBairro = (l: LinhaBairro): Bairro => ({ ...l, poligono: JSON.parse(l.poligono) });

/** Grava os bairros da geografia (ids na ordem de `geo.bairros`, a partir de 1). Não duplica. */
export function inserirBairros(db: Database, geo: GeoMarilia): number {
  const ins = db.prepare('INSERT OR IGNORE INTO bairros (nome, regiao, lat, lng, cep, poligono) VALUES (?, ?, ?, ?, ?, ?)');
  const gravar = db.transaction(() => {
    let novos = 0;
    for (const b of geo.bairros) novos += ins.run(b.nome, b.regiao, b.lat, b.lng, b.cep, JSON.stringify(b.poligono)).changes;
    return novos;
  });
  return gravar();
}

export function contarBairros(db: Database): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM bairros').get() as { n: number }).n;
}

export function listarBairros(db: Database): Bairro[] {
  return (db.prepare('SELECT * FROM bairros ORDER BY id').all() as LinhaBairro[]).map(paraBairro);
}

export function bairroExiste(db: Database, id: number): boolean {
  return db.prepare('SELECT 1 FROM bairros WHERE id = ?').get(id) !== undefined;
}
