// "Quem é você?": o agente escolhe o próprio nome uma vez; a escolha fica guardada no aparelho.
import { MagnifyingGlass } from '@phosphor-icons/react';
import { useState } from 'react';
import { ROTULO_CATEGORIA_AGENTE } from '../../../shared/dominio';
import { useAgentes } from '../api/consultas';
import { AvisoErro } from '../componentes/AvisoErro';
import { EstadoVazio } from '../componentes/EstadoVazio';
import { EtiquetaSituacaoAgente } from '../componentes/EtiquetaSituacaoAgente';
import { useAtraso } from '../util/useAtraso';
import estilos from './Campo.module.css';

export function EscolhaDoAgente({ onEscolher }: { onEscolher: (id: number) => void }) {
  const [busca, setBusca] = useState('');
  const buscaAtrasada = useAtraso(busca.trim());
  const consulta = useAgentes({ ...(buscaAtrasada && { busca: buscaAtrasada }), porPagina: 100 });

  return (
    <section className={estilos.escolha}>
      <h1 className={estilos.tituloPagina}>Quem é você?</h1>
      <p className={estilos.suave}>Escolha seu nome para começar o turno. A escolha fica guardada neste celular.</p>
      <label className={estilos.busca}>
        <MagnifyingGlass size={20} aria-hidden="true" />
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou matrícula" aria-label="Buscar por nome ou matrícula" />
      </label>
      {consulta.isError && <AvisoErro erro={consulta.error} titulo="Não foi possível carregar os agentes" onTentarDeNovo={() => void consulta.refetch()} />}
      {consulta.data?.itens.length === 0 && <EstadoVazio titulo="Nenhum agente encontrado" descricao="Confira o nome ou a matrícula." />}
      <ul className={estilos.listaAgentes}>
        {consulta.data?.itens.map((a) => (
          <li key={a.id}>
            <button type="button" className={estilos.opcaoAgente} onClick={() => onEscolher(a.id)}>
              <span className={estilos.nomeAgente}>{a.nome}</span>
              <span className={estilos.suave}>{a.matricula} · {ROTULO_CATEGORIA_AGENTE[a.categoria]} · base {a.baseBairroNome}</span>
              <EtiquetaSituacaoAgente situacao={a.situacao} tamanho="compacta" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
