const fs = require('fs');
const path = require('path');

// Directories
const environmentsDir = path.join(__dirname, '..', 'src', 'environments');
const frontendEnvPath = path.join(__dirname, '..', '.env');
const frontendEnvExamplePath = path.join(__dirname, '..', '.env.example');
const backendEnvPath = path.join(__dirname, '..', '..', 'backend', '.env');
const backendEnvExamplePath = path.join(__dirname, '..', '..', 'backend', '.env.example');

// Ensure environments directory exists
if (!fs.existsSync(environmentsDir)) {
  fs.mkdirSync(environmentsDir, { recursive: true });
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const values = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

const sharedFileEnv = {
  ...parseEnvFile(backendEnvExamplePath),
  ...parseEnvFile(backendEnvPath),
  ...parseEnvFile(frontendEnvExamplePath),
  ...parseEnvFile(frontendEnvPath),
};

function readEnv(name, fallback) {
  return process.env[name] ?? sharedFileEnv[name] ?? fallback;
}

// Get config from environment variables or backend .env
const apiKey = readEnv('OPENROUTER_API_KEY', 'OPENROUTER_API_KEY_PLACEHOLDER');
const apiBaseUrl = readEnv('API_BASE_URL', 'http://localhost:8000');
const auctionPreviewImageUrl = readEnv('AUCTION_PREVIEW_IMAGE_URL', '');

// Define the content for environment.prod.ts
const envProdContent = `export const environment = {
  production: true,
  apiBaseUrl: '${apiBaseUrl}',
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
  },
  auctionPreviewImageUrl: '${auctionPreviewImageUrl}'
};
`;

// Define the content for environment.ts (Dev)
const envDevContent = `export const environment = {
  production: false,
  apiBaseUrl: '${apiBaseUrl}',
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
  },
  auctionPreviewImageUrl: '${auctionPreviewImageUrl}'
};
`;

// Write the files
fs.writeFileSync(path.join(environmentsDir, 'environment.prod.ts'), envProdContent);
fs.writeFileSync(path.join(environmentsDir, 'environment.ts'), envDevContent);
fs.writeFileSync(path.join(environmentsDir, 'environment.development.ts'), envDevContent);

console.log('Environment files generated successfully!');
console.log(`API Key injected: ${apiKey !== 'OPENROUTER_API_KEY_PLACEHOLDER' ? 'YES' : 'NO (Placeholder used)'}`);
