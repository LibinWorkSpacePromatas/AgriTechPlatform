const fs = require('fs');
const path = require('path');

// Directories
const environmentsDir = path.join(__dirname, '..', 'src', 'environments');

// Ensure environments directory exists
if (!fs.existsSync(environmentsDir)) {
  fs.mkdirSync(environmentsDir, { recursive: true });
}

// Get API Key from Environment Variable or use placeholder
const apiKey = process.env.OPENROUTER_API_KEY || 'OPENROUTER_API_KEY_PLACEHOLDER';

// Define the content for environment.prod.ts
const envProdContent = `export const environment = {
  production: true,
  weatherApi: {
    baseUrl: 'https://api.open-meteo.com/v1/forecast',
    timeout: 10000,
    retryAttempts: 3
  },
  irrigation: {
    defaultLatitude: -34.53,
    defaultLongitude: 138.96,
    criticalMoistureThreshold: 0.20,
    optimalMoistureThreshold: 0.40,
    maxRetries: 3,
    australiaBounds: {
      minLat: -44,
      maxLat: -10,
      minLon: 112,
      maxLon: 154
    }
  },
  ollama: {
    host: 'https://openrouter.ai/api/v1',
    apiKey: '${apiKey}'
  }
};
`;

// Define the content for environment.ts (Dev)
const envDevContent = `export const environment = {
  production: false,
  weatherApi: {
    baseUrl: 'https://api.open-meteo.com/v1/forecast',
    timeout: 10000,
    retryAttempts: 3
  },
  irrigation: {
    defaultLatitude: -34.53,
    defaultLongitude: 138.96,
    criticalMoistureThreshold: 0.20,
    optimalMoistureThreshold: 0.40,
    maxRetries: 3,
    australiaBounds: {
      minLat: -44,
      maxLat: -10,
      minLon: 112,
      maxLon: 154
    }
  },
  ollama: {
    host: 'https://openrouter.ai/api/v1',
    apiKey: '${apiKey}'
  }
};
`;

// Write the files
fs.writeFileSync(path.join(environmentsDir, 'environment.prod.ts'), envProdContent);
fs.writeFileSync(path.join(environmentsDir, 'environment.ts'), envDevContent);
fs.writeFileSync(path.join(environmentsDir, 'environment.development.ts'), envDevContent);

console.log('Environment files generated successfully!');
console.log(`API Key injected: ${apiKey !== 'OPENROUTER_API_KEY_PLACEHOLDER' ? 'YES' : 'NO (Placeholder used)'}`);
