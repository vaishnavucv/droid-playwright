# AI Playwright Test Engine 🚀

An AI-powered test generation engine that crawls websites (including authenticated sections), analyzes their DOM structure, and generates comprehensive Playwright test cases using GPT-4o.

## 📋 Features

- **Multi-Page Crawler**: Automatically discovers and scans up to 100 internal pages.
- **Login Automation**: Detects login forms and authenticates using your credentials.
- **Chunked AI Analysis**: Processes large site data in manageable chunks to avoid token limits.
- **Playwright-Ready**: Generates actionable test cases with actual CSS selectors and pseudo-code.
- **Export Formats**: Saves results in both `JSON` and `CSV` formats for easy integration.

---

## ⚙️ Setup & Installation

Follow these steps when moving to a new system:

### 1. Clone the Repository
```bash
git clone https://github.com/vaishnavucv/droid-playwright.git
cd droid-playwright
git checkout v2-playwright-ai-engine
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Install Playwright Browsers
```bash
npx playwright install chromium
```

### 4. Configure Environment Variables
Create a `.env` file in the root directory and add your OpenAI API Key:
```env
OPENAI_API_KEY=your_sk_openai_key_here
```

### 5. Configure Login Credentials
Edit `config.yml` with your test credentials:
```yaml
username: "your_username"
password: "your_password"
use_username: true
use_email: false
```

---

## 🚀 Running the Engine

To scan a website and generate test cases, run:

```bash
node ai-test-engine.js <website_url>
```

**Example:**
```bash
node ai-test-engine.js https://nseacademy-staging.nuvepro.io/
```

---

## 📂 Output Structure

All results are saved in a directory named after the website domain (e.g., `nseacademy-staging.nuvepro.io/`):

- **`site_analysis.json`**: The raw DOM data for all crawled pages.
- **`test_cases.json`**: Functional, UI, and E2E test cases with Playwright steps.
- **`test_cases.csv`**: A spreadsheet version of the test plan.

---

## 🛠️ Troubleshooting

- **Login Failing?**: Ensure the `userSelector` and `passSelector` in `ai-test-engine.js` match your site's login form.
- **Browser Not Found?**: Run `npx playwright install chromium`.
- **Token Limits?**: The engine handles 100 pages using chunking, but for extremely dense pages, you may need to reduce `CHUNK_SIZE` in the code.
