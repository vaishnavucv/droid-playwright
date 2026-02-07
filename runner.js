const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { crawl } = require('./site-scanner.js');
const { generateTestCases } = require('./ai-analyser.js');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function main() {
    console.log('🌟 Welcome to the Unified Playwright AI Test Generator 🌟');

    // Automatically set PLAYWRIGHT_BROWSERS_PATH if .playwright directory exists
    const localPlaywrightPath = path.join(__dirname, '.playwright');
    if (fs.existsSync(localPlaywrightPath)) {
        process.env.PLAYWRIGHT_BROWSERS_PATH = localPlaywrightPath;
        console.log('📦 Using local Playwright browsers...');
    }
    // 1. Collect input from user
    let url = process.argv[2];
    if (!url) {
        url = await askQuestion('Please enter the Website URL to scan: ');
    } else {
        console.log(`🔗 Scanning provided URL: ${url}`);
    }

    if (!url || !url.startsWith('http')) {
        console.error('❌ Invalid URL. Please start with http:// or https://');
        process.exit(1);
    }

    try {
        // 2. Run Site Scanner
        console.log('\n--- 🛠️ Step 1: Scanning Website ---');
        const siteData = await crawl(url);

        const siteAnalysisPath = 'site_analysis.json';
        fs.writeFileSync(siteAnalysisPath, JSON.stringify(siteData, null, 2));
        console.log(`✅ Scan complete. Site data saved to ${siteAnalysisPath}`);

        // 3. Run AI Analyser
        console.log('\n--- 🤖 Step 2: Generating AI Test Cases ---');
        await generateTestCases();

        console.log('\n--- ✨ All Stages Complete ---');
        console.log('You can find your results in:');
        console.log('- test_cases.json (Full Data)');
        console.log('- test_cases.csv (Ready for Dashboard)');

    } catch (error) {
        console.error('\n🛑 An error occurred during the process:');
        console.error(error.message);
    } finally {
        rl.close();
    }
}

function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

main();
