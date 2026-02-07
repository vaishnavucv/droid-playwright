const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const yaml = require('js-yaml');

// Load config
let config = {};
try {
    if (fs.existsSync('config.yml')) {
        config = yaml.load(fs.readFileSync('config.yml', 'utf8'));
    }
} catch (e) {
    console.error('Error loading config.yml:', e);
}

// Load link rules
let linkRules = { include: [], exclude: [] };
try {
    if (fs.existsSync('link-rules.json')) {
        const rulesContent = fs.readFileSync('link-rules.json', 'utf8');
        if (rulesContent.trim()) {
            linkRules = JSON.parse(rulesContent);
        }
    }
} catch (e) {
    console.error('Error loading link-rules.json:', e);
}

const MAX_PAGES = 50; // Limit to avoid infinite crawl
const TIMEOUT = 30000;

function log(msg, type = 'log') {
    // Default to stderr to avoid breaking MCP stdio
    if (type === 'error') console.error(msg);
    else console.error(msg);
}

async function scanPage(page, url, timeout = TIMEOUT) {
    log(`Scanning: ${url}`);
    try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: timeout });
    } catch (e) {
        log(`Failed to load ${url}: ${e.message}`, 'error');
        return null;
    }

    // Extract data first
    const data = await page.evaluate(() => {
        const getElementInfo = (el) => {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return null; // Skip invisible

            return {
                tagName: el.tagName.toLowerCase(),
                id: el.id || null,
                className: el.className instanceof SVGAnimatedString ? el.className.baseVal : el.className,
                text: el.innerText ? el.innerText.substring(0, 50).replace(/\s+/g, ' ').trim() : null,
                attributes: Array.from(el.attributes).reduce((acc, attr) => {
                    acc[attr.name] = attr.value;
                    return acc;
                }, {}),
                rect: {
                    x: Math.round(rect.x),
                    y: Math.round(rect.y),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height)
                }
            };
        };

        const categories = {
            ui_components: [],
            clickable_controls: [],
            input_fields: [],
            forms: [],
            authentication_points: [], // Heuristic
            navigation_paths: [],
            file_upload: [],
            file_download: [], // Heuristic
            drag_drop: [], // Heuristic
            generic_dom: [] // Just significant ones
        };

        // Helper to categorize
        const categorize = (el) => {
            const info = getElementInfo(el);
            if (!info) return;

            const tag = info.tagName;
            const type = el.getAttribute('type');
            const role = el.getAttribute('role');
            // const ariaLabel = el.getAttribute('aria-label') || ''; // Unused
            // const outerHTML = el.outerHTML.toLowerCase(); // unused

            // Generic Clickable (Very loose definition to catch everything)
            if (tag === 'button' || role === 'button' || type === 'submit' || type === 'button' || type === 'reset' || el.onclick || el.getAttribute('ng-click') || el.getAttribute('@click')) {
                categories.clickable_controls.push(info);
            }
            if (tag === 'a') {
                // If it has href, it's nav or link. If not, maybe just clickable anchor.
                if (el.href) {
                    // Check if it's an image link
                    if (/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(el.href)) {
                        // It's a link to an image - maybe file_download or just a resource
                        // Let's put it in generic_dom or a new category if we had one, 
                        // but properly mapping to 'file_download' or just ignoring navigation to it is key.
                        // User said "if there is any images... don't open... just record them".
                        // So we want to list it.
                    } else {
                        // Check if inside a nav
                        if (el.closest('nav') || el.closest('header') || el.closest('footer')) {
                            categories.navigation_paths.push(info);
                        } else {
                            // Link but maybe control?
                            categories.clickable_controls.push(info);
                        }
                    }
                } else {
                    categories.clickable_controls.push(info);
                }
            }

            // Input Fields
            if (tag === 'input' || tag === 'textarea' || tag === 'select') {
                categories.input_fields.push(info);

                // File Upload
                if (tag === 'input' && type === 'file') {
                    categories.file_upload.push(info);
                }
            }

            // Forms
            if (tag === 'form') {
                categories.forms.push(info);

                // Authentication Heuristic
                const text = (el.innerText || '').toLowerCase();
                const action = (el.getAttribute('action') || '').toLowerCase();
                if (text.includes('login') || text.includes('sign in') || text.includes('register') || text.includes('password') ||
                    action.includes('login') || action.includes('auth')) {
                    categories.authentication_points.push(info);
                }
            }

            // Authentication (Inputs)
            if (tag === 'input' && (type === 'password' || (el.name && el.name.toLowerCase().includes('password')))) {
                categories.authentication_points.push(info);
            }

            // Drag and Drop
            if (el.draggable || role === 'application' || (el.className && typeof el.className === 'string' && el.className.includes('draggable'))) {
                categories.drag_drop.push(info);
            }

            // UI Components (Heuristic)
            if (role && role !== 'presentation' && role !== 'none' && role !== 'button' && role !== 'link') {
                categories.ui_components.push(info); // Semantic roles other than basic interactions
            }
            if (tag === 'header' || tag === 'footer' || tag === 'main' || tag === 'aside' || tag === 'nav' || tag === 'article' || tag === 'section') {
                categories.ui_components.push(info);
            }
            if (el.className && typeof el.className === 'string' && (el.className.includes('card') || el.className.includes('modal') || el.className.includes('dialog'))) {
                categories.ui_components.push(info);
            }

            // File Download & Images
            if (tag === 'img') {
                // It's an image. User said "just record them".
                // We'll put them in generic_dom or maybe categorize as 'ui_components' -> 'image'?
                // Or let's piggyback on 'file_download' if it's a link to image, but this is a tag.
                // Let's add them to generic_dom for now or create a pseudo category in results if needed.
                // The structure requested doesn't have "images".
                // "UI components" seems best fit for images.
                categories.ui_components.push({ ...info, type: 'image' });
            }

            if (tag === 'a' && (el.hasAttribute('download') || (el.href && /\.(pdf|zip|docx|xlsx|csv|exe|dmg|iso)$/i.test(el.href)))) {
                categories.file_download.push(info);
            }
            // Check for image links specifically to satisfy "don't open... just record"
            if (tag === 'a' && el.href && /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(el.href)) {
                categories.file_download.push({ ...info, type: 'image_link' });
            }

            // DOM Elements (Requirement: "DOM elements")
            // Capturing significant DOM elements that might be useful for automation reference
            if ((tag === 'div' || tag === 'span' || tag === 'section' || tag === 'article') && (el.id || el.getAttribute('name') || el.getAttribute('data-testid'))) {
                categories.generic_dom.push(info);
            }
        };

        // Walk the DOM
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => categorize(el));

        return categories;
    });

    // Also extract links for crawling
    const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]'))
            .map(a => a.href)
            .filter(href => href.startsWith('http') && !/\.(jpg|jpeg|png|gif|bmp|webp|svg|pdf|zip|docx|exe|dmg)$/i.test(href));
    });

    // Check for login forms and attempt login if config provided
    // Do this AFTER extraction so we don't lose the context if navigation happens
    if (config && (config.username || config.email) && config.password) {
        try {
            // First find selectors
            const loginSelectors = await page.evaluate((creds) => {
                // Heuristics for username/email
                let userSelector = 'input[type="text"], input[type="email"], input[name*="user"], input[name*="email"], input[name*="login"]';
                // Try to find a precise match if possible to avoid generic text inputs
                if (document.querySelector('input[name="username"]')) userSelector = 'input[name="username"]';
                else if (document.querySelector('input[name="email"]')) userSelector = 'input[name="email"]';
                else if (document.querySelector('input[name="login"]')) userSelector = 'input[name="login"]';

                // Heuristics for password
                let passSelector = 'input[type="password"], input[name*="pass"]';
                if (document.querySelector('input[name="password"]')) passSelector = 'input[name="password"]';

                // Submit button
                let submitSelector = 'button[type="submit"], input[type="submit"], button:not([type="button"])';

                // Verify existence
                if (document.querySelector(userSelector) && document.querySelector(passSelector)) {
                    return { userSelector, passSelector, submitSelector };
                }
                return null;
            });

            if (loginSelectors) {
                log('Found login form on ' + url);
                const { userSelector, passSelector, submitSelector } = loginSelectors;

                // Determine username to use
                let usernameToUse = config.username;
                if (config.use_email && config.email) usernameToUse = config.email;
                else if (config.use_username && config.username) usernameToUse = config.username;
                else {
                    // Fallback logic
                    if (config.email && (userSelector.includes('email'))) {
                        usernameToUse = config.email;
                    }
                }

                if (usernameToUse) {
                    await page.fill(userSelector, usernameToUse);

                    // Validation: Check if value stuck
                    const actualValue = await page.inputValue(userSelector);
                    if (actualValue === usernameToUse) {
                        log('Username filled successfully.', 'success');

                        // Proceed to password
                        await page.fill(passSelector, config.password);

                        // Highlight for visibility
                        await page.evaluate(({ userSelector, passSelector }) => {
                            const u = document.querySelector(userSelector);
                            const p = document.querySelector(passSelector);
                            if (u) u.style.border = '2px solid green';
                            if (p) p.style.border = '2px solid green';
                        }, { userSelector, passSelector });

                        // Submit
                        const submitExists = await page.$(submitSelector);
                        if (submitExists) {
                            await page.click(submitSelector);
                            try {
                                await page.waitForLoadState('networkidle', { timeout: 10000 });
                            } catch (e) { }
                        }
                    } else {
                        log('Validation Failed: Username field did not retain value.', 'error');
                    }
                }
            }
        } catch (e) {
            log('Error attempting login fill: ' + e.message, 'error');
        }
    }

    return { data, links };
}

