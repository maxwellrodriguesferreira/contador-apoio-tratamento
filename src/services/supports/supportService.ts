import { LocalDatabase } from '../storage/localDatabase';
import { TreatmentSupport, UserProfile } from '../../types';
import { supportSchema } from '../../validators/schemas';
import { AuditService } from '../audit/auditService';
import { AIService } from '../ai/aiService';
import { CloudSyncService } from '../api/cloudSyncService';

export class SupportService {
  static getAll(includeDeleted: boolean = false): TreatmentSupport[] {
    const all = LocalDatabase.getSupports();
    if (includeDeleted) {
      return [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return all.filter((s) => !s.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  static getById(id: string): TreatmentSupport | undefined {
    return LocalDatabase.getSupports().find((s) => s.id === id);
  }

  /**
   * Registra um novo apoio (CREATE)
   * Somente ADMIN autorizado.
   */
  static create(
    currentUser: UserProfile,
    data: { date: string; attendantId: string; quantity: number; observation?: string }
  ): TreatmentSupport {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('403 Forbidden: Usuários com perfil ATENDENTE não possuem permissão para registrar apoios.');
    }

    const validated = supportSchema.parse(data);
    const supports = LocalDatabase.getSupports();

    const newSupport: TreatmentSupport = {
      id: `sup-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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

    supports.push(newSupport);
    LocalDatabase.saveSupports(supports);
    CloudSyncService.syncSupport(newSupport);

    // Auditoria de apoio
    AuditService.logSupportMutation(
      newSupport.id,
      currentUser.id,
      currentUser.name,
      'CREATE',
      null,
      newSupport
    );

    // Log geral de sistema
    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'SUPPORT_CREATED',
      'TREATMENT_SUPPORT',
      newSupport.id,
      { quantity: newSupport.quantity, date: newSupport.date, attendantId: newSupport.attendantId }
    );

    // Invalidação das análises de IA para a data e mês
    AIService.invalidateCacheForDate(newSupport.date);

    return newSupport;
  }

  /**
   * Atualiza um apoio existente (UPDATE)
   * Regra 8: Substitui a quantidade, nunca acumula.
   * Concorrência: Verifica versão.
   */
  static update(
    currentUser: UserProfile,
    id: string,
    data: { date: string; attendantId: string; quantity: number; observation?: string; expectedVersion?: number }
  ): TreatmentSupport {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('403 Forbidden: Usuários com perfil ATENDENTE não possuem permissão para editar apoios.');
    }

    const validated = supportSchema.parse(data);
    const supports = LocalDatabase.getSupports();
    const support = supports.find((s) => s.id === id);

    if (!support) {
      throw new Error('Registro de apoio não encontrado.');
    }

    if (data.expectedVersion !== undefined && support.version !== data.expectedVersion) {
      throw new Error('Este registro foi alterado por outro usuário. Atualize os dados antes de salvar.');
    }

    const oldSnapshot: TreatmentSupport = { ...support };

    support.date = validated.date;
    support.attendantId = validated.attendantId;
    support.quantity = validated.quantity; // Substitui o valor de forma exata
    support.observation = validated.observation?.trim() || undefined;
    support.updatedBy = `${currentUser.name} (${currentUser.role})`;
    support.updatedAt = new Date().toISOString();
    support.version += 1;

    LocalDatabase.saveSupports(supports);
    CloudSyncService.syncSupport(support);

    // Auditoria de apoio com valores antigos e novos
    AuditService.logSupportMutation(
      support.id,
      currentUser.id,
      currentUser.name,
      'UPDATE',
      oldSnapshot,
      support
    );

    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'SUPPORT_UPDATED',
      'TREATMENT_SUPPORT',
      support.id,
      {
        oldQty: oldSnapshot.quantity,
        newQty: support.quantity,
        difference: support.quantity - oldSnapshot.quantity,
      }
    );

    // Invalidação de IA
    AIService.invalidateCacheForDate(oldSnapshot.date);
    if (oldSnapshot.date !== support.date) {
      AIService.invalidateCacheForDate(support.date);
    }

    return support;
  }

  /**
   * Exclusão suave (DELETE / Soft Delete)
   */
  static delete(currentUser: UserProfile, id: string): TreatmentSupport {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('403 Forbidden: Usuários com perfil ATENDENTE não possuem permissão para excluir apoios.');
    }

    const supports = LocalDatabase.getSupports();
    const support = supports.find((s) => s.id === id);

    if (!support) {
      throw new Error('Registro de apoio não encontrado.');
    }

    const oldSnapshot: TreatmentSupport = { ...support };

    support.deletedAt = new Date().toISOString();
    support.deletedBy = `${currentUser.name} (${currentUser.role})`;
    support.updatedAt = new Date().toISOString();
    support.version += 1;

    LocalDatabase.saveSupports(supports);
    CloudSyncService.syncSupport(support);

    AuditService.logSupportMutation(
      support.id,
      currentUser.id,
      currentUser.name,
      'DELETE',
      oldSnapshot,
      support
    );

    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'SUPPORT_DELETED',
      'TREATMENT_SUPPORT',
      support.id,
      { removedQuantity: support.quantity, date: support.date }
    );

    AIService.invalidateCacheForDate(support.date);

    return support;
  }

  /**
   * Restauração de registro excluído (RESTORE)
   */
  static restore(currentUser: UserProfile, id: string): TreatmentSupport {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('403 Forbidden: Usuários com perfil ATENDENTE não possuem permissão para restaurar apoios.');
    }

    const supports = LocalDatabase.getSupports();
    const support = supports.find((s) => s.id === id);

    if (!support) {
      throw new Error('Registro de apoio não encontrado.');
    }

    const oldSnapshot: TreatmentSupport = { ...support };

    support.deletedAt = null;
    support.deletedBy = null;
    support.updatedBy = `${currentUser.name} (${currentUser.role}) [RESTAURADO]`;
    support.updatedAt = new Date().toISOString();
    support.version += 1;

    LocalDatabase.saveSupports(supports);
    CloudSyncService.syncSupport(support);

    AuditService.logSupportMutation(
      support.id,
      currentUser.id,
      currentUser.name,
      'RESTORE',
      oldSnapshot,
      support
    );

    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'SUPPORT_RESTORED',
      'TREATMENT_SUPPORT',
      support.id,
      { restoredQuantity: support.quantity, date: support.date }
    );

    AIService.invalidateCacheForDate(support.date);

    return support;
  }

  /**
   * Limpa registros de apoios (em lote / em massa)
   * Suporta exclusão definitiva (hard delete) ou mover para lixeira (soft delete)
   */
  static async clearLancamentos(
    currentUser: UserProfile,
    options: {
      hardDelete?: boolean;
      onlyDeleted?: boolean;
      targetIds?: string[];
    } = {}
  ): Promise<number> {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('403 Forbidden: Apenas ADMINISTRADORES podem limpar registros de apoios.');
    }

    let supports = LocalDatabase.getSupports();
    let affectedCount = 0;
    const now = new Date().toISOString();
    const author = `${currentUser.name} (${currentUser.role})`;

    const shouldAffect = (s: TreatmentSupport) => {
      if (options.targetIds && options.targetIds.length > 0) {
        return options.targetIds.includes(s.id);
      }
      if (options.onlyDeleted) {
        return Boolean(s.deletedAt);
      }
      return true;
    };

    const datesToInvalidate = new Set<string>();

    if (options.hardDelete) {
      const toDelete = supports.filter(shouldAffect);
      affectedCount = toDelete.length;
      toDelete.forEach((s) => datesToInvalidate.add(s.date));

      supports = supports.filter((s) => !shouldAffect(s));
      LocalDatabase.saveSupports(supports);

      const syncPromises = toDelete.map((s) => CloudSyncService.deleteSupport(s.id));
      await Promise.all(syncPromises);
    } else {
      const syncPromises: Promise<void>[] = [];
      supports = supports.map((s) => {
        if (shouldAffect(s) && !s.deletedAt) {
          affectedCount++;
          datesToInvalidate.add(s.date);
          const updated: TreatmentSupport = {
            ...s,
            deletedAt: now,
            deletedBy: author,
            updatedAt: now,
            version: s.version + 1,
          };
          syncPromises.push(CloudSyncService.syncSupport(updated));
          return updated;
        }
        return s;
      });
      LocalDatabase.saveSupports(supports);
      await Promise.all(syncPromises);
    }

    if (affectedCount > 0) {
      AuditService.logSystemAction(
        currentUser.id,
        currentUser.name,
        currentUser.role,
        'SUPPORT_DELETED',
        'TREATMENT_SUPPORT',
        'BATCH_CLEAR',
        {
          affectedCount,
          hardDelete: Boolean(options.hardDelete),
          onlyDeleted: Boolean(options.onlyDeleted),
          targetIdsCount: options.targetIds?.length,
        }
      );
      datesToInvalidate.forEach((d) => AIService.invalidateCacheForDate(d));
      CloudSyncService.notifyDataChanged();
    }

    return affectedCount;
  }
}

