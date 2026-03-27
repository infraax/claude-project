# GitHub Environments Setup

> **Note:** GitHub Environments are configured in the GitHub Settings UI, not via files.
> This document serves as a checklist for manual configuration.

## Setup Instructions

### Environment: production

1. Go to: **Settings → Environments → New environment**
2. Name: `production`
3. Protection rules:
   - **Required reviewers:** infraax (yourself)
   - **Wait timer:** 0 minutes
4. Environment secrets (add these):
   - `ANTHROPIC_API_KEY` → your Anthropic API key
   - `SUPABASE_URL` → (add later when Supabase is set up)
   - `SUPABASE_ANON_KEY` → (add later)
5. Deployment branches: `main` only

### Environment: staging

1. Go to: **Settings → Environments → New environment**
2. Name: `staging`
3. No protection rules required
4. Environment secrets (same as production):
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
5. Deployment branches: any branch (optional)

## Using Environments in Workflows

Reference environments in workflow files using:

```yaml
jobs:
  deploy:
    environment:
      name: production
      url: https://your-site.com
```

This ensures deployments respect protection rules and have access to environment-specific secrets.
