import express, { Request, Response, NextFunction } from 'express';
import { handleRegister, handleLogin, handleRefresh } from './controllers/auth.controller';
import { handleDnaScan } from './controllers/dna.controller';
import { handleCreativeGenerate } from './controllers/creative.controller';
import {
  handleCacheCheck,
  handleCacheStore,
  handleUsageStats,
  handleUsageReset,
  handleSetTier
} from './controllers/cache.controller';
import {
  handleListAssets,
  handleGetAsset,
  handleCreateAsset,
  handleDownloadAsset
} from './controllers/asset.controller';
import {
  handlePrometheusMetrics,
  handleGrafanaDashboardData,
  handleInjectTestFailure
} from './controllers/observability.controller';
import { enforceQuotaMiddleware } from './middleware/quota.middleware';

const app = express();

app.use(express.json());

// Auth endpoints
app.post('/api/auth/register', handleRegister);
app.post('/api/auth/login', handleLogin);
app.post('/api/auth/refresh', handleRefresh);

// DNA endpoints
app.post('/api/dna/scan', enforceQuotaMiddleware, handleDnaScan);

// Creative Generation endpoints
app.post('/api/creative/generate', enforceQuotaMiddleware, handleCreativeGenerate);

// Cache & Cost Control endpoints
app.post('/api/cache/check', handleCacheCheck);
app.post('/api/cache/store', handleCacheStore);
app.get('/api/usage/stats', handleUsageStats);
app.post('/api/usage/reset', handleUsageReset);
app.post('/api/usage/tier', handleSetTier);

// Asset Library & History endpoints
app.get('/api/assets', handleListAssets);
app.post('/api/assets', handleCreateAsset);
app.get('/api/assets/:id', handleGetAsset);
app.get('/api/assets/:id/download', handleDownloadAsset);

// Observability & Telemetry endpoints
app.get('/metrics', handlePrometheusMetrics);
app.get('/api/observability/dashboard', handleGrafanaDashboardData);
app.post('/api/observability/test-failure', handleInjectTestFailure);

// Standard status health endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Global error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[Unhandled Error]:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error'
  });
});

export default app;
