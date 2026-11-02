// Usage: node sn-ticket-support/controltower-bo-lookup.cjs <email|username|phone> [--show phones,profile,mfa,opps] [--mfa-limit N]
// Opens Control Tower (https://passport.p.vu.local/mastercontrolprogram/) in a visible Chromium, searches,
// opens "Details" for each ENROLLED match (max 3) and prints only the requested sections (default: all).
// A not-enrolled contact (no Enrolled Brand / Username / PassportAccountId on its card) is reported from
// the card alone and Details are not opened, unless --details is passed.
// READ ONLY. MUST NOT click Unlock / Obliterate / Reset factors / Grant MFA bypass until the user approves it. Also Resend
// enrollment buttons: this script never clicks them.
// Reminders (FLAG lines) are always printed, whatever --show says:
//   - Username differs from the email address
//   - Co-Borrower email or username is the same as the borrower's
const { chromium } = require('../node_modules/playwright');
const path = require('path');
const fs = require('fs');

// Project's Playwright expects a Chromium build that is not installed: use the newest installed one.
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

const args = process.argv.slice(2);
const term = args.find(a => !a.startsWith('--') && (args[args.indexOf(a) - 1] || '').startsWith('--') === false);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };
const show = new Set(opt('show', 'phones,profile,mfa,opps').split(',').map(s => s.trim()));
const mfaLimit = parseInt(opt('mfa-limit', '10'), 10);
const forceDetails = args.includes('--details');

if (!term) {
    console.error('Usage: node sn-ticket-support/controltower-bo-lookup.cjs <email|username|phone> [--show phones,profile,mfa,opps] [--mfa-limit N]');
    process.exit(1);
}

const norm = s => (s || '').trim().toLowerCase();
const isNone = s => !s || ['n/a', 'none', ''].includes(norm(s));
const OPP_LABELS = ['Brand', 'Display Name', 'Loan Number', 'Property State', 'Loan Status', 'Opportunity Type', 'Created Date',
    'Loan Officer', 'Opportunity CRM Link', 'Co-Borrower Name', 'Co-Borrower Email', 'Co-Borrower Username',
    'Co-Borrower ProfileId', 'Co-Borrower PassportAccountId', 'Co-Borrower CRM Link'];
const KNOWN = new Set(['Email', 'Contact Guid', 'Home Phone Number', 'Mobile Phone Number', 'Last MyVU Login Date',
    'Last MyVU App Login Date', 'Brand', 'Profile ID', 'PassportAccount ID', 'Created Date', 'Updated Date', 'Username', 'MFA Logs']);

// value on the line after a label, or '' if the next line is another label (empty value)
function field(lines, label) {
    const i = lines.indexOf(label);
    if (i < 0 || i + 1 >= lines.length) return '';
    return KNOWN.has(lines[i + 1]) ? '' : lines[i + 1];
}

