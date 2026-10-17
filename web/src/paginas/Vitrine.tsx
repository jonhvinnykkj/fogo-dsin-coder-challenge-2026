// Vitrine dos componentes base, com dados reais do servidor. Só existe em desenvolvimento (/vitrine):
// serve para conferir a identidade visual nos dois temas e para as próximas telas reaproveitarem os componentes.
import { Plus, Tray } from '@phosphor-icons/react';
import { useState } from 'react';
import { ROTULO_SITUACAO, SITUACOES_EQUIPAMENTO, COR_SITUACAO, COR_CRITICIDADE, REGIOES } from '../../../shared/dominio';
import { formatarPct, formatarRelativo } from '../../../shared/formato';
import type { Equipamento } from '../../../shared/modelos';
import { TIPOS_EQUIPAMENTO, tipoPorId } from '../../../shared/tipos-equipamento';
import { ErroApi } from '../api/cliente';
import { useEquipamentos, useIndicadores, usePrevisao } from '../api/consultas';
import { AvisoErro } from '../componentes/AvisoErro';
import { BarraFiltros, type ValorFiltro } from '../componentes/BarraFiltros';
import { BlocoIndicador } from '../componentes/BlocoIndicador';
import { Botao } from '../componentes/Botao';
import { CampoDinamico } from '../componentes/CampoDinamico';
import { CartaoExplicacao } from '../componentes/CartaoExplicacao';
import { EstadoVazio } from '../componentes/EstadoVazio';
import { EtiquetaSituacao } from '../componentes/EtiquetaSituacao';
import { Gaveta } from '../componentes/Gaveta';
import { IconeTipo } from '../componentes/IconeTipo';
import { MapaBase } from '../componentes/MapaBase';
import { Tabela, type Coluna } from '../componentes/Tabela';
import estilos from './Vitrine.module.css';

const COLUNAS: Coluna<Equipamento>[] = [
  { chave: 'codigo', titulo: 'Código', render: (e) => <strong className="numeros">{e.codigo}</strong>, semQuebra: true },
  { chave: 'tipo', titulo: 'Tipo', render: (e) => <IconeTipo tipo={e.tipo} rotulo="curto" /> },
  { chave: 'situacao', titulo: 'Situação', render: (e) => <EtiquetaSituacao situacao={e.situacao} tamanho="compacta" /> },
  { chave: 'bairro', titulo: 'Bairro', render: (e) => e.bairroNome, esconderNoCelular: true },
  { chave: 'marca', titulo: 'Marca e modelo', render: (e) => `${e.marca} ${e.modelo}`, esconderNoCelular: true },
  { chave: 'sinal', titulo: 'Último sinal', render: (e) => (e.ultimoSinalEm ? formatarRelativo(e.ultimoSinalEm, new Date()) : 'Sem sinal'), alinhar: 'direita', esconderNoCelular: true },
];

