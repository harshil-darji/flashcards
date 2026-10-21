import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function ListRow({ title, subtitle, detail, chevron, onClick, leading, accessory, indent = 0, tint, destructive, multiline }: {
  title: ReactNode;
  subtitle?: ReactNode;
  detail?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  leading?: ReactNode;
  accessory?: ReactNode;
  indent?: number;
  tint?: boolean;
  destructive?: boolean;
  multiline?: boolean;
}) {
  const cls = `list-row${onClick ? ' tappable' : ''}${tint ? ' tint' : ''}${destructive ? ' destructive' : ''}${multiline ? ' multiline' : ''}`;
  const content = (
    <>
      {leading && <span className="list-row-leading">{leading}</span>}
      <span className="list-row-main">
        <span className="list-row-title">{title}</span>
        {subtitle && <span className="list-row-subtitle">{subtitle}</span>}
      </span>
      {detail !== undefined && <span className="list-row-detail">{detail}</span>}
      {accessory}
      {chevron && <span className="list-row-chevron"><Icon name="chevron-right" size={16} strokeWidth={2.6} /></span>}
    </>
  );
  const style = indent ? { paddingLeft: 16 + indent * 18 } : undefined;
  return onClick ? (
    <button type="button" className={cls} style={style} onClick={onClick}>{content}</button>
  ) : (
    <div className={cls} style={style}>{content}</div>
  );
}
