import { useEffect, type ReactNode } from 'react'

export interface ResultProps {
  ok: boolean
  title: string
  children?: ReactNode
  /** auto close delay (ms) */
  ms: number
  onDone(): void
  hint?: string
}

/** Full-screen result: icon + colour + text (never colour alone). */
export function Result({ ok, title, children, ms, onDone, hint }: ResultProps) {
  useEffect(() => {
    const id = setTimeout(onDone, ms)
    return () => clearTimeout(id)
  }, [ms, onDone])
  return (
    <div className={`result ${ok ? 'ok' : 'ko'}`} role="alert" data-testid="result" onClick={onDone}>
      <div className="result-icon" aria-hidden>{ok ? '✔' : '✖'}</div>
      <div className="result-title">{title}</div>
      <div className="result-body">{children}</div>
      {hint && <div className="result-hint">{hint}</div>}
    </div>
  )
}
