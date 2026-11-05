import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Attendant } from '../../types';

interface AttendantSelectorProps {
  label?: string;
  value: string; // attendantId
  onChange: (attendantId: string) => void;
  attendants: Attendant[];
  required?: boolean;
  disabled?: boolean;
  error?: string;
  helperText?: string;
  placeholder?: string;
  id?: string;
  allowClear?: boolean;
  clearLabel?: string;
}

export const AttendantSelector: React.FC<AttendantSelectorProps> = ({
  label = 'Atendente Farmacêutico',
  value,
  onChange,
  attendants,
  required = false,
  disabled = false,
  error,
  helperText,
  placeholder = 'Selecione o atendente...',
  id,
  allowClear = false,
  clearLabel = 'Todos os Atendentes',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedAttendant = useMemo(() => {
    return attendants.find((a) => a.id === value);
  }, [attendants, value]);

  // Ordenação numérica por código em ordem crescente + filtro de busca
  const sortedAndFiltered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return [...attendants]
      .filter((a) => {
        if (!term) return true;
        return (
          a.name.toLowerCase().includes(term) ||
          a.code.toLowerCase().includes(term)
        );
      })
      .sort((a, b) =>
        String(a.code || '').localeCompare(String(b.code || ''), undefined, { numeric: true, sensitivity: 'base' })
      );
  }, [attendants, search]);

  // Foco automático no input de busca ao abrir
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearch('');
    }
  }, [isOpen]);

  // Fecha ao clicar fora ou ao pressionar Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (attendantId: string) => {
    onChange(attendantId);
    setIsOpen(false);
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : 'attendant-selector');

  return (
    <div className="flex flex-col gap-1.5 w-full relative" ref={containerRef}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant flex items-center justify-between"
        >
          <span>
            {label}
            {required && <span className="text-error ml-1">*</span>}
          </span>
          <span className="text-[10px] text-outline normal-case font-normal">
            Ordem por código crescente
          </span>
        </label>
      )}

      {/* Botão Principal de Seleção */}
      <button
        type="button"
        id={inputId}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full min-h-[48px] px-3.5 py-2 rounded-xl bg-surface-container-lowest border transition-all text-left flex items-center justify-between gap-3 shadow-sm ${
          disabled
            ? 'opacity-60 bg-surface-container-low cursor-not-allowed border-outline-variant/40'
            : error
            ? 'border-error focus:ring-2 focus:ring-error/20 hover:border-error'
            : isOpen
            ? 'border-primary ring-2 ring-primary/20 shadow-md'
            : 'border-outline-variant hover:border-primary/60 hover:bg-surface-container-lowest/90'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {selectedAttendant ? (
            <>
              {/* Avatar do Atendente */}
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0 shadow-sm border border-primary/20">
                {getInitials(selectedAttendant.name)}
              </div>

              {/* Informações: Código e Nome */}
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary text-on-primary font-mono font-bold text-[11px] leading-none shrink-0 shadow-xs">
                    Cód. {selectedAttendant.code}
                  </span>
                  <span className="font-bold text-sm text-on-surface truncate">
                    {selectedAttendant.name}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="w-8 h-8 rounded-lg bg-surface-container text-outline flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">support_agent</span>
              </div>
              <span className="text-sm text-outline truncate">{placeholder}</span>
            </>
          )}
        </div>

        {/* Ícone Indicador de Ação */}
        <div className="flex items-center gap-1 shrink-0 text-outline">
          {allowClear && value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  onChange('');
                }
              }}
              className="p-1 rounded-md hover:bg-surface-container text-outline hover:text-error transition-colors mr-0.5 cursor-pointer"
              title="Limpar seleção"
              aria-label="Limpar seleção"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </span>
          )}
          <span
            className={`material-symbols-outlined text-[20px] transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-primary' : ''
            }`}
          >
            expand_more
          </span>
        </div>
      </button>

      {error && <span className="text-xs font-medium text-error flex items-center gap-1">{error}</span>}
      {helperText && !error && <span className="text-xs text-on-surface-variant">{helperText}</span>}

      {/* ---------------------------------------------------------------------- */}
      {/* Menu / Dropdown / Modal Bottom-Sheet de Atendentes                     */}
      {/* ---------------------------------------------------------------------- */}
      {isOpen && (
        <>
          {/* Backdrop para mobile */}
          <div
            className="fixed inset-0 z-40 bg-on-surface/40 backdrop-blur-xs sm:hidden animate-in fade-in duration-150"
            onClick={() => setIsOpen(false)}
          />

          <div
            className={`fixed sm:absolute bottom-0 sm:bottom-auto left-0 sm:left-0 right-0 sm:right-0 sm:top-full sm:mt-1.5 z-50 bg-surface-container-lowest rounded-t-2xl sm:rounded-xl shadow-2xl sm:shadow-modal border border-outline-variant/40 flex flex-col max-h-[82dvh] sm:max-h-80 overflow-hidden animate-in sm:zoom-in-95 duration-150 pb-[env(safe-area-inset-bottom,0px)] sm:pb-0`}
            role="listbox"
          >
            {/* Barra de Arraste no mobile */}
            <div className="sm:hidden w-10 h-1 rounded-full bg-outline-variant/60 mx-auto mt-2.5 mb-1" />

            {/* Cabeçalho do Dropdown */}
            <div className="p-3 border-b border-outline-variant/30 bg-surface-container-low/40 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary">groups</span>
                  <span className="text-xs font-bold text-on-surface">Selecione o Atendente</span>
                </div>
                <span className="text-[10px] text-outline font-semibold">
                  {sortedAndFiltered.length} de {attendants.length} atendente(s)
                </span>
              </div>

              {/* Campo de Busca Rápida */}
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-2.5 text-outline text-[16px] pointer-events-none">
                  search
                </span>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filtrar por nome ou número do código..."
                  className="w-full h-9 pl-8 pr-8 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-xs text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 placeholder:text-outline"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 text-outline hover:text-on-surface p-1 rounded"
                    aria-label="Limpar busca"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                )}
              </div>
            </div>

            {/* Lista com Rolagem dos Atendentes (Sempre em Ordem Crescente de Código) */}
            <div className="overflow-y-auto flex-1 divide-y divide-outline-variant/15 p-1 max-h-60 sm:max-h-56">
              {allowClear && (
                <button
                  type="button"
                  onClick={() => handleSelect('')}
                  className={`w-full px-3 py-2.5 rounded-lg flex items-center justify-between gap-3 text-left transition-colors mb-1 ${
                    !value
                      ? 'bg-primary/10 text-primary font-bold shadow-xs'
                      : 'hover:bg-surface-container-low text-on-surface'
                  }`}
                  role="option"
                  aria-selected={!value}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-7 h-7 rounded-md bg-surface-container flex items-center justify-center text-primary font-bold shrink-0">
                      <span className="material-symbols-outlined text-[18px]">groups</span>
                    </div>
                    <span className="text-xs font-semibold">{clearLabel}</span>
                  </div>
                  {!value && (
                    <span className="material-symbols-outlined text-primary text-[18px] shrink-0">
                      check_circle
                    </span>
                  )}
                </button>
              )}

              {sortedAndFiltered.length === 0 ? (
                <div className="py-8 text-center text-outline flex flex-col items-center justify-center gap-1">
                  <span className="material-symbols-outlined text-[24px]">person_search</span>
                  <span className="text-xs font-semibold">Nenhum atendente encontrado</span>
                  <span className="text-[11px]">Tente buscar por outro código ou nome</span>
                </div>
              ) : (
                sortedAndFiltered.map((attendant) => {
                  const isSelected = attendant.id === value;
                  return (
                    <button
                      key={attendant.id}
                      type="button"
                      onClick={() => handleSelect(attendant.id)}
                      className={`w-full px-3 py-2.5 rounded-lg flex items-center justify-between gap-3 text-left transition-colors ${
                        isSelected
                          ? 'bg-primary/10 text-primary font-bold shadow-xs'
                          : 'hover:bg-surface-container-low text-on-surface'
                      }`}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {/* Avatar */}
                        <div
                          className={`w-7 h-7 rounded-md flex items-center justify-center font-bold text-[11px] shrink-0 ${
                            isSelected
                              ? 'bg-primary text-on-primary'
                              : 'bg-surface-container text-on-surface-variant'
                          }`}
                        >
                          {getInitials(attendant.name)}
                        </div>

                        {/* Código em Destaque e Nome */}
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span
                            className={`px-1.5 py-0.5 rounded font-mono text-[11px] font-bold shrink-0 ${
                              isSelected
                                ? 'bg-primary text-on-primary'
                                : 'bg-surface-container text-primary'
                            }`}
                          >
                            Cód. {attendant.code}
                          </span>
                          <span className="text-xs truncate">{attendant.name}</span>
                          {attendant.active === false && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-high text-outline font-normal shrink-0">
                              Inativo
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Checkmark no Selecionado */}
                      {isSelected ? (
                        <span className="material-symbols-outlined text-primary text-[18px] shrink-0">
                          check_circle
                        </span>
                      ) : (
                        <span className="material-symbols-outlined text-outline/40 text-[18px] shrink-0 opacity-0 group-hover:opacity-100">
                          radio_button_unchecked
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Rodapé do Menu com Botão Fechar em Mobile */}
            <div className="sm:hidden p-2.5 border-t border-outline-variant/20 bg-surface-container-low/40">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-full py-2.5 rounded-xl bg-surface-container text-xs font-bold text-on-surface hover:bg-surface-container-high transition-colors"
              >
                Concluir Seleção
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
