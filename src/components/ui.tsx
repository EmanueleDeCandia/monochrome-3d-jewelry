import React from 'react';
import { cn } from '../utils/cn';

/* ------------------------------------------------------------------ *
 * Small monochrome control primitives shared by every panel
 * ------------------------------------------------------------------ */

export const SectionTitle: React.FC<{
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  right?: React.ReactNode;
}> = ({ icon, title, hint, right }) => (
  <div className="flex items-start justify-between gap-2 mb-2">
    <div className="flex items-start gap-2 min-w-0">
      {icon ? <span className="text-white mt-[1px] shrink-0">{icon}</span> : null}
      <div className="min-w-0">
        <div className="text-[10px] font-mono-cad uppercase tracking-[0.18em] text-zinc-200 truncate">
          {title}
        </div>
        {hint ? (
          <div className="text-[9px] font-mono-cad text-zinc-500 leading-snug">{hint}</div>
        ) : null}
      </div>
    </div>
    {right}
  </div>
);

export const Panel: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <section
    className={cn(
      'bg-black/75 border border-white/12 backdrop-blur-xl p-3 space-y-2.5',
      className
    )}
  >
    {children}
  </section>
);

export const SegmentedControl = <T extends string>({
  options,
  value,
  onChange,
  columns = 2,
  size = 'md',
}: {
  options: { id: T; label: string; hint?: string }[];
  value: T;
  onChange: (id: T) => void;
  columns?: 1 | 2 | 3 | 4 | 5;
  size?: 'sm' | 'md';
}) => (
  <div
    className={cn(
      'grid gap-[3px]',
      columns === 1 && 'grid-cols-1',
      columns === 2 && 'grid-cols-2',
      columns === 3 && 'grid-cols-3',
      columns === 4 && 'grid-cols-4',
      columns === 5 && 'grid-cols-5'
    )}
  >
    {options.map((option) => {
      const active = option.id === value;
      return (
        <button
          key={option.id}
          type="button"
          title={option.hint}
          onClick={() => onChange(option.id)}
          className={cn(
            'border transition-colors text-center leading-tight',
            size === 'sm' ? 'px-1.5 py-1.5 text-[9px]' : 'px-2 py-2 text-[10px]',
            'font-mono-cad uppercase tracking-wide',
            active
              ? 'bg-white text-black border-white font-semibold'
              : 'bg-zinc-950/80 text-zinc-400 border-white/12 hover:border-white/45 hover:text-white'
          )}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

export const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  /** values are pushed on every input event; use this for expensive rebuilds */
  onCommit?: (value: number) => void;
}> = ({ label, value, min, max, step, onChange, format, onCommit }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-[10px] font-mono-cad">
      <span className="text-zinc-400 uppercase tracking-wide">{label}</span>
      <span className="text-white font-semibold">{format ? format(value) : value.toFixed(2)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(parseFloat(event.target.value))}
      onPointerUp={() => onCommit?.(value)}
      onKeyUp={() => onCommit?.(value)}
      className="w-full h-1 appearance-none bg-zinc-800 accent-white cursor-pointer
                 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white
                 [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-black"
    />
  </div>
);

export const ToggleRow: React.FC<{
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, hint, checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={cn(
      'w-full flex items-center justify-between gap-2 px-2 py-1.5 border transition-colors text-left',
      checked
        ? 'bg-white/10 border-white/40 text-white'
        : 'bg-zinc-950/70 border-white/12 text-zinc-500 hover:border-white/30'
    )}
  >
    <span className="min-w-0">
      <span className="block text-[10px] font-mono-cad uppercase tracking-wide truncate">
        {label}
      </span>
      {hint ? (
        <span className="block text-[9px] font-mono-cad text-zinc-500 truncate">{hint}</span>
      ) : null}
    </span>
    <span
      className={cn(
        'shrink-0 text-[9px] font-mono-cad px-1.5 py-0.5 border',
        checked ? 'bg-white text-black border-white' : 'bg-black text-zinc-500 border-white/20'
      )}
    >
      {checked ? 'ON' : 'OFF'}
    </span>
  </button>
);

export const Toolbar: React.FC<{
  label: string;
  title?: string;
  onClick: () => void;
  active?: boolean;
  icon?: React.ReactNode;
  variant?: 'default' | 'primary';
  className?: string;
}> = ({ label, title, onClick, active, icon, variant = 'default', className }) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    className={cn(
      'flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono-cad uppercase tracking-wide border transition-all',
      variant === 'primary'
        ? 'bg-white text-black border-white hover:bg-zinc-200 font-semibold'
        : active
        ? 'bg-white text-black border-white font-semibold'
        : 'bg-zinc-950/80 text-zinc-300 border-white/20 hover:border-white/60 hover:text-white',
      className
    )}
  >
    {icon}
    <span className="hidden sm:inline">{label}</span>
  </button>
);
