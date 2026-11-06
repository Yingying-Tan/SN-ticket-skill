// Usage: node sn-ticket-support/crm-open.cjs
// Sign-in test for Dynamics 365 CRM (https://veteransunited.crm.dynamics.com). Opens CRM in a visible
// Chromium using the persistent profile `.crm-profile`, waits (up to 5 minutes) while the user completes
// the Okta / Microsoft sign-in and MFA by hand, then prints whether CRM loaded and closes so the session is saved.
// Read-only: it never types, clicks or reads any record. Credentials are never typed by this script.
const { chromium } = require('../node_modules/playwright');
const fs = require('fs');
const path = require('path');

const URL_CRM = 'https://veteransunited.crm.dynamics.com/';

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

(async () => {
    const context = await chromium.launchPersistentContext(path.join(__dirname, '.crm-profile'), {
        headless: false,
        executablePath: chromiumPath(),
        viewport: null,
    });
    const page = context.pages()[0] || await context.newPage();
    await page.goto(URL_CRM, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    console.log('CRM window open. Sign in by hand if asked (Okta / Microsoft). Waiting up to 5 minutes...');
    const deadline = Date.now() + 5 * 60 * 1000;
    let ok = false;
    while (Date.now() < deadline) {
        const u = page.url();
        if (/^https:\/\/veteransunited\.crm\.dynamics\.com\/main\.aspx/i.test(u)) { ok = true; break; }
        await page.waitForTimeout(2000).catch(() => {});
    }
    if (ok) {
        await page.waitForTimeout(5000).catch(() => {});
        console.log('SIGNED IN: CRM loaded. Host:', new URL(page.url()).host, '| Title:', await page.title().catch(() => '?'));
    } else {
        console.log('NOT SIGNED IN within 5 minutes. Last host:', (() => { try { return new URL(page.url()).host; } catch { return '?'; } })());
    }
    await context.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
