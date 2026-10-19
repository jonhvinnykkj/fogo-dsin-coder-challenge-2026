// O despacho do agente: o que aconteceu, onde, a que distância, e os dois passos dele ("cheguei" e "concluída").
import { BellRinging, CheckCircle, FlagCheckered, MapPin, MapTrifold, NavigationArrow, Siren } from '@phosphor-icons/react';
import { useId } from 'react';
import { formatarDistancia } from '../../../shared/campo';
import { ROTULO_TIPO_OCORRENCIA } from '../../../shared/dominio';
import { formatarDataHora, formatarRelativo } from '../../../shared/formato';
import { useConcluirDespacho, useDespacho, useRegistrarChegada } from '../api/campo';
import { AvisoErro } from '../componentes/AvisoErro';
import { Botao, classeBotao } from '../componentes/Botao';
import { EstadoVazio } from '../componentes/EstadoVazio';
import { useAgora } from '../util/useAgora';
import estilos from './Campo.module.css';

interface Props {
  agenteId: number;
  /** Chegou agora pelo tempo real: destaque até o agente agir. */
  novo: boolean;
  onAgiu: () => void;
}

const linkDoMapa = (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;

export function CartaoDespacho({ agenteId, novo, onAgiu }: Props) {
  const idTitulo = useId();
  const agora = useAgora(30_000);
  const consulta = useDespacho(agenteId);
  const chegada = useRegistrarChegada(agenteId);
  const conclusao = useConcluirDespacho(agenteId);
  const despacho = consulta.data;
  const o = despacho?.ocorrencia;
  const erro = chegada.error ?? conclusao.error;

  return (
    <section aria-labelledby={idTitulo} className={estilos.secao}>
      <h2 id={idTitulo} className={estilos.tituloSecao}>Despacho</h2>
      {novo && despacho && (
        <p role="alert" className={estilos.novoDespacho}>
          <BellRinging weight="fill" size={22} aria-hidden="true" /> Novo despacho!
        </p>
      )}
      {consulta.isError && <AvisoErro erro={consulta.error} titulo="Não foi possível carregar o despacho" onTentarDeNovo={() => void consulta.refetch()} />}
      {consulta.isSuccess && !despacho && (
        <EstadoVazio
          titulo="Nenhum despacho agora"
          descricao="Quando a Central mandar você para uma ocorrência, ela aparece aqui, com aviso e vibração."
          icone={<Siren weight="fill" />}
        />
      )}
      {despacho && o && (
        <article className={`${estilos.despacho} ${novo ? estilos.despachoNovo : ''}`}>
          <div className={estilos.despachoTopo}>
            <span className={estilos.tipoOcorrencia}>{ROTULO_TIPO_OCORRENCIA[o.tipo]}</span>
            <span className={estilos.gravidade}>Gravidade {o.gravidade} de 4</span>
          </div>
          <p className={estilos.descricao}>{o.descricao}</p>
          <p className={estilos.linhaIcone}>
            <MapPin weight="fill" size={20} aria-hidden="true" />
            <span>{despacho.logradouro ?? 'Local sem rua próxima'} · {despacho.bairroNome}</span>
          </p>
          <p className={estilos.linhaIcone}>
            <NavigationArrow weight="fill" size={20} aria-hidden="true" />
            <span>a {formatarDistancia(despacho.distanciaMetros)} de você</span>
          </p>
          <p className={estilos.suave}>
            Despachado {formatarRelativo(o.inicio, agora)}
            {despacho.chegouEm && ` · chegou às ${formatarDataHora(despacho.chegouEm).slice(-5)}`}
          </p>
          {erro && <AvisoErro erro={erro} titulo="Não foi possível registrar" />}
          <div className={estilos.acoesDespacho}>
            {despacho.chegouEm ? (
              <Botao
                variante="primario"
                className={estilos.botaoGrande}
                icone={<FlagCheckered weight="fill" size={22} aria-hidden="true" />}
                disabled={conclusao.isPending}
                onClick={() => conclusao.mutate(o.id, { onSuccess: onAgiu })}
              >
                Concluir ocorrência
              </Botao>
            ) : (
              <Botao
                variante="primario"
                className={estilos.botaoGrande}
                icone={<CheckCircle weight="fill" size={22} aria-hidden="true" />}
                disabled={chegada.isPending}
                onClick={() => chegada.mutate(o.id, { onSuccess: onAgiu })}
              >
                Cheguei ao local
              </Botao>
            )}
            <a className={`${classeBotao('secundario')} ${estilos.botaoGrande}`} href={linkDoMapa(o.lat, o.lng)} target="_blank" rel="noreferrer">
              <MapTrifold weight="fill" size={22} aria-hidden="true" />
              <span>Abrir no mapa</span>
            </a>
          </div>
        </article>
      )}
    </section>
  );
}
