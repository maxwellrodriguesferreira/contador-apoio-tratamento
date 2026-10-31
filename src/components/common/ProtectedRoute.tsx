import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types';
import { LoadingState } from './States';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  fallbackPath?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
}) => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingState message="Validando credenciais de acesso seguro..." />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null; // O roteador direcionará para o /login
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-100 flex items-center justify-center text-error mb-4">
          <span className="material-symbols-outlined text-[36px]">gpp_bad</span>
        </div>
        <h2 className="text-2xl font-bold text-on-surface mb-2">403 — Acesso Restrito</h2>
        <p className="text-sm text-on-surface-variant max-w-md mb-6">
          Seu perfil ({user.role}) não possui permissão para acessar esta área administrativa. Esta tentativa foi registrada na auditoria de segurança.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};

export const RoleGuard: React.FC<{
  roles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}> = ({ roles, children, fallback = null }) => {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
};
