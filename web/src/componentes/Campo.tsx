// Campo de formulário com rótulo, ajuda e erro (texto, lista, data…). Visual igual ao CampoDinamico.
// O controle recebe `id` e os atributos de acessibilidade por função: `{(p) => <input {...p} />}`.
import { WarningCircle } from '@phosphor-icons/react';
import { useId, type ReactNode } from 'react';
import estilos from './CampoDinamico.module.css';

export interface PropsControle {
  id: string;
  className: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}

interface Props {
  rotulo: string;
  erro?: string;
  ajuda?: ReactNode;
  opcional?: boolean;
  children: (props: PropsControle) => ReactNode;
  className?: string;
}

export function Campo({ rotulo, erro, ajuda, opcional = false, children, className }: Props) {
  const id = useId();
  const idAjuda = `${id}-ajuda`;
  const idErro = `${id}-erro`;
  const descricao = [ajuda ? idAjuda : '', erro ? idErro : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`${estilos.campo} ${className ?? ''}`}>
      <label htmlFor={id} className={estilos.rotulo}>
        {rotulo}
        {opcional && <span className={estilos.opcional}> (opcional)</span>}
      </label>
      {children({ id, className: estilos.entrada, ...(erro ? { 'aria-invalid': true as const } : {}), ...(descricao ? { 'aria-describedby': descricao } : {}) })}
      {ajuda && <span id={idAjuda} className={estilos.ajuda}>{ajuda}</span>}
      {erro && (
        <span id={idErro} className={estilos.erro}>
          <WarningCircle weight="fill" size={16} aria-hidden="true" />
          {erro}
        </span>
      )}
    </div>
  );
}
