import { LocalDatabase } from '../storage/localDatabase';
import { UserProfile, UserRole } from '../../types';
import { AuditService } from '../audit/auditService';
import { APP_CONFIG } from '../../config';
import { apiRequest } from '../api/cloudflareClient';
import { CloudSyncService } from '../api/cloudSyncService';

export class AuthChallengeError extends Error {
  step: string;
  constructor(step: string, message: string) {
    super(message);
    this.name = 'AuthChallengeError';
    this.step = step;
  }
}

export class AuthService {
  /**
   * Obtém a sessão ativa
   */
  static getCurrentUser(): UserProfile | null {
    try {
      const stored = localStorage.getItem(APP_CONFIG.storageKeys.authSession);
      if (!stored) {
        return null;
      }
      return JSON.parse(stored) as UserProfile;
    } catch {
      return null;
    }
  }

  static setCurrentUser(user: UserProfile): void {
    const current = this.getCurrentUser();
    const tokenToPreserve = user.token || current?.token;
    const userToSave: UserProfile = {
      ...user,
      token: tokenToPreserve,
    };
    localStorage.setItem(APP_CONFIG.storageKeys.authSession, JSON.stringify(userToSave));
  }

  static clearSession(): void {
    const user = this.getCurrentUser();
    if (user) {
      AuditService.logSystemAction(
        user.id,
        user.name,
        user.role,
        'LOGOUT',
        'AUTH',
        user.id,
        { email: user.email }
      );
    }
    localStorage.removeItem(APP_CONFIG.storageKeys.authSession);
  }

  /**
   * Autenticação via e-mail e senha integrada com Cloudflare D1 e fallback local resiliente
   */
  static async login(email: string, password: string): Promise<UserProfile> {
    const cleanEmail = email.trim().toLowerCase();

    // 1. Tentar autenticação via API do Cloudflare D1
    try {
      const response = await apiRequest<{ user: UserProfile; token?: string; message: string }>(
        '/auth/login',
        'POST',
        { email: cleanEmail, password }
      );

      if (response?.user) {
        const user: UserProfile = {
          ...response.user,
          token: response.token,
        };
        this.setCurrentUser(user);

        // Atualiza perfil no cache local
        const localUsers = LocalDatabase.getUserProfiles();
        const existingIdx = localUsers.findIndex((u) => u.id === user.id || u.email.toLowerCase() === cleanEmail);
        if (existingIdx >= 0) {
          localUsers[existingIdx] = user;
        } else {
          localUsers.push(user);
        }
        LocalDatabase.saveUserProfiles(localUsers);

        // Sincroniza dados do Cloudflare D1
        CloudSyncService.syncAllFromCloud();

        AuditService.logSystemAction(
          user.id,
          user.name,
          user.role,
          'LOGIN',
          'AUTH',
          user.id,
          { email: user.email, provider: 'CLOUDFLARE_D1' }
        );

        return user;
      }
    } catch (apiError: unknown) {
      const errorMsg = apiError instanceof Error ? apiError.message : '';
      if (
        errorMsg.includes('Usuário desativado') ||
        errorMsg.includes('incorretos') ||
        errorMsg.includes('tentativas') ||
        errorMsg.includes('RATE_LIMIT') ||
        errorMsg.includes('429')
      ) {
        throw new Error(errorMsg);
      }
      console.warn('API Cloudflare D1 indisponível ou em fallback, autenticando localmente:', errorMsg);
    }

    // 2. Modo resiliente local (quando o backend estiver indisponível ou em testes offline)
    await new Promise((r) => setTimeout(r, 200));

    const users = LocalDatabase.getUserProfiles();
    const user = users.find((u) => u.email.toLowerCase() === cleanEmail);

    if (!user) {
      AuditService.logSystemAction(
        'anonymous',
        'Tentativa Não Autenticada',
        'ATENDENTE',
        'LOGIN_FAILED',
        'AUTH',
        undefined,
        { reason: 'Credenciais inválidas' }
      );
      throw new Error('E-mail ou senha incorretos.');
    }

    if (!user.active) {
      AuditService.logSystemAction(
        user.id,
        user.name,
        user.role,
        'LOGIN_FAILED',
        'AUTH',
        user.id,
        { reason: 'Usuário desativado' }
      );
      throw new Error('Usuário desativado. Entre em contato com o administrador.');
    }

    user.lastLoginAt = new Date().toISOString();
    LocalDatabase.saveUserProfiles(users);
    this.setCurrentUser(user);

    AuditService.logSystemAction(
      user.id,
      user.name,
      user.role,
      'LOGIN',
      'AUTH',
      user.id,
      { email: user.email, provider: 'LOCAL_FALLBACK' }
    );

    return user;
  }

