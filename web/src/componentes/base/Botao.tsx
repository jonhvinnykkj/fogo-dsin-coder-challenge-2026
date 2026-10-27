// Botão em pílula. Primário = laranja-fogo com texto grafite (a cor de ação do F.O.G.O.).
// Ícone sempre acompanhado de palavra; só o botão `soIcone` dispensa a palavra visível e exige `aria-label`.
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import estilos from './Botao.module.css';

export type VarianteBotao = 'primario' | 'secundario' | 'fantasma' | 'perigo';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao;
  tamanho?: 'normal' | 'pequeno';
  icone?: ReactNode;
  soIcone?: boolean;
}

/** Classes do botão, para um `<Link>` com a mesma aparência. */
export function classeBotao(variante: VarianteBotao = 'secundario', tamanho: 'normal' | 'pequeno' = 'normal'): string {
  return [estilos.botao, estilos[variante], tamanho === 'pequeno' ? estilos.pequeno : ''].filter(Boolean).join(' ');
}

export function Botao({ variante = 'secundario', tamanho = 'normal', icone, soIcone = false, className, children, type = 'button', ...resto }: Props) {
  return (
    <button type={type} className={[classeBotao(variante, tamanho), soIcone ? estilos.soIcone : '', className ?? ''].filter(Boolean).join(' ')} {...resto}>
      {icone}
      {children !== undefined && <span>{children}</span>}
    </button>
  );
}
