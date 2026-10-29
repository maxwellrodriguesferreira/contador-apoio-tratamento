import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

interface HeaderProps {
  onToggleMobileMenu: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileMenu }) => {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-surface-container-lowest/95 backdrop-blur-xl shadow-subtle z-30 flex items-center justify-between px-4 lg:px-8 border-b border-outline-variant/30">
      <div className="flex items-center gap-3">
        {/* Botão Mobile Hamburger */}
        <button
          onClick={onToggleMobileMenu}
          className="w-10 h-10 rounded-lg text-on-surface-variant hover:bg-surface-container flex items-center justify-center lg:hidden transition-colors"
          aria-label="Abrir menu lateral"
        >
          <span className="material-symbols-outlined text-[24px]">menu</span>
        </button>

        <div className="flex items-center gap-2 px-2.5 sm:px-3 py-1 rounded-lg bg-surface-container text-on-surface text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
          <span className="font-semibold text-primary truncate">Apoio Farmacêutico</span>
          <span className="text-outline hidden sm:inline">• D1 &amp; Gemini AI</span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 lg:gap-5">
        {/* Toggle Dark Mode */}
        <button
          onClick={toggleTheme}
          className="w-10 h-10 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface flex items-center justify-center transition-colors"
          title={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
          aria-label="Alternar tema"
        >
          <span className="material-symbols-outlined text-[20px]">
            {theme === 'dark' ? 'light_mode' : 'dark_mode'}
          </span>
        </button>

        <div className="h-6 w-[1px] bg-outline-variant/50 hidden sm:block"></div>

        {/* Avatar e Usuário */}
        <div className="flex items-center gap-2.5">
          <div className="flex flex-col text-right hidden sm:flex">
            <span className="text-xs font-bold text-on-surface leading-tight">{user?.name || 'Usuário'}</span>
            <span className="text-[10px] text-primary font-bold tracking-wider uppercase">
              {user?.role || 'CONVIDADO'}
            </span>
          </div>
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold text-xs shadow-sm">
            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
        </div>
      </div>
    </header>
  );
};
