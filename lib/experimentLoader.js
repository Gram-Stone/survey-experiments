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
    const required = ['experimentId', 'title'];
    for (const field of required) {
      if (!config[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Handle multi-page experiments with new pageOrdering structure
    if (config.multiPage && config.pageOrdering) {
      this.validatePageOrdering(config.pageOrdering);
    } else if (config.multiPage && config.pages) {
      // Legacy multi-page format
      if (!Array.isArray(config.pages) || config.pages.length < 1) {
        throw new Error('Multi-page experiment must have at least 1 page');
      }

      for (const page of config.pages) {
        if (!page.id || !page.title || !page.content) {
          throw new Error('Each page must have id, title, and content');
        }
        
        if (page.type === 'choice' && (!page.choices || page.choices.length < 2)) {
          throw new Error('Choice pages must have at least 2 choices');
        }
      }
    } else {
      // Handle legacy single-page experiments
      if (!config.options || !Array.isArray(config.options) || config.options.length < 2) {
        throw new Error('Experiment must have at least 2 options');
      }

      for (const option of config.options) {
        if (!option.id || !option.label || !option.content) {
          throw new Error('Each option must have id, label, and content');
        }
      }
    }
  }

  // Validate new page ordering structure
  validatePageOrdering(pageOrdering) {
    // Validate fixed pages
    if (pageOrdering.fixed) {
      for (const page of pageOrdering.fixed) {
        this.validatePage(page);
      }
    }

    // Validate randomizable pages
    if (pageOrdering.randomizable) {
      for (const page of pageOrdering.randomizable) {
        this.validatePage(page);
      }
    }

    // Validate constrained pages
    if (pageOrdering.constrained) {
      for (const page of pageOrdering.constrained) {
        this.validatePage(page);
        if (page.constraints && page.constraints.minSeparationFromPage) {
          // Could add validation that the referenced page exists
        }
      }
    }
  }

  // Validate individual page
  validatePage(page) {
    if (!page.id || !page.title) {
      throw new Error('Each page must have id and title');
    }
    
    if (page.type === 'choice' && (!page.choices || page.choices.length < 2)) {
      throw new Error('Choice pages must have at least 2 choices');
    }

    if (page.type === 'radio' && (!page.choices || page.choices.length < 2)) {
      throw new Error('Radio pages must have at least 2 choices');
    }

    if (page.type === 'input' && !page.inputType) {
      throw new Error('Input pages must specify inputType');
    }
  }

  // Generate choice options for database storage
  getValidChoices(experimentId) {
    const config = this.loadExperiment(experimentId);
    
    if (config.multiPage && config.pages) {
      // For multi-page experiments, collect all possible response values
      const choices = [];
      for (const page of config.pages) {
        if (page.type === 'choice' && page.choices) {
          choices.push(...page.choices.map(choice => choice.value));
        }
      }
      return choices;
    } else {
      // Legacy single-page experiments
      const choices = config.options.map(opt => opt.id);
      
      if (config.enableDefer) {
        choices.push('DEFER');
      }
      
      return choices;
    }
  }

  // Validate attention check responses
  validateAttentionCheck(responses) {
    // Check for math attention check (legacy name)
    const mathAnswer = responses.math;
    if (mathAnswer && parseInt(mathAnswer) !== 42) {
      return {
        passed: false,
        failedCheck: 'math',
        message: 'Failed attention check: incorrect arithmetic answer'
      };
    }
    
    // Check for attention attention check (new name)
    const attentionAnswer = responses.attention;
    if (attentionAnswer && parseInt(attentionAnswer) !== 42) {
      return {
        passed: false,
        failedCheck: 'attention',
        message: 'Failed attention check: incorrect arithmetic answer'
      };
    }
    
    return { passed: true };
  }

  // Clear cache (useful for development)
  clearCache() {
    this.cache.clear();
  }
}

export default new ExperimentLoader();