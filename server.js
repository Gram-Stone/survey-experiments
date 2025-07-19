import express from 'express';
import session from 'express-session';
import mongoose from 'mongoose';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import surveyRoutes from './routes/survey.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware - allow iframe embedding for MTurk
app.use(helmet({
  frameguard: false, // Disable X-Frame-Options
  contentSecurityPolicy: {
    directives: {
      frameAncestors: ["'self'", "https://www.mturk.com", "https://workersandbox.mturk.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for dashboard
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
      formAction: ["'self'", "https://www.mturk.com", "https://workersandbox.mturk.com"] // Allow form submission to MTurk
    }
  }
}));

// Body parsing middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'pilot-study-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to false for now to fix Render deployment
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 2, // 2 hours
    sameSite: 'lax'
  }
}));

// Force HTTPS for MTurk requests in production
app.use((req, res, next) => {
  // Check if we're in production and the request came via HTTP
  if (process.env.NODE_ENV === 'production' && req.header('x-forwarded-proto') !== 'https') {
    // Redirect HTTP to HTTPS for MTurk compatibility
    return res.redirect(`https://${req.header('host')}${req.url}`);
  }
  next();
});

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pilot-study');

mongoose.connection.on('connected', () => {
  console.log('Connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

// Routes
app.use('/', surveyRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { message: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});