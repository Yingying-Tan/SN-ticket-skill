// Usage: node sn-ticket-support/sn-ticket-read.cjs "<ServiceNow Production Support ticket URL>"
// Opens the ticket form in a visible Chromium (persistent profile, so the Okta/Microsoft sign-in
// is reused) and prints only: ticket number, BO name, BO email, loan number, ticket detail
// (description) and the comments / work notes. Read only: nothing is clicked, typed or saved.
const { chromium } = require('../node_modules/playwright');
const path = require('path');
const fs = require('fs');

const raw = process.argv[2];
if (!raw || !/service-now\.com/.test(raw)) {
    console.error('Usage: node sn-ticket-support/sn-ticket-read.cjs "<ServiceNow ticket URL>"');
    process.exit(1);
}

// nav_to.do?uri=<form>.do%3Fsys_id=... wraps the form in a frame; open the form directly instead
function directUrl(u) {
    u = u.replace(/&amp;/g, '&').split('|')[0];
    const m = u.match(/nav_to\.do\?uri=(.+)$/);
    if (!m) return u;
    const inner = decodeURIComponent(m[1]);
    return new URL(inner.startsWith('/') ? inner : '/' + inner, new URL(u).origin).href;
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

(async () => {
    const context = await chromium.launchPersistentContext(path.join(__dirname, '.servicenow-profile'), {
        headless: false,
        executablePath: chromiumPath(),
        viewport: { width: 1400, height: 900 },
    });
    try {
        const page = context.pages()[0] || await context.newPage();
        await page.goto(directUrl(raw));
        console.error('Waiting for the ticket form (complete any Okta/Microsoft sign-in in the window)...');
        // After SSO, ServiceNow lands on its home page; wait for that, then re-open the ticket
        await page.waitForURL(/vuhlprod\.service-now\.com\/(navpage|now\/|nav_to|x_mrcd3)/, { timeout: 180000 });
        await page.waitForTimeout(1500);
        if (!/x_mrcd3_ps_production_support\.do/.test(page.url())) await page.goto(directUrl(raw));
        // (locator wait, not waitForFunction: the Okta sign-in page's CSP blocks string eval)
        await page.locator('input[id*="x_mrcd3_ps_production_support."], textarea[id*="x_mrcd3_ps_production_support."]')
            .first().waitFor({ state: 'attached', timeout: 180000 });
        await page.waitForTimeout(2500);

        const data = await page.evaluate(() => {
            const labelFor = el => {
                const id = el.id.replace(/^(sys_display\.|sys_readonly\.)/, '');
                const l = document.querySelector(`label[for="${el.id}"], label[for="${id}"]`);
                return (l ? l.innerText : '').replace(/\s+/g, ' ').trim();
            };
            const byLabel = {};
            document.querySelectorAll('input, textarea').forEach(el => {
                if (!el.id || el.type === 'hidden' || el.type === 'checkbox') return;
                const v = (el.value || '').trim();
                const k = labelFor(el);
                if (k && v && !(k in byLabel)) byLabel[k] = v;
            });
            return { fields: byLabel, body: document.body.innerText };
        });

        const f = data.fields;
        const pick = (...names) => {
            for (const n of names) if (f[n]) return f[n];
            return '';
        };
        // Comments and work notes show in the journal block as:
        // "2026-11-01 16:51:19 - Grace Thomas\nWork notes\n\n<text>"
        const entryRe = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) - (.+)\n(Work notes|Additional comments[^\n]*)\n+([\s\S]*?)(?=\n\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} - |\nUpdate\s*Convert|\nRelated Links|$)/gm;
        const comments = [];
        for (const m of data.body.matchAll(entryRe)) {
            comments.push({ at: m[1], by: m[2].trim(), kind: m[3].trim(), text: m[4].trim() });
        }

        console.log(`TICKET: ${pick('Number')}`);
        console.log(`BO name: ${pick('Borrower Name')}`);
        console.log(`BO email: ${pick('What is the confirmed email address?')}`);
        console.log(`Loan number: ${pick('Loan Number/Opportunity ID')}`);
        console.log(`\nTICKET DETAIL:\n${pick('Description')}`);
        console.log('\nCOMMENTS / WORK NOTES:');
        if (!comments.length) console.log('(none)');
        comments.forEach(c => console.log(`- [${c.at}] ${c.by} (${c.kind}): ${c.text}`));
    } finally {
        await context.close();
    }
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
