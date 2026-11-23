# Edge Functions

## ai-assist
Drafts quotes and tidies text with the Claude API. Deployed to the project as `ai-assist` (it checks the user's session itself, so JWT verification is off).

One-time setup: Supabase dashboard > Edge Functions > Secrets > add `ANTHROPIC_API_KEY` (create the key at console.anthropic.com).
Without the key the app shows "The AI assistant is not set up yet" and everything else works.

Redeploy after editing: `supabase functions deploy ai-assist --no-verify-jwt`.
Models: quote drafts use `claude-sonnet-5-5`, text tidy-ups use `claude-haiku-5-5`. Daily limit: 100 requests per company (`DAILY_LIMIT` in index.ts).
