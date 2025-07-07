import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ExperimentLoader {
  constructor() {
    this.experimentsPath = path.join(__dirname, '..', 'experiments');
    this.cache = new Map();
  }

  // Load experiment configuration
  loadExperiment(experimentId) {
    if (this.cache.has(experimentId)) {
      return this.cache.get(experimentId);
    }

    try {
      const configPath = path.join(this.experimentsPath, experimentId, 'config.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      
      // Validate required fields
      this.validateConfig(config);
      
      this.cache.set(experimentId, config);
      return config;
    } catch (error) {
      throw new Error(`Failed to load experiment '${experimentId}': ${error.message}`);
    }
  }

  // Get list of available experiments
  getAvailableExperiments() {
    try {
      const experiments = [];
      const dirs = fs.readdirSync(this.experimentsPath);
      
      for (const dir of dirs) {
        const dirPath = path.join(this.experimentsPath, dir);
        const configPath = path.join(dirPath, 'config.json');
        
        if (fs.statSync(dirPath).isDirectory() && fs.existsSync(configPath)) {
          try {
            const config = this.loadExperiment(dir);
            experiments.push({
              id: dir,
              title: config.title,
              description: config.description
            });
          } catch (error) {
            console.warn(`Skipping invalid experiment '${dir}': ${error.message}`);
          }
        }
      }
      
      return experiments;
    } catch (error) {
      throw new Error(`Failed to list experiments: ${error.message}`);
    }
  }

  // Validate experiment configuration
  validateConfig(config) {
    const required = ['experimentId', 'title', 'options'];
    for (const field of required) {
      if (!config[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (!Array.isArray(config.options) || config.options.length < 2) {
      throw new Error('Experiment must have at least 2 options');
    }

    for (const option of config.options) {
      if (!option.id || !option.label || !option.content) {
        throw new Error('Each option must have id, label, and content');
      }
    }
  }

  // Generate choice options for database storage
  getValidChoices(experimentId) {
    const config = this.loadExperiment(experimentId);
    const choices = config.options.map(opt => opt.id);
    
    if (config.enableDefer) {
      choices.push('DEFER');
    }
    
    return choices;
  }

  // Clear cache (useful for development)
  clearCache() {
    this.cache.clear();
  }
}

export default new ExperimentLoader();