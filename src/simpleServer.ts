import express from 'express';
import cors from 'cors';
import { handleHubCentralWebhook, healthCheck } from './controllers/hubCentralWebhookController';

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ 
    success: true, 
    message: 'ApiSoftia CRM API is healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    port: PORT
  });
});

// Webhook endpoints
app.post('/api/webhooks/hub-central', handleHubCentralWebhook);
app.get('/api/webhooks/crm/health', healthCheck);

// 404 handler
app.use('*', (_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Error handler
app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 ApiSoftia CRM API running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Webhook endpoint: POST /api/webhooks/hub-central`);
  console.log(`❤️ Health check: GET /health`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
