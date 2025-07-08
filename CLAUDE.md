# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Modular psychology research platform for testing processing fluency effects across behavioral economics phenomena. Replicates Novemsky et al. (2007) "Preference Fluency in Choice" methodology and extends it to various heuristics and biases. Node.js web application with MongoDB integration and Amazon Mechanical Turk (AMT) participant recruitment.

## Development Commands
```bash
# Development setup (when package.json exists)
npm install
npm run dev              # Development server with nodemon
npm start               # Production server

# Data analysis
npm run analyze          # Analyze all experiments
npm run analyze:novemsky # Analyze Novemsky et al. (2007) replication
npm run analyze:allais   # Analyze Allais paradox study
npm run export           # Export all data to CSV
npm run export:novemsky  # Export Novemsky data to CSV

# Database (MongoDB required)
# Connect to: mongodb://localhost:27017/pilot-study
```

## Key Technical Requirements
- **Node.js with ES6 modules** (`"type": "module"` in package.json)
- **Express.js** server with EJS templating
- **MongoDB** with Mongoose ODM
- **Express-session** for session management
- **AMT integration** with proper parameter handling
- **Render.com** deployment ready

## Core Architecture
```
survey-experiments/
├── server.js           # Express server entry point
├── models/response.js  # Mongoose schema for experiment data
├── routes/survey.js    # Survey flow routes (modular experiment support)
├── views/              # EJS templates for 6-page survey
├── public/style.css    # Font styling (easy vs hard conditions)
├── scripts/analyze.js  # Data analysis functions
├── experiments/        # Modular experiment definitions
│   ├── font-pretest/       # Font readability validation study
│   ├── novemsky2007/       # Original Study 1 replication
│   ├── allais-paradox/     # Risk preferences  
│   └── template/           # Base template for new experiments
├── docs/               # Documentation and reference materials (gitignored)
│   ├── images/             # Figures and screenshots
│   └── literature/         # Research papers and references
└── .env               # Environment variables
```

## Research Framework
Based on **Novemsky et al. (2007) Study 1** methodology:
- **2×2 factorial design**: Font fluency (easy/hard) × Attribution (present/absent)
- **Processing fluency intervention**: Eye-straining italicized serif font with drop shadow
- **Attribution intervention**: "This information may be difficult to read because of the font"
- **Dependent variables**: Choice deferral rates and preference patterns

## Available Experiments

### 1. Novemsky et al. (2007) Study 1 Replication (`novemsky2007`)
- **Choice options**: Phone A, Phone B, or DEFER ("continue looking at other Web sites")
- **Exact replication** of original cordless phone choice study
- **Expected results**: 17% easy vs 41% hard font deferral rates

### 2. Allais Paradox + Fluency (`allais-paradox`)  
- **Choice options**: A ($2,400 certain), B (lottery), or DEFER
- **Hypothesis**: Hard font increases deferral rates unless attributed to font
- **Extension**: Test fluency effects on risk preferences in financial decisions

**Both experiments use:**
- **2×2 factorial design**: Font fluency (easy/hard) × Attribution (present/absent) 
- **6-page survey flow**: Landing → Instructions → Experiment → Demographics → Check → Completion
- **Target sample**: 20 participants (5 per condition for pilot)

## Database Schema
```javascript
{
  workerId: String,
  assignmentId: String,
  hitId: String,
  fontCondition: String,        // 'easy' or 'hard'
  attributionCondition: String, // 'present' or 'absent'
  allaisChoice: String,         // 'A', 'B', or 'DEFER'
  age: Number,
  education: String,
  readabilityRating: Number,    // 1-5 intervention check
  completionCode: String,       // Format: PILOT{4-random-alphanumeric}
  ipAddress: String,
  timestamps: true
}
```

## Planned Modular Extensions
**Future experiment modules** to test fluency effects on:
- **Anchoring bias** - numerical estimates with high/low anchors
- **Framing effects** - loss vs gain framed equivalent choices  
- **Endowment effect** - willingness to trade owned vs unowned items
- **Availability heuristic** - probability judgments of memorable events
- **Representativeness** - stereotyping and conjunction fallacy
- **Compromise effect** - attraction to middle options in choice sets

## Critical Implementation Details
- **AMT Parameters**: Must capture workerId, assignmentId, hitId from URL
- **Font Conditions**: Randomly assign on landing page, store in session
- **Completion Codes**: Generate format `PILOT{4-random-alphanumeric}`
- **Session Management**: Store all data in session until final save to database
- **Error Handling**: Redirect to start if session invalid

## Environment Variables Required
```
NODE_ENV=production
MONGODB_URI=mongodb://localhost:27017/pilot-study
SESSION_SECRET=your-secret-key
PORT=3000
```

## Security Requirements
- Use Helmet for security headers
- Input validation and sanitization
- Environment variables for sensitive data
- Never expose database credentials

## Success Criteria
1. Survey loads and captures AMT parameters correctly
2. Font intervention creates clear visual difference
3. All responses save to database with proper structure
4. Completion codes generate and AMT submission works
5. Deploys successfully to Render.com

## Modular Design Principles
- **Standardized fluency intervention** across all experiments
- **Consistent AMT integration** and session management
- **Flexible experiment configuration** via JSON/config files
- **Reusable survey flow** templates
- **Unified database schema** with experiment-specific fields

## Development Constraints
- No authentication (public access)
- No admin dashboard (direct database access)
- No mobile optimization (desktop-focused)
- No duplicate prevention beyond basic session handling
- Pilot-focused architecture (extensible to full studies)

## Data Analysis System
Built-in analysis system using functional programming approach (no external statistics packages):

**Core Functions:**
- `analyzeNovemsky2007()` - Replication analysis with deferral rates and attribution effects
- `analyzeAllaisParadox()` - Risk preference analysis and fluency effects on Allais paradox
- `calculateStats()` - Descriptive statistics (mean, SD, median, etc.)
- `chiSquareTest()` - Chi-square tests with p-value approximations
- `exportData()` - CSV export for further analysis

**Key Metrics Calculated:**
- **Deferral rates** by font condition (replicating 17% easy vs 41% hard font finding)
- **Attribution intervention** effects (hard font effect should disappear when attributed to font)
- **Risk preferences** (certain vs lottery choices in Allais paradox)
- **Manipulation checks** (font readability ratings)
- **Chi-square tests** for statistical significance

**File:** `scripts/analyze.js` - Pure functional approach, ES6 modules

## Coding Preferences
- **ES6 modules** preferred over CommonJS (`import`/`export` syntax)
- **Functional programming** preferred over class-based approaches
- **Pure functions** for data analysis and utilities
- **Minimal dependencies** - avoid adding complex ecosystems when possible

## Design Considerations
- **Interface Aesthetics**: Deliberately neutral "institutional research study" design to avoid confounding fluency effects
- **Visual Balance**: Clean enough to avoid distracting ugliness, unremarkable enough to let font intervention be the primary fluency variable
- **Avoiding Confounds**: Beautiful interfaces could create processing fluency that competes with font disfluency; ugly interfaces could create their own cognitive load
- **Cross-Experiment Consistency**: Same visual design and fluency intervention across all behavioral economics tests