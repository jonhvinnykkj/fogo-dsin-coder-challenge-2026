// Cartão de explicação de uma previsão: os 4 blocos (o que prevê, dados usados, como ajuda, confiabilidade), cada dado
// usado em uma linha e, quando ainda não há medida de acerto, a frase que diz isso em vez de um bloco vazio.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ExplicacaoPrevisao } from '../../../shared/modelos';
import { CartaoExplicacao } from './CartaoExplicacao';

const EXPLICACAO: ExplicacaoPrevisao = {
  oQuePreve: 'Quantas ocorrências cada bairro deve ter em cada hora das próximas 24 horas.',
  dadosUsados: [
    '16.384 ocorrências registradas de 22/08 a 17/10 (últimas 8 semanas), contadas por bairro e hora',
    'Horário típico de cada região em cada dia da semana',
    'Previsão do tempo: sem chuva na janela',
  ],
  comoAjuda: 'Mostra onde e quando reforçar patrulhamento antes de as ocorrências acontecerem.',
  confiabilidade: [
    { metrica: 'Erro médio por bairro a cada 3 horas', valor: 0.5348, descricao: 'Errou em média 0,53 ocorrência por bloco.' },
    { metrica: 'Erro a menos que a média simples (%)', valor: 7.9, descricao: 'O modelo errou 7,9% menos que a média simples.' },
  ],
};

describe('CartaoExplicacao', () => {
  it('mostra os 4 títulos: O que prevê, Dados usados, Como ajuda e Confiabilidade', () => {
    render(<CartaoExplicacao explicacao={EXPLICACAO} />);
    for (const titulo of ['O que prevê', 'Dados usados', 'Como ajuda', 'Confiabilidade']) {
      expect(screen.getByRole('heading', { name: titulo })).toBeInTheDocument();
    }
    expect(screen.getByText(EXPLICACAO.oQuePreve)).toBeInTheDocument();
    expect(screen.getByText(EXPLICACAO.comoAjuda)).toBeInTheDocument();
  });

  it('lista cada item de dadosUsados', () => {
    render(<CartaoExplicacao explicacao={EXPLICACAO} />);
    const bloco = screen.getByRole('heading', { name: 'Dados usados' }).parentElement!;
    const itens = within(bloco).getAllByRole('listitem');
    expect(itens.map((i) => i.textContent)).toEqual(EXPLICACAO.dadosUsados);
  });

  it('mostra as métricas de confiabilidade com o número em pt-BR ("(%)" vira o símbolo no valor)', () => {
    render(<CartaoExplicacao explicacao={EXPLICACAO} />);
    expect(screen.getByText('0,53')).toBeInTheDocument();
    expect(screen.getByText('7,9%')).toBeInTheDocument();
    expect(screen.getByText('Erro a menos que a média simples')).toBeInTheDocument();
    expect(screen.queryByText('Sem medida de acerto ainda')).not.toBeInTheDocument();
  });

  it('com confiabilidade vazia mostra "Sem medida de acerto ainda"', () => {
    render(<CartaoExplicacao explicacao={{ ...EXPLICACAO, confiabilidade: [] }} />);
    const bloco = screen.getByRole('heading', { name: 'Confiabilidade' }).parentElement!;
    expect(within(bloco).getByText('Sem medida de acerto ainda')).toBeInTheDocument();
    expect(within(bloco).queryByRole('definition')).not.toBeInTheDocument();
  });

  it('sem confiabilidade, mas com o motivo, mostra o motivo no lugar do aviso genérico', () => {
    render(<CartaoExplicacao explicacao={{ ...EXPLICACAO, confiabilidade: [], semMedida: 'Anomalia não é previsão: é um sinal para olhar.' }} />);
    const bloco = screen.getByRole('heading', { name: 'Confiabilidade' }).parentElement!;
    expect(within(bloco).getByText('Anomalia não é previsão: é um sinal para olhar.')).toBeInTheDocument();
    expect(within(bloco).queryByText('Sem medida de acerto ainda')).not.toBeInTheDocument();
  });
});
