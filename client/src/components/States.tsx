/* Shared loading / error / empty blocks.

   Every screen that reads from the API needs all three, and they should look
   the same everywhere — an error that renders differently on each page reads
   as a broken page rather than a failed request. */

import { FONT_BODY, G, PINK } from '../lib/theme'

export function LoadingBlock({ label = 'Loading…', pad = '3rem' }: { label?: string; pad?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ padding: pad, textAlign: 'center', color: '#9CA3AF', fontSize: '0.85rem', fontFamily: FONT_BODY }}
    >
      {label}
    </div>
  )
}

export function ErrorBlock({
  message,
  onRetry,
  pad = '2rem',
}: {
  message: string
  onRetry?: () => void
  pad?: string
}) {
  return (
    <div
      role="alert"
      style={{
        padding: pad,
        textAlign: 'center',
        fontFamily: FONT_BODY,
        backgroundColor: '#FEF2F2',
        border: '1px solid #FECACA',
        borderRadius: '12px',
      }}
    >
      <p style={{ color: '#DC2626', fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: '0.875rem',
            backgroundColor: G,
            color: 'white',
            border: 'none',
            borderRadius: '999px',
            padding: '0.5rem 1.25rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: FONT_BODY,
          }}
        >
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyBlock({ message, pad = '3rem' }: { message: string; pad?: string }) {
  return (
    <div style={{ padding: pad, textAlign: 'center', color: '#9CA3AF', fontSize: '0.85rem', fontFamily: FONT_BODY }}>
      {message}
    </div>
  )
}

/** Inline banner for a failed write, where the surrounding form stays usable. */
export function InlineError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        backgroundColor: '#FEE2E2',
        color: '#DC2626',
        fontSize: '0.8rem',
        padding: '0.625rem 0.875rem',
        borderRadius: '8px',
        marginBottom: '1rem',
        lineHeight: 1.5,
        fontFamily: FONT_BODY,
      }}
    >
      {message}
    </div>
  )
}

export function InlineNotice({ message }: { message: string }) {
  return (
    <div
      style={{
        backgroundColor: '#ECFDF5',
        color: '#047857',
        fontSize: '0.8rem',
        padding: '0.625rem 0.875rem',
        borderRadius: '8px',
        marginBottom: '1rem',
        lineHeight: 1.5,
        fontFamily: FONT_BODY,
        border: `1px solid ${PINK}00`,
      }}
    >
      {message}
    </div>
  )
}
