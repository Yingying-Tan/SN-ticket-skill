// Usage: node sn-ticket-support/vuplus-open.cjs
// Opens VU+ (Productivity Afterburner > Pipeline Summary) in a visible Chromium, signed in through Okta
// single sign-on, and leaves it open for the user. Closes when the user closes the window.
// Read-only: it only opens the page; it never clicks or types.
// The profile is persisted so the Okta session is reused between runs.
const { chromium } = require('../node_modules/playwright');
const fs = require('fs');
const path = require('path');

const URL_VUPLUS = 'https://vuplus.p.vu.local/ProductivityAfterburner/pipelinesummary';

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
    const context = await chromium.launchPersistentContext(path.join(__dirname, '.vuplus-profile'), {
        headless: false,
        executablePath: chromiumPath(),
        viewport: null,
    });
    const page = context.pages()[0] || await context.newPage();
    await page.goto(URL_VUPLUS, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('VU+ is open. Close the window when you are done.');
    await new Promise(resolve => context.on('close', resolve));
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
