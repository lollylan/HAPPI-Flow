import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

/**
 * Kleines UI-Set. Bewusst kein Fremdpaket: die Anwendung braucht eine
 * Handvoll Bausteine, und jede Abhaengigkeit muss bei einer lokal
 * betriebenen Praxisanwendung mitgepflegt werden.
 */

const FIELD =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ' +
  'focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60 ' +
  'dark:border-slate-700 dark:bg-slate-950';

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  secondary:
    'border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'hover:bg-slate-100 dark:hover:bg-slate-800',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${BUTTON_STYLES[variant]} ${className}`}
    />
  );
}

export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${FIELD} ${props.className ?? ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${FIELD} ${props.className ?? ''}`} />;
}

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 dark:border-slate-600"
      />
      {label}
    </label>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {children}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
      {children}
    </p>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  // Escape schliesst - sonst ist der Dialog auf einem Praxis-PC ohne Maus
  // am Empfang schwer wieder loszuwerden.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div
        className={`w-full rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 ${
          wide ? 'max-w-4xl' : 'max-w-2xl'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <h2 className="font-semibold">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Schließen" className="px-2">
            <X className="size-4" />
          </Button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}
