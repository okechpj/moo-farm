import React from 'react';
import { getInitials } from '../lib/formatters';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'md' | 'lg';
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'lg',
  loading = false,
  className = '',
  disabled,
  children,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1b6b3a] disabled:opacity-50 disabled:cursor-not-allowed';

  const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary: 'bg-[#1b6b3a] text-white hover:bg-[#15562e] active:bg-[#114525]',
    secondary: 'bg-[#e6f2ea] text-[#14532d] hover:bg-[#d4eadb]',
    outline: 'border-2 border-slate-200 bg-white text-slate-800 hover:bg-slate-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-slate-700 hover:bg-slate-100',
  };

  const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
    md: 'min-h-[44px] px-4 py-2 text-sm',
    lg: 'min-h-[50px] px-5 py-3 text-base',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs ${className}`}>
      {children}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Input({ label, hint, error, id, className = '', ...props }: InputProps) {
  const inputId = id ?? label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-semibold text-slate-800">
        {label}
      </label>
      <input
        id={inputId}
        className={`w-full min-h-[48px] rounded-xl border-2 bg-white px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#1b6b3a] focus:outline-none ${
          error ? 'border-red-400' : 'border-slate-200'
        } ${className}`}
        {...props}
      />
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

interface BadgeProps {
  children: React.ReactNode;
  tone?: 'green' | 'amber' | 'red' | 'slate' | 'blue';
}

export function Badge({ children, tone = 'slate' }: BadgeProps) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    red: 'bg-red-50 text-red-800 border-red-200',
    blue: 'bg-sky-50 text-sky-800 border-sky-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

interface InitialsAvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'green' | 'amber' | 'slate';
}

/**
 * Reusable initials placeholder used for both cow profiles and team member avatars.
 */
export function InitialsAvatar({ name, size = 'md', tone = 'green' }: InitialsAvatarProps) {
  const sizes = {
    sm: 'h-9 w-9 text-xs',
    md: 'h-11 w-11 text-sm',
    lg: 'h-16 w-16 text-xl',
  };
  const tones = {
    green: 'bg-[#e6f2ea] text-[#14532d] border-[#c5e2cf]',
    amber: 'bg-amber-100 text-amber-900 border-amber-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  };
  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center rounded-full border font-bold tracking-wide ${sizes[size]} ${tones[tone]}`}
      aria-label={name}
    >
      {getInitials(name)}
    </div>
  );
}

export function AlertBanner({
  tone = 'error',
  title,
  message,
}: {
  tone?: 'error' | 'success' | 'info' | 'warning';
  title?: string;
  message: string;
}) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
  };

  return (
    <div className={`rounded-xl border p-4 text-sm ${styles[tone]}`} role="alert">
      {title && <p className="font-bold mb-0.5">{title}</p>}
      <p>{message}</p>
    </div>
  );
}
