import { LocalDatabase } from '../storage/localDatabase';
import { RoutineCare, UserProfile } from '../../types';
import { routineSchema } from '../../validators/schemas';
import { AuditService } from '../audit/auditService';
import { CloudSyncService } from '../api/cloudSyncService';

export class RoutineService {
  static getAll(includeDeleted: boolean = false): RoutineCare[] {
    const all = LocalDatabase.getRoutines();
    if (includeDeleted) {
      return [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return all.filter((r) => !r.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  static getById(id: string): RoutineCare | undefined {
    return LocalDatabase.getRoutines().find((r) => r.id === id);
  }

  /**
   * Registra um novo atendimento no "Na Rotina" (CREATE)
   * Somente ADMIN autorizado.
   */
  static create(
    currentUser: UserProfile,
    data: { date: string; attendantId: string; quantity: number; observation?: string }
  ): RoutineCare {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('403 Forbidden: Usuários com perfil ATENDENTE não possuem permissão para registrar atendimentos.');
    }

    const validated = routineSchema.parse(data);
    const routines = LocalDatabase.getRoutines();

    const newRoutine: RoutineCare = {
      id: `rot-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      date: validated.date,
      attendantId: validated.attendantId,
      quantity: validated.quantity,
      observation: validated.observation?.trim() || undefined,
      createdBy: `${currentUser.name} (${currentUser.role})`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      deletedBy: null,
      version: 1,
    };

    routines.push(newRoutine);
    LocalDatabase.saveRoutines(routines);
    CloudSyncService.syncRoutine(newRoutine);

    // Auditoria geral
    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'SUPPORT_CREATED' as any,
      'ROUTINE_CARE',
      newRoutine.id,
      { quantity: newRoutine.quantity, date: newRoutine.date, attendantId: newRoutine.attendantId }
    );

    return newRoutine;
  }

  /**
   * Atualiza um atendimento de Na Rotina existente (UPDATE)
   * Substitui a quantidade de forma exata, nunca acumula.
   * Concorrência: Verifica versão.
   */
  static update(
    currentUser: UserProfile,
    id: string,
    data: { date: string; attendantId: string; quantity: number; observation?: string; expectedVersion?: number }
  ): RoutineCare {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('403 Forbidden: Usuários com perfil ATENDENTE não possuem permissão para editar atendimentos.');
    }

    const validated = routineSchema.parse(data);
    const routines = LocalDatabase.getRoutines();
    const routine = routines.find((r) => r.id === id);

    if (!routine) {
      throw new Error('Registro de Na Rotina não encontrado.');
    }

    if (data.expectedVersion !== undefined && routine.version !== data.expectedVersion) {
      throw new Error('Este registro foi alterado por outro usuário. Atualize os dados antes de salvar.');
    }

    const oldSnapshot: RoutineCare = { ...routine };

    routine.date = validated.date;
    routine.attendantId = validated.attendantId;
    routine.quantity = validated.quantity;
    routine.observation = validated.observation?.trim() || undefined;
    routine.updatedBy = `${currentUser.name} (${currentUser.role})`;
    routine.updatedAt = new Date().toISOString();
    routine.version += 1;

    LocalDatabase.saveRoutines(routines);
    CloudSyncService.syncRoutine(routine);

    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'SUPPORT_UPDATED' as any,
      'ROUTINE_CARE',
      routine.id,
      {
        oldQty: oldSnapshot.quantity,
        newQty: routine.quantity,
        difference: routine.quantity - oldSnapshot.quantity,
      }
    );

    return routine;
  }

  /**
   * Exclusão lógica (Soft Delete)
   */
  static softDelete(currentUser: UserProfile, id: string): RoutineCare {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('403 Forbidden: Apenas ADMINISTRADORES podem excluir atendimentos.');
    }

    const routines = LocalDatabase.getRoutines();
    const routine = routines.find((r) => r.id === id);

    if (!routine) {
      throw new Error('Registro de Na Rotina não encontrado.');
    }

    if (routine.deletedAt) {
      throw new Error('Este registro já se encontra excluído.');
    }

    routine.deletedAt = new Date().toISOString();
    routine.deletedBy = `${currentUser.name} (${currentUser.role})`;
    routine.updatedAt = new Date().toISOString();
    routine.version += 1;

    LocalDatabase.saveRoutines(routines);
    CloudSyncService.syncRoutine(routine);

    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'SUPPORT_DELETED' as any,
      'ROUTINE_CARE',
      routine.id,
      { date: routine.date, attendantId: routine.attendantId }
    );

    return routine;
  }

  /**
   * Alias para softDelete mantendo paridade com SupportService
   */
  static delete(currentUser: UserProfile, id: string): RoutineCare {
    return this.softDelete(currentUser, id);
  }

  /**
   * Restauração de registro previamente excluído
   */
  static restore(currentUser: UserProfile, id: string): RoutineCare {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('403 Forbidden: Apenas ADMINISTRADORES podem restaurar atendimentos.');
    }

    const routines = LocalDatabase.getRoutines();
    const routine = routines.find((r) => r.id === id);

    if (!routine) {
      throw new Error('Registro de Na Rotina não encontrado.');
    }

    if (!routine.deletedAt) {
      throw new Error('Este registro já se encontra ativo.');
    }

    routine.deletedAt = null;
    routine.deletedBy = null;
    routine.updatedBy = `${currentUser.name} (${currentUser.role}) [RESTAURADO]`;
    routine.updatedAt = new Date().toISOString();
    routine.version += 1;

    LocalDatabase.saveRoutines(routines);
    CloudSyncService.syncRoutine(routine);

    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'SUPPORT_RESTORED' as any,
      'ROUTINE_CARE',
      routine.id,
      { date: routine.date, attendantId: routine.attendantId }
    );

    return routine;
  }
}
