/* 
 * UNIFIED PLAYWRIGHT AI TEST ENGINE
 * Stage 2: Crawler + Login + AI Analysis + Reporting
 */

// 1. SET ENVIRONMENT FIRST
const path = require('path');
const fs = require('fs');
const { URL } = require('url');
const localPlaywrightPath = path.join(__dirname, '.playwright');
if (fs.existsSync(localPlaywrightPath)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = localPlaywrightPath;
}

// 2. Load dependencies
const { chromium } = require('playwright');
const OpenAI = require('openai');
const readline = require('readline');
const yaml = require('js-yaml');
require('dotenv').config();

// Config Load
let config = {};
try {
    if (fs.existsSync('config.yml')) {
        config = yaml.load(fs.readFileSync('config.yml', 'utf8'));
    }
} catch (e) {
    console.error('Error loading config.yml:', e.message);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

async function getElementData(page) {
    return await page.evaluate(() => {
        const getInfo = (el) => ({
            tagName: el.tagName.toLowerCase(),
            id: el.id || null,
            className: el.className || null,
            text: el.innerText ? el.innerText.substring(0, 60).replace(/\s+/g, ' ').trim() : null,
            type: el.getAttribute('type') || null,
            name: el.getAttribute('name') || null
        });

        const categories = {
            forms: [],
            inputs: [],
            buttons: [],
            links: []
        };

        document.querySelectorAll('form').forEach(f => categories.forms.push(getInfo(f)));
        document.querySelectorAll('input, textarea, select').forEach(i => categories.inputs.push(getInfo(i)));
        document.querySelectorAll('button, [role="button"]').forEach(b => categories.buttons.push(getInfo(b)));
        document.querySelectorAll('a[href]').forEach(a => {
            if (a.href.startsWith('http')) categories.links.push({ ...getInfo(a), href: a.href });
        });

        return categories;
    });
}

async function attemptLogin(page, url) {
    if (!config || !config.password) return false;

    try {
        const loginSelectors = await page.evaluate(() => {
            const userSelector = 'input[type="text"], input[type="email"], input[name*="user"], input[name*="email"], input[id*="user"], input[id*="username"]';
            const passSelector = 'input[type="password"]';
            const submitSelector = 'button[type="submit"], input[type="submit"], button:not([type="button"]), #loginbtn, .login-button';

            const u = document.querySelector(userSelector);
            const p = document.querySelector(passSelector);
            if (u && p) {
                return { userSelector, passSelector, submitSelector };
            }
            return null;
        });

        if (loginSelectors) {
            console.log(`🔑 Login form detected on ${url}. Attempting login...`);
            const username = config.use_email ? config.email : config.username;
            await page.fill(loginSelectors.userSelector, username);
            await page.fill(loginSelectors.passSelector, config.password);

            // Highlight for visibility
            await page.evaluate(({ userSelector, passSelector }) => {
                const u = document.querySelector(userSelector);
                const p = document.querySelector(passSelector);
                if (u) u.style.border = '2px solid green';
                if (p) p.style.border = '2px solid green';
            }, { userSelector: loginSelectors.userSelector, passSelector: loginSelectors.passSelector });

            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => { }), // Wait for navigation after click
                page.click(loginSelectors.submitSelector)
            ]);

            console.log('✅ Login attempted.');
            return true;
        }
    } catch (e) {
        console.error('⚠️ Login attempt failed:', e.message);
    }
    return false;
}

