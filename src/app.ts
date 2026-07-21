import express, { Request, Response, NextFunction } from 'express';
import { handleRegister, handleLogin, handleRefresh } from './controllers/auth.controller';
import { handleDnaScan } from './controllers/dna.controller';
import { handleCreativeGenerate } from './controllers/creative.controller';

const app = express();

app.use(express.json());

// Auth endpoints
app.post('/api/auth/register', handleRegister);
app.post('/api/auth/login', handleLogin);
app.post('/api/auth/refresh', handleRefresh);

// DNA endpoints
app.post('/api/dna/scan', handleDnaScan);

// Creative Generation endpoints
app.post('/api/creative/generate', handleCreativeGenerate);

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
