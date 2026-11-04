// Usage: node sn-ticket-support/vuplus-loan-search.cjs <loan number> [--show-browser]
// VU+ (Productivity Afterburner > Pipeline Summary): clears every filter chip (User, status), searches by the loan number only
// and prints the result list. Headless by default; --show-browser to watch or to sign in by hand (Okta SSO normally needs no prompt).
// Read only: it only changes the page's search filters and clicks Search. It never opens a loan or clicks any loan action.
// Profile: sn-ticket-support/.vuplus-profile (sign-in session; git-ignored, never share).
const { chromium } = require('../node_modules/playwright');
const fs = require('fs');
const path = require('path');

const showBrowser = process.argv.includes('--show-browser');
const loan = process.argv.slice(2).find(a => !a.startsWith('--'));
if (!loan || !/^\d{6,}$/.test(loan)) {
    console.error('Usage: node sn-ticket-support/vuplus-loan-search.cjs <loan number> [--show-browser]');
    process.exit(1);
}

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
    const context = await chromium.launchPersistentContext(path.join(__dirname, '.vuplus-profile'), {
        headless: !showBrowser,
        executablePath: chromiumPath(),
        viewport: { width: 1500, height: 1000 },
        ignoreHTTPSErrors: true,
    });
    try {
        const page = context.pages()[0] || await context.newPage();
        await page.goto('https://vuplus.p.vu.local/ProductivityAfterburner/pipelinesummary', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.getByPlaceholder('Loan Number').waitFor({ timeout: showBrowser ? 180000 : 45000 });
        await page.waitForTimeout(3000);
        // Clear the filter chips ("x<name>", e.g. the User and the "Active" status) so only the loan number filters the search
        const cleared = [];
        for (let i = 0; i < 6; i++) {
            const chip = page.locator('span, div, li').filter({ hasText: /^×\s*\S/ }).filter({ hasNotText: 'Reset' }).last();
            if (!(await chip.count())) break;
            const t = (await chip.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
            if (!/^×\s*\S/.test(t) || t.length > 40) break;
            cleared.push(t.replace(/^×\s*/, ''));
            await chip.click({ position: { x: 6, y: 6 } }).catch(() => {});
            await page.waitForTimeout(600);
        }
        await page.getByPlaceholder('Loan Number').fill(loan);
        await page.getByRole('button', { name: 'Search' }).click();
        await page.waitForFunction(() => /Loan List: \d+ Results?/.test(document.body.innerText), null, { timeout: 30000 });
        await page.waitForTimeout(3000);
        const text = await page.evaluate(() => document.body.innerText);
        const i = text.indexOf('Loan List');
        console.log(`VU+ loan search: ${loan}`);
        console.log(`Filters cleared: ${cleared.length ? cleared.join(', ') : 'none'}`);
        console.log(text.slice(i).split('\n').map(s => s.trim()).filter(Boolean).join(' | '));
    } finally {
        await context.close();
    }
})().catch(e => { console.error('ERROR: ' + e.message + (showBrowser ? '' : ' (if this is a sign-in problem, rerun with --show-browser)')); process.exit(1); });
