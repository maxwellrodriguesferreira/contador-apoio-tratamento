/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Input } from '../components/common/Input';

// Configura o ambiente React act para testes em jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;


describe('Componente Input - Toggle de Visualização de Senha', () => {
  it('não deve exibir botão de alternar quando showPasswordToggle for falso ou omitido', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Input label="Senha" type="password" placeholder="Digite sua senha" />);
    });

    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.type).toBe('password');

    const button = container.querySelector('button');
    expect(button).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('deve alternar entre tipo password e text ao clicar no botão de visualização', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Input label="Senha" type="password" placeholder="Digite sua senha" showPasswordToggle />);
    });

    const input = container.querySelector('input') as HTMLInputElement;
    const button = container.querySelector('button') as HTMLButtonElement;

    expect(input).not.toBeNull();
    expect(input.type).toBe('password');
    expect(button).not.toBeNull();
    expect(button.getAttribute('aria-label')).toBe('Visualizar senha');
    expect(button.textContent).toContain('visibility');

    // Clica para exibir a senha
    act(() => {
      button.click();
    });

    expect(input.type).toBe('text');
    expect(button.getAttribute('aria-label')).toBe('Ocultar senha');
    expect(button.textContent).toContain('visibility_off');

    // Clica para ocultar a senha novamente
    act(() => {
      button.click();
    });

    expect(input.type).toBe('password');
    expect(button.getAttribute('aria-label')).toBe('Visualizar senha');
    expect(button.textContent).toContain('visibility');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('garante que o botão tem type="button" para não submeter formulários acidentalmente', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Input label="Senha" type="password" showPasswordToggle />);
    });

    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.type).toBe('button');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

