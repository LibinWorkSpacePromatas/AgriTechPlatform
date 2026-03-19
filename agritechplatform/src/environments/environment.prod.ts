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
    apiKey: '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'
  }
};
