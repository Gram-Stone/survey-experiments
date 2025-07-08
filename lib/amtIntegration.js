// Amazon Mechanical Turk Integration
// This module handles AMT HIT management for experiment control

import { MTurkClient, CreateHITCommand, GetHITCommand, UpdateExpirationForHITCommand, DeleteHITCommand } from '@aws-sdk/client-mturk';
import dotenv from 'dotenv';
dotenv.config();

// AMT Configuration
const AMT_CONFIG = {
  endpoint: process.env.AMT_ENDPOINT || 'https://mturk-requester-sandbox.us-east-1.amazonaws.com',
  region: process.env.AMT_REGION || 'us-east-1',
  accessKeyId: process.env.AMT_ACCESS_KEY_ID,
  secretAccessKey: process.env.AMT_SECRET_ACCESS_KEY
};

// Check if AMT credentials are configured
function isAmtConfigured() {
  const hasCredentials = AMT_CONFIG.accessKeyId && AMT_CONFIG.secretAccessKey;
  console.log('AMT Configuration Check:', {
    endpoint: AMT_CONFIG.endpoint,
    region: AMT_CONFIG.region,
    hasAccessKey: !!AMT_CONFIG.accessKeyId,
    hasSecretKey: !!AMT_CONFIG.secretAccessKey,
    configured: hasCredentials
  });
  return hasCredentials;
}

// Initialize AMT client
function initializeAmtClient() {
  if (!isAmtConfigured()) {
    console.warn('AMT credentials not configured. HIT management will be manual.');
    return null;
  }
  
  return new MTurkClient({
    endpoint: AMT_CONFIG.endpoint,
    region: AMT_CONFIG.region,
    credentials: {
      accessKeyId: AMT_CONFIG.accessKeyId,
      secretAccessKey: AMT_CONFIG.secretAccessKey
    }
  });
}

// Get HIT information
async function getHitInfo(hitId) {
  const client = initializeAmtClient();
  if (!client) {
    console.log(`Manual action required: Check status of HIT ${hitId} on AMT`);
    return null;
  }
  
  try {
    const command = new GetHITCommand({ HITId: hitId });
    const result = await client.send(command);
    return result.HIT;
  } catch (error) {
    console.error(`Error getting HIT info for ${hitId}:`, error);
    return null;
  }
}

// Expire a HIT immediately
async function expireHit(hitId) {
  const client = initializeAmtClient();
  if (!client) {
    console.log(`MANUAL ACTION REQUIRED: Expire HIT ${hitId} on Amazon Mechanical Turk`);
    console.log(`1. Go to https://requester.mturk.com/`);
    console.log(`2. Find HIT ${hitId} in your HITs list`);
    console.log(`3. Click "Expire" to stop accepting new workers`);
    return false;
  }
  
  try {
    const command = new UpdateExpirationForHITCommand({
      HITId: hitId,
      ExpireAt: new Date() // Expire immediately
    });
    await client.send(command);
    
    console.log(`Successfully expired HIT ${hitId}`);
    return true;
  } catch (error) {
    console.error(`Error expiring HIT ${hitId}:`, error);
    return false;
  }
}

// Delete a HIT (only after it's been expired and all assignments completed)
async function deleteHit(hitId) {
  const client = initializeAmtClient();
  if (!client) {
    console.log(`MANUAL ACTION: Consider deleting HIT ${hitId} after all assignments are completed`);
    return false;
  }
  
  try {
    const command = new DeleteHITCommand({ HITId: hitId });
    await client.send(command);
    console.log(`Successfully deleted HIT ${hitId}`);
    return true;
  } catch (error) {
    console.error(`Error deleting HIT ${hitId}:`, error);
    return false;
  }
}

// Create a new HIT using ExternalQuestion
async function createHit(experimentConfig) {
  const client = initializeAmtClient();
  if (!client) {
    console.log('MANUAL ACTION REQUIRED: Create HIT manually in MTurk interface');
    const params = createHitParameters(experimentConfig);
    console.log('Use these parameters:');
    console.log(JSON.stringify(params, null, 2));
    return null;
  }
  
  try {
    const params = createHitParameters(experimentConfig);
    const command = new CreateHITCommand(params);
    const result = await client.send(command);
    
    console.log(`Successfully created HIT: ${result.HIT.HITId}`);
    console.log(`HIT Type ID: ${result.HIT.HITTypeId}`);
    console.log(`HIT URL: https://workersandbox.mturk.com/mturk/preview?groupId=${result.HIT.HITTypeId}`);
    
    return result.HIT;
  } catch (error) {
    console.error('Error creating HIT:', error);
    return null;
  }
}

