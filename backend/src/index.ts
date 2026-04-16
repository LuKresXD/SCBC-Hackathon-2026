import express from 'express';
import cors from 'cors';
import { config } from './config';
import { bundleRoutes } from './routes/bundles';
import { navRoutes } from './routes/nav';
import { depositRoutes } from './routes/deposit';
import { marketRoutes } from './routes/markets';

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/bundles', bundleRoutes);
app.use('/api/nav', navRoutes);
app.use('/api/deposit', depositRoutes);
app.use('/api/markets', marketRoutes);

app.listen(config.port, () => {
  console.log(`LuKres backend running on port ${config.port}`);
});

export default app;
