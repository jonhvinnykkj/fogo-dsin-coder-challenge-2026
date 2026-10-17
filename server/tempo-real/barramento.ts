// Barramento de eventos em memória: quem produz (ingestão, motor de alertas, simulador) chama `emitir`;
// quem consome (a rota SSE) chama `assinar`. Sem fila nem disco: evento que ninguém ouve some.
//
// As posições são tratadas à parte: cada leitura de veículo muda uma posição, e mandar um evento por leitura
// inundaria a tela. `registrarPosicao` só guarda (a última de cada equipamento/agente) e `descarregarPosicoes`
// manda tudo num evento `posicoes` só. Um relógio de 2 s (`iniciarAgrupamento`) faz isso em produção.
import type { EventoFogo } from '../../shared/modelos';

type ItemPosicao = Extract<EventoFogo, { tipo: 'posicoes' }>['itens'][number];

export class Barramento {
  private readonly ouvintes = new Set<(e: EventoFogo) => void>();
  private readonly posicoesPendentes = new Map<string, ItemPosicao>();
  private relogio: NodeJS.Timeout | undefined;

  emitir(e: EventoFogo): void {
    for (const ouvinte of [...this.ouvintes]) {
      // Um ouvinte quebrado (cliente SSE que acabou de cair) não pode impedir os outros de receber.
      try {
        ouvinte(e);
      } catch (erro) {
        console.error('Ouvinte do barramento falhou:', erro);
      }
    }
  }

  /** Devolve a função que cancela a assinatura. */
  assinar(fn: (e: EventoFogo) => void): () => void {
    this.ouvintes.add(fn);
    return () => {
      this.ouvintes.delete(fn);
    };
  }

  get ouvintesAtivos(): number {
    return this.ouvintes.size;
  }

  registrarPosicao(item: ItemPosicao): void {
    this.posicoesPendentes.set(`${item.tipo}:${item.id}`, item);
  }

  /** Emite um único evento `posicoes` com tudo o que mudou desde a última vez. Sem mudança, não emite. */
  descarregarPosicoes(): void {
    if (this.posicoesPendentes.size === 0) return;
    const itens = [...this.posicoesPendentes.values()];
    this.posicoesPendentes.clear();
    this.emitir({ tipo: 'posicoes', itens });
  }

  iniciarAgrupamento(ms = 2000): void {
    if (this.relogio) return;
    this.relogio = setInterval(() => this.descarregarPosicoes(), ms);
    this.relogio.unref();
  }

  parar(): void {
    if (this.relogio) clearInterval(this.relogio);
    this.relogio = undefined;
  }
}
