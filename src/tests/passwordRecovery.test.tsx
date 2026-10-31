/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthService } from '../services/auth/authService';
import { LocalDatabase } from '../services/storage/localDatabase';
import { LoginPage } from '../pages/Login/LoginPage';
import { UserProfile } from '../types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: vi.fn(),
    completeNewPassword: vi.fn(),
  }),
}));

const mockShowToast = vi.fn();
vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

describe('Suíte de Testes: Recuperação de Senha (Esquecimento de Acesso)', () => {
  const testUser: UserProfile = {
    id: 'usr-recovery-test',
    name: 'Farmacêutico Teste',
    email: 'recuperacao@drogaria.com.br',
    role: 'ATENDENTE',
    active: true,
    attendantId: 'att-rec-1',
    createdAt: '2026-10-31T00:00:00Z',
    updatedAt: '2026-10-31T00:00:00Z',
  };

  const testAttendant = {
    id: 'att-rec-1',
    name: 'Farmacêutico Teste',
    code: '999',
    active: true,
    createdAt: '2026-10-31T00:00:00Z',
    updatedAt: '2026-10-31T00:00:00Z',
  };

  beforeEach(() => {
    LocalDatabase.resetAllData();
    vi.restoreAllMocks();
    mockShowToast.mockClear();

    // Popula banco de dados local com atendente e usuário de teste
    LocalDatabase.saveAttendants([testAttendant]);
    LocalDatabase.saveUserProfiles([testUser]);
  });

  it('1. deve solicitar código de recuperação com sucesso e gerar token numérico de 6 dígitos', async () => {
    const res = await AuthService.requestPasswordReset('recuperacao@drogaria.com.br');

    expect(res.success).toBe(true);
    expect(res.requiresCode).toBe(true);

    const tokens = LocalDatabase.getResetTokens();
    expect(tokens.length).toBeGreaterThan(0);
    const token = tokens.find((t) => t.email === 'recuperacao@drogaria.com.br');
    expect(token).toBeDefined();
    expect(token?.code).toMatch(/^\d{6}$/);
    expect(new Date(token!.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('2. deve validar código correto e rejeitar código incorreto ou inválido', async () => {
    await AuthService.requestPasswordReset('recuperacao@drogaria.com.br');
    const token = LocalDatabase.getResetTokens().find((t) => t.email === 'recuperacao@drogaria.com.br');
    expect(token).toBeDefined();

    // Código correto
    const validCheck = await AuthService.verifyResetCode('recuperacao@drogaria.com.br', token!.code);
    expect(validCheck.valid).toBe(true);

    // Código incorreto
    const invalidCheck = await AuthService.verifyResetCode('recuperacao@drogaria.com.br', '000000');
    expect(invalidCheck.valid).toBe(false);

    // Código de crachá do atendente (recuperação assistida na loja)
    const attendantCheck = await AuthService.verifyResetCode('recuperacao@drogaria.com.br', '999');
    expect(attendantCheck.valid).toBe(true);
  });

  it('3. deve rejeitar redefinição com senha menor que 8 caracteres', async () => {
    await AuthService.requestPasswordReset('recuperacao@drogaria.com.br');
    const token = LocalDatabase.getResetTokens().find((t) => t.email === 'recuperacao@drogaria.com.br');

    await expect(
      AuthService.resetPasswordWithCode('recuperacao@drogaria.com.br', token!.code, 'curta')
    ).rejects.toThrow('no mínimo 8 caracteres');
  });

  it('4. deve concluir a redefinição de senha com sucesso e permitir autenticação posterior', async () => {
    await AuthService.requestPasswordReset('recuperacao@drogaria.com.br');
    const token = LocalDatabase.getResetTokens().find((t) => t.email === 'recuperacao@drogaria.com.br');

    const resetRes = await AuthService.resetPasswordWithCode(
      'recuperacao@drogaria.com.br',
      token!.code,
      'NovaSenhaForte@2026'
    );

    expect(resetRes.success).toBe(true);

    // Token deve ter sido consumido/limpo após uso
    const tokensAfter = LocalDatabase.getResetTokens().filter((t) => t.email === 'recuperacao@drogaria.com.br');
    expect(tokensAfter.length).toBe(0);

    // Usuário deve ter sido atualizado no banco
    const users = LocalDatabase.getUserProfiles();
    const updatedUser = users.find((u) => u.email === 'recuperacao@drogaria.com.br');
    expect(updatedUser).toBeDefined();

    // Login com a conta deve funcionar
    const loggedUser = await AuthService.login('recuperacao@drogaria.com.br', 'NovaSenhaForte@2026');
    expect(loggedUser.id).toBe(testUser.id);
  });

  it('5. deve abrir o modal de recuperação na tela de Login e exibir os passos', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<LoginPage onLoginSuccess={vi.fn()} />);
    });

    // Procura o botão 'Esqueci minha senha'
    const forgotBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Esqueci minha senha')
    );
    expect(forgotBtn).toBeDefined();

    // Clica para abrir o modal
    act(() => {
      forgotBtn!.click();
    });

    // O modal deve estar aberto no DOM
    const modalTitle = Array.from(container.querySelectorAll('h3')).find((h) =>
      h.textContent?.includes('Recuperação de Senha')
    );
    expect(modalTitle).toBeDefined();

    // Deve conter campo para informar o e-mail cadastrado
    const emailInput = container.querySelector('input[type="email"]');
    expect(emailInput).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
