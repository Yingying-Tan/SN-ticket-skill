// Exploration only (read only): vu.okta.com -> "fullstory (external)" tile -> app.fullstory.com.
// Prints where it landed, the visible text, and saves a screenshot. Does not search or save anything.
// Usage: node sn-ticket-support/fullstory-explore.cjs [screenshot-path]
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

const shot = process.argv[2] || path.join(__dirname, 'fullstory-explore.png');

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
        console.error('Found tile: ' + (await tile.innerText()).replace(/\s+/g, ' ').trim());
        const [popup] = await Promise.all([
            context.waitForEvent('page', { timeout: 20000 }).catch(() => null),
            tile.click(),
        ]);
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
        // Org chooser: pick Veterans United Home Loans (never Neighbors Bank)
        if (page.url().includes('orgChooser')) {
            await page.getByText('Veterans United Home Loans', { exact: true }).click();
            await page.waitForURL(u => !u.href.includes('orgChooser'), { timeout: 60000 });
        }
        await page.waitForTimeout(8000);
        if (process.env.FS_URL) {
            await page.goto(process.env.FS_URL);
            await page.waitForTimeout(9000);
            // Optional scripted steps (exploration): FS_ACTIONS='[{"click":"Add user filter"},{"fill":["placeholder","value"]},{"press":"Enter"},{"wait":1500}]'
            for (const a of JSON.parse(process.env.FS_ACTIONS || '[]')) {
                if (a.click) await page.getByText(a.click, { exact: a.exact !== false }).first().click();
                else if (a.clickRole) await page.getByRole(a.clickRole[0], { name: a.clickRole[1] }).first().click();
                else if (a.fill) await page.getByPlaceholder(a.fill[0]).first().fill(a.fill[1]);
                else if (a.xy) await page.mouse.click(a.xy[0], a.xy[1]);
                else if (a.type) await page.keyboard.type(a.type, { delay: 30 });
                else if (a.press) await page.keyboard.press(a.press);
                else if (a.wait) await page.waitForTimeout(a.wait);
                await page.waitForTimeout(1200);
            }
            await page.screenshot({ path: shot.replace('.png', '-url.png') });
            console.log('URL: ' + page.url());
            if (process.env.FS_QUIET) {
                const body = await page.locator('body').innerText();
                console.log('SUMMARY: ' + (body.match(/[\d,]+ Users? of [\d,]+[^\n]*\n[^\n]*Sessions[^\n]*/)?.[0] || '(no summary line)').replace(/\n/g, ' '));
                const sess = await page.locator('a[href*="/session/"]').evaluateAll(as => [...new Set(as.map(a => a.href))]);
                console.log('SESSION LINKS (' + sess.length + '):\n' + sess.join('\n'));
                console.log('Screenshot saved');
                return;
            }
            const els = await page.locator('a[href], button, [role="button"], [role="tab"], input').evaluateAll(es => es
                .map(e => ((e.innerText || e.getAttribute('aria-label') || e.placeholder || '').replace(/\s+/g, ' ').trim() + (e.href ? ' -> ' + e.href : '')))
                .filter(t => t && t.length < 160).slice(0, 120));
            console.log('--- controls ---\n' + els.join('\n'));
            console.log('--- text (first 2000) ---\n' + (await page.locator('body').innerText()).slice(0, 2000));
            return;
        }
        if (process.env.FS_SEARCH) {
            await page.goto('https://app.fullstory.com/ui/1002V/spaces/gWu8ZkdNnauu?tab=home&showSearch=true');
            await page.waitForTimeout(6000);
            await page.screenshot({ path: shot.replace('.png', '-search.png') });
            console.log('--- SEARCH PANEL TEXT ---\n' + (await page.locator('body').innerText()).slice(0, 2500));
            if (process.env.FS_QUERY) {
                const box = page.getByPlaceholder(/Search for dashboards, segments/i);
                await box.click();
                await box.fill(process.env.FS_QUERY);
                await page.waitForTimeout(6000);
                await page.screenshot({ path: shot.replace('.png', '-query.png') });
                console.log('--- AFTER TYPING QUERY (text, first 3000) ---\n' + (await page.locator('body').innerText()).slice(0, 3000));
                return;
            }
            const inputs = await page.locator('input, textarea, [role="combobox"], [contenteditable="true"]').evaluateAll(els => els.map(e => (e.tagName + ' ' + (e.placeholder || e.getAttribute('aria-label') || e.id || ''))));
            console.log('--- inputs ---\n' + inputs.join('\n'));
            return;
        }
        const links = await page.locator('a[href], button').evaluateAll(els => els
            .map(e => ((e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim() + (e.href ? ' -> ' + e.href : '')))
            .filter(t => t && t.length < 140).slice(0, 60));
        console.log('--- links/buttons ---\n' + links.join('\n'));
        console.log('URL: ' + page.url());
        console.log('TITLE: ' + await page.title());
        console.log('--- visible text (first 2500 chars) ---');
        console.log((await page.locator('body').innerText()).slice(0, 2500));
        await page.screenshot({ path: shot });
        console.log('Screenshot: ' + shot);
    } finally {
        await context.close();
    }
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
