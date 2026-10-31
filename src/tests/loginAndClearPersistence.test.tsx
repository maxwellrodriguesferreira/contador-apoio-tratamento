/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LoginPage } from '../pages/Login/LoginPage';
import { LocalDatabase } from '../services/storage/localDatabase';
import { SupportService } from '../services/supports/supportService';
import { RoutineService } from '../services/routine/routineService';
import { CloudSyncService } from '../services/api/cloudSyncService';
import { UserProfile } from '../types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Mock do contexto de autenticação
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: vi.fn(),
    completeNewPassword: vi.fn(),
  }),
}));

// Mock do toast
vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

const adminUser: UserProfile = {
  id: 'usr-admin-test',
  name: 'Admin Teste',
  email: 'admin.teste@drogaria.com.br',
  role: 'ADMIN',
  active: true,
  createdAt: '2026-10-30T00:00:00Z',
  updatedAt: '2026-10-30T00:00:00Z',
};

describe('Validação dos Ajustes: Tela de Login e Persistência de Limpeza de Lançamentos', () => {
  beforeEach(() => {
    LocalDatabase.resetAllData();
    vi.restoreAllMocks();
  });

  describe('Tela de Login - Ajuste do Botão Sobre', () => {
    it('deve conter apenas 1 botão Sobre (no cabeçalho superior) e NÃO no rodapé do formulário', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(<LoginPage />);
      });

      // Busca todos os botões que contenham o texto 'Sobre'
      const buttons = Array.from(container.querySelectorAll('button')).filter((b) =>
        b.textContent?.toLowerCase().includes('sobre')
      );

      // Deve existir apenas o botão do topo (superior direito)
      expect(buttons.length).toBe(1);

      const sobreButton = buttons[0];
      // Verifica se o botão Sobre está no cabeçalho superior (classe absolute top-4 ou z-20)
      expect(sobreButton.closest('.absolute.top-4') || sobreButton.closest('[title*="funcionalidades"]')).not.toBeNull();

      // O rodapé informativo com CRF e versão deve estar presente, mas sem botão Sobre nele
      const footerInfo = container.querySelector('.border-t.border-outline-variant\\/30');
      expect(footerInfo).not.toBeNull();
      expect(footerInfo?.textContent).toContain('CRF-SP: 86426');
      expect(footerInfo?.querySelector('button')).toBeNull();

      act(() => {
        root.unmount();
      });
      container.remove();
    });
  });

  describe('Persistência no Banco de Dados ao Limpar Lançamentos', () => {
    it('deve acionar clearSupports e clearRoutines no CloudSyncService ao realizar a limpeza definitiva', async () => {
      const clearSupportsSpy = vi.spyOn(CloudSyncService, 'clearSupports').mockResolvedValue();
      const clearRoutinesSpy = vi.spyOn(CloudSyncService, 'clearRoutines').mockResolvedValue();

      // 1. Cadastra apoios e rotinas no banco local
      SupportService.create(adminUser, { date: '2026-10-30', attendantId: 'att-1', quantity: 5 });
      RoutineService.create(adminUser, { date: '2026-10-30', attendantId: 'att-1', quantity: 3 });

      expect(LocalDatabase.getSupports().length).toBe(1);
      expect(LocalDatabase.getRoutines().length).toBe(1);

      // 2. Executa a limpeza definitiva (Hard Delete)
      const clearedSupports = await SupportService.clearLancamentos(adminUser, { hardDelete: true });
      const clearedRoutines = await RoutineService.clearLancamentos(adminUser, { hardDelete: true });

      expect(clearedSupports).toBe(1);
      expect(clearedRoutines).toBe(1);

      // 3. Verifica que os dados foram removidos localmente
      expect(LocalDatabase.getSupports().length).toBe(0);
      expect(LocalDatabase.getRoutines().length).toBe(0);

      // 4. Verifica que as chamadas de persistência no backend/nuvem foram efetuadas
      expect(clearSupportsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          hardDelete: true,
        })
      );
      expect(clearRoutinesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          hardDelete: true,
        })
      );
    });
  });
});
