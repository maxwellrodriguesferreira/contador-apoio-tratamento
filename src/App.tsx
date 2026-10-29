import React, { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { LoginPage } from './pages/Login/LoginPage';
import { DashboardPage } from './pages/Dashboard/DashboardPage';
import { RegistrarApoioPage } from './pages/RegistrarApoio/RegistrarApoioPage';
import { RegistrarRotinaPage } from './pages/RegistrarRotina/RegistrarRotinaPage';
import { LancamentosPage } from './pages/Lancamentos/LancamentosPage';
import { AtendentesPage } from './pages/Atendentes/AtendentesPage';
import { MetasPage } from './pages/Metas/MetasPage';
import { RelatoriosPage } from './pages/Relatorios/RelatoriosPage';
import { UsuariosPage } from './pages/Usuarios/UsuariosPage';
import { AuditoriaPage } from './pages/Auditoria/AuditoriaPage';
import { ConfiguracoesPage } from './pages/Configuracoes/ConfiguracoesPage';
import { PerfilPage } from './pages/Perfil/PerfilPage';
import { CloudSyncService } from './services/api/cloudSyncService';

export const App: React.FC = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const [currentPath, setCurrentPath] = useState<string>('dashboard');

  // Sincroniza dados com o banco Cloudflare D1 quando o usuário estiver autenticado
  useEffect(() => {
    if (isAuthenticated) {
      CloudSyncService.syncAllFromCloud();
    }
  }, [isAuthenticated]);

  // Sincroniza rota com o hash da URL se desejado
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#/', '').replace('#', '');
      if (hash) {
        setCurrentPath(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
    window.location.hash = `#/${path}`;
  };

  // Se não estiver autenticado, exibe tela de login pública
  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={() => handleNavigate('dashboard')} />;
  }

  // Se for ATENDENTE tentando acessar rota administrativa, redireciona suavemente para o Dashboard
  const adminOnlyRoutes = [
    'registrar-apoio',
    'registrar-rotina',
    'lancamentos',
    'atendentes',
    'metas',
    'relatorios',
    'usuarios',
    'auditoria',
    'configuracoes',
  ];

  if (!isAdmin && adminOnlyRoutes.includes(currentPath)) {
    return (
      <AppLayout currentPath={currentPath} onNavigate={handleNavigate}>
        <ProtectedRoute allowedRoles={['ADMIN']}>
          <div>Acesso negado</div>
        </ProtectedRoute>
      </AppLayout>
    );
  }

  return (
    <AppLayout currentPath={currentPath} onNavigate={handleNavigate}>
      {currentPath === 'dashboard' && <DashboardPage onNavigate={handleNavigate} />}
      {currentPath === 'registrar-apoio' && (
        <ProtectedRoute allowedRoles={['ADMIN']}>
          <RegistrarApoioPage onNavigate={handleNavigate} />
        </ProtectedRoute>
      )}
      {currentPath === 'registrar-rotina' && (
        <ProtectedRoute allowedRoles={['ADMIN']}>
          <RegistrarRotinaPage onNavigate={handleNavigate} />
        </ProtectedRoute>
      )}
      {currentPath === 'lancamentos' && (
        <ProtectedRoute allowedRoles={['ADMIN']}>
          <LancamentosPage />
        </ProtectedRoute>
      )}
      {currentPath === 'atendentes' && (
        <ProtectedRoute allowedRoles={['ADMIN']}>
          <AtendentesPage />
        </ProtectedRoute>
      )}
      {currentPath === 'metas' && (
        <ProtectedRoute allowedRoles={['ADMIN']}>
          <MetasPage />
        </ProtectedRoute>
      )}
      {currentPath === 'relatorios' && (
        <ProtectedRoute allowedRoles={['ADMIN']}>
          <RelatoriosPage />
        </ProtectedRoute>
      )}
      {currentPath === 'usuarios' && (
        <ProtectedRoute allowedRoles={['ADMIN']}>
          <UsuariosPage />
        </ProtectedRoute>
      )}
      {currentPath === 'auditoria' && (
        <ProtectedRoute allowedRoles={['ADMIN']}>
          <AuditoriaPage />
        </ProtectedRoute>
      )}
      {currentPath === 'configuracoes' && (
        <ProtectedRoute allowedRoles={['ADMIN']}>
          <ConfiguracoesPage />
        </ProtectedRoute>
      )}
      {currentPath === 'perfil' && <PerfilPage />}
    </AppLayout>
  );
};
