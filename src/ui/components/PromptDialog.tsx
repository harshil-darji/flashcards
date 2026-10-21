import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** iOS alert with a single text field. */
export function PromptDialog({ open, title, message, initialValue = '', placeholder, confirmLabel = 'Save', validate, onSubmit, onCancel }: {
  open: boolean;
  title: string;
  message?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** Return an error message to block submit. */
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open, initialValue]);

  if (!open) return null;
  const trimmed = value.trim();
  const error = trimmed ? validate?.(trimmed) ?? null : null;
  const submit = () => { if (trimmed && !error) onSubmit(trimmed); };

  return createPortal(
    <div className="alert-root">
      <div className="alert-backdrop" />
      <form className="alert" role="alertdialog" aria-modal="true" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="alert-content">
          <div className="alert-title">{title}</div>
          {message && <div className="alert-message">{message}</div>}
          <input
            ref={inputRef}
            className="alert-input"
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            autoCapitalize="words"
            enterKeyHint="done"
          />
          {error && <div className="alert-error">{error}</div>}
        </div>
        <div className="alert-buttons">
          <button type="button" className="alert-button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="alert-button bold" disabled={!trimmed || !!error}>{confirmLabel}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
