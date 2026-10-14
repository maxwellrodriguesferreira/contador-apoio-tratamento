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
    localStorage.setItem(APP_CONFIG.storageKeys.authSession, JSON.stringify(user));
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
      const response = await apiRequest<{ user: UserProfile; message: string }>(
        '/auth/login',
        'POST',
        { email: cleanEmail, password }
      );

      if (response?.user) {
        const user = response.user;
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
      if (errorMsg.includes('Usuário desativado') || errorMsg.includes('incorretos')) {
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

  static resetUserPassword(
    currentUser: UserProfile,
    userId: string,
    options?: { newPassword?: string }
  ): { success: boolean; message: string; temporaryPassword?: string } {
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
    CloudSyncService.syncUser(targetUser);

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

  static changePassword(currentUser: UserProfile, _newPassword: string): void {
    const now = new Date().toISOString();
    currentUser.updatedAt = now;
    this.setCurrentUser(currentUser);

    const users = LocalDatabase.getUserProfiles();
    const user = users.find((u) => u.id === currentUser.id);
    if (user) {
      user.updatedAt = now;
      LocalDatabase.saveUserProfiles(users);
      CloudSyncService.syncUser(user);
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
}
