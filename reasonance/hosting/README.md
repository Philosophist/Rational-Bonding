# ourgument.com

Ourgument has its own address, https://ourgument.com. GitHub Pages can only
give this repository one custom domain (rationalbonding.com), so a small
**Cloudflare Worker** named `ourgument` sits on ourgument.com and fetches the
app from https://rationalbonding.com/reasonance/ ([`worker.js`](worker.js)).
Merging to `master` updates both addresses at once; the Worker only needs
changing if `worker.js` changes.

- `ourgument.com/` shows `rationalbonding.com/reasonance/`, and so on for the
  app's files. `/accounts/`, `/images/` and `/favicon.png` come from the site
  root, because the app shares them.
- `www.ourgument.com` and `ourgument.com/reasonance/...` redirect to
  `ourgument.com/...`. Site pages such as `/privacy/` redirect to
  rationalbonding.com.
- rationalbonding.com/reasonance/ keeps working. Its canonical link points at
  ourgument.com.
- Sign-in is kept per website, so people sign in on ourgument.com separately
  (same account). Passkeys are tied to rationalbonding.com, so `accounts/auth.js`
  doesn't offer them on other sites.
- Tests: `npm test` in `reasonance/` includes `test/worker.test.mjs`.

## Setting it up (one time, in the dashboards)

**Cloudflare** (https://dash.cloudflare.com, the account holding ourgument.com):
1. If you added any DNS records for ourgument.com, delete them first
   (ourgument.com → DNS → Records). The Worker makes its own.
2. Left menu **Compute (Workers) → Workers & Pages → Create → Create Worker**
   (start from "Hello World"). Name it `ourgument` and click **Deploy**.
3. Click **Edit code**, select all, paste the whole of `worker.js`, and click
   **Deploy**.
4. Back on the Worker, **Settings → Domains & Routes → Add → Custom domain**:
   `ourgument.com`. Add another for `www.ourgument.com`.

**Supabase** (https://supabase.com/dashboard, project "Space Chess"):
5. **Authentication → URL Configuration → Redirect URLs → Add URL**:
   `https://ourgument.com/**`, then **Save**. Leave the Site URL as it is.

To update the Worker later, repeat step 3 with the new `worker.js`.
