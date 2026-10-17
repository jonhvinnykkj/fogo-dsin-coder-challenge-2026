// Teste de fumaça: sobe o app de verdade (banco próprio, porta 3399) e confere que as três partes aparecem.
import { expect, test } from '@playwright/test';

const ROTULOS_INDICADORES = ['Equipamentos', 'Operacionais', 'Indisponíveis', 'Disponibilidade', 'Agentes em atividade', 'Alertas críticos'];

test('Central: seis indicadores e o mapa de Marília', async ({ page }) => {
  await page.goto('/');
  const faixa = page.getByRole('region', { name: 'Indicadores da cidade' });
  await expect(faixa).toBeVisible();
  for (const rotulo of ROTULOS_INDICADORES) {
    await expect(faixa.getByText(rotulo, { exact: true })).toBeVisible();
  }
  // Sem a chamada à API a faixa mostra "—"; com a cidade povoada, todos os valores viram número.
  await expect(faixa).not.toContainText('—');
  await expect(page.getByRole('region', { name: /Mapa ao vivo de Marília/ })).toBeVisible();
});

test('Previsões: cada módulo diz o que prevê', async ({ page }) => {
  await page.goto('/previsoes');
  await expect(page.getByText('O que prevê').first()).toBeVisible();
});

test('Equipamentos: a lista traz ao menos 10 linhas', async ({ page }) => {
  await page.goto('/equipamentos');
  await expect.poll(() => page.locator('tbody tr').count()).toBeGreaterThanOrEqual(10);
});

test('API: saúde responde', async ({ request }) => {
  const resposta = await request.get('/api/saude');
  expect(resposta.ok()).toBe(true);
  expect(await resposta.json()).toMatchObject({ ok: true });
});
