import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 3005;

// Clave secreta para verificación HMAC (debe coincidir con Hub Central)
const WEBHOOK_SECRET = process.env.HUB_CENTRAL_WEBHOOK_SECRET || 'hub-central-secret-key-2024';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Función de verificación HMAC
function verifyHmacSignature(payload: string, signature: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload, 'utf8')
    .digest('hex');
  
  const expectedSignatureWithPrefix = `sha256=${expectedSignature}`;
  
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignatureWithPrefix),
    Buffer.from(signature)
  );
}

// Health check general
app.get('/health', (_req, res) => {
  res.json({ 
    success: true, 
    message: 'ApiSoftia CRM API is healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    port: PORT
  });
});

// Health check específico para webhooks CRM
app.get('/api/webhooks/crm/health', (_req, res) => {
  res.json({
    success: true,
    service: 'ApiSoftia CRM Webhooks',
    status: 'operational',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: {
      webhook: '/api/webhooks/hub-central',
      health: '/api/webhooks/crm/health'
    }
  });
});

// Webhook principal del Hub Central
app.post('/api/webhooks/hub-central', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Verificar firma HMAC
    const signature = req.headers['x-hub-signature-256'] as string;
    const rawPayload = JSON.stringify(req.body);
    
    if (!signature) {
      return res.status(401).json({
        success: false,
        error: 'Missing signature header'
      });
    }

    if (!verifyHmacSignature(rawPayload, signature)) {
      console.error('Invalid HMAC signature for webhook');
      return res.status(401).json({
        success: false,
        error: 'Invalid signature'
      });
    }

    const payload = req.body;
    
    console.log(`📨 CRM Webhook received: ${payload.eventType} | Order: ${payload.orderId}`);

    // Validar payload básico
    if (!payload.eventType || !payload.orderId || !payload.clientData) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields in payload'
      });
    }

    // Simular procesamiento de eventos (aquí iría la lógica real del CRM)
    let result = { 
      crmRecordId: `crm_${Date.now()}`, 
      clientStatus: 'processed',
      message: `Evento ${payload.eventType} procesado exitosamente`
    };

    switch (payload.eventType) {
      case 'client_lead_created':
        console.log(`👤 Procesando lead: ${payload.clientData.email}`);
        result.clientStatus = 'lead';
        break;
        
      case 'client_purchase_completed':
        console.log(`💰 Procesando compra: ${payload.clientData.email} - $${payload.orderData?.total || 0}`);
        result.clientStatus = 'active';
        break;
        
      case 'client_delivery_confirmed':
        console.log(`📦 Confirmando entrega: ${payload.orderId}`);
        result.clientStatus = 'active';
        break;
        
      case 'client_feedback_received':
        console.log(`⭐ Procesando feedback: ${payload.metadata?.rating || 'N/A'} estrellas`);
        result.clientStatus = 'active';
        break;
        
      case 'client_support_ticket':
        console.log(`🎫 Creando ticket: ${payload.metadata?.subject || 'Consulta general'}`);
        result.clientStatus = 'active';
        break;
        
      default:
        console.warn(`⚠️ Evento CRM no soportado: ${payload.eventType}`);
        return res.status(400).json({
          success: false,
          error: `Unsupported event type: ${payload.eventType}`
        });
    }

    const processingTime = Date.now() - startTime;
    console.log(`✅ CRM Webhook procesado en ${processingTime}ms: ${payload.eventType}`);

    // Simular confirmación asíncrona al Hub Central
    setImmediate(async () => {
      console.log(`📤 Simulando confirmación al Hub Central: ${payload.orderId}`);
    });

    res.json({
      success: true,
      message: 'CRM webhook processed successfully',
      data: result,
      processingTime
    });

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error('❌ Error procesando webhook CRM:', error);

    res.status(500).json({
      success: false,
      error: 'Internal server error processing CRM webhook',
      processingTime
    });
  }
});

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
  console.log(`🔐 HMAC secret configured: ${WEBHOOK_SECRET.substring(0, 10)}...`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
