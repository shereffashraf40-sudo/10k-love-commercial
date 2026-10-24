# 10 آلاف قصة حب — Commercial Baseline

This is a **testable commercial-oriented baseline**, not a claim of production certification. It includes PostgreSQL schema, Node/Express API, an Arabic RTL web interface, an admin console, one-time activation codes, rate limiting, server-side sessions, CSRF protection for admin mutations, audit events, and tests.

## Chosen platform
Because the deployment platform was unspecified, this project uses Node.js 20+ and PostgreSQL 14+ (the Docker example uses PostgreSQL 16). It does not depend on Supabase-specific APIs.

## Run locally
1. Install Node.js 20+ and Docker.
2. Edit `docker-compose.yml` secrets and `.env.example`; copy `.env.example` to `.env` and use unique secrets.
3. Start the database: `docker compose up -d db`
4. Install packages: `npm install`
5. Apply schema: `npm run db:migrate`
6. Start: `npm start`
7. Open `http://localhost:3000`; admin: `http://localhost:3000/admin/login`.

Do not deploy with the example passwords. Use HTTPS in production; `Secure` cookies are enabled when `NODE_ENV=production`. The `docker-compose.yml` app service is configured for local development only. Do not expose it directly to the internet; production requires HTTPS and appropriately configured proxy/network controls.

## Activation codes
`node scripts/generate-codes.js --from 1 --to 10000 > activation-codes-private.txt`

This prints new codes to stdout, and only hashes are stored in PostgreSQL. Store the output securely, do not commit it, and do not put codes in public pages, analytics, or logs. Existing active unused codes are skipped.

## Tests
`npm test` runs unit tests. The PostgreSQL integration test is **skipped** unless `TEST_DATABASE_URL` is set. Use a separate disposable database whose name includes `test`, `spec`, or `ci`, apply the migration to it, then run `TEST_DATABASE_URL='postgres://...' npm test`. The integration test truncates app tables only after this name guard. Never use production for tests.

No test result is claimed here. Run the commands in your environment and inspect their actual output.

## Included protections
- Parameterized SQL queries; no SQL built from user values.
- 10,000-square catalog and database constraints for valid IDs and text lengths.
- SHA-256 hashes of high-entropy activation codes; raw codes are only shown at issuance.
- Transactional publish, single-use code consumption, per-square advisory transaction locks, and unique constraints.
- Admin password from environment, session ID rotation after login, HttpOnly/SameSite cookies, server-side PostgreSQL sessions, CSRF token for admin actions, and rate limits.
- Helmet security headers, restrictive content security policy, bounded request bodies, and generic internal-error responses.
- Admin audit log for issuance and publication.

## Before launch
- Set strong unique secrets through a secret manager, configure TLS and trusted proxy settings correctly, and restrict database network access.
- Use automated backups and perform restore drills; monitor DB, errors, abuse, and capacity.
- Add MFA or an identity provider for admin users before a multi-person production launch.
- Define privacy/consent, moderation, reporting/takedown, retention, terms, and Egyptian legal obligations.
- Payment processing is **not included** because no provider/business flow was specified. Before accepting money, implement signed webhooks, idempotency, refunds, reconciliation, and payment-state tests.
- Have a qualified engineer review and run security, load, restore, and end-to-end tests on staging. This repository is not yet externally audited or certified.
