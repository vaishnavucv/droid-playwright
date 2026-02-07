# Build Notes - Site Scanner Engine (v2-playwright-ai-engine)

This document summarizes the development milestones, features, and configuration logic implemented in the Site Scanner engine.

## Core Features Implementation

### 1. Deep Crawling Architecture
- **Scope**: Implemented a recursive crawler that stays within the starting domain.
- **Limits**: Hard-coded limit of 50 pages (`MAX_PAGES`) to prevent infinite loops.
- **Navigation**: Uses `page.goto` with `networkidle` for reliable loading rather than clicking links.
- **Filtering**: Added logic to skip binary files (PDF, ZIP, EXE) and images (JPG, PNG, etc.) from the crawl queue to save bandwidth and time.

### 2. Comprehensive Element Cataloging
The scanner identified and categorizes the following "artifacts":
- **UI Components**: Semantic tags (header, footer, nav) and common class patterns (card, modal, dialog).
- **Clickable Controls**: Standard buttons/links plus elements with `onclick`, `ng-click`, or `@click` attributes.
- **Input Fields & Forms**: All interactive inputs and complete form structures.
- **Authentication Points**: Heuristic detection of login/register forms and password inputs.
- **File Systems**:
    - **Upload**: Detected via `input[type="file"]`.
    - **Download**: Detected via `download` attributes or specific file extensions.
    - **Images**: Records `<img>` tags and image links without visiting them.
- **Drag & Drop**: Identified via `draggable` attributes or specific class markers.
- **Generic DOM**: Captures significant elements with IDs or Test IDs for automation reference.

### 3. Smart Authentication Engine
- **Config-Driven**: Credentials stored in `config.yml`.
- **Dynamic Selection**: Supports `use_email` or `use_username` flags to target specific field types.
- **Robust Interaction**: Uses Playwright's native `page.fill()` to trigger frontend events (Vue/React/Angular compatible).
- **Verification Logic**: Included a post-fill validation step to confirm the value "stuck" in the input field before proceeding to the password and clicking submit.

### 4. Link Filtering System (`link-rules.json`)
- **Include Rules**: If defined, only URLs matching these patterns are scanned.
- **Exclude Rules**: Strictly skips URLs matching these patterns (e.g., `logout`, `signout`, `delete`).
- **Toggle**: Can be enabled/disabled via `use_link_rules` in `config.yml`.

### 5. MCP Server Integration
- **Custom Tool**: Exposes `scan_website_deep` via an MCP server (`mcp-server.js`).
- **High-Level Output**: Returns the entire site structure as a structured JSON object directly to the AI agent.

## Technical Stack
- **Engine**: Playwright (Chromium)
- **Runtime**: Node.js
- **Data Formats**: YAML (Config), JSON (Results & Rules)
- **Key Libraries**: `js-yaml` (parsing), `@modelcontextprotocol/sdk` (server).

## Development "Chat Prompts" & Logic
- *"Identify and catalog components without performing actions (except login)."*
- *"Gracefully skip images but record their presence."*
- *"Ensure the username field is actually filled (validated) before typing the password."*
- *"Allow the user to exclude specific paths like logout to prevent session disruption."*

---
*Created for: v2-playwright-ai-engine branch*
