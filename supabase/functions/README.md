# Edge Functions

## ai-assist
Drafts quotes and tidies text with the Claude API. Deployed to the project as `ai-assist` (it checks the user's session itself, so JWT verification is off).

One-time setup: Supabase dashboard > Edge Functions > Secrets > add `ANTHROPIC_API_KEY` (create the key at console.anthropic.com).
Without the key the app shows "The AI assistant is not set up yet" and everything else works.

Redeploy after editing: `supabase functions deploy ai-assist --no-verify-jwt`.
Models: quote drafts use `claude-sonnet-5-5`, text tidy-ups use `claude-haiku-5-5`. Daily limit: 100 requests per company (`DAILY_LIMIT` in index.ts).

## send-document
Emails a quote or invoice to the customer's email on file (never to any other address), as an HTML email with the items and totals, via Resend. Limit: 50 emails per company per day; each send is recorded in `email_log`.

One-time setup:
1. Create a free account at resend.com and verify your sending domain (Domains > Add domain, then add the DNS records it shows).
2. Create an API key (API Keys).
3. In Supabase > Edge Functions > Secrets add `RESEND_API_KEY` (the key) and `EMAIL_FROM` (an address on your verified domain, e.g. `accounts@yourcompany.com.au`).
Without these the panel shows "Email sending is not set up yet" and "Open in my email app" still works.

Redeploy after editing: `supabase functions deploy send-document --no-verify-jwt`.
