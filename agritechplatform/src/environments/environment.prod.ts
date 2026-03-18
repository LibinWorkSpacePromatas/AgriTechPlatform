export const environment = {
  production: true,
  apiBaseUrl: 'http://localhost:8000',
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
    apiKey: 'OPENROUTER_API_KEY_PLACEHOLDER'
  }
};
