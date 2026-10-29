import React from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
}) => {
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 py-3 px-3 sm:px-4 bg-surface-container-lowest border-t border-outline-variant/30 text-xs text-on-surface-variant">
      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3 text-center sm:text-left">
        <span>
          Mostrando <strong className="text-on-surface font-semibold">{startItem}</strong> a{' '}
          <strong className="text-on-surface font-semibold">{endItem}</strong> de{' '}
          <strong className="text-on-surface font-semibold">{totalItems}</strong>
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-outline">Por pág:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-7 px-2 bg-surface-container-low rounded border border-outline-variant/50 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-container disabled:opacity-30 disabled:pointer-events-none text-on-surface transition-colors"
          title="Primeira Página"
          aria-label="Primeira Página"
        >
          <span className="material-symbols-outlined text-[18px]">first_page</span>
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-container disabled:opacity-30 disabled:pointer-events-none text-on-surface transition-colors"
          title="Página Anterior"
          aria-label="Página Anterior"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_left</span>
        </button>

        <span className="px-3 py-1 bg-surface-container-low rounded-lg font-semibold text-xs text-on-surface whitespace-nowrap">
          {currentPage} / {Math.max(1, totalPages)}
        </span>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages || totalPages === 0}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-container disabled:opacity-30 disabled:pointer-events-none text-on-surface transition-colors"
          title="Próxima Página"
          aria-label="Próxima Página"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_right</span>
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages || totalPages === 0}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-container disabled:opacity-30 disabled:pointer-events-none text-on-surface transition-colors"
          title="Última Página"
          aria-label="Última Página"
        >
          <span className="material-symbols-outlined text-[18px]">last_page</span>
        </button>
      </div>
    </div>
  );
};
