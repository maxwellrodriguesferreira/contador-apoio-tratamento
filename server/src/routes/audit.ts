import { Router, Request, Response } from 'express';
import { D1DatabaseClient } from '../db/d1Client.js';
import { authenticateToken, requireRole } from '../middlewares/auth.js';

const router = Router();

// Exige autenticação para todos os endpoints de auditoria
router.use(authenticateToken);

interface AuditLogRow {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: string | null;
  ip_address: string | null;
  created_at: string;
}

interface SupportAuditRow {
  id: string;
  treatment_support_id: string;
  user_id: string;
  user_name: string;
  action: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

// Logs Globais do Sistema — Restrito a ADMINISTRADORES
router.get('/logs', requireRole(['ADMIN']), async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await D1DatabaseClient.query<AuditLogRow>(
      'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 500'
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        userRole: r.user_role,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id || undefined,
        metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
        ipAddress: r.ip_address || undefined,
        createdAt: r.created_at,
      }))
    );
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar logs de auditoria no Cloudflare D1.' });
  }
});

router.post('/logs', async (req: Request, res: Response): Promise<void> => {
  const { action, entityType, entityId, metadata } = req.body;

  // Garante que o usuário gravado no log corresponde estritamente à sessão autenticada
  const userId = req.user?.id || req.body.userId || 'unknown-user';
  const userName = req.user?.name || req.body.userName || 'Usuário Desconhecido';
  const userRole = req.user?.role || req.body.userRole || 'ATENDENTE';

  const now = new Date().toISOString();
  const id = req.body.id || `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const metaStr = metadata ? JSON.stringify(metadata) : null;
  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';

  try {
    await D1DatabaseClient.execute(
      `INSERT INTO audit_logs (id, user_id, user_name, user_role, action, entity_type, entity_id, metadata, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, userName, userRole, action, entityType, entityId || null, metaStr, clientIp, now]
    );

    res.status(201).json({ id, success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao registrar log de auditoria no Cloudflare D1.' });
  }
});

// Auditoria de Apoios (OldValue / NewValue) — Restrito a ADMINISTRADORES
router.get('/supports', requireRole(['ADMIN']), async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await D1DatabaseClient.query<SupportAuditRow>(
      'SELECT * FROM treatment_support_audits ORDER BY created_at DESC LIMIT 1000'
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        treatmentSupportId: r.treatment_support_id,
        userId: r.user_id,
        userName: r.user_name,
        action: r.action,
        oldValue: r.old_value ? JSON.parse(r.old_value) : null,
        newValue: r.new_value ? JSON.parse(r.new_value) : null,
        createdAt: r.created_at,
      }))
    );
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar auditoria de apoios no Cloudflare D1.' });
  }
});

router.post('/supports', requireRole(['ADMIN']), async (req: Request, res: Response): Promise<void> => {
  const { treatmentSupportId, action, oldValue, newValue } = req.body;

  const userId = req.user?.id || req.body.userId || 'unknown-user';
  const userName = req.user?.name || req.body.userName || 'ADMIN';

  const now = new Date().toISOString();
  const id = req.body.id || `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const oldStr = oldValue ? JSON.stringify(oldValue) : null;
  const newStr = newValue ? JSON.stringify(newValue) : null;

  try {
    await D1DatabaseClient.execute(
      `INSERT INTO treatment_support_audits (id, treatment_support_id, user_id, user_name, action, old_value, new_value, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, treatmentSupportId, userId, userName, action, oldStr, newStr, now]
    );

    res.status(201).json({ id, success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao registrar auditoria de apoio no Cloudflare D1.' });
  }
});

// Limpar Logs Globais do Sistema — Restrito a ADMINISTRADORES
router.delete('/logs', requireRole(['ADMIN']), async (_req: Request, res: Response): Promise<void> => {
  try {
    await D1DatabaseClient.execute('DELETE FROM audit_logs');
    res.json({ success: true, message: 'Histórico de logs do sistema limpo com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao limpar histórico de logs de auditoria no Cloudflare D1.' });
  }
});

// Limpar Auditoria de Apoios — Restrito a ADMINISTRADORES
router.delete('/supports', requireRole(['ADMIN']), async (_req: Request, res: Response): Promise<void> => {
  try {
    await D1DatabaseClient.execute('DELETE FROM treatment_support_audits');
    res.json({ success: true, message: 'Histórico de auditoria de apoios limpo com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao limpar histórico de auditoria de apoios no Cloudflare D1.' });
  }
});

export default router;
