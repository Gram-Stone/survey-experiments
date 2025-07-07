import mongoose from 'mongoose';
import Response from '../models/response.js';
import dotenv from 'dotenv';

dotenv.config();

// Database connection functions
async function connect() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
}

async function disconnect() {
  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
}

// Basic descriptive statistics
function calculateStats(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sorted = values.sort((a, b) => a - b);
  const median = n % 2 === 0 ? 
    (sorted[n/2 - 1] + sorted[n/2]) / 2 : 
    sorted[Math.floor(n/2)];
  
  const variance = values.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  
  return { n, mean, median, stdDev, min: sorted[0], max: sorted[n-1] };
}

// Calculate confidence interval for proportion (Wilson method)
function calculateProportionCI(successes, n, confidence = 0.95) {
  const z = confidence === 0.95 ? 1.96 : 2.576; // 95% or 99% CI
  const p = successes / n;
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n);
  const center = (p + z * z / (2 * n)) / (1 + z * z / n);
  
  return {
    lower: Math.max(0, (center - margin) * 100),
    upper: Math.min(100, (center + margin) * 100)
  };
}

// Calculate statistical power for two-proportion test (approximation)
function calculatePower(n1, n2, effectSize, pooledP, alpha = 0.05) {
  const z_alpha = 1.96; // For alpha = 0.05, two-tailed
  const pooledVar = pooledP * (1 - pooledP) * (1/n1 + 1/n2);
  const standardError = Math.sqrt(pooledVar);
  
  // Effect size in terms of standard errors
  const delta = effectSize / standardError;
  
  // Power approximation using normal distribution
  const z_beta = delta - z_alpha;
  const power = 1 - normalCDF(z_beta);
  
  return Math.max(0, Math.min(1, power));
}

// Normal cumulative distribution function approximation
function normalCDF(z) {
  // Approximation for standard normal CDF
  const t = 1.0 / (1.0 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2.0);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  
  if (z > 0.0) prob = 1.0 - prob;
  return prob;
}

// Get recommended sample size for experiment
function getRecommendedSampleSize(experimentId) {
  const recommendations = {
    'novemsky2007': 200,
    'allais-paradox': 150,
    'font-pretest': 50
  };
  return recommendations[experimentId] || 100;
}

// Chi-square test for categorical data
function chiSquareTest(observed, expected) {
  let chiSq = 0;
  for (let i = 0; i < observed.length; i++) {
    chiSq += Math.pow(observed[i] - expected[i], 2) / expected[i];
  }
  
  // Simple p-value approximation for df=1 (good enough for 2x2 tables)
  const df = observed.length - 1;
  let p;
  if (df === 1) {
    if (chiSq > 10.83) p = '<0.001';
    else if (chiSq > 6.63) p = '<0.01';
    else if (chiSq > 3.84) p = '<0.05';
    else p = '>0.05';
  } else {
    p = 'approx'; // For larger tables, just show the chi-square value
  }
  
  return { chiSq: chiSq.toFixed(3), p };
}

// Paired t-test for pretest analysis
function pairedTTest(sample1, sample2) {
  const n = sample1.length;
  if (n !== sample2.length || n < 2) {
    return { error: 'Invalid sample sizes' };
  }
  
  // Calculate differences
  const differences = sample1.map((val, i) => val - sample2[i]);
  const meanDiff = differences.reduce((a, b) => a + b, 0) / n;
  const variance = differences.reduce((sum, d) => sum + Math.pow(d - meanDiff, 2), 0) / (n - 1);
  const stdError = Math.sqrt(variance / n);
  const tStat = meanDiff / stdError;
  const df = n - 1;
  
  // Simple p-value approximation for common df values
  let p;
  const absTStat = Math.abs(tStat);
  if (df >= 30) {
    if (absTStat > 3.29) p = '<0.001';
    else if (absTStat > 2.58) p = '<0.01';
    else if (absTStat > 1.96) p = '<0.05';
    else p = '>0.05';
  } else if (df >= 20) {
    if (absTStat > 3.55) p = '<0.001';
    else if (absTStat > 2.75) p = '<0.01';
    else if (absTStat > 2.09) p = '<0.05';
    else p = '>0.05';
  } else {
    p = 'approx'; // For smaller samples, just show t-statistic
  }
  
  return {
    n,
    meanDiff: meanDiff.toFixed(3),
    stdError: stdError.toFixed(3),
    tStat: tStat.toFixed(3),
    df,
    p
  };
}

