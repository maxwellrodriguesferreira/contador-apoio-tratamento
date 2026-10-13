import { Router, Request, Response } from 'express';
import { D1DatabaseClient } from '../db/d1Client.js';

const router = Router();

interface AttendantRow {
  id: string;
  name: string;
  code: string;
  active: number;
  created_at: string;
  updated_at: string;
}

function mapAttendant(row: AttendantRow) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await D1DatabaseClient.query<AttendantRow>(
      'SELECT * FROM attendants ORDER BY name ASC'
    );
    res.json(rows.map(mapAttendant));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar atendentes no Cloudflare D1.' });
  }
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { name, code, active = true } = req.body;

  if (!name || !code) {
    res.status(400).json({ error: 'Nome e código do atendente são obrigatórios.' });
    return;
  }

  const cleanName = name.trim();
  const cleanCode = code.trim();
  const now = new Date().toISOString();
  const id = req.body.id || `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  try {
    const existing = await D1DatabaseClient.query<AttendantRow>(
      'SELECT id FROM attendants WHERE LOWER(code) = ? LIMIT 1',
      [cleanCode.toLowerCase()]
    );

    if (existing.length > 0) {
      res.status(400).json({ error: 'Já existe um atendente cadastrado com este código.' });
      return;
    }

    await D1DatabaseClient.execute(
      `INSERT INTO attendants (id, name, code, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, cleanName, cleanCode, active ? 1 : 0, now, now]
    );

    res.status(201).json({
      id,
      name: cleanName,
      code: cleanCode,
      active,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao cadastrar atendente no Cloudflare D1.' });
  }
});

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { name, code, active } = req.body;
  const now = new Date().toISOString();

  try {
    const rows = await D1DatabaseClient.query<AttendantRow>(
      'SELECT * FROM attendants WHERE id = ? LIMIT 1',
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Atendente não encontrado.' });
      return;
    }

    const current = rows[0];
    const newName = name !== undefined ? name.trim() : current.name;
    const newCode = code !== undefined ? code.trim() : current.code;
    const newActive = active !== undefined ? (active ? 1 : 0) : current.active;

    if (code !== undefined && newCode.toLowerCase() !== current.code.toLowerCase()) {
      const codeCheck = await D1DatabaseClient.query<AttendantRow>(
        'SELECT id FROM attendants WHERE LOWER(code) = ? AND id != ? LIMIT 1',
        [newCode.toLowerCase(), id]
      );
      if (codeCheck.length > 0) {
        res.status(400).json({ error: 'Já existe outro atendente com este código.' });
        return;
      }
    }

    await D1DatabaseClient.execute(
      `UPDATE attendants
       SET name = ?, code = ?, active = ?, updated_at = ?
       WHERE id = ?`,
      [newName, newCode, newActive, now, id]
    );

    res.json({
      id,
      name: newName,
      code: newCode,
      active: Boolean(newActive),
      createdAt: current.created_at,
      updatedAt: now,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar atendente no Cloudflare D1.' });
  }
});

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const rows = await D1DatabaseClient.query<AttendantRow>(
      'SELECT * FROM attendants WHERE id = ? LIMIT 1',
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Atendente não encontrado.' });
      return;
    }

    await D1DatabaseClient.execute('DELETE FROM attendants WHERE id = ?', [id]);
    res.json({ success: true, message: 'Atendente excluído com sucesso do Cloudflare D1.' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir atendente no Cloudflare D1.' });
  }
});

export default router;