async function main() {
    console.log('\n🚀 --- UNIFIED AI TEST ENGINE STARTING --- 🚀');

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('❌ Error: OPENAI_API_KEY not found in .env');
        process.exit(1);
    }

    let startUrl = process.argv[2] || await askQuestion('Please enter the Website URL: ');
    if (!startUrl || !startUrl.startsWith('http')) {
        console.error('❌ Invalid URL.');
        process.exit(1);
    }

    // Prepare Output Directory
    const domain = new URL(startUrl).hostname;
    const outputDir = path.join(__dirname, domain);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const siteAnalysisPath = path.join(outputDir, 'site_analysis.json');
    const testCasesPath = path.join(outputDir, 'test_cases.json');
    const csvPath = path.join(outputDir, 'test_cases.csv');

    try {
        // --- STAGE 1: CRAWLING ---
        console.log(`\n📡 [Stage 1/2] Crawling Site: ${startUrl}`);
        const browser = await chromium.launch({ headless: false });
        const context = await browser.newContext();
        const page = await context.newPage();

        const visited = new Set();
        const queue = [startUrl];
        const results = {};
        const MAX_PAGES = 100; // Increased to cover more of the site
        let loggedIn = false;

        while (queue.length > 0 && visited.size < MAX_PAGES) {
            const url = queue.shift();
            const cleanUrl = url.split('#')[0].replace(/\/$/, ""); // Normalize

            if (visited.has(cleanUrl)) continue;
            visited.add(cleanUrl);

            console.log(`   Scanning [${visited.size}/${MAX_PAGES}]: ${cleanUrl} (Queue: ${queue.length})`);
            try {
                await page.goto(cleanUrl, { waitUntil: 'networkidle', timeout: 30000 });

                // Attempt login if not already logged in
                if (!loggedIn) {
                    const loginHandled = await attemptLogin(page, cleanUrl);
                    if (loginHandled) {
                        loggedIn = true;
                        // After login, we might need to refresh element data or wait for navigation
                        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
                    }
                }

                const data = await getElementData(page);
                results[cleanUrl] = data;

                // Add same-domain links to queue
                data.links.forEach(l => {
                    try {
                        const lUrl = new URL(l.href);
                        const href = l.href.split('#')[0].replace(/\/$/, "");

                        // SKIPS: Skip external domains, logout links, and already visited/queued links
                        if (lUrl.hostname === domain &&
                            !visited.has(href) &&
                            !queue.includes(href) &&
                            !href.toLowerCase().includes('logout') &&
                            !href.toLowerCase().includes('signout')) {
                            queue.push(href);
                        }
                    } catch (e) { }
                });

            } catch (e) {
                console.error(`   ⚠️ Failed to scan ${cleanUrl}: ${e.message}`);
            }
        }

        fs.writeFileSync(siteAnalysisPath, JSON.stringify(results, null, 2));
        await browser.close();
        console.log(`✅ Scan complete. Saved visibility to ${siteAnalysisPath}`);

        // --- STAGE 2: AI ANALYSIS ---
        console.log('\n🤖 [Stage 2/2] AI Generating Test Cases (Chunked Analysis)...');
        const openai = new OpenAI({ apiKey });

        const urls = Object.keys(results);
        const CHUNK_SIZE = 10; // Process 10 pages at a time to stay under token limits
        let allTestCases = {
            functional: [],
            ui_interaction: [],
            authentication: [],
            validation: [],
            end_to_end: []
        };

        for (let i = 0; i < urls.length; i += CHUNK_SIZE) {
            const chunkUrls = urls.slice(i, i + CHUNK_SIZE);
            const chunkData = {};
            chunkUrls.forEach(u => chunkData[u] = results[u]);

            console.log(`   Processing chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(urls.length / CHUNK_SIZE)}...`);

            try {
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        {
                            role: "system",
                            content: `You are a Senior QA Automation Engineer. Based on the provided site scan data, generate detailed Playwright test cases.
You MUST return a JSON object with exactly these keys: "functional", "ui_interaction", "authentication", "validation", "end_to_end".
Each key must map to an array of test case objects. Each test case object must have:
- "title" (string)
- "description" (string)
- "steps" (array of strings) - These MUST be formatted as pseudo-code or Playwright actions (e.g. "await page.click('#loginbtn')") based on the provided selectors.
- "expected" (string)

Crucial Requirements:
1. Use the actual 'id', 'className', or 'name' attributes found in the scan data for selectors.
2. Ensure the steps are technically accurate and logical for a Playwright script.
3. If labels accompany inputs, use those labels to describe the intent of the step.`
                        },
                        {
                            role: "user",
                            content: `Analyze this site structure chunk and generate test cases: ${JSON.stringify(chunkData)}`
                        }
                    ],
                    response_format: { type: "json_object" }
                });

                const chunkResults = JSON.parse(response.choices[0].message.content);

                // Build a normalized key map from the AI response
                const keyMap = {};
                Object.keys(chunkResults).forEach(key => {
                    const normalized = key.toLowerCase().replace(/[\s_-]+/g, '_').replace(/[^a-z_]/g, '');
                    keyMap[normalized] = key;
                });

                // Map common AI response key variations to our expected categories
                const categoryAliases = {
                    functional: ['functional'],
                    ui_interaction: ['ui_interaction', 'ui_interactions', 'uiinteraction', 'ui'],
                    authentication: ['authentication', 'auth'],
                    validation: ['validation', 'input_validation', 'inputvalidation'],
                    end_to_end: ['end_to_end', 'endtoend', 'e_e_workflows', 'ee_workflows', 'e2e', 'e2e_workflows']
                };

                // Merge results with flexible key matching
                Object.keys(allTestCases).forEach(cat => {
                    // First try exact match
                    if (chunkResults[cat] && Array.isArray(chunkResults[cat])) {
                        allTestCases[cat].push(...chunkResults[cat]);
                        return;
                    }
                    // Then try alias matching via normalized keys
                    const aliases = categoryAliases[cat] || [cat];
                    for (const alias of aliases) {
                        const originalKey = keyMap[alias];
                        if (originalKey && chunkResults[originalKey]) {
                            const items = Array.isArray(chunkResults[originalKey]) ? chunkResults[originalKey] : [chunkResults[originalKey]];
                            allTestCases[cat].push(...items);
                            break;
                        }
                    }
                });

                // Also capture any unmatched categories from the AI response
                Object.keys(chunkResults).forEach(key => {
                    const normalized = key.toLowerCase().replace(/[\s_-]+/g, '_').replace(/[^a-z_]/g, '');
                    const alreadyMapped = Object.values(categoryAliases).some(aliases => aliases.includes(normalized));
                    if (!alreadyMapped && Array.isArray(chunkResults[key]) && chunkResults[key].length > 0) {
                        if (!allTestCases[normalized]) allTestCases[normalized] = [];
                        allTestCases[normalized].push(...chunkResults[key]);
                    }
                });
            } catch (e) {
                console.error(`   ⚠️ Error processing chunk ${i}: ${e.message}`);
            }
        }

        fs.writeFileSync(testCasesPath, JSON.stringify(allTestCases, null, 2));

        // Generate CSV
        const header = ['Category', 'Title', 'Description', 'Steps', 'Expected'];
        const rows = [header];
        Object.keys(allTestCases).forEach(cat => {
            allTestCases[cat].forEach(tc => {
                rows.push([
                    cat,
                    tc.title || '',
                    tc.description || '',
                    Array.isArray(tc.steps) ? tc.steps.join('; ') : (tc.steps || ''),
                    tc.expected || ''
                ]);
            });
        });
        fs.writeFileSync(csvPath, rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'));

        console.log(`\n✨ SUCCESS! Stage 2 Complete.`);
        console.log(`📁 Total pages analyzed: ${urls.length}`);
        console.log(`📁 Files generated in directory: /${domain}/`);
        console.log(`- site_analysis.json\n- test_cases.json\n- test_cases.csv`);

    } catch (err) {
        console.error('\n🛑 Fatal Engine Error:', err.message);
    } finally {
        rl.close();
    }
}

main();
