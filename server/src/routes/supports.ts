import { Router, Request, Response } from 'express';
import { D1DatabaseClient } from '../db/d1Client.js';

const router = Router();

interface SupportRow {
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

function mapSupport(row: SupportRow) {
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

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const includeDeleted = req.query.includeDeleted === 'true';

  try {
    const sql = includeDeleted
      ? 'SELECT * FROM treatment_supports ORDER BY date DESC, created_at DESC'
      : 'SELECT * FROM treatment_supports WHERE deleted_at IS NULL ORDER BY date DESC, created_at DESC';

    const rows = await D1DatabaseClient.query<SupportRow>(sql);
    res.json(rows.map(mapSupport));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar apoios no Cloudflare D1.' });
  }
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { date, attendantId, quantity, observation, createdBy } = req.body;

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
  const id = req.body.id || `sup-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const author = createdBy || 'ADMIN';

  try {
    await D1DatabaseClient.execute(
      `INSERT INTO treatment_supports (id, date, attendant_id, quantity, observation, created_by, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, date, attendantId, numQuantity, observation || null, author, now, now]
    );

    res.status(201).json({
      id,
      date,
      attendantId,
      quantity: numQuantity,
      observation: observation || undefined,
      createdBy: author,
      deletedAt: null,
      deletedBy: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao registrar apoio no Cloudflare D1.' });
  }
});

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { date, attendantId, quantity, observation, updatedBy, expectedVersion } = req.body;
  const now = new Date().toISOString();

  try {
    const rows = await D1DatabaseClient.query<SupportRow>(
      'SELECT * FROM treatment_supports WHERE id = ? LIMIT 1',
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Apoio ao tratamento não encontrado.' });
      return;
    }

    const current = rows[0];

    // Concorrência Otimista (Regra 30)
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
    const author = updatedBy || current.updated_by || 'ADMIN';
    const nextVersion = current.version + 1;

    await D1DatabaseClient.execute(
      `UPDATE treatment_supports
       SET date = ?, attendant_id = ?, quantity = ?, observation = ?, updated_by = ?, version = ?, updated_at = ?
       WHERE id = ?`,
      [newDate, newAttendantId, newQuantity, newObservation, author, nextVersion, now, id]
    );

    res.json({
      id,
      date: newDate,
      attendantId: newAttendantId,
      quantity: newQuantity,
      observation: newObservation || undefined,
      createdBy: current.created_by,
      updatedBy: author,
      deletedAt: current.deleted_at,
      deletedBy: current.deleted_by,
      version: nextVersion,
      createdAt: current.created_at,
      updatedAt: now,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar apoio no Cloudflare D1.' });
  }
});

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const deletedBy = (req.body && req.body.deletedBy) || 'ADMIN';
  const now = new Date().toISOString();

  try {
    const rows = await D1DatabaseClient.query<SupportRow>(
      'SELECT * FROM treatment_supports WHERE id = ? LIMIT 1',
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Apoio ao tratamento não encontrado.' });
      return;
    }

    const current = rows[0];
    const nextVersion = current.version + 1;

    await D1DatabaseClient.execute(
      `UPDATE treatment_supports
       SET deleted_at = ?, deleted_by = ?, version = ?, updated_at = ?
       WHERE id = ?`,
      [now, deletedBy, nextVersion, now, id]
    );

    res.json({
      ...mapSupport(current),
      deletedAt: now,
      deletedBy,
      version: nextVersion,
      updatedAt: now,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir apoio no Cloudflare D1.' });
  }
});

router.post('/:id/restore', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const restoredBy = (req.body && req.body.restoredBy) || 'ADMIN';
  const now = new Date().toISOString();

  try {
    const rows = await D1DatabaseClient.query<SupportRow>(
      'SELECT * FROM treatment_supports WHERE id = ? LIMIT 1',
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Apoio ao tratamento não encontrado.' });
      return;
    }

    const current = rows[0];
    const nextVersion = current.version + 1;

    await D1DatabaseClient.execute(
      `UPDATE treatment_supports
       SET deleted_at = NULL, deleted_by = NULL, updated_by = ?, version = ?, updated_at = ?
       WHERE id = ?`,
      [restoredBy, nextVersion, now, id]
    );

    res.json({
      ...mapSupport(current),
      deletedAt: null,
      deletedBy: null,
      updatedBy: restoredBy,
      version: nextVersion,
      updatedAt: now,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao restaurar apoio no Cloudflare D1.' });
  }
});

export default router;
