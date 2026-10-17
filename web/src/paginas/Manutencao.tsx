// Quadro de manutenção: quatro colunas por urgência (atrasadas, imediatas, próximos 7 dias, próximos 30 dias). Cada
// cartão leva à ficha e tem "Registrar manutenção" (o mesmo diálogo da ficha do equipamento): ao registrar, o servidor
// recalcula a próxima data e, se o equipamento estava parado, volta a operacional — o cartão muda de coluna sozinho.
import { CalendarCheck, CalendarDots, Clock, MapPin, Wrench, WarningOctagon, type Icon } from '@phosphor-icons/react';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { COR_CRITICIDADE } from '../../../shared/dominio';
import { formatarNumero } from '../../../shared/formato';
import type { Equipamento, PainelManutencao } from '../../../shared/modelos';
import { usePainelManutencao } from '../api/consultas';
import { AvisoErro } from '../componentes/AvisoErro';
import { Botao } from '../componentes/Botao';
import { DialogoManutencao } from '../componentes/DialogoManutencao';
import { EtiquetaSituacao } from '../componentes/EtiquetaSituacao';
import { IconeTipo } from '../componentes/IconeTipo';
import { Notificacao, type DadosNotificacao } from '../componentes/Notificacao';
import { corDoTexto } from '../estilo/contraste';
import { formatarDia, hojeIso } from '../util/datas';
import lista from './Lista.module.css';
import estilos from './Manutencao.module.css';

type Coluna = keyof PainelManutencao;

const COLUNAS: { chave: Coluna; titulo: string; descricao: (hoje: string) => string; cor: string; Icone: Icon }[] = [
  { chave: 'atrasadas', titulo: 'Atrasadas', descricao: () => 'A data da manutenção programada já passou', cor: COR_CRITICIDADE.critica, Icone: WarningOctagon },
  { chave: 'imediatas', titulo: 'Imediatas', descricao: () => 'Pedido de conserto agora (falha, furto ou vistoria)', cor: COR_CRITICIDADE.alta, Icone: Wrench },
  { chave: 'proximos7', titulo: 'Próximos 7 dias', descricao: (h) => `Programadas de hoje até ${formatarDia(somarDias(h, 7)).slice(0, 5)}`, cor: COR_CRITICIDADE.media, Icone: Clock },
  { chave: 'proximos30', titulo: 'Próximos 30 dias', descricao: (h) => `Programadas de ${formatarDia(somarDias(h, 8)).slice(0, 5)} a ${formatarDia(somarDias(h, 30)).slice(0, 5)}`, cor: COR_CRITICIDADE.baixa, Icone: CalendarDots },
];

/** Datas de calendário "aaaa-mm-dd" sem passar pelo fuso (meio-dia UTC não vira o dia anterior). */
function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
}

const dias = (n: number) => (n === 1 ? '1 dia' : `${formatarNumero(n)} dias`);

function quando(e: Equipamento, coluna: Coluna, hoje: string): string {
  if (coluna === 'imediatas') return e.proximaManutencao ? `Conserto pedido agora; revisão de rotina em ${formatarDia(e.proximaManutencao)}` : 'Conserto pedido agora';
  if (!e.proximaManutencao) return 'Sem data';
  const n = diasEntre(hoje, e.proximaManutencao);
  if (coluna === 'atrasadas') return `Venceu em ${formatarDia(e.proximaManutencao)}, há ${dias(-n)}`;
  if (n === 0) return `Prevista para hoje, ${formatarDia(e.proximaManutencao)}`;
  return `Prevista para ${formatarDia(e.proximaManutencao)}, em ${dias(n)}`;
}

export default function Manutencao() {
  const painel = usePainelManutencao();
  const [registrando, setRegistrando] = useState<Equipamento | null>(null);
  const [aviso, setAviso] = useState<DadosNotificacao | null>(null);
  const fecharAviso = useCallback(() => setAviso(null), []);
  const hoje = hojeIso();

  const total = painel.data ? COLUNAS.reduce((s, c) => s + painel.data[c.chave].length, 0) : 0;
  const urgentes = painel.data ? painel.data.atrasadas.length + painel.data.imediatas.length : 0;

  return (
    <div className={`pagina ${estilos.pagina}`}>
      <header className={lista.cabecalho}>
        <h1 className={lista.titulo}>Manutenção</h1>
        {painel.data && (
          <p className={lista.total}>
            {formatarNumero(total)} equipamentos no quadro, {urgentes === 0 ? 'nenhum urgente' : `${formatarNumero(urgentes)} pedem ação agora`}
          </p>
        )}
      </header>

      {painel.isError && !painel.data && (
        <AvisoErro erro={painel.error} titulo="Não foi possível carregar o quadro" onTentarDeNovo={() => void painel.refetch()} tentando={painel.isFetching} />
      )}

      <div className={estilos.quadro}>
        {COLUNAS.map(({ chave, titulo, descricao, cor, Icone }) => {
          const itens = painel.data?.[chave];
          const idTitulo = `coluna-${chave}`;
          return (
            <section key={chave} className={estilos.coluna} aria-labelledby={idTitulo}>
              <header className={estilos.topo} style={{ background: cor, color: corDoTexto(cor) }}>
                <span className={`${estilos.contagem} numeros`}>{itens ? formatarNumero(itens.length) : '—'}</span>
                <span className={estilos.titulos}>
                  <h2 id={idTitulo} className={estilos.titulo}>
                    <Icone weight="fill" size={16} aria-hidden="true" />
                    {titulo}
                  </h2>
                  <span className={estilos.descricao}>{descricao(hoje)}</span>
                </span>
              </header>
              <div className={estilos.cartoes}>
                {painel.isPending && [0, 1, 2].map((i) => <div key={i} className={estilos.esqueleto} />)}
                {itens?.length === 0 && (
                  <p className={estilos.vazia}>
                    <CalendarCheck weight="fill" size={18} aria-hidden="true" />
                    Nenhum equipamento aqui.
                  </p>
                )}
                {itens && itens.length > 0 && (
                  <ul className={estilos.lista}>
                    {itens.map((e) => (
                      <li key={e.id} className={estilos.cartao}>
                        <div className={estilos.cartaoTopo}>
                          <Link to={`/equipamentos/${e.id}`} className={lista.codigo}>{e.codigo}</Link>
                          <EtiquetaSituacao situacao={e.situacao} tamanho="compacta" />
                        </div>
                        <div className={estilos.cartaoDados}>
                          <IconeTipo tipo={e.tipo} rotulo="curto" tamanho={16} />
                          <span className={estilos.bairro}>
                            <MapPin weight="fill" size={14} aria-hidden="true" />
                            {e.bairroNome}
                          </span>
                        </div>
                        <p className={estilos.data}>{quando(e, chave, hoje)}</p>
                        <Botao tamanho="pequeno" icone={<Wrench weight="fill" size={14} aria-hidden="true" />} onClick={() => setRegistrando(e)} className={estilos.registrar}>
                          Registrar manutenção
                        </Botao>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {registrando && (
        <DialogoManutencao
          aberto
          onFechar={() => setRegistrando(null)}
          equipamento={registrando}
          onRegistrada={() => setAviso({ id: Date.now(), titulo: 'Manutenção registrada', texto: `${registrando.codigo}: o quadro já mostra a nova situação.`, tom: 'ok' })}
        />
      )}
      <Notificacao notificacao={aviso} onFechar={fecharAviso} />
    </div>
  );
}
