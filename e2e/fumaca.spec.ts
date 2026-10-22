// Teste de fumaça: sobe o app de verdade (banco próprio, porta 3399) e confere que as três partes aparecem.
import { expect, test, type Page } from '@playwright/test';

const ROTULOS_INDICADORES = ['Equipamentos', 'Operacionais', 'Indisponíveis', 'Disponibilidade', 'Agentes em atividade', 'Alertas críticos'];

// Tudo exige sessão: cada teste entra como gestor pela entrada de demonstração (ligada por padrão no npm start).
async function entrarComoGestor(page: Page) {
  await page.goto('/entrar');
  await page.getByRole('button', { name: /^Gestor/ }).click();
  await expect(page).not.toHaveURL(/\/entrar/);
}

test('Sem sessão: a tela de entrada aparece e a API recusa', async ({ page, request }) => {
  await page.goto('/equipamentos');
  await expect(page).toHaveURL(/\/entrar/);
  await expect(page.getByRole('heading', { name: 'Entrar na central' })).toBeVisible();
  expect((await request.get('/api/equipamentos')).status()).toBe(401);
});

test('Central: seis indicadores e o mapa de Marília', async ({ page }) => {
  await entrarComoGestor(page);
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
  await entrarComoGestor(page);
  await page.goto('/previsoes');
  await expect(page.getByText('O que prevê').first()).toBeVisible();
});

test('Equipamentos: a lista traz ao menos 10 linhas', async ({ page }) => {
  await entrarComoGestor(page);
  await page.goto('/equipamentos');
  await expect.poll(() => page.locator('tbody tr').count()).toBeGreaterThanOrEqual(10);
});

test('Agente em campo: entra direto no próprio Modo Campo; somente consulta não o vê', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByRole('button', { name: /^Agente em campo/ }).click();
  await expect(page).toHaveURL(/\/campo$/);
  await expect(page.getByRole('group', { name: 'Minha situação' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quem é você?' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Trocar agente' })).toHaveCount(0);

  await page.context().clearCookies();
  await page.goto('/entrar');
  await page.getByRole('button', { name: /^Somente consulta/ }).click();
  await expect(page).not.toHaveURL(/\/entrar/);
  await expect(page.getByRole('link', { name: 'Modo Campo' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Boletim do dia' })).toBeVisible();
});

test('API: saúde responde', async ({ request }) => {
  const resposta = await request.get('/api/saude');
  expect(resposta.ok()).toBe(true);
  expect(await resposta.json()).toMatchObject({ ok: true });
});
