import type { ReactNode } from 'react';

export function FilledButton({ children, onClick, disabled, variant = 'filled' }: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'filled' | 'tinted' | 'destructive';
}) {
  return (
    <button type="button" className={`filled-button ${variant}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
