import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** Nav-bar text or icon button with a 44pt hit target. */
export function BarButton({ onClick, icon, children, label, bold, disabled, destructive }: {
  onClick: () => void;
  icon?: IconName;
  children?: ReactNode;
  label?: string;
  bold?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      className={`bar-button${bold ? ' bold' : ''}${destructive ? ' destructive' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      {icon && <Icon name={icon} size={icon === 'chevron-left' ? 22 : 24} strokeWidth={icon === 'chevron-left' ? 2.6 : 2} />}
      {children && <span>{children}</span>}
    </button>
  );
}
