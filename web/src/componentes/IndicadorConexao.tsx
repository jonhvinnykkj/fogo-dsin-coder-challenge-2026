// Estado da conexão ao vivo, na faixa do topo: verde "Ao vivo", âmbar "Reconectando…".
import { Broadcast, CircleNotch, WifiSlash } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useTempoReal } from '../tempo-real/TempoReal';
import estilos from './IndicadorConexao.module.css';

export function IndicadorConexao() {
  const { conectado } = useTempoReal();
  const [jaConectou, setJaConectou] = useState(false);
  useEffect(() => {
    if (conectado) setJaConectou(true);
  }, [conectado]);

  const estado = conectado ? 'vivo' : jaConectou ? 'caiu' : 'conectando';
  return (
    <span
      className={`${estilos.indicador} ${estilos[estado]}`}
      role="status"
      title={estado === 'vivo' ? 'Recebendo os eventos da cidade em tempo real' : 'A tela tenta reconectar sozinha a cada 3 segundos'}
    >
      {estado === 'vivo' && <Broadcast weight="fill" size={16} aria-hidden="true" className={estilos.pulso} />}
      {estado === 'caiu' && <WifiSlash weight="fill" size={16} aria-hidden="true" />}
      {estado === 'conectando' && <CircleNotch weight="bold" size={16} aria-hidden="true" className={estilos.girar} />}
      <span>{estado === 'vivo' ? 'Ao vivo' : estado === 'caiu' ? 'Reconectando…' : 'Conectando…'}</span>
    </span>
  );
}
