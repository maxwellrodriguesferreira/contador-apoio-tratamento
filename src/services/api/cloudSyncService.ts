import { apiRequest } from './cloudflareClient';
import { LocalDatabase } from '../storage/localDatabase';
import { Attendant, Goal, TreatmentSupport, TreatmentSupportAudit, UserProfile, AuditLog } from '../../types';

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
    }
  }

  static async deleteAttendant(id: string): Promise<void> {
    try {
      await apiRequest<{ success: boolean }>(`/attendants/${id}`, 'DELETE');
    } catch (e) {
      console.warn('Erro ao excluir atendente no Cloudflare D1:', e);
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
    }
  }

  static async syncGoal(goal: Goal): Promise<void> {
    try {
      await apiRequest<Goal>('/goals', 'POST', goal).catch(async () => {
        await apiRequest<Goal>(`/goals/${goal.id}`, 'PUT', goal);
      });
    } catch (e) {
      console.warn('Erro ao sincronizar meta no Cloudflare D1:', e);
    }
  }

  static async deleteGoal(id: string): Promise<void> {
    try {
      await apiRequest<{ success: boolean }>(`/goals/${id}`, 'DELETE');
    } catch (e) {
      console.warn('Erro ao excluir meta no Cloudflare D1:', e);
    }
  }

  static async syncUser(user: UserProfile): Promise<void> {
    try {
      await apiRequest<UserProfile>('/users', 'POST', user).catch(async () => {
        await apiRequest<UserProfile>(`/users/${user.id}`, 'PUT', user);
      });
    } catch (e) {
      console.warn('Erro ao sincronizar usuário no Cloudflare D1:', e);
    }
  }

  static async deleteUser(id: string): Promise<void> {
    try {
      await apiRequest<{ success: boolean }>(`/users/${id}`, 'DELETE');
    } catch (e) {
      console.warn('Erro ao excluir usuário no Cloudflare D1:', e);
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
    try {
      await apiRequest<{ success: boolean }>('/audit/logs', 'DELETE');
    } catch (e) {
      console.warn('Erro ao limpar logs de auditoria no Cloudflare D1:', e);
    }
  }

  static async clearSupportAudits(): Promise<void> {
    try {
      await apiRequest<{ success: boolean }>('/audit/supports', 'DELETE');
    } catch (e) {
      console.warn('Erro ao limpar auditoria de apoios no Cloudflare D1:', e);
    }
  }
}
