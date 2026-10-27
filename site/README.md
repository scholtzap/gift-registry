# gifts.scholtz.work

Static marketing site for Piñata (Cloudflare Pages project `pinata-gifts`). `public/` is served as is;
`functions/api/contact.js` is the contact form (Resend → `CONTACT_TO_EMAIL`, mailto fallback), from the
`scholtz-site-footer` skill. Brand rules: `../DESIGN.md`.

Deploy (no GitHub Actions needed): from this folder, with `CLOUDFLARE_API_TOKEN` = vault `DEV_API_KEY` and
`CLOUDFLARE_ACCOUNT_ID` = vault `CF_ACCOUNT_ID_SCHOLTZAP`, run `npx wrangler pages deploy --branch main`.
Secret: `npx wrangler pages secret put RESEND_API_KEY --project-name pinata-gifts` (vault `RESEND_API_KEY`).
Custom domain `gifts.scholtz.work` needs a proxied CNAME `gifts` → `pinata-gifts.pages.dev` in the
`scholtz.work` zone; the Pages-only token cannot create DNS records.
