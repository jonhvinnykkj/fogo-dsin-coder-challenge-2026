// Campo de característica particular de um tipo de equipamento (catálogo em shared/tipos-equipamento.ts).
// Texto, número (aceita vírgula), sim/não ou lista de opções, com unidade, faixa permitida e erro de validação.
import { WarningCircle } from '@phosphor-icons/react';
import { useEffect, useId, useState } from 'react';
import { formatarNumero } from '../../../../shared/formato';
import type { CampoCaracteristica } from '../../../../shared/tipos-equipamento';
import estilos from './CampoDinamico.module.css';

interface Props {
  campo: CampoCaracteristica;
  valor: unknown;
  /** Número válido vira `number`; vazio vira `undefined`; texto que não é número segue como texto para a validação apontar. */
  onChange: (valor: unknown) => void;
  erro?: string;
}

function lerNumero(texto: string): number | string | undefined {
  const limpo = texto.trim();
  if (limpo === '') return undefined;
  // Vírgula ou ponto como separador decimal (os campos do catálogo não chegam a milhar: o maior é 3650).
  const n = Number(limpo.replace(',', '.'));
  return Number.isFinite(n) ? n : texto;
}

function textoDoNumero(valor: unknown): string {
  if (typeof valor === 'number') return String(valor).replace('.', ',');
  return typeof valor === 'string' ? valor : '';
}

export function CampoDinamico({ campo, valor, onChange, erro }: Props) {
  const id = useId();
  const idAjuda = `${id}-ajuda`;
  const idDica = `${id}-dica`;
  const idErro = `${id}-erro`;
  const descricao = [campo.tipo === 'numero' ? idAjuda : '', campo.dica ? idDica : '', erro ? idErro : ''].filter(Boolean).join(' ') || undefined;

  const rotulo = (
    <>
      {campo.rotulo}
      {!campo.obrigatorio && <span className={estilos.opcional}> (opcional)</span>}
    </>
  );

  if (campo.tipo === 'booleano') {
    return (
      <div className={estilos.campo}>
        <label className={estilos.caixa}>
          <input
            type="checkbox"
            checked={valor === true}
            onChange={(e) => onChange(e.target.checked)}
            aria-invalid={erro ? true : undefined}
            aria-describedby={descricao}
          />
          <span className={estilos.marca} aria-hidden="true" />
          <span className={estilos.rotuloCaixa}>{rotulo}</span>
        </label>
        {campo.dica && <span id={idDica} className={estilos.ajuda}>{campo.dica}</span>}
        {erro && <Erro id={idErro} texto={erro} />}
      </div>
    );
  }

  return (
    <div className={estilos.campo}>
      <label htmlFor={id} className={estilos.rotulo}>{rotulo}</label>
      {campo.tipo === 'opcao' ? (
        <select
          id={id}
          className={estilos.entrada}
          value={typeof valor === 'string' ? valor : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descricao}
          required={campo.obrigatorio}
        >
          <option value="">Escolha…</option>
          {campo.opcoes?.map((o) => (
            <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
          ))}
        </select>
      ) : campo.tipo === 'numero' ? (
        <CampoNumero id={id} campo={campo} valor={valor} onChange={onChange} invalido={Boolean(erro)} descricao={descricao} />
      ) : (
        <input
          id={id}
          className={estilos.entrada}
          type="text"
          value={typeof valor === 'string' ? valor : ''}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descricao}
          required={campo.obrigatorio}
        />
      )}
      {campo.tipo === 'numero' && campo.min !== undefined && campo.max !== undefined && (
        <span id={idAjuda} className={estilos.ajuda}>
          De {formatarNumero(campo.min)} a {formatarNumero(campo.max)}{campo.unidade ? ` ${campo.unidade}` : ''}
        </span>
      )}
      {campo.dica && <span id={idDica} className={estilos.ajuda}>{campo.dica}</span>}
      {erro && <Erro id={idErro} texto={erro} />}
    </div>
  );
}

function CampoNumero({ id, campo, valor, onChange, invalido, descricao }: {
  id: string; campo: CampoCaracteristica; valor: unknown; onChange: (v: unknown) => void; invalido: boolean; descricao: string | undefined;
}) {
  // Texto local: deixa digitar "12," sem o campo apagar a vírgula no meio do caminho.
  const [texto, setTexto] = useState(() => textoDoNumero(valor));
  useEffect(() => {
    if (lerNumero(texto) !== valor) setTexto(textoDoNumero(valor));
    // Só reage ao valor vindo de fora (formulário recarregado); `texto` fica de fora de propósito.
  }, [valor]);

  return (
    <div className={estilos.comUnidade}>
      <input
        id={id}
        className={estilos.entrada}
        type="text"
        inputMode="decimal"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          onChange(lerNumero(e.target.value));
        }}
        aria-invalid={invalido || undefined}
        aria-describedby={descricao}
        required={campo.obrigatorio}
      />
      {campo.unidade && <span className={estilos.unidade} aria-hidden="true">{campo.unidade}</span>}
    </div>
  );
}

function Erro({ id, texto }: { id: string; texto: string }) {
  return (
    <span id={id} className={estilos.erro}>
      <WarningCircle weight="fill" size={16} aria-hidden="true" />
      {texto}
    </span>
  );
}
