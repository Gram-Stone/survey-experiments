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
    required: true
  },
  age: {
    type: Number,
    required: true,
    min: 18,
    max: 120
  },
  education: {
    type: String,
    enum: ['high_school', 'some_college', 'bachelors', 'masters', 'doctorate'],
    required: true
  },
  readabilityRating: {
    type: Number,
    required: true,
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