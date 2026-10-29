import { describe, it, expect, beforeEach } from 'vitest';
import { AuditService } from '../services/audit/auditService';
import { LocalDatabase } from '../services/storage/localDatabase';
import { AuditLog, TreatmentSupportAudit } from '../types';

describe('Suíte de Testes — Limpeza do Histórico de Auditoria e Logs', () => {
  beforeEach(() => {
    LocalDatabase.clearAuditLogs();
    LocalDatabase.clearSupportAudits();
  });

  it('deve registrar e limpar logs do sistema com sucesso', async () => {
    // 1. Inserir logs no banco local
    const mockLog: AuditLog = {
      id: 'log-test-1',
      userId: 'usr-1',
      userName: 'Admin Teste',
      userRole: 'ADMIN',
      action: 'LOGIN',
      entityType: 'AUTH',
      createdAt: new Date().toISOString(),
      ipAddress: '127.0.0.1',
    };
    LocalDatabase.saveAuditLogs([mockLog]);
    expect(AuditService.getAllSystemLogs()).toHaveLength(1);

    // 2. Limpar logs do sistema
    await AuditService.clearSystemLogs();
    expect(AuditService.getAllSystemLogs()).toHaveLength(0);
  });

  it('deve registrar e limpar histórico de auditoria de apoios com sucesso', async () => {
    // 1. Inserir auditoria de apoios
    const mockAudit: TreatmentSupportAudit = {
      id: 'audit-test-1',
      treatmentSupportId: 'sup-1',
      userId: 'usr-1',
      userName: 'Admin Teste',
      action: 'CREATE',
      oldValue: null,
      newValue: { quantity: 5 },
      createdAt: new Date().toISOString(),
    };
    LocalDatabase.saveSupportAudits([mockAudit]);
    expect(AuditService.getSupportAudits()).toHaveLength(1);

    // 2. Limpar auditoria de apoios
    await AuditService.clearSupportAudits();
    expect(AuditService.getSupportAudits()).toHaveLength(0);
  });

  it('deve limpar ambos os históricos simultaneamente com clearAllLogs', async () => {
    const mockLog: AuditLog = {
      id: 'log-test-2',
      userId: 'usr-1',
      userName: 'Admin Teste',
      userRole: 'ADMIN',
      action: 'UPDATE_SETTINGS',
      entityType: 'SETTINGS',
      createdAt: new Date().toISOString(),
    };
    const mockAudit: TreatmentSupportAudit = {
      id: 'audit-test-2',
      treatmentSupportId: 'sup-2',
      userId: 'usr-1',
      userName: 'Admin Teste',
      action: 'UPDATE',
      oldValue: { quantity: 5 },
      newValue: { quantity: 10 },
      createdAt: new Date().toISOString(),
    };

    LocalDatabase.saveAuditLogs([mockLog]);
    LocalDatabase.saveSupportAudits([mockAudit]);
    expect(AuditService.getAllSystemLogs()).toHaveLength(1);
    expect(AuditService.getSupportAudits()).toHaveLength(1);

    await AuditService.clearAllLogs();
    expect(AuditService.getAllSystemLogs()).toHaveLength(0);
    expect(AuditService.getSupportAudits()).toHaveLength(0);
  });
});
