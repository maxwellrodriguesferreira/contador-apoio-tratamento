import { Router, Request, Response } from 'express';
import { D1DatabaseClient } from '../db/d1Client.js';

const router = Router();

interface UserRow {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  role: 'ADMIN' | 'ATENDENTE';
  active: number;
  attendant_id: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapUserRow(row: UserRow) {
  return {
    id: row.id,
    authUserId: row.auth_user_id || undefined,
    name: row.name,
    email: row.email,
    role: row.role,
    active: Boolean(row.active),
    attendantId: row.attendant_id || undefined,
    lastLoginAt: row.last_login_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await D1DatabaseClient.query<UserRow>(
      'SELECT * FROM user_profiles ORDER BY name ASC'
    );
    res.json(rows.map(mapUserRow));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar usuários no Cloudflare D1.' });
  }
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { name, email, role, active = true, attendantId } = req.body;

  if (!name || !email || !role) {
    res.status(400).json({ error: 'Nome, e-mail e cargo são obrigatórios.' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  const now = new Date().toISOString();
  const id = req.body.id || `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const authUserId = req.body.authUserId || `cf-user-${Date.now()}`;

  try {
    const existing = await D1DatabaseClient.query<UserRow>(
      'SELECT id FROM user_profiles WHERE LOWER(email) = ? OR id = ? LIMIT 1',
      [cleanEmail, id]
    );

    if (existing.length > 0) {
      const existingId = existing[0].id;
      await D1DatabaseClient.execute(
        `UPDATE user_profiles
         SET name = ?, role = ?, active = ?, attendant_id = ?, updated_at = ?
         WHERE id = ?`,
        [name.trim(), role, active ? 1 : 0, attendantId || null, now, existingId]
      );

      res.status(200).json({
        id: existingId,
        authUserId,
        name: name.trim(),
        email: cleanEmail,
        role,
        active,
        attendantId: attendantId || undefined,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    await D1DatabaseClient.execute(
      `INSERT INTO user_profiles (id, auth_user_id, name, email, role, active, attendant_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, authUserId, name.trim(), cleanEmail, role, active ? 1 : 0, attendantId || null, now, now]
    );

    res.status(201).json({
      id,
      authUserId,
      name: name.trim(),
      email: cleanEmail,
      role,
      active,
      attendantId: attendantId || undefined,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao cadastrar usuário no Cloudflare D1.' });
  }
});

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const { name, role, active, attendantId } = req.body;
  const now = new Date().toISOString();

  try {
    const users = await D1DatabaseClient.query<UserRow>(
      'SELECT * FROM user_profiles WHERE id = ? OR LOWER(email) = ? LIMIT 1',
      [id, id.toLowerCase()]
    );

    if (users.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }

    const current = users[0];
    const targetId = current.id;
    const newName = name !== undefined ? name.trim() : current.name;
    const newRole = role !== undefined ? role : current.role;
    const newActive = active !== undefined ? (active ? 1 : 0) : current.active;
    const newAttendantId = attendantId !== undefined ? (newRole === 'ATENDENTE' ? attendantId : null) : current.attendant_id;

    await D1DatabaseClient.execute(
      `UPDATE user_profiles
       SET name = ?, role = ?, active = ?, attendant_id = ?, updated_at = ?
       WHERE id = ?`,
      [newName, newRole, newActive, newAttendantId, now, targetId]
    );

    res.json({
      id: targetId,
      authUserId: current.auth_user_id || undefined,
      name: newName,
      email: current.email,
      role: newRole,
      active: Boolean(newActive),
      attendantId: newAttendantId || undefined,
      lastLoginAt: current.last_login_at || undefined,
      createdAt: current.created_at,
      updatedAt: now,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar usuário no Cloudflare D1.' });
  }
});

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);

  try {
    const users = await D1DatabaseClient.query<UserRow>(
      'SELECT * FROM user_profiles WHERE id = ? OR LOWER(email) = ? LIMIT 1',
      [id, id.toLowerCase()]
    );

    if (users.length === 0) {
      // Idempotente: se já não existe no banco, considera excluído com sucesso
      res.json({ success: true, message: 'Usuário já não consta no banco de dados.' });
      return;
    }

    const targetId = users[0].id;
    await D1DatabaseClient.execute('DELETE FROM user_profiles WHERE id = ?', [targetId]);
    res.json({ success: true, message: 'Usuário excluído com sucesso do Cloudflare D1.' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir usuário no Cloudflare D1.' });
  }
});

export default router;
