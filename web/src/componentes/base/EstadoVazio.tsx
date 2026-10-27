// Tela ou trecho sem conteúdo: diz o que é e o que fazer, sem pedir desculpas.
import type { ReactNode } from 'react';
import estilos from './EstadoVazio.module.css';

interface Props {
  titulo: string;
  descricao?: ReactNode;
  /** Ícone Phosphor cheio, já instanciado (`<Wrench weight="fill" />`). */
  icone?: ReactNode;
  acao?: ReactNode;
  /** `pagina` ocupa a área de conteúdo; `trecho` cabe dentro de uma lista ou painel. */
  tamanho?: 'pagina' | 'trecho';
}

export function EstadoVazio({ titulo, descricao, icone, acao, tamanho = 'trecho' }: Props) {
  const Titulo = tamanho === 'pagina' ? 'h1' : 'h2';
  return (
    <section className={`${estilos.vazio} ${tamanho === 'pagina' ? estilos.pagina : ''}`}>
      {icone && <span className={estilos.icone} aria-hidden="true">{icone}</span>}
      <Titulo className={estilos.titulo}>{titulo}</Titulo>
      {descricao && <p className={estilos.descricao}>{descricao}</p>}
      {acao && <div className={estilos.acao}>{acao}</div>}
    </section>
  );
}
