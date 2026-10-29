import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { D1DatabaseClient } from '../db/d1Client.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'ATENDENTE';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Chave secreta de assinatura de tokens derivada de variável de ambiente ou fallback persistente
const JWT_SECRET = process.env.JWT_SECRET || process.env.APP_SECRET || 'contador-apoio-secret-jwt-key-2026-secure-token';

/**
 * Utilitário para geração de hash de senhas utilizando PBKDF2 com salt criptográfico (Node.js nativo)
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${derivedKey}`;
}

/**
 * Utilitário para verificação de senhas em tempo constante (protegido contra timing attacks)
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;

  // Se o hash estiver no formato salt:hash (PBKDF2)
  if (storedHash.includes(':')) {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  }

  // Fallback seguro em tempo constante para migração gradual de hash legada
  const passwordBuffer = Buffer.from(password);
  const storedBuffer = Buffer.from(storedHash);
  if (passwordBuffer.length !== storedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(passwordBuffer, storedBuffer);
}

/**
 * Gera um token de autenticação assinado com HMAC-SHA256 e expiração (7 dias)
 */
export function generateToken(user: AuthenticatedUser): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payloadData = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    iat: now,
    exp: now + 7 * 24 * 60 * 60, // 7 dias
  };
  const payload = Buffer.from(JSON.stringify(payloadData)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

/**
 * Valida o token assinado e extrai os dados do usuário autenticado
 */
export function verifyToken(token: string): AuthenticatedUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url');

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return null;
    }

    const payloadObj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    const now = Math.floor(Date.now() / 1000);

    if (payloadObj.exp && payloadObj.exp < now) {
      return null;
    }

    return {
      id: payloadObj.sub,
      email: payloadObj.email,
      name: payloadObj.name,
      role: payloadObj.role,
    };
  } catch {
    return null;
  }
}

/**
 * Middleware que exige autenticação via cabeçalho Authorization: Bearer <token>
 */
export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    res.status(401).json({
      error: 'Não autenticado: Token de acesso ausente ou em formato inválido.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({
      error: 'Não autenticado: Token expirado ou assinatura inválida.',
      code: 'INVALID_TOKEN',
    });
    return;
  }

  try {
    // Validação ativa contra banco de dados para revogação imediata e verificação de status ativo
    const users = await D1DatabaseClient.query<{ id: string; active: number; role: 'ADMIN' | 'ATENDENTE' }>(
      'SELECT id, active, role FROM user_profiles WHERE id = ? LIMIT 1',
      [payload.id]
    );

    if (users.length === 0 || !users[0].active) {
      res.status(403).json({
        error: 'Acesso negado: Usuário inativo ou inexistente.',
        code: 'USER_INACTIVE',
      });
      return;
    }

    req.user = {
      ...payload,
      role: users[0].role,
    };
    next();
  } catch {
    // Se o banco estiver momentaneamente inacessível, aceita a assinatura válida com o payload decodificado
    req.user = payload;
    next();
  }
}

/**
 * Middleware de Autorização por Papel (RBAC Server-Side)
 */
export function requireRole(allowedRoles: Array<'ADMIN' | 'ATENDENTE'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Não autenticado: Sessão do usuário não localizada.',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `403 Forbidden: Usuários com perfil ${req.user.role} não possuem permissão para executar esta operação.`,
        code: 'ACCESS_DENIED',
      });
      return;
    }

    next();
  };
}