// Generic experiment analyzer
async function analyzeExperiment(experimentId) {
  const data = await Response.find({ experimentId });
  
  // Get experiment configuration
  let experiment;
  try {
    const experimentLoader = await import('../lib/experimentLoader.js');
    experiment = experimentLoader.default.loadExperiment(experimentId);
  } catch (error) {
    console.log(`\nWarning: Could not load experiment config for ${experimentId}`);
    experiment = { title: experimentId };
  }
  
  console.log(`\n=== ${experiment.title?.toUpperCase() || experimentId.toUpperCase()} ===`);
  console.log(`Total participants: ${data.length}`);
  
  if (data.length === 0) {
    console.log(`No data found for ${experimentId} experiment`);
    return;
  }
  
  // Check if we have sufficient sample size for meaningful analysis
  if (data.length < 10) {
    console.log(`\nWarning: Sample size (n=${data.length}) is too small for reliable statistical analysis.`);
    console.log(`Consider collecting more data before interpreting results.`);
  }

  // Group by conditions (if applicable)
  const hasConditions = data.some(r => r.fontCondition && r.attributionCondition);
  if (hasConditions) {
    const conditions = {};
    data.forEach(response => {
      const key = `${response.fontCondition}-${response.attributionCondition}`;
      if (!conditions[key]) conditions[key] = [];
      conditions[key].push(response);
    });

    console.log('\nParticipants by condition:');
    Object.keys(conditions).forEach(condition => {
      console.log(`${condition}: ${conditions[condition].length}`);
    });
  }

  // Choice analysis
  console.log('\n--- CHOICE ANALYSIS ---');
  const choicesByFont = {};
  const allChoices = [...new Set(data.map(r => r.choice))];
  
  data.forEach(response => {
    const font = response.fontCondition || 'unknown';
    if (!choicesByFont[font]) {
      choicesByFont[font] = {};
      allChoices.forEach(choice => choicesByFont[font][choice] = 0);
    }
    choicesByFont[font][response.choice]++;
  });

  console.log('\nChoice distribution by condition:');
  Object.keys(choicesByFont).forEach(font => {
    const choices = choicesByFont[font];
    const total = Object.values(choices).reduce((a, b) => a + b, 0);
    console.log(`\n${font} condition (n=${total}):`);
    
    Object.keys(choices).forEach(choice => {
      const count = choices[choice];
      const percentage = total > 0 ? (count/total*100).toFixed(1) : '0.0';
      console.log(`  ${choice}: ${count} (${percentage}%)`);
    });
  });

  // Deferral analysis (if defer option exists)
  if (allChoices.includes('DEFER')) {
    console.log('\n--- DEFERRAL ANALYSIS ---');
    const deferralByFont = {};
    
    Object.keys(choicesByFont).forEach(font => {
      const choices = choicesByFont[font];
      deferralByFont[font] = {
        defer: choices.DEFER || 0,
        choose: Object.keys(choices).filter(c => c !== 'DEFER').reduce((sum, c) => sum + choices[c], 0)
      };
    });

    console.log('\nDeferral rates by condition:');
    Object.keys(deferralByFont).forEach(font => {
      const condition = deferralByFont[font];
      const total = condition.defer + condition.choose;
      const rate = total > 0 ? (condition.defer / total * 100).toFixed(1) : '0.0';
      console.log(`${font}: ${condition.defer}/${total} (${rate}%)`);
    });

    // Chi-square test for font effect on deferral (if easy/hard conditions)
    if (deferralByFont.easy && deferralByFont.hard) {
      const easyTotal = deferralByFont.easy.defer + deferralByFont.easy.choose;
      const hardTotal = deferralByFont.hard.defer + deferralByFont.hard.choose;
      
      if (easyTotal > 0 && hardTotal > 0) {
        const totalDefer = deferralByFont.easy.defer + deferralByFont.hard.defer;
        const totalChoose = deferralByFont.easy.choose + deferralByFont.hard.choose;
        const totalParticipants = totalDefer + totalChoose;
        
        const expectedEasyDefer = (totalDefer * easyTotal) / totalParticipants;
        const expectedHardDefer = (totalDefer * hardTotal) / totalParticipants;
        
        const observed = [deferralByFont.easy.defer, deferralByFont.hard.defer];
        const expected = [expectedEasyDefer, expectedHardDefer];
        
        const chiTest = chiSquareTest(observed, expected);
        console.log(`\nChi-square test: χ² = ${chiTest.chiSq}, p ${chiTest.p}`);
        
        // Calculate effect size (Cohen's w) and confidence intervals
        const easyDeferRate = deferralByFont.easy.defer / easyTotal;
        const hardDeferRate = deferralByFont.hard.defer / hardTotal;
        const effectSize = Math.abs(hardDeferRate - easyDeferRate);
        
        // 95% confidence intervals for proportions (Wilson method)
        const easyCI = calculateProportionCI(deferralByFont.easy.defer, easyTotal);
        const hardCI = calculateProportionCI(deferralByFont.hard.defer, hardTotal);
        
        console.log(`\nEffect size: ${(effectSize * 100).toFixed(1)} percentage points`);
        console.log(`Easy condition deferral rate: ${(easyDeferRate * 100).toFixed(1)}% (95% CI: ${easyCI.lower.toFixed(1)}%-${easyCI.upper.toFixed(1)}%)`);
        console.log(`Hard condition deferral rate: ${(hardDeferRate * 100).toFixed(1)}% (95% CI: ${hardCI.lower.toFixed(1)}%-${hardCI.upper.toFixed(1)}%)`);
        
        // Statistical power calculation (post-hoc)
        const pooledP = (deferralByFont.easy.defer + deferralByFont.hard.defer) / totalParticipants;
        const power = calculatePower(easyTotal, hardTotal, effectSize, pooledP);
        console.log(`Estimated statistical power: ${(power * 100).toFixed(1)}%`);
      }
    }
  }

  // Attribution analysis (if applicable)
  const hardFontData = data.filter(r => r.fontCondition === 'hard');
  if (hardFontData.length > 0 && hardFontData.some(r => r.attributionCondition)) {
    console.log('\n--- ATTRIBUTION MANIPULATION ---');
    const attributionEffect = {
      absent: { defer: 0, choose: 0 },
      present: { defer: 0, choose: 0 }
    };

    hardFontData.forEach(response => {
      const deferred = response.choice === 'DEFER';
      if (deferred) {
        attributionEffect[response.attributionCondition].defer++;
      } else {
        attributionEffect[response.attributionCondition].choose++;
      }
    });

    console.log('\nDeferral rates in hard font condition by attribution:');
    Object.keys(attributionEffect).forEach(attr => {
      const condition = attributionEffect[attr];
      const total = condition.defer + condition.choose;
      const rate = total > 0 ? (condition.defer / total * 100).toFixed(1) : '0.0';
      console.log(`Attribution ${attr}: ${condition.defer}/${total} (${rate}%)`);
    });
  }

  // Risk preference analysis (for 2-option A/B choices)
  const riskChoices = data.filter(r => ['A', 'B'].includes(r.choice));
  if (riskChoices.length > 0) {
    console.log('\n--- RISK PREFERENCE ANALYSIS (A vs B only) ---');
    const riskByFont = {};
    
    riskChoices.forEach(response => {
      const font = response.fontCondition || 'unknown';
      if (!riskByFont[font]) riskByFont[font] = { A: 0, B: 0 };
      riskByFont[font][response.choice]++;
    });

    Object.keys(riskByFont).forEach(font => {
      const choices = riskByFont[font];
      const total = choices.A + choices.B;
      if (total > 0) {
        console.log(`${font}: ${choices.A}/${total} chose option A (${(choices.A/total*100).toFixed(1)}%)`);
      }
    });
  }

  // Manipulation check (readability ratings)
  const ratingsData = data.filter(r => r.readabilityRating);
  if (ratingsData.length > 0) {
    console.log('\n--- MANIPULATION CHECK ---');
    const readabilityByFont = {};
    
    ratingsData.forEach(response => {
      const font = response.fontCondition || 'unknown';
      if (!readabilityByFont[font]) readabilityByFont[font] = [];
      readabilityByFont[font].push(response.readabilityRating);
    });

    Object.keys(readabilityByFont).forEach(font => {
      const ratings = readabilityByFont[font];
      if (ratings.length > 0) {
        const stats = calculateStats(ratings);
        console.log(`${font} readability: M=${stats.mean.toFixed(2)}, SD=${stats.stdDev.toFixed(2)}, n=${stats.n}`);
      }
    });
  }

  // Sample size recommendations
  if (data.length < 50) {
    console.log('\n--- SAMPLE SIZE RECOMMENDATIONS ---');
    console.log(`Current sample size: ${data.length}`);
    
    if (experimentId === 'novemsky2007') {
      console.log('Recommended minimum sample size: 200 participants (100 per condition)');
      console.log('This is based on the original study which found a 24 percentage point difference');
      console.log('between conditions (17% vs 41% deferral rates).');
    } else if (experimentId === 'allais-paradox') {
      console.log('Recommended minimum sample size: 150 participants (75 per condition)');
      console.log('This should provide adequate power to detect medium-sized effects.');
    } else if (experimentId === 'font-pretest') {
      console.log('Recommended minimum sample size: 50 participants');
      console.log('This is a manipulation check study requiring less power.');
    }
    
    const remaining = Math.max(0, getRecommendedSampleSize(experimentId) - data.length);
    if (remaining > 0) {
      console.log(`Recommended additional participants needed: ${remaining}`);
    }
  }

  // Experiment-specific notes
  if (experimentId === 'novemsky2007') {
    console.log('\nExpected replication: 17% easy vs 41% hard font deferral rates');
  } else if (experimentId === 'font-pretest') {
    console.log('\nExpected: Hard font rated significantly more difficult than easy font');
    console.log('Original study: Ms = 3.53 (hard) and 4.88 (easy); t(32) = 2.75, p < .01');
  }

  return {
    totalParticipants: data.length,
    choicesByFont,
    experimentId
  };
}

