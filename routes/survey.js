import express from 'express';
import Response from '../models/response.js';
import ExperimentControl from '../models/experimentControl.js';
import experimentLoader from '../lib/experimentLoader.js';
import { handleExperimentCompletion } from '../lib/amtIntegration.js';

const router = express.Router();

// Generate completion code
function generateCompletionCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'PILOT';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Get client IP address
function getClientIP(req) {
  return req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 
         (req.connection.socket ? req.connection.socket.remoteAddress : null);
}

// Experiment selection page
router.get('/', async (req, res) => {
  const { workerId, assignmentId, hitId, experiment } = req.query;
  
  // If no experiment specified, show selection page
  if (!experiment) {
    const experiments = experimentLoader.getAvailableExperiments();
    return res.render('experiment-selection', { experiments });
  }

  // Load the specified experiment
  try {
    const experimentConfig = experimentLoader.loadExperiment(experiment);
    req.session.experimentId = experiment;
    
    // Initialize experiment control if it doesn't exist
    if (experimentConfig.experimentControl) {
      await ExperimentControl.initializeExperiment(
        experiment, 
        experimentConfig.experimentControl.targetSampleSize,
        experimentConfig.experimentControl.conditions
      );
    }
    
    // Check if experiment is active (after initialization)
    const isActive = await ExperimentControl.isExperimentActive(experiment);
    if (!isActive) {
      return res.render('error', { 
        message: `The '${experimentConfig.title}' experiment has reached its target sample size and is no longer accepting participants. Thank you for your interest!` 
      });
    }
  } catch (error) {
    return res.render('error', { 
      message: `Experiment '${experiment}' not found or invalid.` 
    });
  }
  
  // Validate AMT parameters
  if (!workerId || !assignmentId || !hitId) {
    return res.render('error', { 
      message: 'This study requires Amazon Mechanical Turk parameters. Please access through MTurk.' 
    });
  }

  // Check if assignment is in preview mode
  if (assignmentId === 'ASSIGNMENT_ID_NOT_AVAILABLE') {
    return res.render('preview', { workerId, assignmentId, hitId });
  }

  // Store in session
  req.session.workerId = workerId;
  req.session.assignmentId = assignmentId;
  req.session.hitId = hitId;
  req.session.startTime = new Date();

  // Only assign font/attribution conditions for fluency manipulation experiments
  if (experiment !== 'font-pretest') {
    const fontCondition = Math.random() < 0.5 ? 'easy' : 'hard';
    const attributionCondition = Math.random() < 0.5 ? 'present' : 'absent';
    req.session.fontCondition = fontCondition;
    req.session.attributionCondition = attributionCondition;
  }

  res.render('landing', { 
    workerId, 
    assignmentId, 
    hitId, 
    fontCondition 
  });
});

// Instructions page
router.get('/instructions', (req, res) => {
  if (!req.session.workerId) {
    return res.redirect('/');
  }
  
  res.render('instructions', { 
    fontCondition: req.session.fontCondition 
  });
});

// Main experiment page
router.get('/experiment', (req, res) => {
  if (!req.session.workerId || !req.session.experimentId) {
    return res.redirect('/');
  }
  
  try {
    const experiment = experimentLoader.loadExperiment(req.session.experimentId);
    
    res.render('experiment-dynamic', { 
      fontCondition: req.session.fontCondition,
      attributionCondition: req.session.attributionCondition,
      experiment: experiment
    });
  } catch (error) {
    res.render('error', { 
      message: 'Error loading experiment configuration.' 
    });
  }
});

// Handle experiment form submission
router.post('/experiment', (req, res) => {
  if (!req.session.workerId || !req.session.experimentId) {
    return res.redirect('/');
  }
  
  const { choice } = req.body;
  const experiment = experimentLoader.loadExperiment(req.session.experimentId);
  const validChoices = experimentLoader.getValidChoices(req.session.experimentId);
  
  if (!choice || !validChoices.includes(choice)) {
    return res.render('experiment-dynamic', { 
      fontCondition: req.session.fontCondition,
      attributionCondition: req.session.attributionCondition,
      experiment: experiment,
      error: 'Please select an option before continuing.'
    });
  }
  
  req.session.choice = choice;
  res.redirect('/demographics');
});

// Demographics page
router.get('/demographics', (req, res) => {
  if (!req.session.workerId || !req.session.choice) {
    return res.redirect('/');
  }
  
  res.render('demographics', { 
    fontCondition: req.session.fontCondition 
  });
});

// Handle demographics form submission
router.post('/demographics', (req, res) => {
  if (!req.session.workerId || !req.session.choice) {
    return res.redirect('/');
  }
  
  const { age, education } = req.body;
  
  if (!age || !education || age < 18 || age > 120) {
    return res.render('demographics', { 
      fontCondition: req.session.fontCondition,
      error: 'Please provide valid age and education information.'
    });
  }
  
  req.session.age = parseInt(age);
  req.session.education = education;
  res.redirect('/complete');
});


