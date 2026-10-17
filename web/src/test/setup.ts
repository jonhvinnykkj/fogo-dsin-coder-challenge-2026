// Preparação dos testes da interface (projeto 'web' do Vitest, ambiente jsdom).
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sem `globals: true` a Testing Library não limpa sozinha: cada teste começa com o DOM vazio.
afterEach(() => {
  cleanup();
});
