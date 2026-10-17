import '@fontsource-variable/archivo/wdth.css'; // Archivo com eixos de peso e largura, local (funciona sem internet)
import './estilo/tokens.css';
import './estilo/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { aplicarTema, lerTemaSalvo } from './estilo/tema';

// O index.html já aplica o tema antes de pintar; isto cobre o caso de o script inline não ter rodado.
aplicarTema(lerTemaSalvo());

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
