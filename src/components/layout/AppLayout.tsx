import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { BottomNav } from './BottomNav';

interface AppLayoutProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentPath,
  onNavigate,
  children,
}) => {
  const [isOpenMobile, setIsOpenMobile] = useState(false);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background text-on-surface flex flex-col">
      <Sidebar
        currentPath={currentPath}
        onNavigate={onNavigate}
        isOpenMobile={isOpenMobile}
        onCloseMobile={() => setIsOpenMobile(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Header exclusivo para telas Desktop (oculto em dispositivos móveis/celulares) */}
        <div className="hidden lg:block">
          <Header />
        </div>

        <main className="flex-1 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:pt-4 lg:pt-20 px-3 sm:px-6 lg:px-8 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8 max-w-7xl w-full mx-auto">
          {children}
        </main>

        <footer className="mt-auto py-4 px-4 sm:px-6 lg:px-8 border-t border-outline-variant/20 bg-surface-container-lowest/60 backdrop-blur-sm hidden lg:block">
          <div className="max-w-7xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-on-surface-variant">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-primary">Apoio ao Tratamento</span>
              <span className="text-outline">•</span>
              <span className="text-[11px] text-outline">Gestão Clínica Farmacêutica</span>
            </div>
            <div className="text-[11px] text-center sm:text-right text-on-surface-variant">
              Aplicação desenvolvida pelo Desenvolvedor de Software e Farmacêutico:{' '}
              <span className="font-semibold text-on-surface">Maxwell Rodrigues Ferreira</span>{' '}
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium text-[10px] ml-1">
                CRF-SP: 86426
              </span>
            </div>
          </div>
        </footer>

        {/* Navegação Inferior Móvel (estilo App Nativo para celular) */}
        <BottomNav
          currentPath={currentPath}
          onNavigate={onNavigate}
          onOpenMenu={() => setIsOpenMobile(true)}
        />
      </div>
    </div>
  );
};

