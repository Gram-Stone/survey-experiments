# Amazon Mechanical Turk (AMT) Integration Guide

This guide explains how to set up and manage AMT HITs with automatic experiment control.

## Overview

The system now includes:
1. **Automatic experiment stopping** when target sample size is reached
2. **AMT HIT parameter generation** for easy HIT creation
3. **Automatic HIT expiration** (when AWS credentials are configured)
4. **Race condition protection** to prevent over-recruitment

## Setup Process

### 1. Configure Environment Variables

Add these to your `.env` file:

```bash
# AMT Configuration
AMT_ENDPOINT=https://mturk-requester-sandbox.us-east-1.amazonaws.com  # Sandbox
# AMT_ENDPOINT=https://mturk-requester.us-east-1.amazonaws.com        # Production
AMT_REGION=us-east-1
AMT_ACCESS_KEY_ID=your_access_key_here
AMT_SECRET_ACCESS_KEY=your_secret_key_here
AMT_REWARD=1.00

# Base URL for your experiment
BASE_URL=https://your-domain.com
```

### 2. Generate HIT Parameters

Visit: `GET /amt-parameters/{experimentId}`

Example: `https://your-domain.com/amt-parameters/novemsky2007`

This returns JSON with all the parameters you need to create the HIT on AMT.

### 3. Create HIT on Amazon Mechanical Turk

1. Go to [AMT Requester Interface](https://requester.mturk.com/)
2. Click "Create" → "New HIT" 
3. Choose "External URL" template
4. Copy the parameters from the `/amt-parameters` endpoint:
   - **Title**: From the JSON response
   - **Description**: From the JSON response  
   - **Keywords**: From the JSON response
   - **Reward**: Set your desired payment
   - **External URL**: Copy the `externalUrl` from the response
   - **Max Assignments**: **CRITICAL** - Set this to match your `targetSampleSize`
   - **Assignment Duration**: 30 minutes (recommended)
   - **Auto-approval**: 24 hours (recommended)
   - **HIT Lifetime**: 7 days (recommended)

5. Set qualification requirements:
   - Location: United States
   - HIT Approval Rate: ≥ 95%
   - Number of HITs Approved: ≥ 100

6. Publish the HIT

## How Automatic Control Works

### During Experiment

1. **Participant Access**: When a worker clicks your HIT, they're directed to your experiment URL
2. **Active Check**: System checks if experiment is still active before allowing participation
3. **Completion Tracking**: When a participant completes the study, the counter increments
4. **Automatic Stopping**: When target sample size is reached:
   - Experiment status changes to "inactive"
   - New participants see "experiment completed" message
   - System attempts to expire the HIT automatically (if AWS credentials configured)

### Race Condition Protection

The system uses MongoDB atomic operations to prevent over-recruitment:
- Counter increments are atomic
- Multiple simultaneous completions won't cause overshooting
- Only active experiments accept new participants

## Manual HIT Management

### If AWS Credentials Not Configured

When the target is reached, you'll see console messages like:
```
MANUAL ACTION REQUIRED: Expire HIT H123456789 on Amazon Mechanical Turk
1. Go to https://requester.mturk.com/
2. Find HIT H123456789 in your HITs list  
3. Click "Expire" to stop accepting new workers
```

### Emergency HIT Expiration

You can manually expire a HIT using:
```bash
curl -X POST https://your-domain.com/expire-hit \
  -H "Content-Type: application/json" \
  -d '{"hitId": "H123456789", "experimentId": "novemsky2007"}'
```

## Monitoring Progress

### Dashboard
Visit: `GET /dashboard`

Shows real-time progress for all experiments:
- Current participant count
- Target sample size
- Progress percentage
- Status (Active/Completed)
- Condition breakdowns

### Status API
Visit: `GET /status/{experimentId}`

Returns JSON with current experiment status.

## Target Sample Sizes

Current configurations:
- **Font Pretest**: 50 participants
- **Novemsky 2007 Replication**: 200 participants (100 per condition)
- **Allais Paradox**: 150 participants (75 per condition)

## Best Practices

### Before Publishing HIT

1. **Test the experiment** thoroughly with the full URL including AMT parameters
2. **Verify target sample size** matches your research needs
3. **Check experiment configuration** is correct
4. **Test with preview mode** (assignmentId=ASSIGNMENT_ID_NOT_AVAILABLE)

### During Data Collection

1. **Monitor the dashboard** regularly
2. **Check server logs** for any errors
3. **Verify HIT parameters** match your experiment configuration
4. **Be prepared for manual HIT expiration** if automatic fails

### After Completion

1. **Verify final sample size** in the dashboard
2. **Check that HIT is expired** on AMT
3. **Approve worker assignments** promptly
4. **Download and analyze data** using the analysis scripts

## Troubleshooting

### Over-recruitment
If you get more participants than expected:
- Check if HIT MaxAssignments exceeded your target
- Verify the counter incremented properly in the database
- Look for race conditions in server logs

### Under-recruitment  
If the HIT expires before reaching target:
- Check experiment error rates
- Verify AMT worker qualifications aren't too restrictive
- Consider increasing reward or extending HIT lifetime

### HIT Won't Expire
If automatic expiration fails:
- Check AWS credentials in `.env`
- Verify HIT ID is correct
- Use manual expiration endpoint
- Expire manually on AMT website

## AWS SDK Installation (Optional)

To enable automatic HIT management, install the AWS SDK:

```bash
npm install aws-sdk
```

Then uncomment the AWS integration code in `/lib/amtIntegration.js`.

## Security Notes

- **Never commit AWS credentials** to version control
- **Use IAM roles** with minimal required permissions
- **Test thoroughly in sandbox** before production
- **Monitor costs** to prevent unexpected charges