function parseModal(text) {
    const lines = text.slice(text.indexOf('Contact Information')).split('\n').map(l => l.trim()).filter(Boolean);
    const idx = l => lines.indexOf(l);
    const pStart = idx('Profile Information'), mStart = idx('MFA Logs'), oStart = idx('Borrower Opportunities');
    // A not-enrolled contact may have no Profile / MFA / Opportunities sections at all
    const end = lines.length;
    const contact = lines.slice(0, pStart >= 0 ? pStart : end);
    const profile = pStart >= 0 ? lines.slice(pStart, mStart >= 0 ? mStart : end) : [];

    if (process.env.CT_DEBUG) console.log('DEBUG mStart=' + mStart + ' ' + JSON.stringify(lines.slice(mStart, mStart + 14)));
    const stopAt = lines.findIndex((l, i) => i > mStart && /^(Open contact in CRM|View Client Profile)$/.test(l));
    const hdr = mStart >= 0 ? lines.indexOf('Status Description', mStart) : -1;
    const mfaLines = hdr >= 0 ? lines.slice(hdr + 1, stopAt > 0 ? stopAt : (oStart >= 0 ? oStart : end)) : [];
    const mfa = [];
    for (let i = 0; i + 3 < mfaLines.length; i += 4) mfa.push({ sent: mfaLines[i], type: mfaLines[i + 1], status: mfaLines[i + 2], desc: mfaLines[i + 3] });

    const opps = [];
    for (let i = Math.max(oStart, 0); i < lines.length; i++) {
        if (lines[i] === 'Brand' && lines[i + 1] === 'Display Name') {
            const vals = lines.slice(i + OPP_LABELS.length, i + 2 * OPP_LABELS.length);
            const o = {};
            OPP_LABELS.forEach((k, j) => { o[k] = vals[j] || ''; });
            opps.push(o);
        }
    }
    return {
        email: field(contact, 'Email'), guid: field(contact, 'Contact Guid'),
        home: field(contact, 'Home Phone Number'), mobile: field(contact, 'Mobile Phone Number'),
        lastLogin: field(contact, 'Last MyVU Login Date'), lastAppLogin: field(contact, 'Last MyVU App Login Date'),
        brand: field(profile, 'Brand'), profileId: field(profile, 'Profile ID'), passportId: field(profile, 'PassportAccount ID'),
        created: field(profile, 'Created Date'), updated: field(profile, 'Updated Date'),
        username: field(profile, 'Username'), profileEmail: field(profile, 'Email'),
        mfa, opps, oppsRaw: oStart >= 0 ? lines.length - oStart : 0,
    };
}

// Result card text: "CONTACT / <name> / Details / <email> <phone> Created: <date>" and, for an enrolled
// contact only, "Enrolled Brand: / Username: / PassportAccountId:" followed by their values.
function parseCard(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const contactLine = lines.find(l => /Created:/.test(l)) || '';
    const at = lines.indexOf('PassportAccountId:');
    const values = at >= 0 ? lines.slice(at + 1) : [];
    return {
        type: lines[0] || '', // CONTACT or LEAD; leads show "Lead Brand:" instead of enrollment fields
        name: lines[1] || '',
        email: (contactLine.match(/^\S+@\S+/) || [''])[0],
        phone: (contactLine.match(/\(\d{3}\) \d{3}-\d{4}/) || [''])[0],
        created: (contactLine.match(/Created:\s*(.*)$/) || ['', ''])[1],
        notEnrolled: values.length === 0,
    };
}

// Enrollment = Enrolled Brand + Username + PassportAccountId. All three missing = not enrolled.
function enrollment({ brand, username, passportId }) {
    const missing = [['Enrolled Brand', brand], ['Username', username], ['PassportAccountId', passportId]]
        .filter(([, v]) => isNone(v)).map(([k]) => k);
    if (missing.length === 3) return { state: 'NOT ENROLLED', text: 'This account is NOT ENROLLED: no enrolled brand, username or PassportAccountId.' };
    if (missing.length) return { state: 'PARTIAL', text: `Account looks only PARTIALLY enrolled: missing ${missing.join(', ')}.` };
    return { state: 'ENROLLED', text: 'Enrolled.' };
}

// "+1*******82" -> which phone on file ends with those digits
function whichPhone(desc, home, mobile) {
    const m = desc.match(/\+1\*+(\d+)/);
    if (!m) return '';
    const tail = m[1], digits = s => (s || '').replace(/\D/g, '');
    const h = digits(home).endsWith(tail), mo = digits(mobile).endsWith(tail);
    return h && mo ? 'home or mobile' : h ? 'home' : mo ? 'mobile' : 'no phone on file matches';
}

