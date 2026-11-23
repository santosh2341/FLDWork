// Shows things worth fixing before a quote or invoice goes to the customer. Advisory only; never blocks.
export default function PreSendCheck({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null
  return (
    <details className="card presend">
      <summary><b>⚠ {issues.length} thing{issues.length > 1 ? 's' : ''} to check before sending</b></summary>
      <ul>{issues.map((m) => <li key={m}>{m}</li>)}</ul>
    </details>
  )
}
