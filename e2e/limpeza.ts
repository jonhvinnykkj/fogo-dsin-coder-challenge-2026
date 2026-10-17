// Depois do E2E: apaga o banco temporário (e os arquivos -wal/-shm do SQLite).
import { rmSync } from 'node:fs';

export default function limpeza(): void {
  for (const sufixo of ['', '-wal', '-shm']) rmSync(`data/e2e.db${sufixo}`, { force: true });
}
