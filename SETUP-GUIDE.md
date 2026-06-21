# Harmony Flooring CRM — Setup Guide

Follow these steps in order. Open **PowerShell** for all commands.

---

## STEP 1 — Supabase Project

1. Go to https://supabase.com and sign up / log in
2. Click **New Project** → name it `harmony-flooring-crm`
3. Set a database password (save it somewhere safe) → click **Create Project**
4. Wait ~2 minutes for the project to spin up
5. Go to **SQL Editor** (left sidebar) → click **New Query**
6. Paste the contents of `supabase-setup.sql` and click **Run**
7. Go to **Project Settings → API**
8. Copy two values:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon / public** key (long string starting with `eyJ...`)

---

## STEP 2 — Add Your Supabase Keys to the App

Open `harmony-flooring-crm.html` in any text editor and find these two lines near the top of the `<script>` section:

```
const SUPABASE_URL  = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY  = 'YOUR_SUPABASE_ANON_KEY';
```

Replace with your actual values:

```
const SUPABASE_URL  = 'https://xxxx.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

Save the file.

---

## STEP 3 — Git Setup (PowerShell)

```powershell
# 1. Create your project folder and move the HTML file there
mkdir C:\HarmonyFlooringCRM
cd C:\HarmonyFlooringCRM
Copy-Item "PATH\TO\harmony-flooring-crm.html" .

# 2. Initialize Git
git init
git add .
git commit -m "Initial commit: Harmony Flooring CRM"
```

---

## STEP 4 — Push to GitHub

1. Go to https://github.com → click **New repository**
2. Name it `harmony-flooring-crm` → set to **Private** → click **Create repository**
3. Copy the repository URL (looks like `https://github.com/YOUR_USERNAME/harmony-flooring-crm.git`)

```powershell
# In PowerShell (still in C:\HarmonyFlooringCRM)
git remote add origin https://github.com/YOUR_USERNAME/harmony-flooring-crm.git
git branch -M main
git push -u origin main
```

---

## STEP 5 — Deploy on Netlify (Free Hosting)

**Option A — Drag and Drop (Easiest, no CLI needed):**
1. Go to https://netlify.com → sign up / log in
2. Click **Add new site → Deploy manually**
3. Drag and drop your `harmony-flooring-crm.html` file onto the page
4. Netlify gives you a live URL instantly (e.g. `https://amazing-name-123.netlify.app`)
5. Optional: Go to **Site settings → Change site name** to rename it

**Option B — Connect to GitHub (Auto-deploys on every update):**
1. Go to https://netlify.com → **Add new site → Import an existing project**
2. Connect GitHub → select `harmony-flooring-crm`
3. Build settings: leave everything blank (it's a plain HTML file)
4. Click **Deploy site**
5. Every time you `git push`, the site updates automatically

---

## STEP 6 — Future Updates (Workflow)

Whenever you make changes to the HTML file:

```powershell
cd C:\HarmonyFlooringCRM
git add .
git commit -m "Describe what you changed"
git push
```

If connected to Netlify via GitHub, the live site updates within ~30 seconds.

---

## Summary

| What          | Where                                      |
|---------------|--------------------------------------------|
| Live app      | Your Netlify URL                           |
| Database      | Supabase dashboard → Table Editor          |
| Code          | GitHub → harmony-flooring-crm              |
| Local folder  | C:\HarmonyFlooringCRM                      |

All 4 salesmen can open the same URL on any device (phone, laptop, tablet) and see real-time updates from each other.