export default function Vitrine() {
  const { data: ind } = useIndicadores();
  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState<Record<string, ValorFiltro>>({});
  const [busca, setBusca] = useState('');
  const lista = useEquipamentos({
    pagina,
    porPagina: 8,
    busca: busca || undefined,
    situacao: filtros.situacao?.[0] as Equipamento['situacao'] | undefined,
    regiao: filtros.regiao as Equipamento['regiao'] | undefined,
  });
  const backtest = usePrevisao('backtest');
  const [caracteristicas, setCaracteristicas] = useState<Record<string, unknown>>({ modalidade: 'velocidade', velocidadeMaxima: 60, faixas: 9 });
  const [gaveta, setGaveta] = useState(false);

  return (
    <div className={`pagina ${estilos.vitrine}`}>
      <header className={estilos.cabecalho}>
        <h1 className={estilos.titulo}>Componentes base</h1>
        <p className={estilos.descricao}>Identidade visual do F.O.G.O. com os dados reais da cidade. Só aparece em desenvolvimento.</p>
      </header>

      <section className={estilos.secao} aria-labelledby="v-ind">
        <h2 id="v-ind">Indicadores ao vivo</h2>
        {ind && (
          <div className={estilos.indicadores}>
            <BlocoIndicador rotulo="Equipamentos" valor={ind.totalEquipamentos} cor="neutro" detalhe={`${ind.naoInstalados} não instalados`} />
            <BlocoIndicador rotulo="Operacionais" valor={ind.operacionais} cor={COR_SITUACAO.operacional} />
            <BlocoIndicador rotulo="Indisponíveis" valor={ind.indisponiveis} cor={COR_SITUACAO.mau_funcionamento} detalhe="falha, manutenção ou furto" />
            <BlocoIndicador rotulo="Disponibilidade" valor={formatarPct(ind.disponibilidadePct)} cor="marca" />
            <BlocoIndicador rotulo="Agentes em atividade" valor={ind.agentesEmAtividade} cor={COR_SITUACAO.em_manutencao} detalhe={`de ${ind.agentesTotal}`} />
            <BlocoIndicador rotulo="Alertas críticos" valor={ind.alertasCriticosAbertos} cor={COR_CRITICIDADE.critica} detalhe={`${ind.alertasAbertos} abertos ao todo`} />
          </div>
        )}
      </section>

      <div className={estilos.duas}>
        <section className={estilos.secao} aria-labelledby="v-sit">
          <h2 id="v-sit">Situação</h2>
          <div className={estilos.linha}>
            {SITUACOES_EQUIPAMENTO.map((s) => (
              <EtiquetaSituacao key={s} situacao={s} />
            ))}
          </div>
        </section>
        <section className={estilos.secao} aria-labelledby="v-tipos">
          <h2 id="v-tipos">Tipos de equipamento</h2>
          <div className={estilos.tipos}>
            {TIPOS_EQUIPAMENTO.map((t) => (
              <IconeTipo key={t.id} tipo={t.id} rotulo="curto" />
            ))}
          </div>
        </section>
      </div>

      <section className={estilos.secao} aria-labelledby="v-tab">
        <h2 id="v-tab">Filtros e tabela</h2>
        <BarraFiltros
          busca={{ valor: busca, onChange: (v) => { setBusca(v); setPagina(1); }, placeholder: 'Código, série, marca, rua ou bairro' }}
          filtros={[
            { tipo: 'pilulas', chave: 'situacao', rotulo: 'Situação', opcoes: SITUACOES_EQUIPAMENTO.slice(1, 6).map((s) => ({ valor: s, rotulo: ROTULO_SITUACAO[s], cor: COR_SITUACAO[s] })) },
            { tipo: 'selecao', chave: 'regiao', rotulo: 'Região', opcoes: REGIOES.map((r) => ({ valor: r, rotulo: r })), rotuloTodos: 'Todas' },
          ]}
          valores={filtros}
          onChange={(chave, valor) => {
            // a lista aceita uma situação por vez: fica a última escolhida
            setFiltros((f) => ({ ...f, [chave]: Array.isArray(valor) ? valor.slice(-1) : valor }));
            setPagina(1);
          }}
          onLimpar={() => { setFiltros({}); setBusca(''); setPagina(1); }}
          acoes={<Botao variante="primario" icone={<Plus weight="fill" size={16} aria-hidden="true" />}>Cadastrar equipamento</Botao>}
        />
        {lista.isError ? (
          <AvisoErro erro={lista.error} titulo="Não foi possível carregar os equipamentos" onTentarDeNovo={() => void lista.refetch()} tentando={lista.isFetching} />
        ) : (
          <Tabela
            legenda="Equipamentos cadastrados"
            colunas={COLUNAS}
            linhas={lista.data?.itens}
            chaveLinha={(e) => e.id}
            carregando={lista.isPending}
            onLinha={() => setGaveta(true)}
            paginacao={lista.data ? { pagina, porPagina: 8, total: lista.data.total, onMudar: setPagina } : undefined}
          />
        )}
      </section>

      <div className={estilos.duas}>
        <section className={estilos.secao} aria-labelledby="v-campos">
          <h2 id="v-campos">Campos por tipo (radar)</h2>
          <div className={`formulario ${estilos.campos}`}>
            {tipoPorId('radar').campos.map((c) => (
              <CampoDinamico
                key={c.chave}
                campo={c}
                valor={caracteristicas[c.chave]}
                onChange={(v) => setCaracteristicas((x) => ({ ...x, [c.chave]: v }))}
                {...(c.chave === 'faixas' ? { erro: 'Faixas monitoradas precisa ficar entre 1 a 6' } : {})}
              />
            ))}
            <CampoDinamico campo={tipoPorId('camera').campos[1]!} valor={caracteristicas.visaoNoturna} onChange={(v) => setCaracteristicas((x) => ({ ...x, visaoNoturna: v }))} />
          </div>
        </section>
        <section className={`${estilos.secao} ${estilos.secaoMapa}`} aria-labelledby="v-mapa">
          <h2 id="v-mapa">Mapa base</h2>
          <div className={estilos.mapa}>
            <MapaBase />
          </div>
        </section>
      </div>

      <section className={estilos.secao} aria-labelledby="v-exp">
        <h2 id="v-exp">Explicação de previsão</h2>
        {backtest.data && <CartaoExplicacao explicacao={backtest.data.explicacao} titulo="Teste retroativo do risco" />}
      </section>

      <div className={estilos.duas}>
        <section className={estilos.secao} aria-labelledby="v-erro">
          <h2 id="v-erro">Erro</h2>
          <AvisoErro erro={new ErroApi(0, 'Sem conexão com o servidor do F.O.G.O.')} titulo="Não foi possível carregar os alertas" onTentarDeNovo={() => undefined} />
        </section>
        <section className={estilos.secao} aria-labelledby="v-vazio">
          <h2 id="v-vazio">Vazio</h2>
          <EstadoVazio titulo="Nenhum alerta aberto" descricao="Quando um equipamento parar ou algo acontecer na cidade, o alerta aparece aqui na hora." icone={<Tray weight="fill" />} />
        </section>
      </div>

      <Gaveta
        aberta={gaveta}
        onFechar={() => setGaveta(false)}
        titulo="Ficha lateral"
        subtitulo={<EtiquetaSituacao situacao="operacional" tamanho="compacta" />}
        rodape={<Botao variante="primario" onClick={() => setGaveta(false)}>Entendi</Botao>}
      >
        <p>A ficha do equipamento abre aqui na Central, ao lado do mapa.</p>
      </Gaveta>
    </div>
  );
}
