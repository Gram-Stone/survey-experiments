# Configuration Primitives for Experiment System

## Core Primitive Structure

```json
{
  "experimentId": "string",
  "title": "string",
  "description": "string",
  
  "responseType": "choice|rating|comparison|within-subjects",
  
  "pageFlow": {
    "landing": { "enabled": true, "title": "Research Study" },
    "instructions": { "enabled": true, "title": "Instructions" },
    "experiment": { "enabled": true, "title": "Decision Task" },
    "demographics": { "enabled": true, "title": "Demographics" },
    "completion": { "enabled": true, "title": "Complete" }
  },
  
  "interventions": {
    "font": {
      "enabled": true,
      "conditions": ["easy", "hard"],
      "applyTo": ["decision", "options", "instructions"]
    },
    "attribution": {
      "enabled": true,
      "conditions": ["present", "absent"],
      "text": "Note: This information may be difficult to read because of the font.",
      "showWhen": { "fontCondition": "hard", "attributionCondition": "present" }
    }
  },
  
  "experiment": {
    "instructions": "string",
    "decision": {
      "title": "string",
      "description": "string"
    },
    "questionText": "string",
    "responseConfig": {
      // Different based on responseType
    }
  },
  
  "demographics": {
    "collectAge": true,
    "collectEducation": true,
    "customFields": []
  },
  
  "experimentControl": {
    "targetSampleSize": 20,
    "conditions": {
      "easy_present": 5,
      "easy_absent": 5,
      "hard_present": 5,
      "hard_absent": 5
    }
  }
}
```

## Response Type Configurations

### Choice Response Type
```json
{
  "responseType": "choice",
  "experiment": {
    "responseConfig": {
      "options": [
        {
          "id": "A",
          "label": "Phone A",
          "content": ["Feature 1", "Feature 2"],
          "value": "A"
        }
      ],
      "enableDefer": true,
      "deferOption": {
        "id": "DEFER",
        "label": "I want to continue looking at other Web sites",
        "value": "DEFER"
      },
      "allowMultiple": false,
      "randomizeOrder": false
    }
  }
}
```

### Rating Response Type
```json
{
  "responseType": "rating",
  "experiment": {
    "responseConfig": {
      "items": [
        {
          "id": "readability",
          "label": "How easy was this text to read?",
          "content": ["Sample text to rate"],
          "fontClass": "easy-font"
        }
      ],
      "scale": {
        "min": 1,
        "max": 9,
        "minLabel": "Very difficult",
        "maxLabel": "Very easy",
        "type": "radio"
      }
    }
  }
}
```

### Within-Subjects Response Type
```json
{
  "responseType": "within-subjects",
  "experiment": {
    "responseConfig": {
      "conditions": [
        {
          "id": "easy",
          "label": "Text Sample A",
          "content": ["Sample text in easy font"],
          "fontClass": "easy-font"
        },
        {
          "id": "hard",
          "label": "Text Sample B", 
          "content": ["Sample text in hard font"],
          "fontClass": "hard-font"
        }
      ],
      "scale": {
        "min": 1,
        "max": 9,
        "minLabel": "Very difficult",
        "maxLabel": "Very easy"
      },
      "randomizeOrder": true,
      "showSimultaneously": false
    }
  }
}
```

## Updated Font-Pretest Configuration

```json
{
  "experimentId": "font-pretest",
  "title": "Font Readability Study",
  "description": "Validation study to test readability differences between font conditions",
  
  "responseType": "within-subjects",
  
  "pageFlow": {
    "landing": { "enabled": true, "title": "Research Study" },
    "instructions": { "enabled": true, "title": "Instructions" },
    "experiment": { "enabled": true, "title": "Text Evaluation" },
    "demographics": { "enabled": false },
    "completion": { "enabled": true, "title": "Complete" }
  },
  
  "interventions": {
    "font": { "enabled": false },
    "attribution": { "enabled": false }
  },
  
  "experiment": {
    "instructions": "You will see two different text samples. Please rate how easy each one is to read.",
    "questionText": "Please rate the readability of each text sample:",
    "responseConfig": {
      "conditions": [
        {
          "id": "easy",
          "label": "Text Sample A",
          "content": [
            "This is a sample of text to evaluate readability.",
            "Please read this text carefully and rate how easy it is to read."
          ],
          "fontClass": "easy-font"
        },
        {
          "id": "hard",
          "label": "Text Sample B",
          "content": [
            "This is a sample of text to evaluate readability.", 
            "Please read this text carefully and rate how easy it is to read."
          ],
          "fontClass": "hard-font"
        }
      ],
      "scale": {
        "min": 1,
        "max": 9,
        "minLabel": "Very difficult to read",
        "maxLabel": "Very easy to read"
      },
      "randomizeOrder": true,
      "showSimultaneously": false
    }
  },
  
  "demographics": {
    "collectAge": false,
    "collectEducation": false
  },
  
  "experimentControl": {
    "targetSampleSize": 50,
    "conditions": {
      "pretest": 50
    }
  }
}
```

## Benefits of This Structure

1. **Flexible Response Types**: Supports choice, rating, comparison, and within-subjects designs
2. **Configurable Page Flow**: Can enable/disable pages as needed
3. **Modular Interventions**: Font and attribution interventions are optional and configurable
4. **Unified Template System**: Same templates can render different experiment types based on responseType
5. **Extensible**: Easy to add new response types or interventions without changing core code

This would allow the font-pretest experiment to work properly while maintaining the existing choice-based experiments.