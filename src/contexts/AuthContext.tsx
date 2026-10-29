import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { AuthService } from '../services/auth/authService';
import { CloudSyncService } from '../services/api/cloudSyncService';
import { LocalDatabase } from '../services/storage/localDatabase';
import { useToast } from './ToastContext';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAttendant: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  completeNewPassword: (newPassword: string, email: string, fullName?: string) => Promise<UserProfile>;
  logout: () => void;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { showToast } = useToast();

  const syncCurrentSession = () => {
    const current = AuthService.getCurrentUser();
    if (current) {
      const users = LocalDatabase.getUserProfiles();
      const updated = users.find(
        (u) => u.id === current.id || u.email.toLowerCase() === current.email.toLowerCase()
      );
      if (updated) {
        const mergedUser: UserProfile = {
          ...updated,
          token: current.token,
        };
        AuthService.setCurrentUser(mergedUser);
        setUser(mergedUser);
        return;
      }
    }
    setUser(current);
  };

  useEffect(() => {
    try {
      syncCurrentSession();
    } catch (e) {
      console.error('Erro ao inicializar sessão de autenticação:', e);
    } finally {
      setIsLoading(false);
    }

    const unsubscribe = CloudSyncService.subscribe(syncCurrentSession);
    return unsubscribe;
  }, []);

  const login = async (email: string, password: string): Promise<UserProfile> => {
    setIsLoading(true);
    try {
      const loggedUser = await AuthService.login(email, password);
      setUser(loggedUser);
      showToast(`Bem-vindo, ${loggedUser.name}!`, 'success', 'Login Concluído');
      return loggedUser;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao autenticar.';
      showToast(msg, 'error', 'Falha no Acesso');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const completeNewPassword = async (newPassword: string, email: string, fullName?: string): Promise<UserProfile> => {
    setIsLoading(true);
    try {
      const loggedUser = await AuthService.completeNewPassword(newPassword, email, fullName);
      setUser(loggedUser);
      showToast(`Senha atualizada com sucesso. Bem-vindo, ${loggedUser.name}!`, 'success', 'Acesso Concluído');
      return loggedUser;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao redefinir nova senha.';
      showToast(msg, 'error', 'Falha ao Definir Senha');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    AuthService.clearSession();
    setUser(null);
    showToast('Sessão encerrada com sucesso.', 'info');
  };

  const refreshUser = () => {
    syncCurrentSession();
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user && user.active,
    isAdmin: !!user && user.role === 'ADMIN',
    isAttendant: !!user && user.role === 'ATENDENTE',
    isLoading,
    login,
    completeNewPassword,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
