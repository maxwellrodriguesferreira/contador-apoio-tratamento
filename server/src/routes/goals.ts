import { Router, Request, Response } from 'express';
import { D1DatabaseClient } from '../db/d1Client.js';

const router = Router();

interface GoalRow {
  id: string;
  type: string;
  attendant_id: string | null;
  target_value: number;
  start_date: string;
  end_date: string | null;
  active: number;
  created_at: string;
  updated_at: string;
}

function mapGoal(row: GoalRow) {
  return {
    id: row.id,
    type: row.type,
    attendantId: row.attendant_id || undefined,
    targetValue: row.target_value,
    startDate: row.start_date,
    endDate: row.end_date || undefined,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await D1DatabaseClient.query<GoalRow>(
      'SELECT * FROM goals ORDER BY start_date DESC'
    );
    res.json(rows.map(mapGoal));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar metas no Cloudflare D1.' });
  }
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { type, attendantId, targetValue, startDate, endDate, active = true } = req.body;

  if (!type || targetValue === undefined || !startDate) {
    res.status(400).json({ error: 'Tipo, meta e data de início são obrigatórios.' });
    return;
  }

  const numTarget = parseInt(String(targetValue), 10);
  const now = new Date().toISOString();
  const id = req.body.id || `goal-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  try {
    const existing = await D1DatabaseClient.query<GoalRow>('SELECT id FROM goals WHERE id = ? LIMIT 1', [id]);
    if (existing.length > 0) {
      await D1DatabaseClient.execute(
        `UPDATE goals
         SET type = ?, attendant_id = ?, target_value = ?, start_date = ?, end_date = ?, active = ?, updated_at = ?
         WHERE id = ?`,
        [type, attendantId || null, numTarget, startDate, endDate || null, active ? 1 : 0, now, id]
      );

      res.status(200).json({
        id,
        type,
        attendantId: attendantId || undefined,
        targetValue: numTarget,
        startDate,
        endDate: endDate || undefined,
        active,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    await D1DatabaseClient.execute(
      `INSERT INTO goals (id, type, attendant_id, target_value, start_date, end_date, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, type, attendantId || null, numTarget, startDate, endDate || null, active ? 1 : 0, now, now]
    );

    res.status(201).json({
      id,
      type,
      attendantId: attendantId || undefined,
      targetValue: numTarget,
      startDate,
      endDate: endDate || undefined,
      active,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar meta no Cloudflare D1.' });
  }
});

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { type, attendantId, targetValue, startDate, endDate, active } = req.body;
  const now = new Date().toISOString();

  try {
    const rows = await D1DatabaseClient.query<GoalRow>('SELECT * FROM goals WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      res.status(404).json({ error: 'Meta não encontrada.' });
      return;
    }

    const current = rows[0];
    const newType = type || current.type;
    const newAttendantId = attendantId !== undefined ? (attendantId || null) : current.attendant_id;
    const newTarget = targetValue !== undefined ? parseInt(String(targetValue), 10) : current.target_value;
    const newStartDate = startDate || current.start_date;
    const newEndDate = endDate !== undefined ? (endDate || null) : current.end_date;
    const newActive = active !== undefined ? (active ? 1 : 0) : current.active;

    await D1DatabaseClient.execute(
      `UPDATE goals
       SET type = ?, attendant_id = ?, target_value = ?, start_date = ?, end_date = ?, active = ?, updated_at = ?
       WHERE id = ?`,
      [newType, newAttendantId, newTarget, newStartDate, newEndDate, newActive, now, id]
    );

    res.json({
      id,
      type: newType,
      attendantId: newAttendantId || undefined,
      targetValue: newTarget,
      startDate: newStartDate,
      endDate: newEndDate || undefined,
      active: Boolean(newActive),
      createdAt: current.created_at,
      updatedAt: now,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar meta no Cloudflare D1.' });
  }
});

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const rows = await D1DatabaseClient.query<GoalRow>('SELECT * FROM goals WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      res.json({ success: true, message: 'Meta já não consta no banco de dados.' });
      return;
    }

    await D1DatabaseClient.execute('DELETE FROM goals WHERE id = ?', [id]);
    res.json({ success: true, message: 'Meta excluída com sucesso do Cloudflare D1.' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir meta no Cloudflare D1.' });
  }
});

export default router;