// Export data to CSV
async function exportData(experimentId = null) {
  const query = experimentId ? { experimentId } : {};
  const data = await Response.find(query).sort({ createdAt: 1 });
  
  console.log('\n=== DATA EXPORT ===');
  console.log('CSV format data:\n');
  
  // Header
  const headers = [
    'workerId', 'experimentId', 'fontCondition', 'attributionCondition', 
    'choice', 'age', 'education', 'readabilityRating', 'completionCode', 
    'createdAt'
  ];
  console.log(headers.join(','));
  
  // Data rows
  data.forEach(response => {
    const row = [
      response.workerId,
      response.experimentId,
      response.fontCondition,
      response.attributionCondition,
      response.choice,
      response.age,
      response.education,
      response.readabilityRating,
      response.completionCode,
      response.createdAt.toISOString()
    ];
    console.log(row.join(','));
  });
}

// Main analysis runner
async function runAnalysis(options = {}) {
  await connect();
  
  try {
    if (options.experiment) {
      await analyzeExperiment(options.experiment);
    } else {
      // Analyze all experiments if none specified
      const experiments = ['font-pretest', 'novemsky2007', 'allais-paradox'];
      for (const exp of experiments) {
        try {
          await analyzeExperiment(exp);
        } catch (error) {
          console.log(`\nSkipping ${exp}: ${error.message}`);
        }
      }
    }
    
    if (options.export) {
      await exportData(options.experiment);
    }
    
  } catch (error) {
    console.error('Analysis error:', error);
  } finally {
    await disconnect();
  }
}

// Command line interface
const args = process.argv.slice(2);
const options = {};

args.forEach(arg => {
  if (arg === '--export') options.export = true;
  if (arg.startsWith('--experiment=')) options.experiment = arg.split('=')[1];
});

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAnalysis(options);
}

// Export functions for potential reuse
export { 
  connect, 
  disconnect, 
  calculateStats, 
  calculateProportionCI,
  calculatePower,
  chiSquareTest,
  pairedTTest,
  analyzeExperiment, 
  exportData, 
  runAnalysis,
  getRecommendedSampleSize
};