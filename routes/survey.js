import express from 'express';
import Response from '../models/response.js';
import ExperimentControl from '../models/experimentControl.js';
import experimentLoader from '../lib/experimentLoader.js';
import { handleExperimentCompletion, createHit, listAllHits, getHitStatus, approveAssignment, rejectAssignment } from '../lib/amtIntegration.js';

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

// Experiment selection page - handle both GET and POST
async function handleExperimentStart(req, res) {
  // Debug: log all parameters
  console.log('Query parameters:', req.query);
  console.log('Body parameters:', req.body);
  console.log('Headers:', req.headers);
  console.log('Full URL:', req.url);
  
  // Try to get parameters from both query and body
  let { workerId, assignmentId, hitId, experiment, turkSubmitTo } = req.query;
  
  // If not in query, try body (POST data)
  if (!workerId && req.body) {
    workerId = req.body.workerId || workerId;
    assignmentId = req.body.assignmentId || assignmentId;
    hitId = req.body.hitId || hitId;
    experiment = req.body.experiment || experiment;
    turkSubmitTo = req.body.turkSubmitTo || turkSubmitTo;
  }
  
  console.log('Extracted parameters:', { workerId, assignmentId, hitId, experiment, turkSubmitTo });
  
  // If no experiment specified
  if (!experiment) {
    // In development, show experiment selection
    if (process.env.NODE_ENV !== 'production') {
      const experiments = experimentLoader.getAvailableExperiments();
      return res.render('experiment-selection', { experiments });
    }
    
    // In production, require MTurk access
    return res.render('error', { 
      message: 'This study must be accessed through Amazon Mechanical Turk. Please find our study on MTurk to participate.' 
    });
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
  
  // Validate AMT parameters (allow preview mode)
  if (!workerId || !assignmentId || !hitId) {
    // Allow preview access with default parameters
    const previewWorkerId = 'PREVIEW_WORKER';
    const previewAssignmentId = 'ASSIGNMENT_ID_NOT_AVAILABLE';
    const previewHitId = 'PREVIEW_HIT';
    
    return res.render('preview', { 
      workerId: previewWorkerId, 
      assignmentId: previewAssignmentId, 
      hitId: previewHitId 
    });
  }

  // Check if assignment is in preview mode
  if (assignmentId === 'ASSIGNMENT_ID_NOT_AVAILABLE') {
    return res.render('preview', { workerId, assignmentId, hitId });
  }

  // Check if worker has already completed any experiment
  try {
    const existingResponse = await Response.findOne({ workerId: workerId });
    if (existingResponse) {
      return res.render('error', { 
        message: 'You have already participated in one of our studies. Thank you for your interest, but you cannot participate in multiple studies.' 
      });
    }
  } catch (err) {
    console.error('Error checking existing participation:', err);
  }

  // Store in session
  req.session.workerId = workerId;
  req.session.assignmentId = assignmentId;
  req.session.hitId = hitId;
  req.session.turkSubmitTo = turkSubmitTo;
  req.session.startTime = new Date();

  // Only assign font/attribution conditions for fluency intervention experiments
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
    fontCondition: req.session.fontCondition 
  });
}

// Add both GET and POST routes for experiment start
router.get('/', handleExperimentStart);
router.post('/', handleExperimentStart);

// Instructions page
router.get('/instructions', async (req, res) => {
  console.log('Instructions page - URL params:', req.query);
  console.log('Instructions page - Session data:', {
    sessionId: req.sessionID,
    workerId: req.session.workerId,
    experimentId: req.session.experimentId,
    nodeEnv: process.env.NODE_ENV
  });
  
  // Try to get parameters from URL if session is empty (MTurk iframe issue)
  let { workerId, assignmentId, hitId, experiment, turkSubmitTo } = req.query;
  
  if (!req.session.workerId && workerId && assignmentId && hitId && experiment) {
    console.log('Session empty, reinitializing from URL parameters');
    
    // Reinitialize session from URL parameters
    req.session.workerId = workerId;
    req.session.assignmentId = assignmentId;
    req.session.hitId = hitId;
    req.session.experimentId = experiment;
    req.session.turkSubmitTo = turkSubmitTo;
    
    // Only assign font/attribution conditions for fluency intervention experiments
    if (experiment !== 'font-pretest') {
      const fontCondition = Math.random() < 0.5 ? 'easy' : 'hard';
      const attributionCondition = Math.random() < 0.5 ? 'present' : 'absent';
      req.session.fontCondition = fontCondition;
      req.session.attributionCondition = attributionCondition;
    }
  }
  
  if (!req.session.workerId) {
    console.log('No workerId in session or URL, redirecting to home');
    return res.redirect('/');
  }
  
  res.render('instructions', { 
    fontCondition: req.session.fontCondition 
  });
});