// Main function to handle experiment completion
async function handleExperimentCompletion(hitId, experimentId, targetSampleSize) {
  console.log(`\n=== EXPERIMENT COMPLETION HANDLER ===`);
  console.log(`Experiment: ${experimentId}`);
  console.log(`HIT ID: ${hitId}`);
  console.log(`Target Sample Size: ${targetSampleSize}`);
  
  // Step 1: Get HIT information
  const hitInfo = await getHitInfo(hitId);
  if (hitInfo) {
    console.log(`HIT Status: ${hitInfo.HITStatus}`);
    console.log(`Max Assignments: ${hitInfo.MaxAssignments}`);
    console.log(`Number of Assignments Available: ${hitInfo.NumberOfAssignmentsAvailable}`);
    console.log(`Number of Assignments Completed: ${hitInfo.NumberOfAssignmentsCompleted}`);
  }
  
  // Step 2: Expire the HIT to prevent new assignments
  const expired = await expireHit(hitId);
  
  // Step 3: Log completion
  console.log(`Experiment ${experimentId} has reached its target sample size.`);
  console.log(`HIT ${hitId} has been ${expired ? 'automatically expired' : 'marked for manual expiration'}.`);
  
  // Step 4: Provide instructions for manual cleanup if needed
  if (!expired) {
    console.log(`\n=== MANUAL ACTIONS REQUIRED ===`);
    console.log(`1. Log in to Amazon Mechanical Turk Requester Interface`);
    console.log(`2. Navigate to your HITs list`);
    console.log(`3. Find HIT ${hitId}`);
    console.log(`4. Click "Expire" to stop accepting new workers`);
    console.log(`5. Wait for any in-progress assignments to complete`);
    console.log(`6. Optionally delete the HIT after all assignments are finished`);
  }
  
  return expired;
}

// Create AMT HIT parameters that match experiment configuration
function createHitParameters(experimentConfig) {
  const baseUrl = process.env.BASE_URL || 'https://your-domain.com';
  const experimentId = experimentConfig.experimentId;
  const targetSampleSize = experimentConfig.experimentControl?.targetSampleSize || 100;
  
  return {
    Title: `${experimentConfig.title} - Psychology Research Study`,
    Description: experimentConfig.description || 'Participate in a psychology research study',
    Keywords: 'psychology, research, decision making, survey',
    Reward: process.env.AMT_REWARD || '1.00', // $1.00 default
    AssignmentDurationInSeconds: 30 * 60, // 30 minutes
    AutoApprovalDelayInSeconds: 24 * 60 * 60, // 24 hours
    LifetimeInSeconds: 7 * 24 * 60 * 60, // 7 days
    MaxAssignments: targetSampleSize,
    Question: `
      <ExternalQuestion xmlns="http://mechanicalturk.amazonaws.com/AWSMechanicalTurkDataSchemas/2006-07-14/ExternalQuestion.xsd">
        <ExternalURL>${baseUrl}/?experiment=${experimentId}</ExternalURL>
        <FrameHeight>600</FrameHeight>
      </ExternalQuestion>
    `,
    RequesterAnnotation: `Experiment: ${experimentId}, Target: ${targetSampleSize}`,
    QualificationRequirements: AMT_CONFIG.endpoint.includes('sandbox') ? [
      // Sandbox/testing qualifications - very relaxed
      {
        QualificationTypeId: '00000000000000000071', // Location is US
        Comparator: 'EqualTo', 
        LocaleValues: [{ Country: 'US' }]
      }
    ] : [
      // Production qualifications - strict quality controls
      {
        QualificationTypeId: '00000000000000000071', // Location is US
        Comparator: 'EqualTo',
        LocaleValues: [{ Country: 'US' }]
      },
      {
        QualificationTypeId: '000000000000000000L0', // Approval rate >= 95%
        Comparator: 'GreaterThanOrEqualTo',
        IntegerValues: [95]
      },
      {
        QualificationTypeId: '00000000000000000040', // Number of HITs approved >= 100
        Comparator: 'GreaterThanOrEqualTo',
        IntegerValues: [100]
      }
    ]
  };
}

export {
  isAmtConfigured,
  getHitInfo,
  expireHit,
  deleteHit,
  createHit,
  handleExperimentCompletion,
  createHitParameters
};