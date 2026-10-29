import React from 'react';

interface BottomNavProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onOpenMenu: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentPath,
  onNavigate,
  onOpenMenu,
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Início', icon: 'dashboard' },
    { id: 'registrar-apoio', label: 'Apoio', icon: 'health_and_safety' },
    { id: 'registrar-rotina', label: 'Rotina', icon: 'assignment_turned_in' },
    { id: 'lancamentos', label: 'Lançamentos', icon: 'medication' },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface-container-lowest/95 backdrop-blur-xl border-t border-outline-variant/30 lg:hidden shadow-modal pb-[env(safe-area-inset-bottom)]"
      aria-label="Navegação inferior móvel"
    >
      <div className="flex items-center justify-around h-16 px-1 max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = currentPath === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl transition-all relative ${
                isActive
                  ? 'text-primary font-bold'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <span className="absolute -top-1 w-8 h-1 rounded-full bg-primary animate-in fade-in zoom-in-75 duration-200" />
              )}
              <span
                className={`material-symbols-outlined text-[22px] transition-transform ${
                  isActive ? 'scale-110' : ''
                }`}
              >
                {item.icon}
              </span>
              <span className="text-[10px] tracking-tight mt-0.5 leading-tight truncate max-w-full">
                {item.label}
              </span>
            </button>
          );
        })}

        {/* Botão para abrir o menu completo lateral */}
        <button
          onClick={onOpenMenu}
          className="flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl text-on-surface-variant hover:text-on-surface transition-colors"
          aria-label="Abrir menu completo com metas, relatórios e configurações"
        >
          <span className="material-symbols-outlined text-[22px]">menu</span>
          <span className="text-[10px] tracking-tight mt-0.5 leading-tight truncate">
            Mais
          </span>
        </button>
      </div>
    </nav>
  );
};
