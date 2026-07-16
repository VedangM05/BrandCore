import express from 'express';
import { handleRegister, handleLogin, handleRefresh } from './controllers/auth.controller';

const app = express();

app.use(express.json());

// Auth endpoints
app.post('/api/auth/register', handleRegister);
app.post('/api/auth/login', handleLogin);
app.post('/api/auth/refresh', handleRefresh);

// Standard status health endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

export default app;
