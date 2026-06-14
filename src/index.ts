import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import clientRoutes from './routes/clients';
import tagRoutes from './routes/tags';
import webhookRoutes from './routes/webhooks';
import { authenticateApiKey } from './middleware/auth';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => {
  res.json({ 
    success: true, 
    message: 'Soft-IA CRM API is healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.use('/api/clients', authenticateApiKey, clientRoutes);
app.use('/api/tags', authenticateApiKey, tagRoutes);
app.use('/api/webhooks', webhookRoutes);

app.use('*', (_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const server = app.listen(config.port, () => {
  console.log(`🚀 Soft-IA CRM API server running on port ${config.port}`);
  console.log(`📊 Environment: ${config.nodeEnv}`);
  console.log(`🔗 Soft-IA Base URL: ${config.softIA.baseUrl}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;