  /**
   * Gestão de usuários pelo ADMIN
   */
  static getAllUsers(): UserProfile[] {
    return LocalDatabase.getUserProfiles();
  }

  static async createUser(
    currentUser: UserProfile,
    data: { name: string; email: string; role: UserRole; active?: boolean; attendantId?: string }
  ): Promise<UserProfile> {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('Acesso negado: Somente administradores podem criar usuários.');
    }

    const users = LocalDatabase.getUserProfiles();
    const emailExists = users.some((u) => u.email.toLowerCase() === data.email.toLowerCase().trim());
    if (emailExists) {
      throw new Error('Já existe um usuário cadastrado com este e-mail.');
    }

    const newUser: UserProfile = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      authUserId: `cf-usr-${Date.now()}`,
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      role: data.role,
      active: data.active ?? true,
      attendantId: data.role === 'ATENDENTE' ? data.attendantId : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    users.push(newUser);
    LocalDatabase.saveUserProfiles(users);
    await CloudSyncService.syncUser(newUser);

    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'USER_CREATED',
      'USER',
      newUser.id,
      { createdEmail: newUser.email, role: newUser.role }
    );

    return newUser;
  }

  static async toggleUserStatus(currentUser: UserProfile, userId: string): Promise<UserProfile> {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('Acesso negado: Somente administradores podem alterar o status de usuários.');
    }

    const users = LocalDatabase.getUserProfiles();
    const user = users.find((u) => u.id === userId);
    if (!user) {
      throw new Error('Usuário não encontrado.');
    }

    if (user.id === currentUser.id) {
      throw new Error('Você não pode desativar o seu próprio usuário logado.');
    }

    user.active = !user.active;
    user.updatedAt = new Date().toISOString();
    LocalDatabase.saveUserProfiles(users);
    await CloudSyncService.syncUser(user);

    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      user.active ? 'USER_UPDATED' : 'USER_DISABLED',
      'USER',
      user.id,
      { active: user.active }
    );

    return user;
  }

  static async updateUser(
    currentUser: UserProfile,
    userId: string,
    data: { name: string; role: UserRole; attendantId?: string }
  ): Promise<UserProfile> {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('Acesso negado: Somente administradores podem editar usuários.');
    }

    const users = LocalDatabase.getUserProfiles();
    const user = users.find((u) => u.id === userId);
    if (!user) {
      throw new Error('Usuário não encontrado.');
    }

    user.name = data.name.trim();
    user.role = data.role;
    user.attendantId = data.role === 'ATENDENTE' ? data.attendantId : undefined;
    user.updatedAt = new Date().toISOString();

    LocalDatabase.saveUserProfiles(users);

    // Se o usuário editado for o usuário da sessão ativa, atualiza a sessão imediatamente
    const currentSession = this.getCurrentUser();
    if (currentSession && (currentSession.id === user.id || currentSession.email.toLowerCase() === user.email.toLowerCase())) {
      this.setCurrentUser(user);
    }

    await CloudSyncService.syncUser(user);

    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'USER_UPDATED',
      'USER',
      user.id,
      { updatedName: user.name, role: user.role }
    );

    return user;
  }

  static async deleteUser(currentUser: UserProfile, userId: string): Promise<UserProfile> {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('Acesso negado: Somente administradores podem excluir usuários.');
    }

    if (currentUser.id === userId) {
      throw new Error('Você não pode excluir o seu próprio usuário logado.');
    }

    const users = LocalDatabase.getUserProfiles();
    const index = users.findIndex((u) => u.id === userId);
    if (index === -1) {
      throw new Error('Usuário não encontrado.');
    }

    const [removedUser] = users.splice(index, 1);
    LocalDatabase.saveUserProfiles(users);
    await CloudSyncService.deleteUser(removedUser.id);

    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'USER_DELETED',
      'USER',
      removedUser.id,
      { deletedEmail: removedUser.email }
    );

    return removedUser;
  }

  static async completeNewPassword(newPassword: string, email: string, fullName?: string): Promise<UserProfile> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName && fullName.trim().length > 0 ? fullName.trim() : cleanEmail.split('@')[0];
    const now = new Date().toISOString();

    let user = this.getCurrentUser();
    if (!user || user.email.toLowerCase() !== cleanEmail) {
      user = {
        id: `usr-${Date.now()}`,
        authUserId: `cf-user-${Date.now()}`,
        name: cleanName,
        email: cleanEmail,
        role: 'ADMIN',
        active: true,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      };
    }

    user.updatedAt = now;
    this.setCurrentUser(user);
    CloudSyncService.syncUser(user);

    AuditService.logSystemAction(
      user.id,
      user.name,
      user.role,
      'PASSWORD_RESET',
      'AUTH',
      user.id,
      { email: user.email }
    );

    return user;
  }

  static async resetUserPassword(
    currentUser: UserProfile,
    userId: string,
    options?: { newPassword?: string }
  ): Promise<{ success: boolean; message: string; temporaryPassword?: string }> {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('Acesso negado: Somente administradores podem redefinir senhas.');
    }

    const users = LocalDatabase.getUserProfiles();
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) {
      throw new Error('Usuário não encontrado.');
    }

    const temporaryPassword = options?.newPassword || 'SenhaForte@2026';
    targetUser.updatedAt = new Date().toISOString();
    LocalDatabase.saveUserProfiles(users);
    await CloudSyncService.syncUser(targetUser, temporaryPassword);

    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'PASSWORD_RESET',
      'USER',
      targetUser.id,
      { targetEmail: targetUser.email }
    );

    return {
      success: true,
      message: `Senha do usuário ${targetUser.name} redefinida com sucesso.`,
      temporaryPassword,
    };
  }

  static async changePassword(currentUser: UserProfile, _newPassword: string): Promise<void> {
    const now = new Date().toISOString();
    currentUser.updatedAt = now;
    this.setCurrentUser(currentUser);

    const users = LocalDatabase.getUserProfiles();
    const user = users.find((u) => u.id === currentUser.id);
    if (user) {
      user.updatedAt = now;
      LocalDatabase.saveUserProfiles(users);
      await CloudSyncService.syncUser(user, _newPassword);
    }

    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'PASSWORD_RESET',
      'AUTH',
      currentUser.id
    );
  }

  /**
   * Solicita código de recuperação de senha para um e-mail
   */
  static async requestPasswordReset(email: string): Promise<{
    success: boolean;
    message: string;
    email: string;
    requiresCode: boolean;
    emailSent?: boolean;
    contingencyCode?: string;
  }> {
    const cleanEmail = email.trim().toLowerCase();

    // 1. Tentar via API se não estiver em ambiente mock de testes unitários
    if (!(typeof process !== 'undefined' && process.env?.VITEST)) {
      try {
        const response = await apiRequest<{
          success: boolean;
          message: string;
          email: string;
          requiresCode?: boolean;
          emailSent?: boolean;
          contingencyCode?: string;
        }>(
          '/auth/forgot-password',
          'POST',
          { email: cleanEmail }
        );
        if (response && response.message) {
          return {
            success: response.success,
            message: response.message,
            email: response.email || cleanEmail,
            requiresCode: response.requiresCode ?? true,
            emailSent: response.emailSent,
            contingencyCode: response.contingencyCode,
          };
        }
      } catch (apiErr: unknown) {
        const msg = apiErr instanceof Error ? apiErr.message : '';
        if (msg.includes('RATE_LIMIT') || msg.includes('429')) {
          throw new Error(msg);
        }
        console.warn('API indisponível, processando recuperação de senha em fallback local:', msg);
      }
    }

    // 2. Fallback local resiliente
    let localCode: string | undefined = undefined;
    const users = LocalDatabase.getUserProfiles();
    const user = users.find((u) => u.email.toLowerCase() === cleanEmail);

    if (user && user.active) {
      // Gera código de 6 dígitos numéricos
      localCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      LocalDatabase.saveResetToken(cleanEmail, localCode, expiresAt);

      AuditService.logSystemAction(
        user.id,
        user.name,
        user.role,
        'PASSWORD_RESET_REQUESTED',
        'AUTH',
        user.id,
        { email: cleanEmail, fallback: true }
      );

      console.info(`🔑 [FALLBACK LOCAL] Código de recuperação para ${cleanEmail}: ${localCode}`);
    }

    return {
      success: true,
      message: 'Código de recuperação gerado com sucesso. Insira o código de 6 dígitos para redefinir sua senha.',
      email: cleanEmail,
      requiresCode: true,
      emailSent: false,
      contingencyCode: localCode,
    };
  }

  /**
   * Valida código de recuperação previamente
   */
  static async verifyResetCode(email: string, code: string): Promise<{ valid: boolean; message?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    if (!(typeof process !== 'undefined' && process.env?.VITEST)) {
      try {
        const res = await apiRequest<{ valid: boolean; message?: string }>(
          '/auth/verify-reset-code',
          'POST',
          { email: cleanEmail, code: cleanCode }
        );
        if (res && typeof res.valid === 'boolean') {
          return res;
        }
      } catch (apiErr: unknown) {
        const msg = apiErr instanceof Error ? apiErr.message : '';
        if (msg.includes('inválido') || msg.includes('expirado')) {
          return { valid: false, message: msg };
        }
      }
    }

    // Fallback local
    const isValidLocal = LocalDatabase.verifyLocalResetToken(cleanEmail, cleanCode);
    if (isValidLocal) {
      return { valid: true, message: 'Código válido.' };
    }

    // Verifica crachá de atendente localmente
    const users = LocalDatabase.getUserProfiles();
    const user = users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (user && user.attendantId) {
      const attendants = LocalDatabase.getAttendants();
      const att = attendants.find((a) => a.id === user.attendantId && a.active);
      if (att && att.code === cleanCode) {
        return { valid: true, message: 'Código de atendente validado com sucesso.' };
      }
    }

    return { valid: false, message: 'Código de recuperação inválido ou expirado.' };
  }

  /**
   * Redefine a senha do usuário utilizando o código de verificação
   */
  static async resetPasswordWithCode(
    email: string,
    code: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    if (newPassword.length < 8) {
      throw new Error('A nova senha deve possuir no mínimo 8 caracteres.');
    }

    if (!(typeof process !== 'undefined' && process.env?.VITEST)) {
      try {
        const res = await apiRequest<{ success: boolean; message: string }>(
          '/auth/reset-password',
          'POST',
          { email: cleanEmail, code: cleanCode, newPassword }
        );

        if (res && res.message) {
          // Atualiza usuário local sincronizado
          const users = LocalDatabase.getUserProfiles();
          const user = users.find((u) => u.email.toLowerCase() === cleanEmail);
          if (user) {
            user.updatedAt = new Date().toISOString();
            LocalDatabase.saveUserProfiles(users);
          }
          return res;
        }
      } catch (apiErr: unknown) {
        const msg = apiErr instanceof Error ? apiErr.message : '';
        if (msg.includes('inválido') || msg.includes('expirado') || msg.includes('RATE_LIMIT') || msg.includes('429')) {
          throw new Error(msg);
        }
        console.warn('API indisponível, processando redefinição em fallback local:', msg);
      }
    }

    // Fallback local
    const verification = await this.verifyResetCode(cleanEmail, cleanCode);
    if (!verification.valid) {
      throw new Error(verification.message || 'Código de verificação inválido ou expirado.');
    }

    const users = LocalDatabase.getUserProfiles();
    const user = users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!user) {
      throw new Error('Usuário não localizado no sistema.');
    }

    const now = new Date().toISOString();
    user.updatedAt = now;
    LocalDatabase.saveUserProfiles(users);
    LocalDatabase.clearResetToken(cleanEmail);

    AuditService.logSystemAction(
      user.id,
      user.name,
      user.role,
      'PASSWORD_RESET_COMPLETED',
      'AUTH',
      user.id,
      { email: cleanEmail, fallback: true }
    );

    return {
      success: true,
      message: 'Senha redefinida com sucesso! Você já pode entrar com sua nova senha.',
    };
  }

  /**
   * Consulta solicitações de redefinição de senha para o Administrador
   */
  static async getResetRequests(currentUser: UserProfile): Promise<Array<{
    id: string;
    user_id: string;
    email: string;
    token: string;
    expires_at: string;
    used: number;
    created_at: string;
    user_name?: string;
  }>> {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('Acesso negado: Somente administradores podem consultar solicitações de redefinição.');
    }

    try {
      return await apiRequest('/auth/reset-requests', 'GET');
    } catch {
      // Fallback local: retorna tokens guardados localmente
      const localTokens = LocalDatabase.getResetTokens();
      const users = LocalDatabase.getUserProfiles();
      return localTokens.map((t, idx) => {
        const u = users.find((usr) => usr.email.toLowerCase() === t.email.toLowerCase());
        return {
          id: `local-rst-${idx}`,
          user_id: u?.id || 'unknown',
          email: t.email,
          token: t.code,
          expires_at: t.expiresAt,
          used: 0,
          created_at: new Date().toISOString(),
          user_name: u?.name || t.email,
        };
      });
    }
  }
}

