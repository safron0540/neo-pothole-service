import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
  note?: string;
  // 'plain' — на белой карточке, 'footer' — серая полоса внизу таблицы
  variant?: 'plain' | 'footer';
}

// Макет: «Показано 4 из 18», кнопки 32×32 с радиусом 8, активная — #C42915
export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  itemLabel = '',
  note,
  variant = 'plain',
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const getPageNumbers = () => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (currentPage <= 3) return [1, 2, 3, '...', totalPages];
    if (currentPage >= totalPages - 2) return [1, '...', totalPages - 2, totalPages - 1, totalPages];
    return [1, '...', currentPage, '...', totalPages];
  };

  const pages = getPageNumbers();
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);
  const shown = Math.max(0, endItem - startItem + 1);

  const square = 'w-8 h-8 rounded-lg flex items-center justify-center text-sm cursor-pointer transition-colors select-none';
  const idle = variant === 'footer' ? 'bg-white hover:bg-neutral-200' : 'bg-neutral-100 hover:bg-neutral-200';

  return (
    <div
      className={`flex items-center justify-between select-none ${
        variant === 'footer' ? 'bg-neutral-100 px-5 py-2.5' : 'pt-2'
      }`}
    >
      <div className="text-xs font-light text-neutral-700 whitespace-nowrap">
        {totalItems > 0 ? (
          <span>
            Показано {shown} из {totalItems}
            {itemLabel ? ` ${itemLabel}` : ''}
          </span>
        ) : (
          <span>Нет записей</span>
        )}
        {note && <span className="ml-2 text-neutral-500">• {note}</span>}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Предыдущая страница"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          className={`${square} ${idle} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {pages.map((p, idx) => {
          if (p === '...') {
            return (
              <span key={`dots-${idx}`} className="px-1 text-neutral-500">
                ...
              </span>
            );
          }
          const pageNum = p as number;
          const isActive = currentPage === pageNum;
          return (
            <button
              key={pageNum}
              type="button"
              onClick={() => onPageChange(pageNum)}
              className={`${square} ${isActive ? 'bg-red-700 text-white' : `${idle} text-neutral-700`}`}
            >
              {pageNum}
            </button>
          );
        })}

        <button
          type="button"
          aria-label="Следующая страница"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className={`${square} ${idle} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
