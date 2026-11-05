/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AttendantSelector } from '../components/common/AttendantSelector';
import { Attendant } from '../types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockAttendants: Attendant[] = [
  { id: 'att-14', name: 'Bianca', code: '014', active: true, createdAt: '2026-10-29' },
  { id: 'att-08', name: 'Aline', code: '008', active: true, createdAt: '2026-10-29' },
  { id: 'att-06', name: 'Gabriel Supervisor', code: '006', active: true, createdAt: '2026-10-29' },
  { id: 'att-16', name: 'David', code: '016', active: true, createdAt: '2026-11-02' },
  { id: 'att-11', name: 'Arthur', code: '011', active: true, createdAt: '2026-10-29' },
];

describe('Componente AttendantSelector - Seleção Aprimorada de Atendentes', () => {
  it('deve renderizar o botão com o atendente selecionado e badge de código', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onChange = vi.fn();

    act(() => {
      root.render(
        <AttendantSelector
          value="att-08"
          onChange={onChange}
          attendants={mockAttendants}
        />
      );
    });

    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain('Aline');
    expect(button?.textContent).toContain('Cód. 008');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('deve ordenar os atendentes em ordem numérica crescente de código no menu', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onChange = vi.fn();

    act(() => {
      root.render(
        <AttendantSelector
          value=""
          onChange={onChange}
          attendants={mockAttendants}
        />
      );
    });

    // Clica para abrir o seletor
    const toggleButton = container.querySelector('button');
    act(() => {
      toggleButton?.click();
    });

    // Verifica os itens de opção de atendentes renderizados
    const options = container.querySelectorAll('[role="option"]');
    const codes = Array.from(options)
      .map((el) => {
        const match = el.textContent?.match(/Cód\.\s*(\d+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    // Deve estar na ordem natural crescente: 006, 008, 011, 014, 016
    expect(codes).toEqual(['006', '008', '011', '014', '016']);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('deve selecionar um atendente ao clicar em sua opção na lista', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onChange = vi.fn();

    act(() => {
      root.render(
        <AttendantSelector
          value=""
          onChange={onChange}
          attendants={mockAttendants}
        />
      );
    });

    // Abre o menu
    const toggleButton = container.querySelector('button');
    act(() => {
      toggleButton?.click();
    });

    // Encontra o botão do atendente Gabriel (006)
    const options = container.querySelectorAll('[role="option"]');
    const gabrielOption = Array.from(options).find((opt) =>
      opt.textContent?.includes('Gabriel')
    ) as HTMLButtonElement | undefined;

    expect(gabrielOption).toBeDefined();

    act(() => {
      gabrielOption?.click();
    });

    expect(onChange).toHaveBeenCalledWith('att-06');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
