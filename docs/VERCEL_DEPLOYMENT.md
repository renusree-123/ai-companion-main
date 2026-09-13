# Deploying AI Study Companion to Vercel

This guide details how to deploy the **AI Study Companion** to [Vercel](https://vercel.com).

---

## 1. Prerequisites

Before deploying, ensure you have:
1. A **Vercel account** ([vercel.com](https://vercel.com/signup))
2. A **Groq API Key** ([console.groq.com/keys](https://console.groq.com/keys))
3. A hosted **PostgreSQL Database** (e.g. [Neon](https://neon.tech), [Supabase](https://supabase.com), or [Vercel Postgres](https://vercel.com/storage/postgres))

---

## 2. Database Configuration for Vercel

Since Vercel uses serverless functions with an ephemeral filesystem, switch the Prisma database provider to PostgreSQL for production:

In `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Then push your schema to the remote database:
```bash
# Set your DATABASE_URL in your local environment or run directly:
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require" npx prisma db push
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require" npm run db:seed
```

---

## 3. Configure Environment Variables in Vercel

In your Vercel Project Settings -> **Environment Variables**, add the following:

| Variable Name | Example Value | Description |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://user:pass@ep-host.neon.tech/neondb?sslmode=require` | Remote PostgreSQL connection string |
| `AUTH_SECRET` | `openssl rand -base64 48` generated secret | Minimum 16-character secure secret |
| `GROQ_API_KEY` | `gsk_...` | Your Groq API key |
| `AI_MODEL` | `groq/compound` | Default primary Groq model |
| `AI_FALLBACK_MODEL` | `groq/compound-mini` | Fallback Groq model |
| `AI_PROVIDER` | `groq` | Set to `groq` or `auto` |
| `WORKER_IN_PROCESS` | `true` | Runs worker in web process |

---

## 4. Deploying via Vercel CLI or GitHub

### Method A: Vercel CLI (Quickest)

Run the following commands in your terminal:

```bash
# 1. Log in to Vercel
npx vercel login

# 2. Deploy Preview
npx vercel

# 3. Deploy to Production
npx vercel --prod
```

### Method B: Git Integration (Recommended for CI/CD)

1. Push your repository to GitHub / GitLab / Bitbucket.
2. Go to [Vercel Dashboard](https://vercel.com/new) and import the repository.
3. Vercel will auto-detect Next.js and read [`vercel.json`](file:///c:/Users/istyl/Documents/project/ai-study-campanion-main/vercel.json).
4. Add the environment variables listed in Section 3.
5. Click **Deploy**.

---

## 5. Verification & Health Check

Once deployed, test your deployment URL:
- **Authentication:** Visit `/login` and test logging in with a seeded or newly registered account.
- **Learning Hub:** Navigate to `/learning-hub` to test Quiz Generation, Summariser, and Topic Explainer.
- **System Health:** Visit `/admin/health` to verify database connectivity and AI provider status.
