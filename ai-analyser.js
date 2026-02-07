const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
require('dotenv').config();

const siteAnalysisPath = path.join(__dirname, 'site_analysis.json');
const outputPath = path.join(__dirname, 'test_cases.json');

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
    console.error('Error: OPENAI_API_KEY not found in .env file.');
    console.log('Please add your API key to the .env file as follows:');
    console.log('OPENAI_API_KEY=your_actual_key_here');
    process.exit(1);
}

const openai = new OpenAI({
    apiKey: apiKey,
});

async function generateTestCases() {
    console.log('🚀 Starting Stage 2: AI Analysis & Test Case Generation...');

    if (!fs.existsSync(siteAnalysisPath)) {
        console.error('❌ Error: site_analysis.json not found. Please run "node site-scanner.js <URL>" first.');
        process.exit(1);
    }

    const rawData = fs.readFileSync(siteAnalysisPath, 'utf8');
    const siteData = JSON.parse(rawData);
    const urls = Object.keys(siteData);

    console.log(`📊 Found ${urls.length} pages in analysis.`);

    let allTestCases = {
        functional: [],
        ui_interaction: [],
        authentication: [],
        validation: [],
        end_to_end: []
    };

    // Process pages in chunks
    const CHUNK_SIZE = 2;
    for (let i = 0; i < urls.length; i += CHUNK_SIZE) {
        const chunkUrls = urls.slice(i, i + CHUNK_SIZE);
        const chunkData = {};
        chunkUrls.forEach(url => {
            // Include only essential fields to maximize token efficiency
            chunkData[url] = {
                forms: siteData[url].forms,
                input_fields: siteData[url].input_fields,
                clickable_controls: siteData[url].clickable_controls.slice(0, 30),
                ui_components: siteData[url].ui_components.slice(0, 20),
                authentication_points: siteData[url].authentication_points
            };
        });

        console.log(`📡 Processing chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(urls.length / CHUNK_SIZE)}: ${chunkUrls[0]}${chunkUrls.length > 1 ? '...' : ''}`);

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `You are a Senior QA Automation Engineer. Your goal is to generate detailed, actionable test cases for Playwright based on website scan data.
                        
The user has provided JSON data describing the DOM elements, forms, and interactive components of several pages.

Generate test cases in exactly these categories:
1. **Functional test cases**: Core logic, feature walkthroughs.
2. **UI interaction test cases**: Buttons, links, navigation, hover effects, visibility.
3. **Authentication and authorization test cases**: Login forms, registration, secure paths.
4. **Input validation and negative test cases**: Form field limits, invalid email formats, required field errors.
5. **Workflow-based end-to-end (E2E) test cases**: Sequences of actions across multiple elements or pages.

CRITICAL:
- Use actual selectors from the "id", "className", or "attributes" provided in the scan data.
- Ensure the "steps" are clear and "expected" results are verifiable.
- Output MUST be valid JSON in the specified format.`
                    },
                    {
                        role: "user",
                        content: `Pages: ${chunkUrls.join(', ')}\n\nScan Data excerpt: ${JSON.stringify(chunkData)}`
                    }
                ],
                response_format: { type: "json_object" }
            });

            const result = JSON.parse(response.choices[0].message.content);

            // Merge and categorize
            if (result.functional) allTestCases.functional.push(...result.functional);
            if (result.ui_interaction) allTestCases.ui_interaction.push(...result.ui_interaction);
            if (result.authentication) allTestCases.authentication.push(...result.authentication);
            if (result.validation) allTestCases.validation.push(...result.validation);
            if (result.end_to_end) allTestCases.end_to_end.push(...result.end_to_end);

        } catch (error) {
            console.error(`⚠️ Error processing chunk ${i}:`, error.message);
        }
    }

    // Save outputs
    fs.writeFileSync(outputPath, JSON.stringify(allTestCases, null, 2));
    console.log(`\n✅ Analysis complete! Generated ${Object.values(allTestCases).flat().length} total test cases.`);
    console.log(`📁 JSON results saved to: ${outputPath}`);

    const csvPath = path.join(__dirname, 'test_cases.csv');
    const csvContent = convertToCSV(allTestCases);
    fs.writeFileSync(csvPath, csvContent);
    console.log(`📁 CSV results saved to: ${csvPath}`);
}

function convertToCSV(data) {
    const header = ['Category', 'Title', 'Description', 'Steps', 'Expected Output'];
    const rows = [header];

    Object.keys(data).forEach(category => {
        data[category].forEach(tc => {
            rows.push([
                category,
                tc.title || tc.name || '',
                tc.description || '',
                Array.isArray(tc.steps) ? tc.steps.join('; ') : (tc.steps || ''),
                tc.expected || tc.expectedResult || ''
            ]);
        });
    });

    return rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

// Export for use as a library
module.exports = { generateTestCases };

// Only run if called directly
if (require.main === module) {
    generateTestCases().catch(err => {
        console.error('🛑 Fatal error:', err);
        process.exit(1);
    });
}

