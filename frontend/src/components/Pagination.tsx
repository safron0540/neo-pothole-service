import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';


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

  // Узкая колонка (очередь диспетчера): кнопки помельче и подпись короче, чтобы всё
  // стояло в одну строку и не вылезало за карточку
  const root = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 420));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

  const square = `${compact ? 'w-7 h-7' : 'w-8 h-8'} shrink-0 rounded-lg flex items-center justify-center text-sm cursor-pointer transition-colors select-none`;
  const idle = variant === 'footer' ? 'bg-white hover:bg-neutral-200' : 'bg-neutral-100 hover:bg-neutral-200';

  return (
    <div
      ref={root}
      className={`flex items-center select-none ${compact ? 'justify-center gap-4' : 'justify-between gap-2'} ${
        variant === 'footer' ? 'bg-neutral-100 px-5 py-2.5' : compact ? '' : 'pt-2'
      }`}
    >
      <div className="min-w-0 truncate text-sm text-neutral-600 whitespace-nowrap">
        {totalItems > 0 ? (
          <span>
            {compact ? '' : 'Показано '}
            {shown} из {totalItems.toLocaleString('ru-RU')}
            {itemLabel ? ` ${itemLabel}` : ''}
          </span>
        ) : (
          <span>Нет записей</span>
        )}
        {note && <span className="ml-2 text-neutral-500">• {note}</span>}
      </div>

      <div className={`flex shrink-0 items-center ${compact ? 'gap-0.5' : 'gap-1'}`}>
        <button
          type="button"
          aria-label="Предыдущая страница"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          className={`${square} ${idle} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <Icon name="pagination-prev" className="h-[9px] w-[6px]" />
        </button>

        {pages.map((p, idx) => {
          if (p === '...') {
            return (
              <span key={`dots-${idx}`} className="px-0.5 text-neutral-500">
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
          <Icon name="pagination-next" className="h-[9px] w-[6px]" />
        </button>
      </div>
    </div>
  );
};
