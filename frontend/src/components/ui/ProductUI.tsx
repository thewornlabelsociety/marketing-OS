import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="flex flex-wrap items-end justify-between gap-5"><div className="max-w-2xl">{eyebrow && <p className="mos-eyebrow">{eyebrow}</p>}<h1 className="mos-display mt-1">{title}</h1>{description && <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">{description}</p>}</div>{action}</header>;
}
export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger' }) { return <button {...props} className={`mos-button mos-button-${variant} ${className}`} />; }
export function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) { return <span className={`mos-status mos-status-${tone}`}>{children}</span>; }
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) { return <div className="mos-empty">{icon && <div className="mb-4 text-zinc-400">{icon}</div>}<h2 className="text-base font-semibold tracking-tight text-zinc-950">{title}</h2><p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">{description}</p>{action && <div className="mt-5">{action}</div>}</div>; }
export function Skeleton({ className = '' }: { className?: string }) { return <div className={`mos-skeleton ${className}`} aria-hidden="true" />; }
