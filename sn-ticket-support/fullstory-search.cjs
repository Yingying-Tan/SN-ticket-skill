// Fullstory web app search by email (read only in effect, BUT see NOTE).
// NOTE: applying a filter makes Fullstory store an unnamed ad hoc search (URL people:search:<id>).
// It is not listed under Segments and cannot be deleted from here. Decided 2026-11-02 to accept this for now; revisit later.
// Usage: node sn-ticket-support/fullstory-search.cjs <email> [days]   (days: 7, 30 or 90; default 30)
const { chromium } = require('../node_modules/playwright');
const path = require('path');
const fs = require('fs');

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

const email = process.argv[2];
const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(email || '');
if (!email || !(email.includes('@') || isGuid)) { console.error('Usage: node fullstory-search.cjs <email|guid> [days]'); process.exit(2); }
const days = process.argv[3] || '30';

(async () => {
    const context = await chromium.launchPersistentContext(path.join(__dirname, '.fullstory-profile'), {
        headless: false,
        executablePath: chromiumPath(),
        viewport: { width: 1400, height: 900 },
    });
    try {
        const okta = context.pages()[0] || await context.newPage();
        await okta.goto('https://vu.okta.com');
        const tile = okta.locator('a', { hasText: /fullstory.*external|external.*fullstory/i }).first();
        await tile.waitFor({ timeout: 90000 });
        await Promise.all([context.waitForEvent('page', { timeout: 20000 }).catch(() => null), tile.click()]);
        console.error('Waiting for Fullstory (complete any Okta/Microsoft sign-in in the window)...');
        const page = await new Promise((resolve, reject) => {
            const deadline = Date.now() + 180000;
            const timer = setInterval(() => {
                const hit = context.pages().find(p => p.url().includes('app.fullstory.com'));
                if (hit) { clearInterval(timer); resolve(hit); }
                else if (Date.now() > deadline) { clearInterval(timer); reject(new Error('Timed out waiting for app.fullstory.com')); }
            }, 1000);
        });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(4000);
        if (page.url().includes('orgChooser')) {
            await page.getByText('Veterans United Home Loans', { exact: true }).click();
            await page.waitForURL(u => !u.href.includes('orgChooser'), { timeout: 60000 });
        }
        await page.waitForTimeout(6000);
        const step = async (fn) => { await fn(); await page.waitForTimeout(1200); };
        const setDays = async () => {
            const label = { 7: 'Past 7 days', 90: 'Past 90 days' }[days];
            if (label) {
                await step(() => page.getByText('Past 30 days').first().click());
                await step(() => page.getByText(label, { exact: true }).first().click());
            }
        };
        async function run(mode) {
            await page.goto('https://app.fullstory.com/ui/1002V/segments/everyone/people');
            await page.waitForTimeout(9000);
            await step(() => page.getByText('Filters', { exact: true }).first().click());
            if (mode === 'email') {
                await step(() => page.getByText('Add user filter', { exact: true }).first().click());
                await step(() => page.getByText('Email', { exact: true }).first().click());
            } else {
                // Event filter: Any activity, refine by Text (icon next to "Any activity"), operator "is"
                await step(() => page.mouse.click(507, 572));
                await step(() => page.getByText('Text', { exact: true }).first().click());
            }
            await step(() => page.keyboard.type(email, { delay: 30 }));
            await step(() => page.keyboard.press('Enter'));
            await setDays();
            await step(() => page.getByText('Apply Filters', { exact: true }).first().click());
            await page.waitForTimeout(8000);
            const body = await page.locator('body').innerText();
            const summary = body.match(/[\d,]+ Users? of [\d,]+[^\n]*\n[^\n]*Sessions[^\n]*/)?.[0];
            const sess = await page.locator('a[href*="/session/"]').evaluateAll(as => [...new Set(as.map(a => a.href))]);
            const users = await page.locator('a[href*="/user/"]').evaluateAll(as => [...new Set(as.map(a => a.href))]);
            console.log('--- SEARCH: ' + (mode === 'email' ? 'email as a user' : 'text contains the email') + ' (' + days + ' days) ---');
            console.log('URL: ' + page.url());
            console.log('SUMMARY: ' + (summary ? summary.replace(/\n/g, ' ') : '(no match)'));
            console.log('SESSION LINKS (' + sess.length + '):\n' + sess.join('\n'));
            console.log('USER LINKS (' + users.length + '):\n' + users.join('\n'));
            return !!summary; // a summary line means at least one user matched (session links may be empty; use the user links)
        }
        // Order: email as a user, then text. (Questionnaire GUID is the third option, done separately.)
        // Optional 4th arg "text" skips the email search (use when it was already run).
        if (isGuid) {
            // GUID (contact or questionnaire): text search only
            if (!(await run('text'))) console.log('No match by GUID text.');
        } else if (process.argv[4] === 'text') {
            if (!(await run('text'))) console.log('No match by text. Next option: questionnaire GUID.');
        } else if (!(await run('email'))) {
            console.log('No match by email; trying text...');
            if (!(await run('text'))) console.log('No match by text either. Next option: questionnaire GUID.');
        }
    } finally {
        await context.close();
    }
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
