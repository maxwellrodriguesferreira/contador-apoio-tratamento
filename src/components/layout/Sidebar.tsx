import React from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPath,
  onNavigate,
  isOpenMobile,
  onCloseMobile,
}) => {
  const { user, isAdmin, logout } = useAuth();

  const adminNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'registrar-apoio', label: 'Registrar Apoio', icon: 'assignment_turned_in' },
    { id: 'lancamentos', label: 'Lançamentos', icon: 'medication' },
    { id: 'atendentes', label: 'Atendentes', icon: 'support_agent' },
    { id: 'metas', label: 'Metas', icon: 'track_changes' },
    { id: 'relatorios', label: 'Relatórios', icon: 'assessment' },
    { id: 'usuarios', label: 'Usuários', icon: 'badge' },
    { id: 'auditoria', label: 'Auditoria', icon: 'security' },
    { id: 'configuracoes', label: 'Configurações', icon: 'tune' },
  ];

  const attendantNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  ];

  const itemsToRender = isAdmin ? adminNavItems : attendantNavItems;

  const handleItemClick = (path: string) => {
    onNavigate(path);
    onCloseMobile();
  };

  return (
    <>
      {/* Backdrop para mobile */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-on-surface/40 backdrop-blur-sm lg:hidden animate-in fade-in"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-surface-container-lowest shadow-subtle z-50 flex flex-col justify-between transition-transform duration-300 border-r border-outline-variant/30 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo do Stitch */}
          <div className="h-16 flex items-center gap-3 px-5 bg-surface-container-lowest border-b border-outline-variant/20">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-on-primary shadow-sm">
              <span className="material-symbols-outlined text-[22px]">health_and_safety</span>
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-base text-primary leading-tight tracking-tight">
                Apoio Tratamento
              </span>
              <span className="text-[11px] text-on-surface-variant font-medium">Gestão & Clínica</span>
            </div>
          </div>

          {/* Status Cloudflare D1 */}
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-center justify-between p-2 bg-surface-container-low rounded-lg border border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[11px] font-bold text-tertiary-container uppercase tracking-wider">
                  Cloudflare D1
                </span>
              </div>
              <span className="text-[10px] text-outline font-medium">SQL Edge / Docker</span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <div className="px-3 py-1 text-[11px] font-bold text-outline uppercase tracking-wider">
              {isAdmin ? 'Administração Clínica' : 'Área do Atendente'}
            </div>
            <nav className="flex flex-col gap-1 mt-1">
              {itemsToRender.map((item) => {
                const isActive = currentPath === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item.id)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left w-full ${
                      isActive
                        ? 'bg-primary-container text-on-primary font-bold shadow-sm'
                        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="px-3 pt-6 pb-1 text-[11px] font-bold text-outline uppercase tracking-wider">
              Operação
            </div>
            <nav className="flex flex-col gap-1 mt-1">
              <button
                onClick={() => handleItemClick('perfil')}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left w-full ${
                  currentPath === 'perfil'
                    ? 'bg-primary-container text-on-primary font-bold shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">account_circle</span>
                <span>Meu Perfil</span>
              </button>
            </nav>
          </div>

          {/* User footer & Logout */}
          <div className="p-4 bg-surface-container-low border-t border-outline-variant/30 flex items-center justify-between">
            <div className="flex flex-col min-w-0 pr-2">
              <span className="text-xs font-bold text-on-surface truncate">{user?.name || 'Usuário'}</span>
              <span className="text-[11px] text-on-surface-variant truncate">
                {isAdmin ? 'Administrador Geral' : 'Atendente da Drogaria'}
              </span>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-rose-50 transition-colors"
              title="Sair da Sessão"
              aria-label="Sair da Sessão"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
