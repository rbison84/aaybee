# Supabase Setup Instructions

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Name it "aaybee" (or your preferred name)
4. Set a strong database password (save this!)
5. Choose your region (closest to your users)
6. Wait for project to be created (~2 minutes)

## 2. Get Your Project Credentials

After creation, go to **Settings > API** and note:

- **Project URL**: `https://[your-project-ref].supabase.co`
- **Anon/Public Key**: `eyJ...` (safe to use in client)
- **Service Role Key**: `eyJ...` (NEVER expose in client)

## 3. Run Database Schema

1. Go to **SQL Editor** in Supabase Dashboard
2. Create a new query
3. Copy/paste contents of `schema.sql`
4. Click **Run** (should complete successfully)

## 4. Run RLS Policies

1. Create another new query
2. Copy/paste contents of `rls_policies.sql`
3. Click **Run**

## 5. Seed Initial Movies

1. Create another new query
2. Copy/paste contents of `seed_movies.sql`
3. Click **Run**

## 6. Verify Setup

Go to **Table Editor** and check:
- [ ] `movies` table exists with 50 rows
- [ ] `user_profiles` table exists (empty)
- [ ] `user_movies` table exists (empty)
- [ ] `comparisons` table exists (empty)

Go to **Authentication > Policies** and verify RLS is enabled.

## 7. Configure Auth (Optional for now)

Go to **Authentication > Providers** and enable:
- Email (enabled by default)
- Google (optional, for social login later)
- Apple (optional, for iOS social login later)

## 8. Environment Variables

Create `.env` file in project root:

```env
EXPO_PUBLIC_SUPABASE_URL=https://[your-project-ref].supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key...
```

**Never commit `.env` to git!**

## Database Schema Overview

```
┌─────────────────┐     ┌──────────────────┐
│   auth.users    │────<│  user_profiles   │
│   (Supabase)    │     │                  │
└────────┬────────┘     └──────────────────┘
         │
         │ 1:many
         ▼
┌─────────────────┐     ┌──────────────────┐
│   user_movies   │>────│     movies       │
│  (per-user)     │     │    (global)      │
└────────┬────────┘     └──────────────────┘
         │
         │ related
         ▼
┌─────────────────┐
│   comparisons   │
│   (history)     │
└─────────────────┘
```

## Row Level Security Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| movies | Everyone | Authenticated | Service only | Service only |
| user_profiles | Own only | Own only | Own only | - |
| user_movies | Own only | Own only | Own only | Own only |
| comparisons | Own only | Own only | - | - |

## Next Steps

After setup, we'll create:
1. `src/services/supabase.ts` - Client configuration
2. `src/services/authService.ts` - Authentication helpers
3. `src/services/syncService.ts` - Data synchronization
