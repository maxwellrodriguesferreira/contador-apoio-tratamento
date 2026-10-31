import { Router, Request, Response } from 'express';
import { D1DatabaseClient } from '../db/d1Client.js';
import { authenticateToken, requireRole } from '../middlewares/auth.js';

const router = Router();

// Exige autenticação para todos os endpoints do Na Rotina
router.use(authenticateToken);

interface RoutineRow {
  id: string;
  date: string;
  attendant_id: string;
  quantity: number;
  observation: string | null;
  created_by: string;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

function mapRoutine(row: RoutineRow) {
  return {
    id: row.id,
    date: row.date,
    attendantId: row.attendant_id,
    quantity: row.quantity,
    observation: row.observation || undefined,
    createdBy: row.created_by,
    updatedBy: row.updated_by || undefined,
    deletedAt: row.deleted_at || null,
    deletedBy: row.deleted_by || null,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Leitura: Permitida a usuários autenticados (ADMIN e ATENDENTE)
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const includeDeleted = req.query.includeDeleted === 'true';

  try {
    const sql = includeDeleted
      ? 'SELECT * FROM routine_cares ORDER BY date DESC, created_at DESC'
      : 'SELECT * FROM routine_cares WHERE deleted_at IS NULL ORDER BY date DESC, created_at DESC';

    const rows = await D1DatabaseClient.query<RoutineRow>(sql);
    res.json(rows.map(mapRoutine));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar registros de Na Rotina no Cloudflare D1.' });
  }
});

// Criação: Restrita a ADMINISTRADORES (Regras RBAC do sistema)
router.post('/', requireRole(['ADMIN']), async (req: Request, res: Response): Promise<void> => {
  const { date, attendantId, quantity, observation, deletedAt, deletedBy, version } = req.body;

  if (!date || !attendantId || quantity === undefined) {
    res.status(400).json({ error: 'Data, atendente e quantidade são obrigatórios.' });
    return;
  }

  const numQuantity = parseInt(String(quantity), 10);
  if (isNaN(numQuantity) || numQuantity <= 0) {
    res.status(400).json({ error: 'A quantidade deve ser um número inteiro positivo.' });
    return;
  }

  const now = new Date().toISOString();
  const id = req.body.id || `rot-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const author = req.user ? `${req.user.name} (${req.user.role})` : 'ADMIN';
  const recVersion = typeof version === 'number' && version > 0 ? version : 1;

  try {
    const existing = await D1DatabaseClient.query<RoutineRow>(
      'SELECT id, version FROM routine_cares WHERE id = ? LIMIT 1',
      [id]
    );

    if (existing.length > 0) {
      await D1DatabaseClient.execute(
        `UPDATE routine_cares
         SET date = ?, attendant_id = ?, quantity = ?, observation = ?, updated_by = ?, deleted_at = ?, deleted_by = ?, version = ?, updated_at = ?
         WHERE id = ?`,
        [date, attendantId, numQuantity, observation || null, author, deletedAt || null, deletedBy || null, recVersion, now, id]
      );

      res.status(200).json({
        id,
        date,
        attendantId,
        quantity: numQuantity,
        observation: observation || undefined,
        createdBy: author,
        updatedBy: author,
        deletedAt: deletedAt || null,
        deletedBy: deletedBy || null,
        version: recVersion,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    await D1DatabaseClient.execute(
      `INSERT INTO routine_cares (id, date, attendant_id, quantity, observation, created_by, deleted_at, deleted_by, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, date, attendantId, numQuantity, observation || null, author, deletedAt || null, deletedBy || null, recVersion, now, now]
    );

    res.status(201).json({
      id,
      date,
      attendantId,
      quantity: numQuantity,
      observation: observation || undefined,
      createdBy: author,
      deletedAt: deletedAt || null,
      deletedBy: deletedBy || null,
      version: recVersion,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao registrar atendimento Na Rotina no Cloudflare D1.' });
  }
});

// Edição: Restrita a ADMINISTRADORES
router.put('/:id', requireRole(['ADMIN']), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { date, attendantId, quantity, observation, expectedVersion, deletedAt, deletedBy } = req.body;
  const now = new Date().toISOString();

  try {
    const rows = await D1DatabaseClient.query<RoutineRow>(
      'SELECT * FROM routine_cares WHERE id = ? LIMIT 1',
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Registro de Na Rotina não encontrado.' });
      return;
    }

    const current = rows[0];

    if (expectedVersion !== undefined && expectedVersion !== current.version) {
      res.status(409).json({
        error: 'Conflito de versão: este registro foi modificado por outro usuário. Atualize a página e tente novamente.',
      });
      return;
    }

    const newDate = date || current.date;
    const newAttendantId = attendantId || current.attendant_id;
    const newQuantity = quantity !== undefined ? parseInt(String(quantity), 10) : current.quantity;
    const newObservation = observation !== undefined ? (observation || null) : current.observation;
    const author = req.user ? `${req.user.name} (${req.user.role})` : current.updated_by || 'ADMIN';
    const newDeletedAt = deletedAt !== undefined ? (deletedAt || null) : current.deleted_at;
    const newDeletedBy = deletedBy !== undefined ? (deletedBy || null) : current.deleted_by;
    const nextVersion = current.version + 1;

    await D1DatabaseClient.execute(
      `UPDATE routine_cares
       SET date = ?, attendant_id = ?, quantity = ?, observation = ?, updated_by = ?, deleted_at = ?, deleted_by = ?, version = ?, updated_at = ?
       WHERE id = ?`,
      [newDate, newAttendantId, newQuantity, newObservation, author, newDeletedAt, newDeletedBy, nextVersion, now, id]
    );

    res.json({
      id,
      date: newDate,
      attendantId: newAttendantId,
      quantity: newQuantity,
      observation: newObservation || undefined,
      createdBy: current.created_by,
      updatedBy: author,
      deletedAt: newDeletedAt,
      deletedBy: newDeletedBy,
      version: nextVersion,
      createdAt: current.created_at,
      updatedAt: now,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar atendimento Na Rotina no Cloudflare D1.' });
  }
});

// Limpeza em Massa (Clear Lancamentos de Rotina): Restrita a ADMINISTRADORES
router.post('/clear', requireRole(['ADMIN']), async (req: Request, res: Response): Promise<void> => {
  const { hardDelete, onlyDeleted, targetIds } = req.body || {};
  const isHard = Boolean(hardDelete);
  const isTrashOnly = Boolean(onlyDeleted);
  const author = req.user ? `${req.user.name} (${req.user.role})` : 'ADMIN';
  const now = new Date().toISOString();

  try {
    let affectedCount = 0;

    if (Array.isArray(targetIds) && targetIds.length > 0) {
      const placeholders = targetIds.map(() => '?').join(',');
      if (isHard) {
        const resSql = await D1DatabaseClient.execute(
          `DELETE FROM routine_cares WHERE id IN (${placeholders})`,
          targetIds
        );
        affectedCount = resSql.changes;
      } else {
        const resSql = await D1DatabaseClient.execute(
          `UPDATE routine_cares
           SET deleted_at = ?, deleted_by = ?, version = version + 1, updated_at = ?
           WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
          [now, author, now, ...targetIds]
        );
        affectedCount = resSql.changes;
      }
    } else if (isTrashOnly) {
      if (isHard) {
        const resSql = await D1DatabaseClient.execute(
          'DELETE FROM routine_cares WHERE deleted_at IS NOT NULL'
        );
        affectedCount = resSql.changes;
      } else {
        affectedCount = 0;
      }
    } else {
      if (isHard) {
        const resSql = await D1DatabaseClient.execute('DELETE FROM routine_cares');
        affectedCount = resSql.changes;
      } else {
        const resSql = await D1DatabaseClient.execute(
          `UPDATE routine_cares
           SET deleted_at = ?, deleted_by = ?, version = version + 1, updated_at = ?
           WHERE deleted_at IS NULL`,
          [now, author, now]
        );
        affectedCount = resSql.changes;
      }
    }

    res.json({ success: true, affectedCount });
  } catch (error) {
    console.error('Erro ao limpar registros Na Rotina no Cloudflare D1:', error);
    res.status(500).json({ error: 'Erro ao limpar atendimentos de rotina no banco de dados.' });
  }
});

// Exclusão: Restrita a ADMINISTRADORES (Suporta soft delete e hard delete com ?hard=true)
router.delete('/:id', requireRole(['ADMIN']), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const isHard = req.query.hard === 'true';
  const deletedBy = req.user ? `${req.user.name} (${req.user.role})` : 'ADMIN';
  const now = new Date().toISOString();

  try {
    const rows = await D1DatabaseClient.query<RoutineRow>(
      'SELECT * FROM routine_cares WHERE id = ? LIMIT 1',
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Registro de Na Rotina não encontrado.' });
      return;
    }

    const current = rows[0];

    if (isHard) {
      await D1DatabaseClient.execute(
        'DELETE FROM routine_cares WHERE id = ?',
        [id]
      );
      res.json({ success: true, id, hardDeleted: true });
      return;
    }

    const nextVersion = current.version + 1;

    await D1DatabaseClient.execute(
      `UPDATE routine_cares
       SET deleted_at = ?, deleted_by = ?, version = ?, updated_at = ?
       WHERE id = ?`,
      [now, deletedBy, nextVersion, now, id]
    );

    res.json({
      ...mapRoutine(current),
      deletedAt: now,
      deletedBy,
      version: nextVersion,
      updatedAt: now,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir atendimento Na Rotina no Cloudflare D1.' });
  }
});

// Restauração: Restrita a ADMINISTRADORES
router.post('/:id/restore', requireRole(['ADMIN']), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const restoredBy = req.user ? `${req.user.name} (${req.user.role}) [RESTAURADO]` : 'ADMIN [RESTAURADO]';
  const now = new Date().toISOString();

  try {
    const rows = await D1DatabaseClient.query<RoutineRow>(
      'SELECT * FROM routine_cares WHERE id = ? LIMIT 1',
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Registro de Na Rotina não encontrado.' });
      return;
    }

    const current = rows[0];
    const nextVersion = current.version + 1;

    await D1DatabaseClient.execute(
      `UPDATE routine_cares
       SET deleted_at = NULL, deleted_by = NULL, updated_by = ?, version = ?, updated_at = ?
       WHERE id = ?`,
      [restoredBy, nextVersion, now, id]
    );

    res.json({
      ...mapRoutine(current),
      deletedAt: null,
      deletedBy: null,
      updatedBy: restoredBy,
      version: nextVersion,
      updatedAt: now,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao restaurar atendimento Na Rotina no Cloudflare D1.' });
  }
});

export default router;
