// A marca é uma placa: laranja-fogo, grafite por cima, letras largas (igual à faixa do app, na escala 1920).
import { fonte, marca } from '../tema';

interface Props {
  altura?: number;
  largura?: number;
  tamanho?: number;
}

export function Marca({ altura = 80, largura = 326, tamanho = 34 }: Props) {
  return (
    <div
      style={{
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        boxSizing: 'border-box',
        width: largura,
        height: altura,
        paddingLeft: 28,
        background: marca.fogo,
        color: marca.sobreFogo,
        fontFamily: fonte.familia,
        fontSize: tamanho,
        fontWeight: 900,
        fontStretch: fonte.expandida,
        letterSpacing: '0.02em',
        lineHeight: 1,
      }}
    >
      F.O.G.O.
    </div>
  );
}
