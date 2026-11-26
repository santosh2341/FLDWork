// Where Stripe sends a customer after paying from a payment link (/paid?invoice=123). No sign-in, no app chrome.
export default function Paid() {
  const q = new URLSearchParams(window.location.search)
  const invoice = q.get('invoice')?.replace(/\D/g, '')
  const cancelled = q.get('cancelled') === '1'
  return (
    <div className="qp">
      <header className="qp-top"><b>Payment</b></header>
      <main className="qp-main">
        <div className={`qp-card qp-done ${cancelled ? 'no' : 'ok'}`} role="status">
          <h2>{cancelled ? 'Payment not completed' : 'Thank you for your payment'}</h2>
          <p>
            {cancelled
              ? `No payment was taken${invoice ? ` for invoice #${invoice}` : ''}. You can use the same link again to pay, or contact us.`
              : `Your card payment${invoice ? ` for invoice #${invoice}` : ''} went through. Stripe emails a receipt to the address you gave, and the invoice updates in our system within a minute or two.`}
          </p>
          <p className="muted">You can close this page.</p>
        </div>
      </main>
    </div>
  )
}
