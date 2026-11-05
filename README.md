# Coursework Tracker

Group coursework tracker for 7MNST021C Management and Organisational Behaviour (WIUT). Static web app on GitHub Pages with Firebase Authentication and Firestore (free Spark plan).

## Roles

- **Admin**: the email in `config.js` and `firestore.rules`. Manages the team list.
- **Students**: edit tasks, log their work, record meetings and issues.
- **Lecturer**: read-only access to everything.

## Setup

1. Put your personal email (lowercase) in two places:
   - `config.js` → `ADMIN_EMAIL_SHA256`: not the email itself but its hash, made with `printf '%s' 'you@example.com' | shasum -a 256`
   - `firestore.rules` → `isAdmin()`
2. Firebase console → Firestore → **Rules**: paste the whole `firestore.rules` and click **Publish**.
3. Firebase console → Authentication → **Sign-in method**:
   - Email/Password, also with **Email link (passwordless sign-in)** on;
   - **Google** on (choose a support email).
4. Authentication → **Settings → User actions**: turn **Enable create (sign-up)** off, so only accounts made in **Users → Add user** can sign in with a password.
5. Authentication → **Settings → Authorized domains**: add `<your-github-username>.github.io`.
6. GitHub: upload `index.html`, `app.js`, `config.js`, `style.css` to the repository, then **Settings → Pages → Deploy from a branch → main / root**. The site appears at `https://<your-github-username>.github.io/<repo>/`.
7. Open the site, sign in with the admin email, go to **Team** and add the students (by student ID) and the lecturer, then **Dashboard → Create tasks from the brief**.

## Local test

```
cd ~/Desktop/wiut-coursework-tracker
python3 -m http.server 8080
```

Open http://localhost:8080 (localhost is authorised in Firebase by default).

## Notes

- The free plan limits how many sign-in emails can be sent per day. Google sign-in has no such limit; the email link is for people without a Google account, such as the lecturer.
- Sessions persist in the browser, so each person signs in once per device.
- `coursework-board-v0.html` is the earlier claude.ai prototype, kept for reference; do not upload it.
