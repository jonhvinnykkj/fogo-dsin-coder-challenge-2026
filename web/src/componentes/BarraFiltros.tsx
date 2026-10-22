// Barra de filtros em pílulas. Filtro escolhido vira bloco cheio (grafite, ou a cor da situação), para ler de longe
// o que está filtrado. Seleção única usa <select> nativo (acessível e bom no celular); `pilulas` permite várias.
import { CaretDown, MagnifyingGlass, X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { corDoTexto } from '../estilo/contraste';
import { Botao } from './Botao';
import estilos from './BarraFiltros.module.css';

export interface OpcaoFiltro {
  valor: string;
  rotulo: string;
  /** Cor cheia quando ativa (ex.: cor da situação). */
  cor?: string;
}

/** `grupo`: filtros seguidos com o mesmo grupo saem juntos, sob um título que diz o que eles afetam (ex.: "Só agentes"). */
export type DefinicaoFiltro =
  | { tipo: 'selecao'; chave: string; rotulo: string; opcoes: OpcaoFiltro[]; rotuloTodos?: string; grupo?: string }
  | { tipo: 'pilulas'; chave: string; rotulo: string; opcoes: OpcaoFiltro[]; grupo?: string };

export type ValorFiltro = string | string[] | undefined;

interface Props {
  filtros: DefinicaoFiltro[];
  valores: Record<string, ValorFiltro>;
  onChange: (chave: string, valor: ValorFiltro) => void;
  busca?: { valor: string; onChange: (valor: string) => void; placeholder: string; rotulo?: string };
  onLimpar?: () => void;
  /** Ações à direita (ex.: "Cadastrar equipamento"). */
  acoes?: ReactNode;
}

function estaAtivo(v: ValorFiltro): boolean {
  return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== '';
}

/** Agrupa os filtros seguidos que têm o mesmo `grupo`; os sem grupo seguem soltos, como sempre. */
function agruparFiltros(filtros: DefinicaoFiltro[]): { titulo?: string; filtros: DefinicaoFiltro[] }[] {
  const grupos: { titulo?: string; filtros: DefinicaoFiltro[] }[] = [];
  for (const f of filtros) {
    const ultimo = grupos[grupos.length - 1];
    if (f.grupo !== undefined && ultimo?.titulo === f.grupo) ultimo.filtros.push(f);
    else if (f.grupo === undefined && ultimo && ultimo.titulo === undefined) ultimo.filtros.push(f);
    else grupos.push({ ...(f.grupo !== undefined && { titulo: f.grupo }), filtros: [f] });
  }
  return grupos;
}

export function BarraFiltros({ filtros, valores, onChange, busca, onLimpar, acoes }: Props) {
  const algumAtivo = filtros.some((f) => estaAtivo(valores[f.chave])) || Boolean(busca?.valor);

  return (
    <div className={estilos.barra} role="search" aria-label="Filtros">
      {busca && (
        <label className={estilos.busca}>
          <MagnifyingGlass weight="fill" size={16} aria-hidden="true" />
          <span className="so-leitor">{busca.rotulo ?? 'Buscar'}</span>
          <input type="search" value={busca.valor} placeholder={busca.placeholder} onChange={(e) => busca.onChange(e.target.value)} />
        </label>
      )}

      {agruparFiltros(filtros).map((g) => {
        const itens = g.filtros.map((f) => (f.tipo === 'selecao' ? (
          <FiltroSelecao key={f.chave} def={f} valor={valores[f.chave] as string | undefined} onChange={(v) => onChange(f.chave, v)} />
        ) : (
          <FiltroPilulas key={f.chave} def={f} valor={(valores[f.chave] as string[] | undefined) ?? []} onChange={(v) => onChange(f.chave, v.length ? v : undefined)} />
        )));
        return g.titulo === undefined ? itens : (
          <div key={g.titulo} className={estilos.bloco} role="group" aria-label={g.titulo}>
            <span className={estilos.tituloBloco}>{g.titulo}</span>
            <div className={estilos.itensBloco}>{itens}</div>
          </div>
        );
      })}

      {onLimpar && algumAtivo && (
        <Botao variante="fantasma" tamanho="pequeno" icone={<X weight="bold" size={14} aria-hidden="true" />} onClick={onLimpar}>
          Limpar filtros
        </Botao>
      )}

      {acoes && <div className={estilos.acoes}>{acoes}</div>}
    </div>
  );
}

function FiltroSelecao({ def, valor, onChange }: { def: Extract<DefinicaoFiltro, { tipo: 'selecao' }>; valor: string | undefined; onChange: (v: string | undefined) => void }) {
  const ativo = estaAtivo(valor);
  return (
    <label className={`${estilos.selecao} ${ativo ? estilos.ativo : ''}`}>
      <span className={estilos.rotulo}>{def.rotulo}</span>
      <select value={valor ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{def.rotuloTodos ?? 'Todos'}</option>
        {def.opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>{o.rotulo}</option>
        ))}
      </select>
      <CaretDown weight="fill" size={12} aria-hidden="true" className={estilos.seta} />
    </label>
  );
}

function FiltroPilulas({ def, valor, onChange }: { def: Extract<DefinicaoFiltro, { tipo: 'pilulas' }>; valor: string[]; onChange: (v: string[]) => void }) {
  const alternar = (v: string) => onChange(valor.includes(v) ? valor.filter((x) => x !== v) : [...valor, v]);
  return (
    <div className={estilos.grupo} role="group" aria-label={def.rotulo}>
      {def.opcoes.map((o) => {
        const ativa = valor.includes(o.valor);
        const estilo = ativa && o.cor ? { backgroundColor: o.cor, color: corDoTexto(o.cor) } : undefined;
        return (
          <button key={o.valor} type="button" aria-pressed={ativa} className={`${estilos.pilula} ${ativa ? estilos.ativo : ''}`} style={estilo} onClick={() => alternar(o.valor)}>
            {o.cor && !ativa && <span className={estilos.amostra} style={{ backgroundColor: o.cor }} aria-hidden="true" />}
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}
