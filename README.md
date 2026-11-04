# Northstar School Manager — independent rebuild (Phase 1)

React + Vite frontend, Vercel Functions backend, Supabase Auth/PostgreSQL. This is an initial working implementation of authentication, school licenses, staged user creation, invitations and approval workflows. Student/academic/attendance/fee interfaces are NOT implemented yet; SQL schemas are included. It is NOT a finished commercial SaaS.

## Setup
1. Create a **new Supabase project** and copy Project URL and publishable/anon key. Never put the service-role key in frontend code or GitHub.
2. In Supabase SQL Editor, run `sql/setup.sql`.
3. In Supabase Authentication > Users, create your Super Admin user and confirm their email. Then run `update public.profiles set role='super_admin',approved=true,school_id=null where email='YOUR_SUPER_ADMIN_EMAIL';` with your actual email.
4. Create a private GitHub repo and upload this project. Do NOT upload `.env` files.
5. Import the repo at Vercel. Framework preset **Vite**, build command `npm run build`, output directory `dist`.
6. Vercel Project Settings > Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Get the latter from Supabase project API settings. The service key is backend-only.
7. Redeploy after setting variables. Set Supabase Authentication > URL Configuration > Site URL to your Vercel URL; add `https://YOUR-APP.vercel.app/**` to redirect allowlist.
8. Configure custom SMTP for production invitations/password reset; Supabase default mail has strict limits.
9. Test: login as Super Admin; create school; approve license; save user (draft); send invitation; recipient follows email and sets password; sign in and verify assigned role.

## Local development
`npm install` then copy `.env.example` to `.env.local`, fill public vars. Vite local dev does not automatically run Vercel Functions: install Vercel CLI and use `vercel dev` for full-stack local testing. Never expose service role key to the browser.

## Security / production gaps
- Super Admin promotion is manual SQL and must be controlled by project owner.
- Account invitation uses Supabase Auth invitation email; users must accept it before approval. Invitation acceptance endpoint verifies Supabase token.
- Student cap trigger and tenant RLS are present in database, but full student UI and operational workflows are pending.
- Production requires audit logs, rate limiting, backup/restore, billing, comprehensive tests and review of account approval and school isolation.
- Vercel Hobby plan is not intended for commercial SaaS use; check plan terms before selling.
