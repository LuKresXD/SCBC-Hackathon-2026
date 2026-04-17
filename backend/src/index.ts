import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { bundleRoutes } from './routes/bundles';
import { navRoutes } from './routes/nav';
import { depositRoutes } from './routes/deposit';
import { marketRoutes } from './routes/markets';
import { sseRoutes } from './routes/sse';
import { docsRoutes } from './routes/docs';
import { adminRoutes } from './routes/admin';
import { leaderboardRoutes } from './routes/leaderboard';
import { demoRoutes } from './routes/demo';
import { webhookRoutes } from './routes/webhook';
import { batchRoutes } from './routes/batch';
import { ppnRoutes } from './routes/ppn';
import { alertRoutes } from './routes/alerts';
import { startCronJobs } from './services/cron';
import { supabase } from './db/supabase';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Explicit preflight handler for all routes
app.options('*', cors());

app.use(express.json());

// Request logging
app.use(requestLogger);

// Rate limiting: 100 req/min per IP (general)
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use(generalLimiter);

// Stricter rate limit for Polymarket proxy: 30 req/min per IP
const marketLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many market requests, please try again later' },
});

// Health check
app.get('/api/health', async (_req, res) => {
  const services: {
    supabase: { status: 'ok' | 'error'; latency_ms: number; error?: string };
    polymarket: { status: 'ok' | 'error'; latency_ms: number; error?: string };
  } = {
    supabase: { status: 'ok', latency_ms: 0 },
    polymarket: { status: 'ok', latency_ms: 0 },
  };

  let overall: 'ok' | 'degraded' = 'ok';

  // Check Supabase
  try {
    const start = Date.now();
    const { error } = await supabase.from('bundles').select('id').limit(1);
    services.supabase.latency_ms = Date.now() - start;
    if (error) {
      services.supabase.status = 'error';
      services.supabase.error = error.message;
      overall = 'degraded';
    }
  } catch (err: any) {
    services.supabase.status = 'error';
    services.supabase.error = err.message ?? 'Unknown error';
    overall = 'degraded';
  }

  // Check Polymarket API
  try {
    const start = Date.now();
    const resp = await fetch('https://gamma-api.polymarket.com/markets?limit=1');
    services.polymarket.latency_ms = Date.now() - start;
    if (!resp.ok) {
      services.polymarket.status = 'error';
      services.polymarket.error = `HTTP ${resp.status}`;
      overall = 'degraded';
    }
  } catch (err: any) {
    services.polymarket.status = 'error';
    services.polymarket.error = err.message ?? 'Unknown error';
    overall = 'degraded';
  }

  res.json({
    status: overall,
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
    services,
  });
});

// Routes
app.use('/api/bundles', bundleRoutes);
app.use('/api/nav', navRoutes);
app.use('/api/deposit', depositRoutes);
app.use('/api/markets', marketLimiter, marketRoutes);
app.use('/api/sse', sseRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/docs', docsRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/batch', batchRoutes);
app.use('/api/ppn', ppnRoutes);
app.use('/api/alerts', alertRoutes);

// Root redirect to API docs
app.get('/', (_req, res) => res.redirect('/api/docs'));

// Global error handler (must be after all routes)
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`LuKres backend running on port ${config.port}`);
  startCronJobs();
});

export default app;
