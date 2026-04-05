# Publishing Checklist for `latex-pro-web`

Use this before pushing the repo to GitHub or putting the project on a resume.

---

## 1. Secret Safety

Do **not** publish any file that contains:

- OpenAI keys
- demo access codes
- personal API tokens
- private user documents
- local-only environment files

Make sure these are **not committed**:

- `.env.local`
- `.env.server`
- any secret-bearing `.env.*` file

Quick checks:

```bash
git status
git ls-files
```

---

## 2. Public Demo Strategy

Recommended for resume usage:

- public frontend demo is visible
- full AI usage requires an access code
- OpenAI key stays server-side only
- basic rate limiting stays enabled

---

## 3. Before First Push

Inside the project root:

```bash
git init
git add .
git commit -m "Initial public demo version"
```

Create a GitHub repo, then connect it:

```bash
git remote add origin https://github.com/<your-username>/latex-pro-web.git
git branch -M main
git push -u origin main
```

If `origin` already exists:

```bash
git remote -v
```

---

## 4. Final Repo Sanity Check

Before publishing, confirm:

- [ ] README is present
- [ ] `.gitignore` is present
- [ ] no secret files are tracked
- [ ] repo name looks professional
- [ ] commit messages are understandable
- [ ] screenshots / GIFs are prepared
- [ ] public demo wording matches reality

---

## 5. Recommended Resume Framing

Suggested project framing:

- Built a V2 academic report workbench for LaTeX-based document generation and editing
- Designed multi-workspace document state management with Zustand
- Implemented structured section editing for tables, charts, and figures
- Added PDF preview compilation and a gated public-demo architecture for safe showcase deployment

---

## 6. Suggested Public Links

On your resume, prefer:

- GitHub repository link
- public demo link
- optional short demo video / GIF

---

## 7. Deployment Note

For public deployment:

- frontend can be public
- backend should keep `OPENAI_API_KEY` server-side
- full AI mode should require the demo access code
- do not expose paid API credentials in browser code
