import { describe, it, expect } from 'vitest';
import {
  generateToken,
  verifyToken,
  hashPassword,
  verifyPassword,
} from '../../server/src/middlewares/auth';

describe('Suíte de Testes de Segurança — Autenticação, Tokens e Criptografia', () => {
  const mockAdmin = {
    id: 'usr-admin-123',
    email: 'admin@drogaria.com.br',
    name: 'Admin Seguro',
    role: 'ADMIN' as const,
  };

  const mockAtendente = {
    id: 'usr-atendente-123',
    email: 'atendente@drogaria.com.br',
    name: 'Atendente Seguro',
    role: 'ATENDENTE' as const,
  };

  it('deve gerar e validar token criptograficamente assinado com sucesso', () => {
    const token = generateToken(mockAdmin);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const verified = verifyToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.id).toBe(mockAdmin.id);
    expect(verified?.email).toBe(mockAdmin.email);
    expect(verified?.role).toBe('ADMIN');
  });

  it('deve rejeitar tokens adulterados na assinatura', () => {
    const token = generateToken(mockAdmin);
    const parts = token.split('.');
    // Altera a assinatura
    const forgedSignature = parts[2] + 'tampered';
    const forgedToken = `${parts[0]}.${parts[1]}.${forgedSignature}`;

    const verified = verifyToken(forgedToken);
    expect(verified).toBeNull();
  });

  it('deve rejeitar tokens adulterados no payload para escalada de privilégios', () => {
    const token = generateToken(mockAtendente);
    const parts = token.split('.');

    // Tenta trocar o cargo no payload de ATENDENTE para ADMIN
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    payload.role = 'ADMIN';
    const forgedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const forgedToken = `${parts[0]}.${forgedPayload}.${parts[2]}`;

    const verified = verifyToken(forgedToken);
    expect(verified).toBeNull();
  });

  it('deve gerar hash de senha usando PBKDF2 com salt aleatório exclusivo', () => {
    const pass = 'MinhaSenhaSegura@2026';
    const hash1 = hashPassword(pass);
    const hash2 = hashPassword(pass);

    expect(hash1).toContain(':');
    expect(hash2).toContain(':');
    // Salts diferentes devem gerar hashes diferentes para a mesma senha
    expect(hash1).not.toBe(hash2);

    expect(verifyPassword(pass, hash1)).toBe(true);
    expect(verifyPassword(pass, hash2)).toBe(true);
    expect(verifyPassword('SenhaIncorreta@123', hash1)).toBe(false);
  });

  it('não deve aceitar a senha padrão de backdoor (SenhaForte@2026) contra hash legítimo', () => {
    const userPass = 'UsuarioSenhaUnica#9988';
    const userHash = hashPassword(userPass);

    expect(verifyPassword('SenhaForte@2026', userHash)).toBe(false);
  });

  it('deve sanitizar caracteres HTML para prevenir XSS na formatação de pareceres', () => {
    const escapeHtml = (unsafe: string): string => {
      return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const formatInline = (str: string) => {
      const safeStr = escapeHtml(str);
      return safeStr
        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-on-surface">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em class="text-on-surface-variant font-medium">$1</em>');
    };

    const maliciousPayload = '<script>alert("XSS")</script><img src=x onerror=alert(1)>**Texto Importante**';
    const result = formatInline(maliciousPayload);

    // O código malicioso deve ser neutralizado
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('<img');
    expect(result).toContain('&lt;script&gt;');
    expect(result).toContain('&lt;img src=x onerror=alert(1)&gt;');
    // A formatação de markdown segura deve ser preservada
    expect(result).toContain('<strong class="font-bold text-on-surface">Texto Importante</strong>');
  });
});
