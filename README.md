# Claude Code Prompt: Font Fluency Experiment Pilot

## Project Overview
Build a minimal pilot study web application to test the infrastructure for a font fluency and Allais paradox experiment. This is a simplified version to validate the technical setup before building the full study.

## Technical Requirements
- **Node.js with ES6 modules** (use `"type": "module"` in package.json)
- **Express.js** for the web server
- **EJS** for templating
- **MongoDB** with Mongoose for data storage
- **Express-session** for session management
- **Amazon Mechanical Turk integration** only (no other platforms)
- **Render.com deployment ready** with proper configuration

## Pilot Study Specifications

### Simplified Experimental Design
- **Two conditions**: Easy font (Arial 16px) vs Hard font (Brush Script MT 13px, gray on light gray)
- **One Allais problem only** (not the full pair)
- **Minimal demographics** (just age and education)
- **Basic manipulation check** (font readability rating 1-5)
- **No timing enforcement** (keep it simple for pilot)
- **Target**: 20 participants total (10 per condition)

### AMT Integration Requirements
- Capture AMT parameters: `workerId`, `assignmentId`, `hitId`
- Generate completion codes in format: `PILOT{4-random-alphanumeric}`
- Handle AMT submission properly with external question format

### Database Schema (Minimal)
```javascript
{
  workerId: String,
  assignmentId: String,
  hitId: String,
  fontCondition: String, // 'easy' or 'hard'
  allaisChoice: String,  // 'A' or 'B'
  age: Number,
  education: String,
  readabilityRating: Number, // 1-5
  completionCode: String,
  ipAddress: String,
  timestamps: true
}
```

### Survey Flow
1. **Landing page** (`/`) - Capture AMT parameters, assign random font condition
2. **Instructions** (`/instructions`) - Brief study overview
3. **Main experiment** (`/experiment`) - Single Allais problem with font styling
4. **Demographics** (`/demographics`) - Age and education level
5. **Manipulation check** (`/check`) - Font readability question
6. **Completion** (`/complete`) - Show completion code and AMT submission form

### Allais Problem (Use Problem A1 only)
```
Situation: Choose between the following options:

Option A: $2,400 for certain
Option B: 33% chance of $2,500, 66% chance of $2,400, 1% chance of $0

Which would you prefer?
```

## Implementation Requirements

### File Structure
```
pilot-study/
├── package.json
├── server.js
├── models/
│   └── response.js
├── routes/
│   └── survey.js
├── views/
│   ├── layout.ejs
│   ├── instructions.ejs
│   ├── experiment.ejs
│   ├── demographics.ejs
│   ├── check.ejs
│   └── complete.ejs
├── public/
│   └── style.css
└── .env
```

### Key Implementation Details

#### Font Styling (CSS Classes)
```css
.easy-font {
  font-family: Arial, sans-serif;
  font-size: 16px;
  color: #000;
  background: #fff;
}

.hard-font {
  font-family: 'Brush Script MT', cursive;
  font-size: 13px;
  color: #666;
  background: #f5f5f5;
}
```

#### Session Management
- Store font condition, AMT data, and responses in session
- Generate unique participant ID for tracking
- Clear session after completion

#### Error Handling
- Redirect to start if session is invalid
- Handle database connection errors
- Validate AMT parameters

#### Security
- Helmet for security headers
- Input validation and sanitization
- Environment variables for sensitive data

### Environment Variables Needed
```
NODE_ENV=production
MONGODB_URI=mongodb://localhost:27017/pilot-study
SESSION_SECRET=your-secret-key
PORT=3000
```

### Deployment Configuration

#### package.json scripts
```json
{
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  }
}
```

#### Render deployment files
- Create `render.yaml` for automatic deployment
- Configure environment variables for production
- Set up MongoDB database connection

### Validation & Testing Requirements
- Test all survey flow paths
- Verify AMT parameter capture
- Test font rendering in different browsers
- Validate data saving to database
- Test completion code generation
- Verify AMT submission form functionality

## Success Criteria for Pilot
1. **Technical**: Survey loads, captures data, generates completion codes
2. **AMT Integration**: Properly handles AMT worker flow start to finish
3. **Font Manipulation**: Clear visual difference between conditions
4. **Data Quality**: All responses save correctly with proper structure
5. **Deployment**: Successfully deploys to Render and handles real traffic

## Constraints & Simplifications
- **No authentication** (public access)
- **No admin dashboard** (check data directly in database)
- **No email notifications** (manual monitoring)
- **No advanced analytics** (basic data export only)
- **No duplicate prevention** (beyond basic session handling)
- **No mobile optimization** (desktop-focused for now)

## Expected Development Time
- **Setup & structure**: 30 minutes
- **Core survey flow**: 1 hour
- **Font styling & form handling**: 30 minutes
- **Database integration**: 30 minutes
- **AMT integration**: 30 minutes
- **Testing & deployment**: 30 minutes
- **Total**: ~3.5 hours

Build this as a solid foundation that can be extended for the full study later. Focus on clean, readable code and proper error handling. Make sure the AMT integration works perfectly since that's critical for the real study.