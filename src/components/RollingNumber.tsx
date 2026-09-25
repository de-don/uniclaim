const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

/**
 * Renders already-formatted text with every digit on its own rolling strip, so
 * a changing number visibly counts rather than swapping in place. Anything that
 * is not a digit — `$`, separators, `—` — is drawn as-is.
 */
export function RollingNumber({ value }: { value: string }) {
  const chars = [...value]

  return (
    <span className="roll">
      <span className="sr-only">{value}</span>
      <span aria-hidden="true">
        {chars.map((char, i) => {
          // Keyed from the right: when "$9.99" becomes "$10.00" the cents keep
          // their slots and roll, and only the new leading digit mounts.
          const slot = chars.length - i
          const digit = Number(char)
          if (char === ' ' || Number.isNaN(digit)) {
            return <span key={`c${slot}${char}`}>{char}</span>
          }
          return (
            <span key={`d${slot}`} className="roll__digit">
              <span className="roll__strip" style={{ transform: `translateY(${-digit * 10}%)` }}>
                {DIGITS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </span>
            </span>
          )
        })}
      </span>
    </span>
  )
}
