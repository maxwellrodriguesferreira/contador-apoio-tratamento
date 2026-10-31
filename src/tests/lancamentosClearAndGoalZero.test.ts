import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupportService } from '../services/supports/supportService';
import { RoutineService } from '../services/routine/routineService';
import { GoalService } from '../services/goals/goalService';
import { LocalDatabase } from '../services/storage/localDatabase';
import { UserProfile } from '../types';
import { CloudSyncService } from '../services/api/cloudSyncService';
import {
  calculateDashboardMetrics,
  calculateConsolidatedMetrics,
  getActiveGoal,
  filterValidRecords,
} from '../utils/calculations';

describe('Suíte de Testes: Limpeza de Lançamentos e Reflexo no Dashboard com Metas Zeradas', () => {
  const adminUser: UserProfile = {
    id: 'usr-admin',
    authUserId: 'sub-admin',
    name: 'Administrador Farmácia',
    email: 'admin@drogaria.com.br',
    role: 'ADMIN',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const attendantUser: UserProfile = {
    id: 'usr-attendant',
    authUserId: 'sub-attendant',
    name: 'Atendente Balcão',
    email: 'atendente@drogaria.com.br',
    role: 'ATENDENTE',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    LocalDatabase.saveSupports([]);
    LocalDatabase.saveRoutines([]);
    LocalDatabase.saveGoals([]);
    LocalDatabase.saveAuditLogs([]);
    vi.spyOn(CloudSyncService, 'syncSupport').mockResolvedValue();
    vi.spyOn(CloudSyncService, 'syncRoutine').mockResolvedValue();
    vi.spyOn(CloudSyncService, 'syncGoal').mockResolvedValue();
    vi.spyOn(CloudSyncService, 'deleteSupport').mockResolvedValue();
    vi.spyOn(CloudSyncService, 'deleteRoutine').mockResolvedValue();
    vi.spyOn(CloudSyncService, 'clearSupports').mockResolvedValue();
    vi.spyOn(CloudSyncService, 'clearRoutines').mockResolvedValue();
    vi.spyOn(CloudSyncService, 'deleteGoal').mockResolvedValue();
    vi.spyOn(CloudSyncService, 'notifyDataChanged').mockImplementation(() => {});
  });

  describe('Reflexo no Dashboard ao Limpar Totalmente a Meta', () => {
    it('quando limpar totalmente a meta através do botão, deve retornar 0 e zerar as informações no dashboard', async () => {
      // 1. Cadastra meta diária e mensal
      await GoalService.setGoal(adminUser, {
        type: 'DAILY_STORE',
        targetValue: 60,
        startDate: '2026-10-01',
      });
      await GoalService.setGoal(adminUser, {
        type: 'MONTHLY_STORE',
        targetValue: 1200,
        startDate: '2026-10-01',
      });

      // Cadastra apoios de teste
      SupportService.create(adminUser, {
        date: '2026-10-29',
        attendantId: 'att-1',
        quantity: 15,
      });

      let currentGoals = GoalService.getAll();
      expect(currentGoals.length).toBe(2);

      let metricsBefore = calculateDashboardMetrics(
        SupportService.getAll(false),
        LocalDatabase.getAttendants(),
        currentGoals,
        '2026-10-29'
      );
      expect(metricsBefore.todayGoal).toBe(60);
      expect(metricsBefore.monthGoal).toBe(1200);
      expect(metricsBefore.todayPercentage).toBe(25); // 15/60 = 25%

      // 2. Limpar totalmente as metas através da função do botão
      await GoalService.clearAllGoals(adminUser);

      currentGoals = GoalService.getAll();
      expect(currentGoals.length).toBe(0);

      // 3. Verifica se getActiveGoal retorna 0
      expect(getActiveGoal(currentGoals, 'DAILY_STORE', '2026-10-29')).toBe(0);
      expect(getActiveGoal(currentGoals, 'MONTHLY_STORE', '2026-10-29')).toBe(0);

      // 4. Verifica se as métricas do dashboard zeram as metas e porcentagens
      const metricsAfter = calculateDashboardMetrics(
        SupportService.getAll(false),
        LocalDatabase.getAttendants(),
        currentGoals,
        '2026-10-29'
      );

      expect(metricsAfter.todayGoal).toBe(0);
      expect(metricsAfter.monthGoal).toBe(0);
      expect(metricsAfter.todayPercentage).toBe(0);
      expect(metricsAfter.todayDifference).toBe(0);
      expect(metricsAfter.monthPercentage).toBe(0);
      expect(metricsAfter.monthRemainingValue).toBe(0);
      expect(metricsAfter.monthRequiredPace).toBe(0);
      expect(CloudSyncService.notifyDataChanged).toHaveBeenCalled();
    });
  });

  describe('Função de Limpar Registros de Lançamentos no Menu de Lançamentos', () => {
    it('deve realizar limpeza em massa definitiva (Hard Delete) de apoios e rotinas', async () => {
      // Cria apoios
      SupportService.create(adminUser, { date: '2026-10-28', attendantId: 'att-1', quantity: 10 });
      SupportService.create(adminUser, { date: '2026-10-29', attendantId: 'att-1', quantity: 20 });
      // Cria rotinas
      RoutineService.create(adminUser, { date: '2026-10-29', attendantId: 'att-2', quantity: 5 });

      expect(LocalDatabase.getSupports().length).toBe(2);
      expect(LocalDatabase.getRoutines().length).toBe(1);

      // Limpar apoios com hard delete
      const clearedSupports = await SupportService.clearLancamentos(adminUser, { hardDelete: true });
      expect(clearedSupports).toBe(2);
      expect(LocalDatabase.getSupports().length).toBe(0);

      // Limpar rotinas com hard delete
      const clearedRoutines = await RoutineService.clearLancamentos(adminUser, { hardDelete: true });
      expect(clearedRoutines).toBe(1);
      expect(LocalDatabase.getRoutines().length).toBe(0);

      // Dados nos relatórios consolidados devem ficar zerados e fiéis
      const cons = calculateConsolidatedMetrics(
        LocalDatabase.getSupports(),
        LocalDatabase.getRoutines(),
        '2026-10-29'
      );
      expect(cons.todayTotalServices).toBe(0);
      expect(cons.monthTotalServices).toBe(0);
    });

    it('deve suportar limpeza de itens filtrados por ID (apenas período selecionado)', async () => {
      const s1 = SupportService.create(adminUser, { date: '2026-10-25', attendantId: 'att-1', quantity: 10 });
      const s2 = SupportService.create(adminUser, { date: '2026-10-29', attendantId: 'att-1', quantity: 15 });

      // Limpar apenas o s1
      const cleared = await SupportService.clearLancamentos(adminUser, {
        hardDelete: true,
        targetIds: [s1.id],
      });

      expect(cleared).toBe(1);
      const remaining = LocalDatabase.getSupports();
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe(s2.id);
      expect(remaining[0].quantity).toBe(15);
    });

    it('deve bloquear a limpeza de lançamentos por usuários sem perfil ADMIN', async () => {
      await expect(
        SupportService.clearLancamentos(attendantUser, { hardDelete: true })
      ).rejects.toThrow('Apenas ADMINISTRADORES');

      await expect(
        RoutineService.clearLancamentos(attendantUser, { hardDelete: true })
      ).rejects.toThrow('Apenas ADMINISTRADORES');
    });

    it('deve garantir que filterValidRecords desconsidere registros excluídos ou duplicados', () => {
      const records = [
        { id: '1', date: '2026-10-29', quantity: 10, deletedAt: null },
        { id: '2', date: '2026-10-29', quantity: 20, deletedAt: '2026-10-29T10:00:00Z' },
        { id: '1', date: '2026-10-29', quantity: 10, deletedAt: null }, // duplicata acidental
      ];

      const valid = filterValidRecords(records);
      expect(valid.length).toBe(1);
      expect(valid[0].id).toBe('1');
      expect(valid[0].quantity).toBe(10);
    });
  });
});
