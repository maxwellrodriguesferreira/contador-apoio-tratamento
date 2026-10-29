import { LocalDatabase } from '../storage/localDatabase';
import { Goal, GoalType, UserProfile } from '../../types';
import { goalSchema } from '../../validators/schemas';
import { AuditService } from '../audit/auditService';
import { CloudSyncService } from '../api/cloudSyncService';

export class GoalService {
  static getAll(): Goal[] {
    return LocalDatabase.getGoals().sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  static getActiveGoals(): Goal[] {
    return LocalDatabase.getGoals().filter((g) => g.active);
  }

  /**
   * Salva ou atualiza uma meta criando histórico temporal
   */
  static async setGoal(
    currentUser: UserProfile,
    data: {
      type: GoalType;
      targetValue: number;
      startDate: string;
      endDate?: string | null;
      attendantId?: string;
    }
  ): Promise<Goal> {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('Acesso negado: Somente administradores podem definir metas.');
    }

    const validated = goalSchema.parse({
      ...data,
      active: true,
    });

    const goals = LocalDatabase.getGoals();

    // Encerra a meta anterior do mesmo tipo e atendente (se houver) colocando endDate
    const syncPromises: Promise<void>[] = [];
    goals.forEach((g) => {
      if (
        g.active &&
        g.type === validated.type &&
        (validated.attendantId ? g.attendantId === validated.attendantId : !g.attendantId)
      ) {
        g.active = false;
        if (!g.endDate) {
          g.endDate = validated.startDate;
        }
        g.updatedAt = new Date().toISOString();
        syncPromises.push(CloudSyncService.syncGoal(g));
      }
    });

    if (syncPromises.length > 0) {
      await Promise.all(syncPromises);
    }

    const newGoal: Goal = {
      id: `goal-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: validated.type,
      attendantId: validated.attendantId,
      targetValue: validated.targetValue,
      startDate: validated.startDate,
      endDate: validated.endDate || null,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    goals.push(newGoal);
    LocalDatabase.saveGoals(goals);
    await CloudSyncService.syncGoal(newGoal);

    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'GOAL_CREATED',
      'GOAL',
      newGoal.id,
      { type: newGoal.type, targetValue: newGoal.targetValue, startDate: newGoal.startDate }
    );
    CloudSyncService.notifyDataChanged();
    return newGoal;
  }

  static async updateGoal(
    currentUser: UserProfile,
    id: string,
    data: {
      type?: GoalType;
      targetValue?: number;
      startDate?: string;
      endDate?: string | null;
      active?: boolean;
      attendantId?: string;
    }
  ): Promise<Goal> {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('Acesso negado: Somente administradores podem editar metas.');
    }

    const goals = LocalDatabase.getGoals();
    const index = goals.findIndex((g) => g.id === id);
    if (index === -1) {
      throw new Error('Meta não encontrada.');
    }

    const currentGoal = goals[index];
    const updatedType = data.type ?? currentGoal.type;
    const updatedAttendantId =
      data.attendantId !== undefined
        ? (updatedType === 'DAILY_ATTENDANT' || updatedType === 'MONTHLY_ATTENDANT' ? data.attendantId : undefined)
        : currentGoal.attendantId;
    const updatedTargetValue = data.targetValue ?? currentGoal.targetValue;
    const updatedStartDate = data.startDate ?? currentGoal.startDate;
    const updatedEndDate = data.endDate !== undefined ? data.endDate : currentGoal.endDate;
    const updatedActive = data.active !== undefined ? data.active : currentGoal.active;

    const validated = goalSchema.parse({
      type: updatedType,
      targetValue: updatedTargetValue,
      startDate: updatedStartDate,
      endDate: updatedEndDate,
      active: updatedActive,
      attendantId: updatedAttendantId,
    });

    const syncPromises: Promise<void>[] = [];
    if (validated.active) {
      goals.forEach((g) => {
        if (
          g.id !== id &&
          g.active &&
          g.type === validated.type &&
          (validated.attendantId ? g.attendantId === validated.attendantId : !g.attendantId)
        ) {
          g.active = false;
          g.updatedAt = new Date().toISOString();
          syncPromises.push(CloudSyncService.syncGoal(g));
        }
      });
    }

    const updatedGoal: Goal = {
      ...currentGoal,
      type: validated.type,
      targetValue: validated.targetValue,
      startDate: validated.startDate,
      endDate: validated.endDate || null,
      active: validated.active,
      attendantId: validated.attendantId,
      updatedAt: new Date().toISOString(),
    };

    goals[index] = updatedGoal;
    LocalDatabase.saveGoals(goals);

    if (syncPromises.length > 0) {
      await Promise.all(syncPromises);
    }
    await CloudSyncService.syncGoal(updatedGoal);

    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'GOAL_UPDATED',
      'GOAL',
      updatedGoal.id,
      {
        previous: {
          targetValue: currentGoal.targetValue,
          startDate: currentGoal.startDate,
          endDate: currentGoal.endDate,
          active: currentGoal.active,
        },
        current: {
          targetValue: updatedGoal.targetValue,
          startDate: updatedGoal.startDate,
          endDate: updatedGoal.endDate,
          active: updatedGoal.active,
        },
      }
    );

    CloudSyncService.notifyDataChanged();
    return updatedGoal;
  }

  static async deleteGoal(currentUser: UserProfile, id: string): Promise<void> {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('Acesso negado: Somente administradores podem excluir metas.');
    }

    const goals = LocalDatabase.getGoals();
    const index = goals.findIndex((g) => g.id === id);
    if (index === -1) {
      throw new Error('Meta não encontrada.');
    }

    const [removed] = goals.splice(index, 1);
    LocalDatabase.saveGoals(goals);
    await CloudSyncService.deleteGoal(removed.id);

    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'GOAL_DELETED',
      'GOAL',
      removed.id,
      { deletedGoalType: removed.type, targetValue: removed.targetValue }
    );

    CloudSyncService.notifyDataChanged();
  }

  static async clearAllGoals(currentUser: UserProfile): Promise<void> {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('Acesso negado: Somente administradores podem excluir metas.');
    }

    const goals = LocalDatabase.getGoals();
    if (goals.length === 0) return;

    const deletePromises = goals.map((g) => CloudSyncService.deleteGoal(g.id).catch(() => {}));
    await Promise.all(deletePromises);

    LocalDatabase.saveGoals([]);

    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'GOAL_DELETED',
      'GOAL',
      'ALL_GOALS',
      { count: goals.length, action: 'RESET_ALL_GOALS' }
    );

    CloudSyncService.notifyDataChanged();
  }
}
