import { Router, Request, Response } from 'express';
import { EcommerceHandler } from '../services/ecommerce-handler';
import { ecommerceEventSchema } from '../validation/schemas';
import { config } from '../config';
import { handleHubCentralWebhook, healthCheck } from '../controllers/hubCentralWebhookController';
import crypto from 'crypto';

const router = Router();
const ecommerceHandler = new EcommerceHandler();

function verifyWebhookSignature(payload: string, signature: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', config.webhook.secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(`sha256=${expectedSignature}`),
    Buffer.from(signature)
  );
}

router.post('/ecommerce', async (req: Request, res: Response) => {
  try {
    const payload = JSON.stringify(req.body);
    const signature = req.headers['x-webhook-signature'] as string;
    
    if (!signature || !verifyWebhookSignature(payload, signature)) {
      return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
    }

    const eventData = ecommerceEventSchema.parse(req.body);
    
    const event = {
      ...eventData,
      timestamp: eventData.timestamp ? new Date(eventData.timestamp) : new Date(),
    };

    await ecommerceHandler.handleEcommerceEvent(event);
    
    res.json({ success: true, message: 'Webhook processed successfully' });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    
    console.error('Webhook processing error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/health', (req: Request, res: Response) => {
  res.json({ success: true, message: 'Webhook endpoint is healthy' });
});

// Nuevo endpoint para webhooks del Hub Central
router.post('/hub-central', handleHubCentralWebhook);

// Health check específico para webhooks CRM
router.get('/crm/health', healthCheck);

export default router;