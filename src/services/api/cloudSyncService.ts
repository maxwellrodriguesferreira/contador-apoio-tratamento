import { apiRequest } from './cloudflareClient';
import { LocalDatabase } from '../storage/localDatabase';
import { Attendant, Goal, TreatmentSupport, RoutineCare, TreatmentSupportAudit, UserProfile, AuditLog, AISettings, AppSettings } from '../../types';

type DataChangeListener = () => void;

export class CloudSyncService {
  private static isSyncing = false;
  private static listeners = new Set<DataChangeListener>();

  /**
   * Registra um listener que é executado sempre que os dados são atualizados da nuvem
   */
  static subscribe(listener: DataChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notifica todas as telas para recarregarem os dados
   */
  static notifyDataChanged(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('Erro ao notificar listener de dados:', err);
      }
    });
  }

  /**
   * Sincroniza todos os dados do banco Cloudflare D1 para a memória/cache local da aplicação
   */
  static async syncAllFromCloud(): Promise<void> {
    if (this.isSyncing) {
      return;
    }

    this.isSyncing = true;
    try {
      console.info('🔄 Sincronizando dados com o banco Cloudflare D1...');

      // 1. Sincronizar Atendentes
      try {
        const cloudAttendants = await apiRequest<Attendant[]>('/attendants');
        if (Array.isArray(cloudAttendants)) {
          LocalDatabase.saveAttendants(cloudAttendants);
        }
      } catch (e) {
        console.warn('Aviso ao sincronizar atendentes do Cloudflare D1:', e);
      }

      // 2. Sincronizar Apoios ao Tratamento
      try {
        const cloudSupports = await apiRequest<TreatmentSupport[]>('/supports?includeDeleted=true');
        if (Array.isArray(cloudSupports)) {
          LocalDatabase.saveSupports(cloudSupports);
        }
      } catch (e) {
        console.warn('Aviso ao sincronizar apoios do Cloudflare D1:', e);
      }

      // 2.1 Sincronizar Na Rotina
      try {
        const cloudRoutines = await apiRequest<RoutineCare[]>('/routines?includeDeleted=true');
        if (Array.isArray(cloudRoutines)) {
          LocalDatabase.saveRoutines(cloudRoutines);
        }
      } catch (e) {
        console.warn('Aviso ao sincronizar Na Rotina do Cloudflare D1:', e);
      }


      // 3. Sincronizar Metas
      try {
        const cloudGoals = await apiRequest<Goal[]>('/goals');
        if (Array.isArray(cloudGoals)) {
          LocalDatabase.saveGoals(cloudGoals);
        }
      } catch (e) {
        console.warn('Aviso ao sincronizar metas do Cloudflare D1:', e);
      }

      // 4. Sincronizar Usuários
      try {
        const cloudUsers = await apiRequest<UserProfile[]>('/users');
        if (Array.isArray(cloudUsers)) {
          LocalDatabase.saveUserProfiles(cloudUsers);
        }
      } catch (e) {
        console.warn('Aviso ao sincronizar usuários do Cloudflare D1:', e);
      }

      // 5. Sincronizar Auditoria de Apoios
      try {
        const cloudSupportAudits = await apiRequest<TreatmentSupportAudit[]>('/audit/supports');
        if (Array.isArray(cloudSupportAudits)) {
          LocalDatabase.saveSupportAudits(cloudSupportAudits);
        }
      } catch (e) {
        console.warn('Aviso ao sincronizar auditoria de apoios do Cloudflare D1:', e);
      }

      // 6. Sincronizar Logs Globais de Auditoria
      try {
        const cloudAuditLogs = await apiRequest<AuditLog[]>('/audit/logs');
        if (Array.isArray(cloudAuditLogs)) {
          LocalDatabase.saveAuditLogs(cloudAuditLogs);
        }
      } catch (e) {
        console.warn('Aviso ao sincronizar logs de auditoria do Cloudflare D1:', e);
      }

      // 7. Sincronizar Configurações Globais e IA
      try {
        const cloudSettings = await apiRequest<{
          aiSettings?: Partial<AISettings>;
          appSettings?: Partial<AppSettings>;
        }>('/settings');
        if (cloudSettings) {
          if (cloudSettings.aiSettings) {
            const currentAi = LocalDatabase.getAISettings();
            LocalDatabase.saveAISettings({ ...currentAi, ...cloudSettings.aiSettings });
          }
          if (cloudSettings.appSettings) {
            const currentApp = LocalDatabase.getAppSettings();
            LocalDatabase.saveAppSettings({ ...currentApp, ...cloudSettings.appSettings });
          }
        }
      } catch (e) {
        console.warn('Aviso ao sincronizar configurações do Cloudflare D1:', e);
      }

      console.info('✓ Sincronização com o Cloudflare D1 concluída com sucesso.');
      this.notifyDataChanged();
    } catch (e) {
      console.warn('Falha na sincronização com Cloudflare D1 (operando com persistência local resiliente):', e);
    } finally {
      this.isSyncing = false;
    }
  }

  // --- Mutations Assíncronas Diretas para o Cloudflare D1 ---

  static async syncAttendant(attendant: Attendant): Promise<void> {
    try {
      await apiRequest<Attendant>('/attendants', 'POST', attendant).catch(async () => {
        await apiRequest<Attendant>(`/attendants/${attendant.id}`, 'PUT', attendant);
      });
    } catch (e) {
      console.warn('Erro ao sincronizar atendente no Cloudflare D1:', e);
      throw e;
    }
  }

  static async deleteAttendant(id: string): Promise<void> {
    try {
      await apiRequest<{ success: boolean }>(`/attendants/${id}`, 'DELETE');
    } catch (e) {
      console.warn('Erro ao excluir atendente no Cloudflare D1:', e);
      throw e;
    }
  }

  static async syncSupport(support: TreatmentSupport): Promise<void> {
    try {
      if (support.deletedAt) {
        await apiRequest<TreatmentSupport>(`/supports/${support.id}`, 'PUT', support).catch(async () => {
          await apiRequest<TreatmentSupport>('/supports', 'POST', support);
        });
      } else {
        await apiRequest<TreatmentSupport>('/supports', 'POST', support).catch(async () => {
          await apiRequest<TreatmentSupport>(`/supports/${support.id}`, 'PUT', support);
        });
      }
    } catch (e) {
      console.warn('Erro ao sincronizar apoio no Cloudflare D1:', e);
      throw e;
    }
  }

  static async syncRoutine(routine: RoutineCare): Promise<void> {
    try {
      if (routine.deletedAt) {
        await apiRequest<RoutineCare>(`/routines/${routine.id}`, 'PUT', routine).catch(async () => {
          await apiRequest<RoutineCare>('/routines', 'POST', routine);
        });
      } else {
        await apiRequest<RoutineCare>('/routines', 'POST', routine).catch(async () => {
          await apiRequest<RoutineCare>(`/routines/${routine.id}`, 'PUT', routine);
        });
      }
    } catch (e) {
      console.warn('Erro ao sincronizar atendimento Na Rotina no Cloudflare D1:', e);
      throw e;
    }
  }

  static async deleteSupport(id: string, hard = false): Promise<void> {
    try {
      await apiRequest<{ success: boolean }>(`/supports/${id}${hard ? '?hard=true' : ''}`, 'DELETE');
    } catch (e) {
      console.warn('Erro ao excluir apoio no Cloudflare D1:', e);
    }
  }

  static async deleteRoutine(id: string, hard = false): Promise<void> {
    try {
      await apiRequest<{ success: boolean }>(`/routines/${id}${hard ? '?hard=true' : ''}`, 'DELETE');
    } catch (e) {
      console.warn('Erro ao excluir atendimento de rotina no Cloudflare D1:', e);
    }
  }

  static async clearSupports(options: {
    hardDelete?: boolean;
    onlyDeleted?: boolean;
    targetIds?: string[];
  }): Promise<void> {
    try {
      await apiRequest<{ success: boolean; affectedCount: number }>('/supports/clear', 'POST', options);
    } catch (e) {
      console.warn('Aviso ao executar limpeza de apoios na API D1, executando fallback individual:', e);
      if (options.targetIds && options.targetIds.length > 0) {
        await Promise.all(options.targetIds.map((id) => this.deleteSupport(id, options.hardDelete)));
      }
    }
  }

  static async clearRoutines(options: {
    hardDelete?: boolean;
    onlyDeleted?: boolean;
    targetIds?: string[];
  }): Promise<void> {
    try {
      await apiRequest<{ success: boolean; affectedCount: number }>('/routines/clear', 'POST', options);
    } catch (e) {
      console.warn('Aviso ao executar limpeza de rotinas na API D1, executando fallback individual:', e);
      if (options.targetIds && options.targetIds.length > 0) {
        await Promise.all(options.targetIds.map((id) => this.deleteRoutine(id, options.hardDelete)));
      }
    }
  }



  static async syncGoal(goal: Goal): Promise<void> {
    try {
      await apiRequest<Goal>('/goals', 'POST', goal).catch(async () => {
        await apiRequest<Goal>(`/goals/${goal.id}`, 'PUT', goal);
      });
    } catch (e) {
      console.warn('Erro ao sincronizar meta no Cloudflare D1:', e);
      throw e;
    }
  }

  static async deleteGoal(id: string): Promise<void> {
    try {
      await apiRequest<{ success: boolean }>(`/goals/${id}`, 'DELETE');
    } catch (e) {
      console.warn('Erro ao excluir meta no Cloudflare D1:', e);
      throw e;
    }
  }

  static async syncUser(user: UserProfile, password?: string): Promise<void> {
    const payload = password ? { ...user, password } : user;
    try {
      await apiRequest<UserProfile>('/users', 'POST', payload).catch(async () => {
        await apiRequest<UserProfile>(`/users/${user.id}`, 'PUT', payload);
      });
    } catch (e) {
      console.warn('Erro ao sincronizar usuário no Cloudflare D1:', e);
      throw e;
    }
  }

  static async deleteUser(id: string): Promise<void> {
    try {
      await apiRequest<{ success: boolean }>(`/users/${id}`, 'DELETE');
    } catch (e) {
      console.warn('Erro ao excluir usuário no Cloudflare D1:', e);
      throw e;
    }
  }

  static async syncAuditLog(log: AuditLog): Promise<void> {
    try {
      await apiRequest<{ id: string }>('/audit/logs', 'POST', log);
    } catch (e) {
      console.warn('Erro ao sincronizar log de auditoria no Cloudflare D1:', e);
    }
  }

  static async syncSupportAudit(audit: TreatmentSupportAudit): Promise<void> {
    try {
      await apiRequest<{ id: string }>('/audit/supports', 'POST', audit);
    } catch (e) {
      console.warn('Erro ao sincronizar auditoria de apoio no Cloudflare D1:', e);
    }
  }

  static async clearAuditLogs(): Promise<void> {
    await apiRequest<{ success: boolean }>('/audit/logs', 'DELETE');
  }

  static async clearSupportAudits(): Promise<void> {
    await apiRequest<{ success: boolean }>('/audit/supports', 'DELETE');
  }

  static async syncSettings(
    aiSettings?: Partial<AISettings>,
    appSettings?: Partial<AppSettings>
  ): Promise<void> {
    try {
      await apiRequest<{ success: boolean }>('/settings', 'PUT', { aiSettings, appSettings });
    } catch (e) {
      console.warn('Erro ao sincronizar configurações no Cloudflare D1:', e);
      throw e;
    }
  }
}
