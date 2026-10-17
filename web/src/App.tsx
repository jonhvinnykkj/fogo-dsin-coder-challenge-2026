// Raiz do app: cache de dados (TanStack Query), uma conexão de tempo real e as rotas.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { deveTentarDeNovo } from './api/consultas';
import { criarRoteador } from './rotas';
import { TempoRealProvider } from './tempo-real/TempoReal';

export function App() {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: deveTentarDeNovo,
            refetchOnWindowFocus: false, // o tempo real já mantém a tela em dia
          },
        },
      }),
  );
  const [roteador] = useState(criarRoteador);

  return (
    <QueryClientProvider client={qc}>
      <TempoRealProvider>
        <RouterProvider router={roteador} />
      </TempoRealProvider>
    </QueryClientProvider>
  );
}