async function crawl(startUrl, options = {}) {
    const maxPages = options.maxPages || MAX_PAGES;
    const timeout = options.timeout || TIMEOUT;

    const launchOptions = { headless: false };
    if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
        launchOptions.executablePath = undefined;
    }

    const browser = await chromium.launch(launchOptions);
    const context = await browser.newContext();
    const domain = new URL(startUrl).hostname;

    await context.route('**', route => {
        const request = route.request();
        let url;
        try {
            url = new URL(request.url());
        } catch (e) {
            route.continue();
            return;
        }

        // Block navigation to other domains
        if (request.isNavigationRequest() && url.hostname !== domain) {
            console.log(`Blocked external navigation: ${url.hostname}`);
            route.abort();
            return;
        }

        route.continue();
    });

    const page = await context.newPage();

    const visited = new Set();
    const queue = [startUrl];
    const results = {};

    let count = 0;

    while (queue.length > 0 && count < maxPages) {
        const url = queue.shift();

        // Normalize URL to avoid duplicates (strip fragments, etc)
        const cleanUrl = url.split('#')[0];

        if (visited.has(cleanUrl)) continue;
        visited.add(cleanUrl);
        count++;

        const pageResult = await scanPage(page, cleanUrl, timeout);
        if (!pageResult) continue;

        results[cleanUrl] = pageResult.data;

        // Add new links
        for (const link of pageResult.links) {
            try {
                const linkUrl = new URL(link);
                // Only crawl same domain
                if (linkUrl.hostname === domain && !visited.has(link.split('#')[0])) {
                    if (!/\.(jpg|jpeg|png|gif|bmp|webp|svg|pdf|zip|docx|exe|dmg)$/i.test(linkUrl.pathname)) {
                        // Apply link rules
                        let allowed = true;
                        if (config.use_link_rules && linkRules) {
                            const urlStr = linkUrl.toString();

                            // Exclude
                            if (linkRules.exclude && linkRules.exclude.length > 0) {
                                if (linkRules.exclude.some(rule => urlStr.includes(rule))) allowed = false;
                            }

                            // Include (if defined, must match at least one)
                            if (allowed && linkRules.include && linkRules.include.length > 0) {
                                if (!linkRules.include.some(rule => urlStr.includes(rule))) allowed = false;
                            }
                        }

                        if (allowed) queue.push(link);
                    }
                }
            } catch (e) {
                // Ignore invalid links
            }
        }
    }

    await browser.close();
    return results;
}

// Export for use as a library
module.exports = { crawl };

// Only run if called directly
if (require.main === module) {
    const targetUrl = process.argv[2];
    if (!targetUrl) {
        console.log('Usage: node site-scanner.js <URL>');
        process.exit(1);
    }

    crawl(targetUrl).then(data => {
        const outputPath = 'site_analysis.json';
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
        console.log(`Analysis complete. Data saved to ${outputPath}`);
    }).catch(err => {
        console.error('Crawl failed:', err);
        process.exit(1);
    });
}
