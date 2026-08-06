# Deploying to Vercel

**Repo:** `Perfectus-Technology-Limited/poker`
**Stack:** Next.js 16, TypeScript. Needs one Redis database. No other services, no migrations.

---

## 1. Import

Vercel → **Add New → Project** → import `Perfectus-Technology-Limited/poker`.

Auto-detects as Next.js. No build settings to change.

## 2. Node version

**Settings → General → Node.js Version → 22.x**

## 3. Create Redis

**Storage → Create Database → Redis** (Upstash, free tier).

| Setting | Value |
|---|---|
| Region | Same as the functions — `us-east-1` |
| Global replication | Off |
| **Eviction** | **Off** ⚠️ — otherwise live games can get deleted |
| TLS | On |

## 4. Set the env var as `REDIS_URL`

Copy the database's connection string. **It must start with `redis://` or `rediss://`** — not `https://`. (Upstash gives you two URLs; the `https://` one is the REST endpoint and the app can't use it.)

Then **Settings → Environment Variables** on the project:

| Key | Value | Environments |
|---|---|---|
| `REDIS_URL` | the `rediss://...` string | Production, Preview, Development |

If the integration already added it under a different name, just add `REDIS_URL` as well.

## 5. Redeploy

Deployments → latest → ⋯ → **Redeploy**.

Env vars only reach a build that runs after they exist, so this step isn't optional.

---

## Check it worked

Play a hand, then look at the **runtime logs**. If you see `No Redis credentials found`, it isn't connected.

Worth checking properly — without Redis the site still *looks* fine, it just quietly loses games later.

---

More detail if needed: `DEPLOYMENT.md` in the repo.
