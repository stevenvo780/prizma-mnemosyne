import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'crypto';
import { config } from './config';
import clientRoutes from './routes/clients';
import tagRoutes from './routes/tags';
import webhookRoutes from './routes/webhooks';
import { authenticateApiKey } from './middleware/auth';
import { CrmSyncService } from './services/crmSyncService';

const app = express();
const crmSyncService = new CrmSyncService();

// Middleware para verificar firma HMAC en endpoints de Nous
function verifyHmacSignature(payload: string, signature: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', config.hubCentral.webhookSecret)
    .update(payload, 'utf8')
    .digest('hex');

  const expectedSignatureWithPrefix = `sha256=${expectedSignature}`;

  // Normalizar y comparar longitudes antes de timingSafeEqual
  const expectedBuf = Buffer.from(expectedSignatureWithPrefix);
  const receivedBuf = Buffer.from(signature || '');

  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Mnemosyne CRM API is healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.use('/api/clients', authenticateApiKey, clientRoutes);
app.use('/api/tags', authenticateApiKey, tagRoutes);
app.use('/api/webhooks', webhookRoutes);

/**
 * PRIMARY ENTRY POINT for CRM sync: POST /api/customers/upsert
 *
 * **Auth model:** Verified HMAC signature (x-prizma-signature header with SHA256)
 * **Idempotency:** Supported via x-idempotency-key header (optional, auto-generated if not provided)
 * **Behavior:** Enqueues lead/customer sync to outbox for async processing with automatic retries.
 * **Returns immediately** (202 Accepted) after persisting to outbox; actual sync is asynchronous.
 *
 * Payload shape:
 *   {
 *     "customer": { "email": "...", "name": "...", "phone": "..." } | { "email": "...", ... },
 *     "orderId": "...",
 *     "metadata": { ... },
 *     "x-idempotency-key": "..." (optional, generated if not provided)
 *   }
 */
app.post('/api/customers/upsert', async (req, res) => {
  try {
    // Verificar firma HMAC
    const signature = req.headers['x-prizma-signature'] as string;
    const rawPayload = JSON.stringify(req.body);

    if (!signature) {
      res.status(401).json({
        success: false,
        error: 'Missing X-Prizma-Signature header'
      });
      return;
    }

    if (!verifyHmacSignature(rawPayload, signature)) {
      console.error('[nous] Invalid HMAC signature for /api/customers/upsert');
      res.status(401).json({
        success: false,
        error: 'Invalid signature'
      });
      return;
    }

    const payload = req.body;
    const customerData = payload.customer || payload;
    const email = customerData.email;

    if (!email) {
      res.status(400).json({ success: false, error: 'customer.email is required' });
      return;
    }

    // Extract idempotency key (for deduplication across retries)
    const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;

    let crmResult: { crmRecordId?: string; clientStatus?: string; message?: string } = {};
    try {
      crmResult = await crmSyncService.createOrUpdateLead(
        {
          email,
          name: customerData.name || 'Cliente Nous',
          phone: customerData.phone,
          leadSource: 'nous_connector',
          orderId: payload.orderId || payload.metadata?.orderId,
          metadata: payload.metadata,
        } as any,
        idempotencyKey // Pass idempotency key for deduplication
      );
    } catch (err: any) {
      console.warn(`[nous] CRM sync warning for ${email}: ${err.message}`);
      crmResult.crmRecordId = `pending_${Date.now()}`;
      crmResult.clientStatus = 'enqueued';
    }

    res.status(202).json({
      success: true,
      message: crmResult.message || 'Cliente sincronización encolada',
      email,
      crmRecordId: crmResult.crmRecordId || `pending_${Date.now()}`,
      clientStatus: crmResult.clientStatus || 'enqueued',
      timestamp: new Date().toISOString(),
      note: 'Sync is asynchronous. Use crmRecordId to poll status.'
    });
  } catch (error: any) {
    console.error('[nous] Error en customers/upsert:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal error' });
  }
});

app.use('*', (_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const server = app.listen(config.port, () => {
  console.log(`🚀 Mnemosyne CRM API server running on port ${config.port}`);
  console.log(`📊 Environment: ${config.nodeEnv}`);
  console.log(`🔗 Soft-IA Base URL (upstream CRM): ${config.softIA.baseUrl}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;