// Completion page
router.get('/complete', async (req, res) => {
  if (!req.session.workerId || !req.session.choice || 
      !req.session.age) {
    return res.redirect('/');
  }
  
  try {
    // Generate completion code
    const completionCode = generateCompletionCode();
    
    // Save response to database
    const response = new Response({
      workerId: req.session.workerId,
      assignmentId: req.session.assignmentId,
      hitId: req.session.hitId,
      experimentId: req.session.experimentId,
      fontCondition: req.session.fontCondition,
      attributionCondition: req.session.attributionCondition,
      choice: req.session.choice,
      age: req.session.age,
      education: req.session.education,
      completionCode: completionCode,
      ipAddress: getClientIP(req)
    });
    
    await response.save();
    
    // Update experiment control count and check if we need to stop the experiment
    const controlStatus = await ExperimentControl.incrementCount(
      req.session.experimentId,
      req.session.fontCondition
    );
    
    // If experiment just reached completion, trigger HIT management
    if (controlStatus && !controlStatus.isActive && controlStatus.completedAt) {
      console.log(`Experiment ${req.session.experimentId} has reached target sample size. Triggering HIT management...`);
      
      // Try to expire the HIT on AMT
      try {
        await handleExperimentCompletion(
          req.session.hitId, 
          req.session.experimentId, 
          controlStatus.targetSampleSize
        );
      } catch (error) {
        console.error('Error managing HIT completion:', error);
        // Continue anyway - the important thing is that our system stops accepting new participants
      }
    }
    
    // Store completion info before destroying session
    const completionInfo = {
      completionCode,
      assignmentId: req.session.assignmentId,
      hitId: req.session.hitId
    };
    
    // Clear session
    req.session.destroy();
    
    res.render('complete', { 
      completionCode,
      assignmentId: completionInfo.assignmentId,
      hitId: completionInfo.hitId
    });
    
  } catch (error) {
    console.error('Error saving response:', error);
    res.render('error', { 
      message: 'Error saving your response. Please try again.' 
    });
  }
});

// Experiment status endpoint
router.get('/status/:experimentId', async (req, res) => {
  try {
    const { experimentId } = req.params;
    const status = await ExperimentControl.getExperimentStatus(experimentId);
    
    if (!status) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    
    res.json(status);
  } catch (error) {
    console.error('Error fetching experiment status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Experiment status dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const experiments = ['font-pretest', 'novemsky2007', 'allais-paradox'];
    const statusData = [];
    
    for (const experimentId of experiments) {
      const status = await ExperimentControl.getExperimentStatus(experimentId);
      if (status) {
        statusData.push(status);
      }
    }
    
    res.render('dashboard', { experiments: statusData });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.render('error', { message: 'Error loading dashboard' });
  }
});

// AMT HIT parameters endpoint
router.get('/amt-parameters/:experimentId', async (req, res) => {
  try {
    const { experimentId } = req.params;
    const experimentConfig = experimentLoader.loadExperiment(experimentId);
    
    const { createHitParameters } = await import('../lib/amtIntegration.js');
    const hitParams = createHitParameters(experimentConfig);
    
    res.json({
      experimentId,
      hitParameters: hitParams,
      externalUrl: `${req.protocol}://${req.get('host')}/?experiment=${experimentId}`,
      instructions: {
        step1: "Copy the HIT parameters below",
        step2: "Go to Amazon Mechanical Turk Requester Interface",
        step3: "Create a new HIT using 'External URL' template",
        step4: "Paste the parameters and External URL",
        step5: "Set MaxAssignments to match your target sample size",
        step6: "Publish the HIT"
      }
    });
  } catch (error) {
    console.error('Error generating AMT parameters:', error);
    res.status(500).json({ error: 'Error generating AMT parameters' });
  }
});

// Manual HIT expiration endpoint (for emergencies)
router.post('/expire-hit', async (req, res) => {
  try {
    const { hitId, experimentId } = req.body;
    
    if (!hitId || !experimentId) {
      return res.status(400).json({ error: 'hitId and experimentId are required' });
    }
    
    const { handleExperimentCompletion } = await import('../lib/amtIntegration.js');
    const success = await handleExperimentCompletion(hitId, experimentId, 0);
    
    res.json({ 
      success,
      message: success ? 'HIT expired successfully' : 'Manual expiration required - check logs'
    });
  } catch (error) {
    console.error('Error expiring HIT:', error);
    res.status(500).json({ error: 'Error expiring HIT' });
  }
});

// Health check endpoint for Render
router.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

export default router;