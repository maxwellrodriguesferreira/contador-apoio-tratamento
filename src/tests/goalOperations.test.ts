import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoalService } from '../services/goals/goalService';
import { LocalDatabase } from '../services/storage/localDatabase';
import { UserProfile } from '../types';
import { CloudSyncService } from '../services/api/cloudSyncService';
import { AuditService } from '../services/audit/auditService';

describe('Suíte de Testes: Operações de Metas (Criação, Edição, Exclusão e Reset)', () => {
  const adminUser: UserProfile = {
    id: 'usr-admin-meta',
    authUserId: 'sub-admin-meta',
    name: 'Administrador Teste',
    email: 'admin@drogaria.com.br',
    role: 'ADMIN',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const regularUser: UserProfile = {
    id: 'usr-atendente-meta',
    authUserId: 'sub-atendente-meta',
    name: 'Atendente Normal',
    email: 'atendente@drogaria.com.br',
    role: 'ATENDENTE',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    LocalDatabase.saveGoals([]);
    LocalDatabase.saveAuditLogs([]);
    vi.spyOn(CloudSyncService, 'syncGoal').mockResolvedValue();
    vi.spyOn(CloudSyncService, 'deleteGoal').mockResolvedValue();
  });

  it('deve criar uma nova meta com versionamento temporal e auditoria', async () => {
    const goal = await GoalService.setGoal(adminUser, {
      type: 'DAILY_STORE',
      targetValue: 60,
      startDate: '2026-09-01',
    });

    expect(goal.id).toBeDefined();
    expect(goal.targetValue).toBe(60);
    expect(goal.active).toBe(true);
    expect(LocalDatabase.getGoals().length).toBe(1);

    const logs = AuditService.getAllSystemLogs();
    expect(logs.some((l) => l.action === 'GOAL_CREATED' && l.entityId === goal.id)).toBe(true);
  });

  it('deve editar uma meta existente alterando o valor alvo e vigência com sucesso', async () => {
    const initial = await GoalService.setGoal(adminUser, {
      type: 'DAILY_STORE',
      targetValue: 60,
      startDate: '2026-09-01',
    });

    const updated = await GoalService.updateGoal(adminUser, initial.id, {
      targetValue: 75,
      startDate: '2026-09-05',
      endDate: '2026-12-31',
      active: true,
    });

    expect(updated.id).toBe(initial.id);
    expect(updated.targetValue).toBe(75);
    expect(updated.startDate).toBe('2026-09-05');
    expect(updated.endDate).toBe('2026-12-31');

    const storedGoals = LocalDatabase.getGoals();
    expect(storedGoals.length).toBe(1);
    expect(storedGoals[0].targetValue).toBe(75);

    const logs = AuditService.getAllSystemLogs();
    expect(logs.some((l) => l.action === 'GOAL_UPDATED' && l.entityId === initial.id)).toBe(true);
  });

  it('deve permitir encerrar uma meta marcando active como false na edição', async () => {
    const initial = await GoalService.setGoal(adminUser, {
      type: 'MONTHLY_STORE',
      targetValue: 1200,
      startDate: '2026-09-01',
    });

    const updated = await GoalService.updateGoal(adminUser, initial.id, {
      active: false,
      endDate: '2026-09-30',
    });

    expect(updated.active).toBe(false);
    expect(updated.endDate).toBe('2026-09-30');

    const activeGoals = GoalService.getActiveGoals();
    expect(activeGoals.length).toBe(0);
  });

  it('deve impedir que usuários que não sejam ADMIN definam ou editem metas', async () => {
    await expect(
      GoalService.setGoal(regularUser, {
        type: 'DAILY_STORE',
        targetValue: 50,
        startDate: '2026-09-01',
      })
    ).rejects.toThrow('Acesso negado');

    const initial = await GoalService.setGoal(adminUser, {
      type: 'DAILY_STORE',
      targetValue: 60,
      startDate: '2026-09-01',
    });

    await expect(
      GoalService.updateGoal(regularUser, initial.id, {
        targetValue: 80,
      })
    ).rejects.toThrow('Acesso negado');
  });

  it('deve excluir uma meta individual com sucesso e registrar GOAL_DELETED na auditoria', async () => {
    const goal = await GoalService.setGoal(adminUser, {
      type: 'DAILY_STORE',
      targetValue: 60,
      startDate: '2026-09-01',
    });

    expect(LocalDatabase.getGoals().length).toBe(1);

    await GoalService.deleteGoal(adminUser, goal.id);

    expect(LocalDatabase.getGoals().length).toBe(0);
    expect(CloudSyncService.deleteGoal).toHaveBeenCalledWith(goal.id);

    const logs = AuditService.getAllSystemLogs();
    expect(logs.some((l) => l.action === 'GOAL_DELETED' && l.entityId === goal.id)).toBe(true);
  });

  it('deve limpar todas as metas cadastradas (reset/refazer) quando solicitado pelo ADMIN', async () => {
    await GoalService.setGoal(adminUser, {
      type: 'DAILY_STORE',
      targetValue: 60,
      startDate: '2026-09-01',
    });
    await GoalService.setGoal(adminUser, {
      type: 'MONTHLY_STORE',
      targetValue: 1200,
      startDate: '2026-09-01',
    });
    await GoalService.setGoal(adminUser, {
      type: 'DAILY_ATTENDANT',
      targetValue: 10,
      startDate: '2026-09-01',
      attendantId: 'att-1',
    });

    expect(LocalDatabase.getGoals().length).toBe(3);

    // Limpar todas para refazer
    await GoalService.clearAllGoals(adminUser);

    expect(LocalDatabase.getGoals().length).toBe(0);
    expect(CloudSyncService.deleteGoal).toHaveBeenCalledTimes(3);

    const logs = AuditService.getAllSystemLogs();
    expect(logs.some((l) => l.action === 'GOAL_DELETED' && l.entityId === 'ALL_GOALS')).toBe(true);
  });
});
