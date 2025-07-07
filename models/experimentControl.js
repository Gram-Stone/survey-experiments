import mongoose from 'mongoose';

const experimentControlSchema = new mongoose.Schema({
  experimentId: {
    type: String,
    required: true,
    unique: true
  },
  targetSampleSize: {
    type: Number,
    required: true,
    min: 1
  },
  currentCount: {
    type: Number,
    default: 0,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  completedAt: {
    type: Date,
    default: null
  },
  conditions: {
    type: Map,
    of: {
      target: Number,
      current: Number
    },
    default: new Map()
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
experimentControlSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to check if experiment is active
experimentControlSchema.statics.isExperimentActive = async function(experimentId) {
  const control = await this.findOne({ experimentId });
  return control ? control.isActive : false;
};

// Static method to increment participant count with race condition protection
experimentControlSchema.statics.incrementCount = async function(experimentId, fontCondition = null) {
  // Use findOneAndUpdate with atomic operations to prevent race conditions
  const update = {
    $inc: { currentCount: 1 },
    updatedAt: new Date()
  };
  
  // Update condition-specific counts if applicable
  if (fontCondition) {
    update.$inc[`conditions.${fontCondition}.current`] = 1;
  }
  
  const control = await this.findOneAndUpdate(
    { experimentId, isActive: true },
    update,
    { new: true }
  );
  
  if (!control) return null;
  
  // Check if target reached and mark as inactive
  if (control.currentCount >= control.targetSampleSize && control.isActive) {
    const finalUpdate = await this.findOneAndUpdate(
      { 
        experimentId, 
        currentCount: { $gte: control.targetSampleSize },
        isActive: true
      },
      {
        isActive: false,
        completedAt: new Date(),
        updatedAt: new Date()
      },
      { new: true }
    );
    
    return finalUpdate || control;
  }
  
  return control;
};

// Static method to get experiment status
experimentControlSchema.statics.getExperimentStatus = async function(experimentId) {
  const control = await this.findOne({ experimentId });
  if (!control) return null;
  
  return {
    experimentId: control.experimentId,
    targetSampleSize: control.targetSampleSize,
    currentCount: control.currentCount,
    isActive: control.isActive,
    completedAt: control.completedAt,
    progress: (control.currentCount / control.targetSampleSize * 100).toFixed(1),
    conditions: Object.fromEntries(control.conditions)
  };
};

// Static method to initialize experiment control
experimentControlSchema.statics.initializeExperiment = async function(experimentId, targetSampleSize, conditions = null) {
  const existing = await this.findOne({ experimentId });
  if (existing) return existing;
  
  const controlData = {
    experimentId,
    targetSampleSize,
    currentCount: 0,
    isActive: true
  };
  
  // Initialize condition-specific targets if provided
  if (conditions) {
    const conditionMap = new Map();
    Object.entries(conditions).forEach(([condition, target]) => {
      conditionMap.set(condition, { target, current: 0 });
    });
    controlData.conditions = conditionMap;
  }
  
  const control = new this(controlData);
  await control.save();
  return control;
};

export default mongoose.model('ExperimentControl', experimentControlSchema);