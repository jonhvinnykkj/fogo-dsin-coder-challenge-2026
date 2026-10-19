// Raiz do app: cache de dados (TanStack Query), a sessão e as rotas. O tempo real só abre depois de entrar (rotas.tsx).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { deveTentarDeNovo } from './api/consultas';
import { criarRoteador } from './rotas';
import { SessaoProvider } from './sessao/Sessao';

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
      <SessaoProvider>
        <RouterProvider router={roteador} />
      </SessaoProvider>
    </QueryClientProvider>
  );
}
