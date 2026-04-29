# Supabase

Local Supabase configuration for Calldone.

## First-time setup

Install the Supabase CLI:

```bash
brew install supabase/tap/supabase
```

(Or use `npx supabase` to run on-demand without a global install.)

## Linking to a remote project

After creating a project at https://supabase.com (under the OasisView account):

```bash
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push
```

## Local development

```bash
supabase start    # start local Postgres + studio
supabase stop     # stop everything
supabase status   # see what's running
```

## Migrations

Add new migrations with:

```bash
supabase migration new <name>
```

Edit the generated SQL file under `migrations/`, then push to remote with:

```bash
supabase db push
```
