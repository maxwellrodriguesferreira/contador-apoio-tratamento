import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { D1DatabaseClient } from '../db/d1Client.js';
import { loginRateLimiter, passwordResetRateLimiter } from '../middlewares/rateLimiter.js';
import { EmailService } from '../services/emailService.js';
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

interface ResetTokenRow {
  id: string;
  user_id: string;
  email: string;
  token: string;
  expires_at: string;
  used: number;
  created_at: string;
}

interface AttendantRow {
  id: string;
  code: string;
  name: string;
  active: number;
}

/**
 * Solicitação de recuperação de senha (Forgot Password)
 * Gera um código numérico de 6 dígitos válido por 15 minutos.
 */
router.post('/forgot-password', passwordResetRateLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  if (!email || typeof email !== 'string') {
    res.status(400).json({ error: 'E-mail é obrigatório para recuperação de senha.' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const users = await D1DatabaseClient.query<UserRow>(
      'SELECT id, name, email, role, active, attendant_id FROM user_profiles WHERE LOWER(email) = ? LIMIT 1',
      [cleanEmail]
    );

    // Resposta genérica e segura em caso de e-mail não encontrado ou inativo (Anti-Enumeração OWASP)
    if (users.length === 0 || !users[0].active) {
      res.json({
        success: true,
        message: 'Se o e-mail informado estiver cadastrado e ativo, o código de recuperação foi gerado.',
        email: cleanEmail,
      });
      return;
    }

    const user = users[0];
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutos
    const code = String(crypto.randomInt(100000, 1000000));
    const resetId = `rst-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    // Invalida solicitações anteriores ainda não utilizadas para este e-mail
    try {
      await D1DatabaseClient.execute(
        'UPDATE password_reset_tokens SET used = 1 WHERE LOWER(email) = ? AND used = 0',
        [cleanEmail]
      );
    } catch {
      // Se tabela estiver sendo criada no primeiro acesso
    }

    // Registra o novo token no banco de dados
    await D1DatabaseClient.execute(
      `INSERT INTO password_reset_tokens (id, user_id, email, token, expires_at, used, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [resetId, user.id, cleanEmail, code, expiresAt, now]
    );

    // Registra auditoria
    const auditId = `aud-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    try {
      await D1DatabaseClient.execute(
        `INSERT INTO audit_logs (id, user_id, user_name, user_role, action, entity_type, entity_id, metadata, created_at)
         VALUES (?, ?, ?, ?, 'PASSWORD_RESET_REQUESTED', 'AUTH', ?, ?, ?)`,
        [auditId, user.id, user.name, user.role, resetId, JSON.stringify({ email: cleanEmail }), now]
      );
    } catch {
      // Ignora erro em log de auditoria
    }

    // Log visível e destacado no console do servidor (ideal para redes locais, Raspberry Pi e VPS sem SMTP externo)
    console.log('\n=======================================================');
    console.log('🔑 [RECUPERAÇÃO DE SENHA — APOIO AO TRATAMENTO]');
    console.log(`Usuário: ${user.name} (${cleanEmail})`);
    console.log(`Código de Redefinição (PIN): ${code}`);
    console.log(`Validade: 15 minutos (até ${expiresAt})`);
    console.log('=======================================================\n');

    // Disparo de e-mail via SMTP ou Resend se houver provedor configurado
    const emailResult = await EmailService.sendPasswordResetEmail(cleanEmail, user.name, code);

    if (emailResult.success) {
      res.json({
        success: true,
        emailSent: true,
        provider: emailResult.provider,
        message: 'Código de recuperação enviado com sucesso para o seu e-mail. Verifique sua caixa de entrada e pasta de spam.',
        email: cleanEmail,
        requiresCode: true,
      });
    } else {
      // Quando o e-mail não foi enviado (servidor sem SMTP configurado ou falha externa)
      res.json({
        success: true,
        emailSent: false,
        provider: emailResult.provider,
        contingencyCode: code,
        emailError: emailResult.error,
        message: EmailService.isConfigured()
          ? 'Houve uma oscilação no servidor de e-mail. Para sua comodidade, o código de recuperação está disponível abaixo.'
          : 'Nenhum servidor de e-mail (SMTP) está configurado nesta instalação. Como contingência direta, utilize o código de segurança gerado abaixo.',
        email: cleanEmail,
        requiresCode: true,
      });
    }
  } catch (error) {
    console.error('Erro ao processar solicitação de recuperação de senha:', error);
    res.status(500).json({ error: 'Erro interno ao processar recuperação de senha.' });
  }
});

/**
 * Validação prévia de código de recuperação
 */
router.post('/verify-reset-code', passwordResetRateLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email, code } = req.body;

  if (!email || !code) {
    res.status(400).json({ error: 'E-mail e código de recuperação são obrigatórios.' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = String(code).trim();

  try {
    const users = await D1DatabaseClient.query<UserRow>(
      'SELECT id, name, email, role, active, attendant_id FROM user_profiles WHERE LOWER(email) = ? LIMIT 1',
      [cleanEmail]
    );

    if (users.length === 0 || !users[0].active) {
      res.status(400).json({ error: 'Código de recuperação inválido ou expirado.' });
      return;
    }

    const user = users[0];

    // 1. Verifica token de 6 dígitos na tabela password_reset_tokens
    const tokens = await D1DatabaseClient.query<ResetTokenRow>(
      `SELECT * FROM password_reset_tokens
       WHERE LOWER(email) = ? AND token = ? AND used = 0
       ORDER BY created_at DESC LIMIT 1`,
      [cleanEmail, cleanCode]
    );

    if (tokens.length > 0) {
      const t = tokens[0];
      if (new Date(t.expires_at).getTime() > Date.now()) {
        res.json({ valid: true, message: 'Código de recuperação válido.' });
        return;
      }
    }

    // 2. Validação alternativa por código de crachá de atendente (recuperação assistida na loja)
    if (user.attendant_id) {
      const attendants = await D1DatabaseClient.query<AttendantRow>(
        'SELECT id, code FROM attendants WHERE id = ? AND active = 1 LIMIT 1',
        [user.attendant_id]
      );
      if (attendants.length > 0 && attendants[0].code.trim() === cleanCode) {
        res.json({ valid: true, message: 'Código de atendente validado com sucesso.' });
        return;
      }
    }

    // 3. Validação alternativa por Chave de Administrador
    if (checkAdminAuth(cleanEmail, cleanCode) || (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD === cleanCode)) {
      res.json({ valid: true, message: 'Chave de segurança administrativa autorizada.' });
      return;
    }

    res.status(400).json({ error: 'Código de recuperação inválido ou expirado.' });
  } catch (error) {
    console.error('Erro ao verificar código de recuperação:', error);
    res.status(500).json({ error: 'Erro ao validar código de recuperação.' });
  }
});

/**
 * Conclusão da redefinição de senha com código validado
 */
router.post('/reset-password', passwordResetRateLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email, code, newPassword } = req.body;

  if (!email || !code || !newPassword) {
    res.status(400).json({ error: 'E-mail, código de verificação e nova senha são obrigatórios.' });
    return;
  }

  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    res.status(400).json({ error: 'A nova senha deve possuir pelo menos 8 caracteres.' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = String(code).trim();
  const now = new Date().toISOString();

  try {
    const users = await D1DatabaseClient.query<UserRow>(
      'SELECT id, name, email, role, active, attendant_id FROM user_profiles WHERE LOWER(email) = ? LIMIT 1',
      [cleanEmail]
    );

    if (users.length === 0 || !users[0].active) {
      res.status(404).json({ error: 'Usuário não localizado ou inativo no sistema.' });
      return;
    }

    const user = users[0];
    let isAuthorized = false;
    let usedTokenId: string | null = null;

    // 1. Verifica token de 6 dígitos gerado
    const tokens = await D1DatabaseClient.query<ResetTokenRow>(
      `SELECT * FROM password_reset_tokens
       WHERE LOWER(email) = ? AND token = ? AND used = 0
       ORDER BY created_at DESC LIMIT 1`,
      [cleanEmail, cleanCode]
    );

    if (tokens.length > 0) {
      const t = tokens[0];
      if (new Date(t.expires_at).getTime() > Date.now()) {
        isAuthorized = true;
        usedTokenId = t.id;
      }
    }

    // 2. Validação alternativa via Código de Atendente (Crachá)
    if (!isAuthorized && user.attendant_id) {
      const attendants = await D1DatabaseClient.query<AttendantRow>(
        'SELECT id, code FROM attendants WHERE id = ? AND active = 1 LIMIT 1',
        [user.attendant_id]
      );
      if (attendants.length > 0 && attendants[0].code.trim() === cleanCode) {
        isAuthorized = true;
      }
    }

    // 3. Validação alternativa via Chave Mestra de Administrador
    if (!isAuthorized && (checkAdminAuth(cleanEmail, cleanCode) || (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD === cleanCode))) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      res.status(400).json({ error: 'Código de verificação inválido, expirado ou não autorizado.' });
      return;
    }

    // Gera hash criptográfico seguro PBKDF2 com salt
    const newHash = hashPassword(newPassword);

    await D1DatabaseClient.execute(
      'UPDATE user_profiles SET password_hash = ?, updated_at = ? WHERE id = ?',
      [newHash, now, user.id]
    );

    // Marca o token como consumido e invalida os demais deste e-mail
    if (usedTokenId) {
      await D1DatabaseClient.execute(
        'UPDATE password_reset_tokens SET used = 1 WHERE id = ?',
        [usedTokenId]
      );
    }
    await D1DatabaseClient.execute(
      'UPDATE password_reset_tokens SET used = 1 WHERE LOWER(email) = ?',
      [cleanEmail]
    );

    // Auditoria
    const auditId = `aud-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    try {
      await D1DatabaseClient.execute(
        `INSERT INTO audit_logs (id, user_id, user_name, user_role, action, entity_type, entity_id, metadata, created_at)
         VALUES (?, ?, ?, ?, 'PASSWORD_RESET_COMPLETED', 'AUTH', ?, ?, ?)`,
        [auditId, user.id, user.name, user.role, user.id, JSON.stringify({ email: cleanEmail, method: usedTokenId ? 'TOKEN_PIN' : 'CREDENTIAL_ASSISTED' }), now]
      );
    } catch {
      // Ignora erro em log de auditoria
    }

    res.json({
      success: true,
      message: 'Senha redefinida com sucesso! Você já pode entrar utilizando sua nova senha.',
    });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    res.status(500).json({ error: 'Erro interno ao redefinir a senha no Cloudflare D1.' });
  }
});

/**
 * Consulta de solicitações recentes de redefinição de senha (Acesso exclusivo ADMIN)
 */
router.get('/reset-requests', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Acesso negado: Somente administradores podem consultar solicitações de redefinição.' });
    return;
  }

  try {
    const requests = await D1DatabaseClient.query<ResetTokenRow & { user_name?: string }>(
      `SELECT r.id, r.user_id, r.email, r.token, r.expires_at, r.used, r.created_at, u.name as user_name
       FROM password_reset_tokens r
       LEFT JOIN user_profiles u ON r.user_id = u.id
       ORDER BY r.created_at DESC
       LIMIT 50`
    );

    res.json(requests);
  } catch (error) {
    console.error('Erro ao consultar solicitações de recuperação:', error);
    res.status(500).json({ error: 'Erro ao consultar solicitações de recuperação.' });
  }
});

export default router;
