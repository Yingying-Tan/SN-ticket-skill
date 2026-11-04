// Usage: node sn-ticket-support/sn-ticket-read.cjs "<ServiceNow PS ticket or INC incident URL>"  (SN_DEBUG=1 lists the field labels)
// Opens the ticket form in a visible Chromium (persistent profile, so the Okta/Microsoft sign-in
// is reused) and prints only: ticket number, BO name, BO email, loan number, ticket detail
// (description), the created time (earliest activity entry) and the comments / work notes. Read only: nothing is clicked, typed or saved.
const { chromium } = require('../node_modules/playwright');
const path = require('path');
const fs = require('fs');

const showBrowser = process.argv.includes('--show-browser');
const raw = process.argv.slice(2).find(a => !a.startsWith('--'));
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
        headless: !showBrowser, // headless by default; --show-browser to watch or to sign in by hand
        executablePath: chromiumPath(),
        viewport: { width: 1400, height: 900 },
    });
    try {
        const page = context.pages()[0] || await context.newPage();
        await page.goto(directUrl(raw));
        console.error(showBrowser ? 'Waiting for the ticket form (complete any Okta/Microsoft sign-in in the window)...' : 'Headless: waiting for the ticket form (if this times out the sign-in expired; rerun with --show-browser)...');
        // After SSO, ServiceNow lands on its home page; wait for that, then re-open the ticket
        await page.waitForURL(/vuhlprod\.service-now\.com\/(navpage|now\/|nav_to|x_mrcd3)/, { timeout: showBrowser ? 180000 : 60000 });
        await page.waitForTimeout(1500);
        // Works for PS tickets (x_mrcd3_ps_production_support) and incidents (incident)
        if (!/(x_mrcd3_ps_production_support|incident)\.do/.test(page.url())) await page.goto(directUrl(raw));
        // (locator wait, not waitForFunction: the Okta sign-in page's CSP blocks string eval)
        await page.locator('input[id*="x_mrcd3_ps_production_support."], textarea[id*="x_mrcd3_ps_production_support."], input[id^="incident."], textarea[id^="incident."]')
            .first().waitFor({ state: 'attached', timeout: showBrowser ? 180000 : 60000 });
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
        // The journal block and the activity stream do not always list the same entries (the stream can have newer
        // notes, the journal can have the text the stream leaves out), so read both and merge them.
        const merged = new Map();
        const kindKey = k => (/^Work notes/i.test(k) ? 'wn' : 'ac');
        const add = c => {
            const key = `${c.at}|${c.by}|${kindKey(c.kind)}`;
            const old = merged.get(key);
            if (!old || c.text.length > old.text.length) merged.set(key, c);
        };
        for (const m of data.body.matchAll(entryRe)) {
            add({ at: m[1], by: m[2].trim(), kind: m[3].trim(), text: m[4].trim() });
        }

        // Activity stream (Now UI, used by incidents and newer PS entries):
        // "<initials>\n<Author>\nWork notes•2026-11-02 13:53:21\n<text>"
        {
            const L = data.body.split('\n').map(s => s.trim());
            const marker = /^(Work notes|Additional comments[^•]*)•(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})$/;
            const anyMarker = /^[A-Za-z ()-]+•\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
            for (let i = 0; i < L.length; i++) {
                const m = L[i].match(marker);
                if (!m) continue;
                let j = i + 1;
                while (j < L.length && !anyMarker.test(L[j])) j++;
                let text = L.slice(i + 1, j);
                if (j < L.length) { // drop the next entry's author line and initials
                    text = text.slice(0, -1);
                    if (text.length && /^[A-Z]{1,3}$/.test(text[text.length - 1])) text = text.slice(0, -1);
                }
                add({ at: m[2], by: L[i - 1] || '', kind: m[1], text: text.join('\n').trim() });
            }
        }
        // Created time = the earliest entry in the activity stream (usually the opener's first "Field changes" entry,
        // e.g. "Field changes•2026-11-03 11:51:29"). Any "<type>•<time>" line counts, plus the journal entries.
        const stamps = [];
        for (const line of data.body.split('\n')) {
            const m = line.trim().match(/^([A-Za-z ()-]+?)\s*•\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})$/);
            if (m) stamps.push({ at: m[2], kind: m[1] });
        }
        for (const c of merged.values()) stamps.push({ at: c.at, kind: c.kind });
        stamps.sort((a, b) => a.at.localeCompare(b.at));
        const created = stamps[0];
        // Newest first
        // Skip page-button noise picked up as a "note" (e.g. "UpdateConvert to Incident"; user, 2026-11-04)
        const isNoise = c => !c.text || /^(Update|Convert to Incident|Save|Post|\s)+$/i.test(c.text);
        const comments = [...merged.values()].filter(c => !isNoise(c)).sort((a, b) => b.at.localeCompare(a.at));
        if (process.env.SN_BODY) console.error('BODY:\n' + data.body.slice(0, 6000));
        if (process.env.SN_DEBUG) {
            console.error('LABELS: ' + Object.keys(f).join(' | '));
            console.error('BODY LINES MATCHING: ' + data.body.split('\n').filter(l => /borrower|crm|encompass|opportunity|loan|email/i.test(l)).slice(0, 40).join(' // '));
        }
        const isInc = /^INC/i.test(pick('Number'));
        // PS tickets carry the BO fields; incidents have a Caller and a short description instead
        console.log(`TICKET: ${pick('Number')}`);
        // Show the BO name as "First Last" (the form often has "Last, First")
        const boName = pick('Borrower Name').replace(/^\s*([^,]+?)\s*,\s*(.+?)\s*$/, '$2 $1');
        if (!isInc) console.log(`BO name: ${boName}`); // incidents: no caller (user does not need it)
        console.log(`BO email: ${pick('What is the confirmed email address?', 'Borrower Email', 'Email')}`);
        if (isInc) {
            // Fields the user wants for incidents (may not be on every incident form/view; blank means not on the form)
            console.log(`CRM OpportunityID: ${pick('CRM OpportunityID', 'CRM Opportunity ID', 'CRM Opportunity Id', 'CRM ID')}`);
            console.log(`Encompass Loan #: ${pick('Encompass Loan #', 'Encompass Loan Number', 'Encompass Loan', 'Loan Number')}`);
        } else {
            console.log(`Loan number: ${pick('Loan Number/Opportunity ID', 'Loan Number')}`);
        }
        console.log(`Created: ${created ? created.at + ' (earliest activity: ' + created.kind + '; ServiceNow time)' : '(not found)'}`);
        const short = isInc ? pick('Short Description', 'Short description') : '';
        console.log(`\nTICKET DETAIL:\n${short ? 'Short description: ' + short + '\n' : ''}${pick('Description').split('\n').filter(l => !/^\s*(Is this phone number listed on the CRM contact card\?|Preferred Contact Time:|What is the entity\?)/i.test(l)).join('\n').trim()}`);
        console.log('\nCOMMENTS / WORK NOTES:');
        if (!comments.length) console.log('(none)');
        comments.forEach(c => console.log(`- [${c.at}] ${c.by} (${c.kind}): ${c.text}`));
    } finally {
        await context.close();
    }
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
