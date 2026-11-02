// Usage: node sn-ticket-support/sendgrid-email-lookup.cjs <recipient-email> [--days 3|7|30] [--max N]
// Opens a visible Chromium, goes vu.okta.com -> SendGrid tile -> Activity > Email Logs,
// searches the recipient address (Date filter: Last 3 days / Last 7 days; 30 = no date filter),
// prints a table, and for every email that is not Delivered opens its details page and prints
// the JSON of each failure event (bounce, dropped, deferred, ...).
// The profile is persisted so Okta/Microsoft sessions are reused between runs.
const { chromium } = require('../node_modules/playwright');
const path = require('path');

const args = process.argv.slice(2);
const email = args.find(a => !a.startsWith('--') && a.includes('@'));
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };
const days = opt('days', '3');
const max = parseInt(opt('max', '10'), 10);

if (!email || !['3', '7', '30'].includes(days)) {
    console.error('Usage: node sn-ticket-support/sendgrid-email-lookup.cjs <recipient-email> [--days 3|7|30] [--max N]');
    process.exit(1);
}

// "Delivered" is the only good end state; anything else gets its failure events read
const isFailed = status => status !== 'Delivered';
// Events in the details table whose "View details" panel holds the failure JSON
const FAILURE_EVENTS = /Bounce|Dropped|Deferred|Blocked|Spam|Unsubscribe/i;

(async () => {
    const context = await chromium.launchPersistentContext(path.join(__dirname, '.sendgrid-profile'), {
        headless: false,
        viewport: { width: 1400, height: 900 },
    });
    try {
        const okta = context.pages()[0] || await context.newPage();
        await okta.goto('https://vu.okta.com');

        // Okta tile may open a new tab or redirect in place
        await Promise.all([
            context.waitForEvent('page', { timeout: 20000 }).catch(() => null),
            okta.locator('a', { hasText: /sendgrid/i }).first().click(),
        ]);

        // Okta/Microsoft sign-in may appear; the user completes it by hand (up to 3 min)
        console.log('Waiting for SendGrid (complete any Okta/Microsoft sign-in in the window)...');
        const page = await new Promise((resolve, reject) => {
            const deadline = Date.now() + 180000;
            const timer = setInterval(() => {
                const hit = context.pages().find(p => p.url().includes('app.sendgrid.com'));
                if (hit) { clearInterval(timer); resolve(hit); }
                else if (Date.now() > deadline) { clearInterval(timer); reject(new Error('Timed out waiting for SendGrid sign-in')); }
            }, 1000);
        });

        // Activity > Email Logs
        await page.goto('https://app.sendgrid.com/email_logs');
        await page.getByPlaceholder(/recipient email address/i).waitFor({ timeout: 30000 });

        // Date filter (Last 3 days / Last 7 days). 30 days = leave unfiltered (usage data is kept 30 days).
        if (days !== '30') {
            await page.getByRole('button', { name: /Date/ }).first().click();
            await page.getByText(`Last ${days} days`, { exact: true }).click();
            const apply = page.getByRole('button', { name: /^Apply$/ });
            if (await apply.isVisible().catch(() => false)) await apply.click();
            await page.keyboard.press('Escape');
        }

        const box = page.getByPlaceholder(/recipient email address/i);
        await box.fill(email);
        await box.press('Enter');
        await page.waitForTimeout(2000);
        await page.waitForFunction(
            e => /\b0 results\b/.test(document.body.innerText) ||
                [...document.querySelectorAll('tr')].some(r => r.innerText.includes(e)),
            email, { timeout: 60000 });
        await page.waitForTimeout(1500);

        // Read rows from the table (cells: Processed At, Message ID, Recipient, Subject, Status, Response)
        const rows = (await page.locator('a[href*="/email_logs/"]').evaluateAll(links =>
            links.map(a => {
                const tr = a.closest('tr, [role="row"]');
                const cells = tr ? [...tr.querySelectorAll('td, [role="cell"]')].map(c => c.innerText.trim()) : [];
                return { href: a.href, cells };
            }))).slice(0, max);

        const summary = await page.locator('text=/\\d+ results?/').first().innerText().catch(() => '');
        console.log(`\nResults for ${email} (${days === '30' ? 'no date filter' : 'Last ' + days + ' days'}): ${summary}`);
        if (!rows.length) {
            console.log('No emails found.');
        } else {
            console.log('\n# | Processed At (UTC) | Status | Subject | Response');
            rows.forEach((r, i) => {
                const [at, , , subject, status, response] = r.cells;
                r.status = (status || '').split('\n')[0].trim();
                r.subject = subject || '';
                console.log([i + 1, at, r.status, r.subject, (response || '').replace(/\s*\n\s*/g, ' ')].join(' | '));
            });

            // One-line verdict so the all-clear case is stated, not implied
            const notDelivered = rows.filter(r => isFailed(r.status));
            if (!notDelivered.length) {
                console.log(`\nSUMMARY: All ${rows.length} email(s) delivered successfully. No bounces, drops or deferrals.`);
            } else {
                const tally = {};
                notDelivered.forEach(r => { tally[r.status] = (tally[r.status] || 0) + 1; });
                console.log(`\nSUMMARY: ${rows.length - notDelivered.length} delivered, ${notDelivered.length} not delivered (` +
                    Object.entries(tally).map(([s, n]) => `${n} ${s}`).join(', ') + '). Details below.');
            }
        }

        // Open each failed email and print the JSON of its failure events
        for (let i = 0; i < rows.length; i++) {
            if (!isFailed(rows[i].status)) continue;
            await page.goto(rows[i].href);
            await page.getByText('Event History').first().waitFor({ timeout: 30000 });
            console.log(`\n--- #${i + 1} ${rows[i].status}: ${rows[i].subject} ---`);
            console.log(`Details: ${rows[i].href}`);
            // The event table is not a real <table>, so open every "View details" and keep the failure ones
            const links = page.getByText('View details');
            await links.first().waitFor({ timeout: 20000 }).catch(() => {});
            await page.waitForTimeout(1000);
            const n = await links.count();
            console.log(`Event detail links on page: ${n}`);
            let found = 0;
            for (let k = 0; k < n; k++) {
                await links.nth(k).click();
                await page.getByText('Capture this data').waitFor({ timeout: 15000 });
                await page.waitForTimeout(300);
                const body = await page.locator('body').innerText();
                const title = body.match(/[A-Za-z][A-Za-z ]* event at [\d/: ]+/)?.[0] || '';
                if (FAILURE_EVENTS.test(title)) {
                    found++;
                    const from = body.lastIndexOf('Description');
                    const jLabel = body.indexOf('JSON', from);
                    const jStart = body.indexOf('{', jLabel);
                    const jEnd = body.indexOf('Capture this data', jStart);
                    const description = body.slice(from + 'Description'.length, jLabel).trim();
                    console.log(`\n[${title}]\nDescription: ${description}\n${body.slice(jStart, jEnd).trim()}`);
                }
                // close the side panel
                await page.keyboard.press('Escape');
                await page.getByText('Capture this data').waitFor({ state: 'hidden', timeout: 3000 }).catch(async () => {
                    await page.getByRole('button', { name: /close/i }).last().click().catch(() => {});
                    await page.getByText('Capture this data').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
                });
            }
            if (!found) console.log('No failure events found in the event table.');
        }
    } finally {
        await context.close();
    }
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
