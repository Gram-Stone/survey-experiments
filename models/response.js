import mongoose from 'mongoose';

const responseSchema = new mongoose.Schema({
  workerId: {
    type: String,
    required: true,
    index: true
  },
  assignmentId: {
    type: String,
    required: true
  },
  hitId: {
    type: String,
    required: true
  },
  experimentId: {
    type: String,
    required: true,
    index: true
  },
  fontCondition: {
    type: String,
    enum: ['easy', 'hard'],
    required: true
  },
  attributionCondition: {
    type: String,
    enum: ['present', 'absent'],
    required: true
  },
  choice: {
    type: String,
    required: false // Make optional for multi-page experiments
  },
  // For multi-page experiments, store all responses
  allResponses: {
    type: mongoose.Schema.Types.Mixed,
    required: false
  },
  age: {
    type: Number,
    required: false,
    min: 18,
    max: 120
  },
  education: {
    type: String,
    enum: ['less_than_hs', 'hs_diploma', 'some_college', 'associates', 'bachelors', 'masters', 'doctoral', 'professional', 'high_school', 'doctorate'],
    required: false
  },
  readabilityRating: {
    type: Number,
    required: false,
    min: 1,
    max: 5
  },
  completionCode: {
    type: String,
    required: true,
    unique: true
  },
  ipAddress: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
responseSchema.index({ workerId: 1, assignmentId: 1 });
responseSchema.index({ experimentId: 1, fontCondition: 1, attributionCondition: 1 });

export default mongoose.model('Response', responseSchema);