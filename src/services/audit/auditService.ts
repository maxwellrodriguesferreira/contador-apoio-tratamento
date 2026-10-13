import { LocalDatabase } from '../storage/localDatabase';
import { AuditLog, AuditLogAction, SupportAuditAction, TreatmentSupport, TreatmentSupportAudit, UserRole } from '../../types';
import { CloudSyncService } from '../api/cloudSyncService';

export class AuditService {
  /**
   * Registra uma entrada no log de auditoria global do sistema
   */
  static logSystemAction(
    userId: string,
    userName: string,
    userRole: UserRole,
    action: AuditLogAction,
    entityType: string,
    entityId?: string,
    metadata?: Record<string, unknown>
  ): void {
    const logs = LocalDatabase.getAuditLogs();
    const newLog: AuditLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId,
      userName,
      userRole,
      action,
      entityType,
      entityId,
      metadata,
      createdAt: new Date().toISOString(),
      ipAddress: '192.168.1.100 (Cloudflare Edge Session)',
    };

    logs.unshift(newLog);
    // Limita aos últimos 1000 logs para manter alta performance
    if (logs.length > 1000) {
      logs.length = 1000;
    }
    LocalDatabase.saveAuditLogs(logs);
    CloudSyncService.syncAuditLog(newLog);
  }

  /**
   * Registra uma auditoria de mutação de apoio (CREATE, UPDATE, DELETE, RESTORE)
   */
  static logSupportMutation(
    treatmentSupportId: string,
    userId: string,
    userName: string,
    action: SupportAuditAction,
    oldValue: Partial<TreatmentSupport> | null,
    newValue: Partial<TreatmentSupport> | null
  ): void {
    const audits = LocalDatabase.getSupportAudits();
    const newAudit: TreatmentSupportAudit = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      treatmentSupportId,
      userId,
      userName,
      action,
      oldValue,
      newValue,
      createdAt: new Date().toISOString(),
    };

    audits.unshift(newAudit);
    LocalDatabase.saveSupportAudits(audits);
    CloudSyncService.syncSupportAudit(newAudit);
  }

  static getAllSystemLogs(): AuditLog[] {
    return LocalDatabase.getAuditLogs();
  }

  static getSupportAudits(supportId?: string): TreatmentSupportAudit[] {
    const audits = LocalDatabase.getSupportAudits();
    if (supportId) {
      return audits.filter((a) => a.treatmentSupportId === supportId);
    }
    return audits;
  }
}
