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
import { startCronJobs } from './services/cron';

const app = express();

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json());

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
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/bundles', bundleRoutes);
app.use('/api/nav', navRoutes);
app.use('/api/deposit', depositRoutes);
app.use('/api/markets', marketLimiter, marketRoutes);
app.use('/api/sse', sseRoutes);
app.use('/api/docs', docsRoutes);

// Root redirect to API docs
app.get('/', (_req, res) => res.redirect('/api/docs'));

app.listen(config.port, () => {
  console.log(`LuKres backend running on port ${config.port}`);
  startCronJobs();
});

export default app;
