import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import * as path from 'path';
import * as fs from 'fs';
import { authRateLimiter, apiRateLimiter } from './middleware/rateLimit.middleware';
import {
  handleRegister,
  handleLogin,
  handleRefresh,
  handleLogout,
  handleGoogleAuth,
  handleVerifyEmail,
  handleResendVerification,
  handleForgotPassword,
  handleResetPassword,
} from './controllers/auth.controller';
import { handleDnaScan, handleUpdateBrandDna } from './controllers/dna.controller';
import { handleAskBrandQuestion, handleKnowledgeStatus, handleGetChatHistory } from './controllers/chat.controller';
import { handleRunCoordinator } from './controllers/coordinator.controller';
import { handleListProjects, handleDeleteProject } from './controllers/project.controller';
import { handleCreativeGenerate, handleCreativeIdeas } from './controllers/creative.controller';
import { handleGenerateImage, handleGeneratePost, handleGenerateCarousel } from './controllers/photoshoot.controller';
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
  handleUpdateAsset,
  handleDownloadAsset,
  handleGetAssetRawBackground
} from './controllers/asset.controller';
import {
  handlePrometheusMetrics,
  handleGrafanaDashboardData,
  handleInjectTestFailure
} from './controllers/observability.controller';
import { enforceQuotaMiddleware } from './middleware/quota.middleware';
import { requireAuth, requireRole } from './middleware/auth.middleware';

const app = express();

// Security headers on every response. CSP is customized (not left default)
// because the default would block things this app actually needs: Google
// Fonts (index.html), the Google Identity Services script + its OAuth popup
// (GoogleAuthButton.tsx), and inline styles from Tailwind/React's style
// props. crossOriginOpenerPolicy is relaxed to 'same-origin-allow-popups' -
// helmet's default ('same-origin') is a documented, easy-to-hit breakage for
// Google's OAuth popup flow specifically (the popup can't message back to
// the opener window otherwise).
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://accounts.google.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'https://oauth2.googleapis.com', 'https://accounts.google.com'],
        frameSrc: ['https://accounts.google.com'],
      },
    },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  })
);

// Default body limit (100kb) is too small for base64-encoded edited images from the
// asset editor - raised for the whole app since only authenticated write routes
// receive large payloads.
app.use(express.json({ limit: '20mb' }));

// General backstop on all API traffic, then a stricter limiter layered on
// top of the credential endpoints specifically - see rateLimit.middleware.ts.
app.use('/api', apiRateLimiter);

// Auth endpoints (public - these are how you obtain a token in the first place)
app.post('/api/auth/register', authRateLimiter, handleRegister);
app.post('/api/auth/login', authRateLimiter, handleLogin);
app.post('/api/auth/refresh', authRateLimiter, handleRefresh);
app.post('/api/auth/logout', handleLogout);
app.post('/api/auth/google', authRateLimiter, handleGoogleAuth);
app.get('/api/auth/verify-email', authRateLimiter, handleVerifyEmail);
app.post('/api/auth/resend-verification', requireAuth, authRateLimiter, handleResendVerification);
app.post('/api/auth/forgot-password', authRateLimiter, handleForgotPassword);
app.post('/api/auth/reset-password', authRateLimiter, handleResetPassword);

// DNA endpoints
app.post('/api/dna/scan', requireAuth, enforceQuotaMiddleware, handleDnaScan);
app.post('/api/coordinator/run', requireAuth, enforceQuotaMiddleware, handleRunCoordinator);
app.patch('/api/dna/:id', requireAuth, handleUpdateBrandDna);
app.post('/api/dna/:id/chat', requireAuth, enforceQuotaMiddleware, handleAskBrandQuestion);
app.get('/api/dna/:id/knowledge-status', requireAuth, handleKnowledgeStatus);
app.get('/api/dna/:id/chat/history', requireAuth, handleGetChatHistory);

app.get('/api/projects', requireAuth, handleListProjects);
app.delete('/api/projects/:id', requireAuth, handleDeleteProject);

// Creative Generation endpoints
app.post('/api/creative/generate', requireAuth, enforceQuotaMiddleware, handleCreativeGenerate);
app.get('/api/creative/ideas', requireAuth, enforceQuotaMiddleware, handleCreativeIdeas);

// AI Photoshoot endpoints - real image generation (Pollinations/FLUX) + server-side text compositing
app.post('/api/photoshoot/image', requireAuth, enforceQuotaMiddleware, handleGenerateImage);
app.post('/api/photoshoot/post', requireAuth, enforceQuotaMiddleware, handleGeneratePost);
app.post('/api/photoshoot/carousel', requireAuth, enforceQuotaMiddleware, handleGenerateCarousel);

// Cache & Cost Control endpoints
app.post('/api/cache/check', requireAuth, handleCacheCheck);
app.post('/api/cache/store', requireAuth, handleCacheStore);
app.get('/api/usage/stats', requireAuth, handleUsageStats);
app.post('/api/usage/reset', requireAuth, handleUsageReset);
app.post('/api/usage/tier', requireAuth, handleSetTier);

// Asset Library & History endpoints
app.get('/api/assets', requireAuth, handleListAssets);
app.post('/api/assets', requireAuth, handleCreateAsset);
app.get('/api/assets/:id', requireAuth, handleGetAsset);
app.put('/api/assets/:id', requireAuth, handleUpdateAsset);
app.get('/api/assets/:id/download', requireAuth, handleDownloadAsset);
app.get('/api/assets/:id/raw-background', requireAuth, handleGetAssetRawBackground);

// Observability & Telemetry endpoints
// /metrics stays public - it's the standard Prometheus scrape target, scraped without a token.
app.get('/metrics', handlePrometheusMetrics);
app.get('/api/observability/dashboard', requireAuth, handleGrafanaDashboardData);
app.post('/api/observability/test-failure', requireAuth, requireRole('admin'), handleInjectTestFailure);

// Standard status health endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Serves the built frontend (vite build -> dist/client) so a single process/
// container can serve both the API and the SPA - only relevant in Docker/
// production, since local development uses `npx vite`'s own dev server
// (proxying /api to this process) instead. Registered last so every API
// route above still wins; the catch-all only ever serves index.html for
// genuinely unmatched GET requests, letting React Router handle client-side
// routes like /login or /signup on a hard refresh.
const clientDist = path.join(process.cwd(), 'dist/client');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api') || req.path === '/health' || req.path === '/metrics') {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Global error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[Unhandled Error]:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error'
  });
});

export default app;
