// Usage: node sn-ticket-support/profile-api-lookup.cjs <profileId> [--offering <offeringId>] [--loan-team] [--public]
//        node sn-ticket-support/profile-api-lookup.cjs --contact <contactGuid>
// Read-only. Gets an Okta token (Authorization Code + PKCE, same as the Postman collection "Published (Internal)"),
// then GETs from the VCCM Profile API:
//   <profileId>                  -> /vuhl/profiles/<profileId>/related-offerings
//   --offering <id>              -> /vuhl/offerings/<id>
//   --offering <id> --loan-team  -> /vuhl/offerings/<id>/loan-team  (also fetches the offering)
//   --contact <guid>           -> /vuhl/enrollments?contactGuid=<guid>  (public gateway, as in the collection)
//   --lead <guid>[,<guid>...]  -> /vuhl/enrollments?leadGuid=<guid> per GUID (public gateway); --profile-by-lead also GETs /vuhl/profiles?leadGuid=<guid>
// --public uses the public gateway instead of the internal one.
// The token stays in memory: it is never printed or written to a file.
// The profile is persisted so the Okta session is reused between runs.
const { chromium } = require('../node_modules/playwright');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const OKTA_AUTH_URL = 'https://vu.okta.com/oauth2/auswzih7bekPPDaYx0x7';
const CLIENT_ID = '0oa18m5a1bxEyKoJp0x8';
const SCOPE = 'vuhl.svcAccount';
const REDIRECT_URI = 'https://oauth.pstmn.io/v1/callback';
const BRAND = 'vuhl';
const BASE_URL = 'https://api-prod-azure.vuhl.redchimney.com/vccm/v1';
const BASE_PUBLIC_URL = 'https://api.vu.com/vccm-public/v1';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined; };
const flag = name => args.includes('--' + name);
const profileId = args.find((a, i) => !a.startsWith('--') && !(i > 0 && ['--offering', '--contact', '--lead'].includes(args[i - 1])));
const offeringId = opt('offering');
const loanTeam = flag('loan-team');
const contactGuid = opt('contact');
// --lead <leadGuid>[,<leadGuid>...]: enrollment search by lead GUID (playbook enrollment step 6), one GET per GUID
const leadGuids = (opt('lead') || '').split(',').map(s => s.trim()).filter(Boolean);
const profileByLead = flag('profile-by-lead'); // also GET /profiles?leadGuid=<guid> for each lead GUID
const base = flag('public') ? BASE_PUBLIC_URL : BASE_URL;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if ((!profileId && !offeringId && !contactGuid && !leadGuids.length) || leadGuids.some(g => !GUID.test(g)) || (contactGuid && !GUID.test(contactGuid)) || (profileId && !GUID.test(profileId)) || (offeringId && !/^\d+$/.test(offeringId)) || (loanTeam && !offeringId)) {
    console.error('Usage: node sn-ticket-support/profile-api-lookup.cjs <profileId> [--offering <offeringId>] [--loan-team] [--public] | --contact <contactGuid>');
    process.exit(1);
}

// The project's Playwright may expect a Chromium build that is not installed on this machine;
// use the newest installed one instead (falls back to Playwright's own choice if none found).
function chromiumPath() {
    try {
        const root = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
        const dirs = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d))
            .sort((a, b) => parseInt(b.split('-')[1], 10) - parseInt(a.split('-')[1], 10));
        for (const d of dirs) {
            const exe = path.join(root, d, 'chrome-win64', 'chrome.exe');
            if (fs.existsSync(exe)) return exe;
        }
    } catch { /* ignore */ }
    return undefined;
}

const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Authorization Code + PKCE through the browser; returns the access token (in memory only)
async function getToken() {
    const verifier = b64url(crypto.randomBytes(64));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));
    const authUrl = `${OKTA_AUTH_URL}/v1/authorize?` + new URLSearchParams({
        response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, scope: SCOPE,
        state, code_challenge: challenge, code_challenge_method: 'S256',
    });

    const context = await chromium.launchPersistentContext(path.join(__dirname, '.profile-api-profile'), {
        headless: false,
        executablePath: chromiumPath(),
        viewport: { width: 1000, height: 800 },
    });
    try {
        const page = context.pages()[0] || await context.newPage();
        // Okta ends on the callback URL; read the code from it (the code is useless without our PKCE verifier).
        // Route interception did not catch this redirect, so watch the navigation instead.
        const redirected = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Timed out waiting for the Okta sign-in')), 180000);
            page.on('framenavigated', f => {
                if (f !== page.mainFrame()) return;
                const u = new URL(f.url());
                // Progress only (host + path, never the query string, which holds the code)
                console.error('  page:', u.origin + u.pathname);
                if (u.origin + u.pathname === REDIRECT_URI) { clearTimeout(timer); resolve(u); }
            });
        });
        console.error('Waiting for Okta (complete any sign-in / MFA in the window)...');
        await page.goto(authUrl);
        const cb = await redirected;
        if (cb.searchParams.get('error')) throw new Error('Okta returned: ' + cb.searchParams.get('error') + ' ' + (cb.searchParams.get('error_description') || ''));
        if (cb.searchParams.get('state') !== state) throw new Error('State mismatch on the Okta redirect');

        const res = await fetch(`${OKTA_AUTH_URL}/v1/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: new URLSearchParams({
                grant_type: 'authorization_code', code: cb.searchParams.get('code'),
                redirect_uri: REDIRECT_URI, client_id: CLIENT_ID, code_verifier: verifier,
            }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.access_token) throw new Error(`Token request failed: ${res.status} ${json.error || ''} ${json.error_description || ''}`);
        return json.access_token;
    } finally {
        await context.close();
    }
}

// Read-only: GET only, nothing else is ever sent to the API
async function get(token, urlPath, baseUrl = base) {
    const url = `${baseUrl}/${BRAND}/${urlPath}`;
    const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    console.log(`\n=== GET /${BRAND}/${urlPath}  ->  ${res.status}`);
    console.log(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
}

(async () => {
    const token = await getToken();
    if (contactGuid) await get(token, `enrollments?contactGuid=${contactGuid}`, BASE_PUBLIC_URL);
    for (const g of leadGuids) {
        await get(token, `enrollments?leadGuid=${g}`, BASE_PUBLIC_URL);
        if (profileByLead) await get(token, `profiles?leadGuid=${g}`);
    }
    if (profileId) await get(token, `profiles/${profileId}/related-offerings`);
    if (offeringId) {
        await get(token, `offerings/${offeringId}`);
        if (loanTeam) await get(token, `offerings/${offeringId}/loan-team`);
    }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
