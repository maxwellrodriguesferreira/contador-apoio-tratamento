import { Router, Request, Response } from 'express';
import { D1DatabaseClient } from '../db/d1Client.js';
import { loginRateLimiter } from '../middlewares/rateLimiter.js';
import {
  authenticateToken,
  generateToken,
  hashPassword,
  verifyPassword,
} from '../middlewares/auth.js';

const router = Router();

interface UserRow {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  password_hash: string | null;
  role: 'ADMIN' | 'ATENDENTE';
  active: number;
  attendant_id: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

// Verificação de credenciais de Administrador via variáveis de ambiente legítimas
function checkAdminAuth(email: string, pass: string): boolean {
  const cleanEmail = email.trim().toLowerCase();
  const allowedEmails = [
    process.env.ADMIN_EMAIL,
    process.env.APP_ADMIN_MAIL,
    process.env.DEFAULT_ADMIN_EMAIL,
  ]
    .filter(Boolean)
    .map((e) => e!.trim().toLowerCase());

  const allowedPasswords = [
    process.env.ADMIN_PASSWORD,
    process.env.APP_ADMIN_PASS,
    process.env.DEFAULT_ADMIN_PASSWORD,
  ].filter(Boolean);

  if (allowedEmails.length === 0 || allowedPasswords.length === 0) {
    return false;
  }

  return allowedEmails.includes(cleanEmail) && allowedPasswords.includes(pass);
}

// Verificação de credenciais de Atendente via variáveis de ambiente legítimas
function checkAtendenteAuth(email: string, pass: string): boolean {
  const cleanEmail = email.trim().toLowerCase();
  const allowedEmails = [
    process.env.ATENDENTE_EMAIL,
    process.env.DEFAULT_ATENDENTE_EMAIL,
  ]
    .filter(Boolean)
    .map((e) => e!.trim().toLowerCase());

  const allowedPasswords = [
    process.env.ATENDENTE_PASSWORD,
    process.env.DEFAULT_ATENDENTE_PASSWORD,
  ].filter(Boolean);

  if (allowedEmails.length === 0 || allowedPasswords.length === 0) {
    return false;
  }

  return allowedEmails.includes(cleanEmail) && allowedPasswords.includes(pass);
}

router.post('/login', loginRateLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || typeof email !== 'string') {
    res.status(400).json({ error: 'E-mail é obrigatório.' });
    return;
  }

  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: 'Senha é obrigatória.' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();

  // Validação contra credenciais de ambiente (se provisionadas com segurança)
  const isValidAdminEnv = checkAdminAuth(cleanEmail, password);
  const isValidAtendenteEnv = checkAtendenteAuth(cleanEmail, password);

  try {
    let users = await D1DatabaseClient.query<UserRow>(
      'SELECT * FROM user_profiles WHERE LOWER(email) = ? LIMIT 1',
      [cleanEmail]
    );

    // Se usuário não existe no banco mas bate com a credencial explícita de ambiente, provisiona com hash seguro
    if (users.length === 0 && (isValidAdminEnv || isValidAtendenteEnv)) {
      const now = new Date().toISOString();
      const role = isValidAdminEnv ? 'ADMIN' : 'ATENDENTE';
      const name = isValidAdminEnv ? 'Administrador do Sistema' : 'Atendente Operacional';
      const id = `usr-env-${Date.now()}`;
      const secureHash = hashPassword(password);

      await D1DatabaseClient.execute(
        `INSERT INTO user_profiles (id, auth_user_id, name, email, password_hash, role, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [id, `env-${role.toLowerCase()}`, name, cleanEmail, secureHash, role, now, now]
      );

      users = await D1DatabaseClient.query<UserRow>(
        'SELECT * FROM user_profiles WHERE LOWER(email) = ? LIMIT 1',
        [cleanEmail]
      );
    }

    if (users.length === 0) {
      res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      return;
    }

    const user = users[0];

    // Validação estrita de senha criptográfica:
    // 1. Credencial explícita de ambiente
    // 2. Hash criptográfico no banco com PBKDF2/scrypt
    let isPasswordValid = false;

    if (isValidAdminEnv || isValidAtendenteEnv) {
      isPasswordValid = true;
    } else if (user.password_hash) {
      isPasswordValid = verifyPassword(password, user.password_hash);

      // Migração e upgrade seguro transparente para PBKDF2 com salt se o hash legado for verificado
      if (isPasswordValid && !user.password_hash.includes(':')) {
        const upgradedHash = hashPassword(password);
        await D1DatabaseClient.execute(
          'UPDATE user_profiles SET password_hash = ? WHERE id = ?',
          [upgradedHash, user.id]
        );
      }
    }

    if (!isPasswordValid) {
      res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      return;
    }

    if (!user.active) {
      res.status(403).json({ error: 'Usuário desativado. Entre em contato com o administrador.' });
      return;
    }

    const now = new Date().toISOString();
    await D1DatabaseClient.execute(
      'UPDATE user_profiles SET last_login_at = ?, updated_at = ? WHERE id = ?',
      [now, now, user.id]
    );

    // Emissão de Token de Sessão Assinado (HMAC-SHA256)
    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    res.json({
      user: {
        id: user.id,
        authUserId: user.auth_user_id || undefined,
        name: user.name,
        email: user.email,
        role: user.role,
        active: Boolean(user.active),
        attendantId: user.attendant_id || undefined,
        lastLoginAt: now,
        createdAt: user.created_at,
        updatedAt: now,
      },
      token,
      message: 'Autenticado com sucesso via Cloudflare D1.',
    });
  } catch (error) {
    console.error('Erro na autenticação Cloudflare D1:', error);
    res.status(500).json({ error: 'Erro interno ao realizar autenticação no banco Cloudflare D1.' });
  }
});

router.get('/me', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Sessão não identificada.' });
    return;
  }

  try {
    const users = await D1DatabaseClient.query<UserRow>(
      'SELECT * FROM user_profiles WHERE id = ? LIMIT 1',
      [req.user.id]
    );

    if (!users || users.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }

    const user = users[0];
    res.json({
      id: user.id,
      authUserId: user.auth_user_id || undefined,
      name: user.name,
      email: user.email,
      role: user.role,
      active: Boolean(user.active),
      attendantId: user.attendant_id || undefined,
      lastLoginAt: user.last_login_at || undefined,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao consultar perfil no Cloudflare D1.' });
  }
});

export default router;
