import React from 'react';

interface FourDotsIconProps {
  className?: string;
}

/**
 * Icona a quattro puntini disposti ai vertici di un quadrato
 * (sostituisce menu hamburger a tre linee o menu a tre puntini).
 */
export const FourDotsIcon: React.FC<FourDotsIconProps> = ({ className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <circle cx="7" cy="7" r="2.2" />
    <circle cx="17" cy="7" r="2.2" />
    <circle cx="7" cy="17" r="2.2" />
    <circle cx="17" cy="17" r="2.2" />
  </svg>
);