// Main experiment page
router.get('/experiment', (req, res) => {
  console.log('Experiment page - URL params:', req.query);
  console.log('Experiment page - Session data:', {
    sessionId: req.sessionID,
    workerId: req.session.workerId,
    experimentId: req.session.experimentId
  });
  
  // Try to get parameters from URL if session is empty
  let { workerId, assignmentId, hitId, experiment, turkSubmitTo } = req.query;
  
  if (!req.session.workerId && workerId && assignmentId && hitId && experiment) {
    console.log('Experiment session empty, reinitializing from URL parameters');
    
    // Reinitialize session from URL parameters
    req.session.workerId = workerId;
    req.session.assignmentId = assignmentId;
    req.session.hitId = hitId;
    req.session.experimentId = experiment;
    req.session.turkSubmitTo = turkSubmitTo;
    
    // Only assign font/attribution conditions for fluency intervention experiments
    if (experiment !== 'font-pretest') {
      const fontCondition = Math.random() < 0.5 ? 'easy' : 'hard';
      const attributionCondition = Math.random() < 0.5 ? 'present' : 'absent';
      req.session.fontCondition = fontCondition;
      req.session.attributionCondition = attributionCondition;
    }
  }
  
  if (!req.session.workerId || !req.session.experimentId) {
    console.log('No workerId or experimentId, redirecting to home');
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
router.post('/experiment', async (req, res) => {
  console.log('POST /experiment - URL params:', req.query);
  console.log('POST /experiment - Session data:', {
    sessionId: req.sessionID,
    workerId: req.session.workerId,
    experimentId: req.session.experimentId
  });
  
  // Try to get parameters from URL if session is empty
  let { workerId, assignmentId, hitId, experiment, turkSubmitTo } = req.query;
  
  if (!req.session.workerId && workerId && assignmentId && hitId && experiment) {
    console.log('POST experiment session empty, reinitializing from URL parameters');
    
    // Reinitialize session from URL parameters
    req.session.workerId = workerId;
    req.session.assignmentId = assignmentId;
    req.session.hitId = hitId;
    req.session.experimentId = experiment;
    req.session.turkSubmitTo = turkSubmitTo;
    
    // Only assign font/attribution conditions for fluency intervention experiments
    if (experiment !== 'font-pretest') {
      const fontCondition = Math.random() < 0.5 ? 'easy' : 'hard';
      const attributionCondition = Math.random() < 0.5 ? 'present' : 'absent';
      req.session.fontCondition = fontCondition;
      req.session.attributionCondition = attributionCondition;
    }
  }
  
  if (!req.session.workerId || !req.session.experimentId) {
    console.log('No workerId or experimentId in POST experiment, redirecting to home');
    return res.redirect('/');
  }
  
  const { choice } = req.body;
  const experimentConfig = experimentLoader.loadExperiment(req.session.experimentId);
  const validChoices = experimentLoader.getValidChoices(req.session.experimentId);
  
  if (!choice || !validChoices.includes(choice)) {
    return res.render('experiment-dynamic', { 
      fontCondition: req.session.fontCondition,
      attributionCondition: req.session.attributionCondition,
      experiment: experimentConfig,
      error: 'Please select an option before continuing.'
    });
  }
  
  req.session.choice = choice;
  
  // Store choice in database immediately to survive session loss
  try {
    await Response.findOneAndUpdate(
      { workerId: req.session.workerId },
      { 
        workerId: req.session.workerId,
        assignmentId: req.session.assignmentId,
        hitId: req.session.hitId,
        experimentId: req.session.experimentId,
        fontCondition: req.session.fontCondition,
        attributionCondition: req.session.attributionCondition,
        choice: choice,
        ipAddress: getClientIP(req)
      },
      { upsert: true, new: true }
    );
    console.log('Saved choice to database:', choice);
  } catch (error) {
    console.error('Error saving choice:', error);
  }
  
  // Preserve URL parameters in redirect
  const queryString = new URLSearchParams(req.query).toString();
  const redirectUrl = queryString ? `/demographics?${queryString}` : '/demographics';
  res.redirect(redirectUrl);
});

// Demographics page
router.get('/demographics', (req, res) => {
  console.log('Demographics page - URL params:', req.query);
  console.log('Demographics page - Session data:', {
    sessionId: req.sessionID,
    workerId: req.session.workerId,
    choice: req.session.choice
  });
  
  // Try to get parameters from URL if session is empty
  let { workerId, assignmentId, hitId, experiment, turkSubmitTo } = req.query;
  
  if (!req.session.workerId && workerId && assignmentId && hitId && experiment) {
    console.log('Demographics session empty, reinitializing from URL parameters');
    
    // Reinitialize session from URL parameters
    req.session.workerId = workerId;
    req.session.assignmentId = assignmentId;
    req.session.hitId = hitId;
    req.session.experimentId = experiment;
    req.session.turkSubmitTo = turkSubmitTo;
    
    // Only assign font/attribution conditions for fluency intervention experiments
    if (experiment !== 'font-pretest') {
      const fontCondition = Math.random() < 0.5 ? 'easy' : 'hard';
      const attributionCondition = Math.random() < 0.5 ? 'present' : 'absent';
      req.session.fontCondition = fontCondition;
      req.session.attributionCondition = attributionCondition;
    }
  }
  
  if (!req.session.workerId) {
    console.log('No workerId in demographics, redirecting to home');
    return res.redirect('/');
  }
  
  res.render('demographics', { 
    fontCondition: req.session.fontCondition 
  });
});

// Handle demographics form submission
router.post('/demographics', async (req, res) => {
  console.log('POST /demographics - URL params:', req.query);
  console.log('POST /demographics - Session data:', {
    sessionId: req.sessionID,
    workerId: req.session.workerId,
    choice: req.session.choice
  });
  
  // Try to get parameters from URL if session is empty
  let { workerId, assignmentId, hitId, experiment, turkSubmitTo } = req.query;
  
  if (!req.session.workerId && workerId && assignmentId && hitId && experiment) {
    console.log('POST demographics session empty, reinitializing from URL parameters');
    
    // Reinitialize session from URL parameters
    req.session.workerId = workerId;
    req.session.assignmentId = assignmentId;
    req.session.hitId = hitId;
    req.session.experimentId = experiment;
    req.session.turkSubmitTo = turkSubmitTo;
    
    // Only assign font/attribution conditions for fluency intervention experiments
    if (experiment !== 'font-pretest') {
      const fontCondition = Math.random() < 0.5 ? 'easy' : 'hard';
      const attributionCondition = Math.random() < 0.5 ? 'present' : 'absent';
      req.session.fontCondition = fontCondition;
      req.session.attributionCondition = attributionCondition;
    }
  }
  
  if (!req.session.workerId) {
    console.log('No workerId in POST demographics, redirecting to home');
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
  
  // Store demographics in database immediately to survive session loss
  try {
    await Response.findOneAndUpdate(
      { workerId: req.session.workerId },
      { 
        age: parseInt(age),
        education: education
      },
      { upsert: true, new: true }
    );
    console.log('Saved demographics to database:', { age, education });
  } catch (error) {
    console.error('Error saving demographics:', error);
  }
  
  // Preserve URL parameters in redirect
  const queryString = new URLSearchParams(req.query).toString();
  const redirectUrl = queryString ? `/complete?${queryString}` : '/complete';
  res.redirect(redirectUrl);
});


// Completion page
router.get('/complete', async (req, res) => {
  console.log('Complete page - URL params:', req.query);
  console.log('Complete page - Session data:', {
    sessionId: req.sessionID,
    workerId: req.session.workerId,
    choice: req.session.choice,
    age: req.session.age
  });
  
  // Try to get parameters from URL if session is empty
  let { workerId, assignmentId, hitId, experiment, turkSubmitTo } = req.query;
  
  if (!req.session.workerId && workerId && assignmentId && hitId && experiment) {
    console.log('Complete session empty, reinitializing from URL parameters');
    
    // Reinitialize session from URL parameters
    req.session.workerId = workerId;
    req.session.assignmentId = assignmentId;
    req.session.hitId = hitId;
    req.session.experimentId = experiment;
    req.session.turkSubmitTo = turkSubmitTo;
    
    // Only assign font/attribution conditions for fluency intervention experiments
    if (experiment !== 'font-pretest') {
      const fontCondition = Math.random() < 0.5 ? 'easy' : 'hard';
      const attributionCondition = Math.random() < 0.5 ? 'present' : 'absent';
      req.session.fontCondition = fontCondition;
      req.session.attributionCondition = attributionCondition;
    }
  }
  
  if (!req.session.workerId) {
    console.log('No workerId in complete page, redirecting to home');
    return res.redirect('/');
  }
  
  try {
    // Get existing partial response from database (should exist from previous form submissions)
    let existingResponse = await Response.findOne({ workerId: req.session.workerId });
    
    if (existingResponse && existingResponse.completionCode) {
      // Worker has already completed - show error
      return res.render('error', { 
        message: 'You have already participated in one of our studies. Thank you for your interest, but you cannot participate in multiple studies.' 
      });
    }
    
    if (!existingResponse) {
      // No partial data found - this shouldn't happen but handle gracefully
      console.log('No existing response found, creating new one');
      existingResponse = new Response({
        workerId: req.session.workerId,
        assignmentId: req.session.assignmentId,
        hitId: req.session.hitId,
        experimentId: req.session.experimentId,
        fontCondition: req.session.fontCondition,
        attributionCondition: req.session.attributionCondition,
        ipAddress: getClientIP(req)
      });
    }
    
    // Check if we have all required data (either from session or database)
    const choice = req.session.choice || existingResponse.choice;
    const age = req.session.age || existingResponse.age;
    const education = req.session.education || existingResponse.education;
    
    if (!choice || !age || !education) {
      console.log('Missing required data:', {
        choice: !!choice,
        age: !!age,
        education: !!education,
        sessionData: {
          choice: !!req.session.choice,
          age: !!req.session.age,
          education: !!req.session.education
        },
        dbData: {
          choice: !!existingResponse.choice,
          age: !!existingResponse.age,
          education: !!existingResponse.education
        }
      });
      return res.render('error', { 
        message: 'Study data incomplete. Please restart the study from the beginning.' 
      });
    }

    // Generate completion code
    const completionCode = generateCompletionCode();
    
    // Complete the response with all data and completion code
    const completedResponse = await Response.findOneAndUpdate(
      { workerId: req.session.workerId },
      {
        workerId: req.session.workerId,
        assignmentId: req.session.assignmentId,
        hitId: req.session.hitId,
        experimentId: req.session.experimentId,
        fontCondition: req.session.fontCondition,
        attributionCondition: req.session.attributionCondition,
        choice: choice,
        age: age,
        education: education,
        completionCode: completionCode,
        ipAddress: getClientIP(req)
      },
      { upsert: true, new: true }
    );
    console.log('Completed response saved:', completedResponse._id);
    
    // Update experiment control count and check if we need to stop the experiment
    const controlStatus = await ExperimentControl.incrementCount(
      req.session.experimentId || completedResponse.experimentId,
      req.session.fontCondition || completedResponse.fontCondition
    );
    
    // If experiment just reached completion, trigger HIT management
    if (controlStatus && !controlStatus.isActive && controlStatus.completedAt) {
      console.log(`Experiment ${req.session.experimentId || completedResponse.experimentId} has reached target sample size. Triggering HIT management...`);
      
      // Try to expire the HIT on AMT
      try {
        await handleExperimentCompletion(
          req.session.hitId || completedResponse.hitId, 
          req.session.experimentId || completedResponse.experimentId, 
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
      assignmentId: req.session.assignmentId || completedResponse.assignmentId,
      hitId: req.session.hitId || completedResponse.hitId,
      turkSubmitTo: req.session.turkSubmitTo || 'https://workersandbox.mturk.com'
    };
    
    // Clear session
    req.session.destroy();
    
    res.render('complete', { 
      completionCode,
      assignmentId: completionInfo.assignmentId,
      hitId: completionInfo.hitId,
      turkSubmitTo: completionInfo.turkSubmitTo
    });
    
  } catch (error) {
    console.error('Error saving response:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      sessionData: {
        workerId: req.session.workerId,
        experimentId: req.session.experimentId,
        choice: req.session.choice,
        age: req.session.age,
        education: req.session.education
      }
    });
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

// Create HIT endpoint
router.post('/create-hit/:experimentId', async (req, res) => {
  try {
    const { experimentId } = req.params;
    const experimentConfig = experimentLoader.loadExperiment(experimentId);
    
    const hit = await createHit(experimentConfig);
    
    if (hit) {
      res.json({
        success: true,
        hitId: hit.HITId,
        hitTypeId: hit.HITTypeId,
        previewUrl: `https://workersandbox.mturk.com/mturk/preview?groupId=${hit.HITTypeId}`,
        message: 'HIT created successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to create HIT - check logs for manual creation instructions'
      });
    }
  } catch (error) {
    console.error('Error creating HIT:', error);
    res.status(500).json({ error: 'Error creating HIT' });
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

// Check HIT status endpoint
router.get('/hit-status/:hitId', async (req, res) => {
  try {
    const { hitId } = req.params;
    const status = await getHitStatus(hitId);
    res.json(status);
  } catch (error) {
    console.error('Error getting HIT status:', error);
    res.status(500).json({ error: 'Error getting HIT status' });
  }
});

// List all HITs endpoint
router.get('/list-hits', async (req, res) => {
  try {
    const hits = await listAllHits();
    if (!hits) {
      return res.json({ message: 'AMT not configured - check HITs manually at https://requestersandbox.mturk.com' });
    }
    
    // Get basic info for each HIT
    const hitSummaries = hits.map(hit => ({
      hitId: hit.HITId,
      title: hit.Title,
      status: hit.HITStatus,
      maxAssignments: hit.MaxAssignments,
      numberOfAssignmentsAvailable: hit.NumberOfAssignmentsAvailable,
      numberOfAssignmentsPending: hit.NumberOfAssignmentsPending,
      numberOfAssignmentsCompleted: hit.NumberOfAssignmentsCompleted,
      creationTime: hit.CreationTime,
      expiration: hit.Expiration
    }));
    
    res.json({ hits: hitSummaries });
  } catch (error) {
    console.error('Error listing HITs:', error);
    res.status(500).json({ error: 'Error listing HITs' });
  }
});

// Approve assignment endpoint
router.post('/approve-assignment', async (req, res) => {
  try {
    const { assignmentId, feedback } = req.body;
    
    if (!assignmentId) {
      return res.status(400).json({ error: 'assignmentId is required' });
    }
    
    const success = await approveAssignment(assignmentId, feedback);
    
    res.json({ 
      success,
      message: success ? 'Assignment approved successfully' : 'Failed to approve assignment - check logs'
    });
  } catch (error) {
    console.error('Error approving assignment:', error);
    res.status(500).json({ error: 'Error approving assignment' });
  }
});

// Reject assignment endpoint
router.post('/reject-assignment', async (req, res) => {
  try {
    const { assignmentId, feedback } = req.body;
    
    if (!assignmentId || !feedback) {
      return res.status(400).json({ error: 'assignmentId and feedback are required' });
    }
    
    const success = await rejectAssignment(assignmentId, feedback);
    
    res.json({ 
      success,
      message: success ? 'Assignment rejected successfully' : 'Failed to reject assignment - check logs'
    });
  } catch (error) {
    console.error('Error rejecting assignment:', error);
    res.status(500).json({ error: 'Error rejecting assignment' });
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