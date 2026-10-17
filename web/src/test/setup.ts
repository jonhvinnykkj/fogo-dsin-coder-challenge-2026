// Preparação dos testes da interface (projeto 'web' do Vitest, ambiente jsdom).
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sem `globals: true` a Testing Library não limpa sozinha: cada teste começa com o DOM vazio.
afterEach(() => {
  cleanup();
});

// O jsdom não implementa <dialog>.showModal/show/close (usados pela Gaveta): um stub que só liga e desliga `open`.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute('open');
};

// O jsdom também não tem scrollIntoView (usado ao levar o foco ao primeiro campo com erro).
Element.prototype.scrollIntoView = function scrollIntoView() {};
