/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { BottomNav } from '../components/layout/BottomNav';

// Configura o ambiente React act para testes em jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Componente BottomNav - Navegação Mobile Touch-Friendly', () => {
  it('deve renderizar os itens essenciais de navegação e botão de menu completo', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onNavigate = vi.fn();
    const onOpenMenu = vi.fn();

    act(() => {
      root.render(
        <BottomNav
          currentPath="dashboard"
          onNavigate={onNavigate}
          onOpenMenu={onOpenMenu}
        />
      );
    });

    const buttons = container.querySelectorAll('button');
    // Deve haver 5 botões: Início, Apoio, Rotina, Lançamentos e Mais (Menu)
    expect(buttons.length).toBe(5);

    // O botão ativo (dashboard) deve ter aria-current="page"
    const activeBtn = container.querySelector('button[aria-current="page"]');
    expect(activeBtn).not.toBeNull();
    expect(activeBtn?.textContent).toContain('Início');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('deve disparar onNavigate ao clicar em um item de navegação', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onNavigate = vi.fn();
    const onOpenMenu = vi.fn();

    act(() => {
      root.render(
        <BottomNav
          currentPath="dashboard"
          onNavigate={onNavigate}
          onOpenMenu={onOpenMenu}
        />
      );
    });

    const buttons = container.querySelectorAll('button');
    // Clica no botão de Lançamentos (índice 3)
    const lancamentosBtn = buttons[3];
    expect(lancamentosBtn.textContent).toContain('Lançamentos');

    act(() => {
      lancamentosBtn.click();
    });

    expect(onNavigate).toHaveBeenCalledWith('lancamentos');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('deve disparar onOpenMenu ao clicar no botão Mais', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onNavigate = vi.fn();
    const onOpenMenu = vi.fn();

    act(() => {
      root.render(
        <BottomNav
          currentPath="dashboard"
          onNavigate={onNavigate}
          onOpenMenu={onOpenMenu}
        />
      );
    });

    const buttons = container.querySelectorAll('button');
    // O último botão é o "Mais"
    const menuBtn = buttons[buttons.length - 1];
    expect(menuBtn.textContent).toContain('Mais');

    act(() => {
      menuBtn.click();
    });

    expect(onOpenMenu).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
