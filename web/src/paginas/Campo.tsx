// Modo Campo: a tela do agente de trânsito, guarda ou PM na rua, pensada para o celular (390 px) e fora da casca do
// gestor (sem menu lateral). Fecha o ciclo da Central: o gestor vê o agente no mapa, e o agente conta daqui o que
// acontece na rua (situação, chegada e conclusão do despacho, problemas nos equipamentos).
// Quem entra como agente vê direto o próprio painel; gestor e operador escolhem um agente (para acompanhar ou demonstrar).
import { useState } from 'react';
import { esquecerAgente, lerAgenteSalvo, salvarAgente } from '../campo/agenteSalvo';
import estilos from '../campo/Campo.module.css';
import { EscolhaDoAgente } from '../campo/EscolhaDoAgente';
import { PainelDoAgente } from '../campo/PainelDoAgente';
import { EstadoVazio } from '../componentes/EstadoVazio';
import { useUsuario } from '../sessao/Sessao';

export default function Campo() {
  const usuario = useUsuario();
  const [agenteId, setAgenteId] = useState(lerAgenteSalvo);

  const escolher = (id: number) => {
    salvarAgente(id);
    setAgenteId(id);
  };
  const trocar = () => {
    esquecerAgente();
    setAgenteId(undefined);
  };

  return (
    <div className={estilos.tela}>
      <header className={estilos.topo}>
        <span className={estilos.marca}>F.O.G.O.</span>
        <span className={estilos.modo}>Modo Campo</span>
      </header>
      <main className={estilos.conteudo}>
        {usuario?.papel === 'agente' ? (
          usuario.agenteId === null ? (
            <EstadoVazio titulo="Seu usuário não está ligado a um agente" descricao="Peça a um gestor para vincular o seu usuário ao seu cadastro de agente." />
          ) : (
            <PainelDoAgente key={usuario.agenteId} agenteId={usuario.agenteId} />
          )
        ) : agenteId === undefined ? (
          <EscolhaDoAgente onEscolher={escolher} />
        ) : (
          <PainelDoAgente key={agenteId} agenteId={agenteId} onTrocar={trocar} />
        )}
      </main>
    </div>
  );
}
