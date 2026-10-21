import { useState } from 'react';
import { Icon } from './Icon';

export function SearchBar({ value, onChange, placeholder = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <div className={`search-bar${focused ? ' focused' : ''}`}>
      <label className="search-field">
        <Icon name="search" size={17} strokeWidth={2.4} />
        <input
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
        />
        {value && (
          <button type="button" className="search-clear" aria-label="Clear" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange('')}>
            <Icon name="close" size={12} strokeWidth={3} />
          </button>
        )}
      </label>
      {(focused || value) && (
        <button
          type="button"
          className="search-cancel"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onChange(''); (document.activeElement as HTMLElement | null)?.blur(); }}
        >
          Cancel
        </button>
      )}
    </div>
  );
}