(async () => {
    const context = await chromium.launchPersistentContext(path.join(__dirname, '.controltower-profile'), {
        headless: !args.includes('--show-browser'), executablePath: chromiumPath(), viewport: { width: 1400, height: 1000 }, ignoreHTTPSErrors: true,
    });
    try {
        const page = context.pages()[0] || await context.newPage();
        // Fresh page + search. Also used between contacts, because the Details modal does not close
        // reliably with Escape and then blocks clicks on the next card.
        const search = async () => {
            await page.goto('https://passport.p.vu.local/mastercontrolprogram/', { timeout: 45000 });
            const box = page.getByPlaceholder('Email/Phone...');
            await box.fill(term);
            await box.press('Enter');
            await page.waitForFunction(() => /Details|No results to display/.test(document.body.innerText), null, { timeout: 30000 });
            await page.waitForTimeout(1500);
        };
        await search();
        const cards = await page.locator('search-result').evaluateAll(els => els.map(e => e.innerText));
        if (!cards.length) { console.log(`No Control Tower match for "${term}".`); return; }
        const parsed = cards.map(parseCard);

        // The search returns CONTACT records (enrolled MyVU accounts) and LEAD records, often several leads
        // for one email. Open only CONTACT records (exact email match when searching by email); list the
        // others so nothing is hidden. If there is no CONTACT, nothing is opened, only listed.
        let todo = parsed.map((c, i) => i);
        if (cards.length > 1) {
            if (term.includes('@')) {
                const exact = todo.filter(i => norm(parsed[i].email) === norm(term));
                if (exact.length) todo = exact;
            }
            todo = todo.filter(i => parsed[i].type === 'CONTACT');
            const others = parsed.filter((c, i) => !todo.includes(i));
            console.log(`NOTE: ${cards.length} records matched "${term}": ${todo.length} CONTACT (opened), ${others.length} other (not opened).`);
            others.forEach(c => console.log(`  ${c.type} | ${c.name} | ${c.email} | ${c.phone || 'no phone'} | created ${c.created}`));
        } else if (parsed[0].type !== 'CONTACT') {
            console.log(`NOTE: the only match is a ${parsed[0].type} record (${parsed[0].name}, ${parsed[0].email}, ${parsed[0].phone || 'no phone'}, created ${parsed[0].created}); it is not an enrolled contact, so Details were not opened.`);
            todo = [];
        }
        todo = todo.slice(0, 3);

        for (let t = 0; t < todo.length; t++) {
            const k = todo[t];
            if (t > 0) await search();
            // The result card already shows Enrolled Brand / Username / PassportAccountId. A not-enrolled
            // contact has none of them, so there is no need to open Details (unless --details is given).
            const card = parsed[k];
            if (card.notEnrolled && !forceDetails) {
                console.log(`\n===== Control Tower: ${card.email || term} =====`);
                console.log('\nENROLLMENT: This account is NOT ENROLLED: no enrolled brand, username or PassportAccountId.');
                console.log(`\nCONTACT ON CARD\n  Name: ${card.name}\n  Email: ${card.email}\n  Phone: ${card.phone || 'none'}\n  Created: ${card.created}`);
                console.log('\nDetails not opened because the account is not enrolled (use --details to open them anyway).');
                continue;
            }
            await page.locator('search-result').nth(k).getByText('Details', { exact: true }).click();
            await page.getByText('Contact Information').waitFor({ timeout: 20000 });
            // Expand MFA Logs (read-only toggle). The modal re-renders as data loads and can collapse the
            // section again, so wait for it to settle and re-click until the table header is visible.
            await page.waitForTimeout(3000);
            const header = page.getByText('Date/Time Sent');
            const hasMfaSection = (await page.getByText('MFA Logs', { exact: true }).count()) > 0;
            for (let attempt = 0; hasMfaSection && attempt < 3 && !(await header.isVisible().catch(() => false)); attempt++) {
                await page.getByText('MFA Logs', { exact: true }).click();
                await header.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
            }
            const mfaOpen = await header.isVisible().catch(() => false);
            await page.waitForTimeout(1000);
            const d = parseModal(await page.locator('body').innerText());

            console.log(`\n===== Control Tower: ${d.email || term} (${d.brand || 'no brand'}) =====`);
            const enr = enrollment(d);
            console.log('\nENROLLMENT: ' + enr.text);
            if (show.has('phones')) {
                console.log(`\nPHONES\n  Home:   ${d.home || 'none'}\n  Mobile: ${d.mobile || 'none'}`);
            }
            if (show.has('profile')) {
                console.log(`\nPROFILE\n  Username: ${d.username}\n  Email: ${d.profileEmail || d.email}\n  Profile ID: ${d.profileId}\n  Contact Guid: ${d.guid}` +
                    `\n  Created: ${d.created}   Updated: ${d.updated}\n  Last MyVU login: ${d.lastLogin}   Last app login: ${d.lastAppLogin}`);
            }
            if (show.has('mfa') && !hasMfaSection) {
                console.log('\nMFA LOGS: this contact has no MFA Logs section.');
            } else if (show.has('mfa') && !mfaOpen) {
                console.log('\nMFA LOGS: could not expand the MFA Logs section; check the window by hand.');
            } else if (show.has('mfa')) {
                const failed = d.mfa.filter(r => r.status !== 'SUCCESS');
                console.log(`\nMFA LOGS (${d.mfa.length} rows: ${d.mfa.length - failed.length} SUCCESS, ${failed.length} not SUCCESS; times as shown by Control Tower)`);
                console.log('  Sent | Type | Delivery | Description | Phone');
                d.mfa.slice(0, mfaLimit).forEach(r => console.log(`  ${r.sent} | ${r.type} | ${r.status} | ${r.desc}` +
                    (/\+1\*/.test(r.desc) ? ` | ${whichPhone(r.desc, d.home, d.mobile)}` : '')));
                if (d.mfa.length > mfaLimit) console.log(`  ... ${d.mfa.length - mfaLimit} more (use --mfa-limit)`);
            }
            if (show.has('opps')) {
                console.log(`\nBORROWER OPPORTUNITIES (${d.opps.length})`);
                d.opps.forEach(o => console.log(`  ${o['Loan Number']} | Display Name: ${o['Display Name'] || '(blank)'} | ${o['Loan Status']} | ${o['Opportunity Type']} | ${o['Property State']} | created ${o['Created Date']} | co-borrower: ${o['Co-Borrower Name']}` +
                    (isNone(o['Co-Borrower Email']) ? '' : ` <${o['Co-Borrower Email']}> / ${o['Co-Borrower Username']}`)));
            }

            // Reminders: always shown
            const flags = [];
            if (enr.state !== 'ENROLLED') flags.push(enr.text);
            if (d.username && d.email && norm(d.username) !== norm(d.email)) {
                flags.push(`Username (${d.username}) is DIFFERENT from the email address (${d.email}).`);
            }
            d.opps.forEach(o => {
                const cbE = norm(o['Co-Borrower Email']), cbU = norm(o['Co-Borrower Username']);
                const mine = [norm(d.email), norm(d.username)].filter(Boolean);
                if (!isNone(cbE) && mine.includes(cbE)) flags.push(`Loan ${o['Loan Number']}: Co-Borrower Email is the SAME as the borrower (${o['Co-Borrower Email']}).`);
                if (!isNone(cbU) && mine.includes(cbU)) flags.push(`Loan ${o['Loan Number']}: Co-Borrower Username is the SAME as the borrower (${o['Co-Borrower Username']}).`);
            });
            if (d.opps.length === 0 && d.oppsRaw > 5) flags.push('Opportunities were on the page but could not be parsed; check the screenshot or page by hand.');
            console.log('\nREMINDERS');
            if (flags.length) flags.forEach(f => console.log('  FLAG: ' + f));
            else console.log('  None: username matches the email, and no co-borrower shares the borrower\'s email or username.');

            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
        }
    } finally {
        await context.close();
    }
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
