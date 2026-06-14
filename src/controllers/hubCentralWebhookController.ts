import { Request, Response } from 'express';
import crypto from 'crypto';
import { CrmSyncService } from '../services/crmSyncService';
import { WebhookService } from '../services/webhookService';
import { HubCentralWebhookPayload, ClientLeadData, ClientPurchaseData } from '../types/hubCentralTypes';

const CRM_SYNC_SERVICE = new CrmSyncService();
const WEBHOOK_SERVICE = new WebhookService();

// Clave secreta para verificación HMAC (debe coincidir con Hub Central)
const WEBHOOK_SECRET = process.env.HUB_CENTRAL_WEBHOOK_SECRET || 'hub-central-secret-key-2024';

/**
 * Verifica la firma HMAC del webhook
 */
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

/**
 * Procesa webhooks del Hub Central para sincronización CRM
 * Eventos soportados:
 * - client_lead_created: Nuevo lead desde formularios web
 * - client_purchase_completed: Cliente completó compra
 * - client_delivery_confirmed: Entrega confirmada
 * - client_feedback_received: Feedback del cliente recibido
 * - client_support_ticket: Ticket de soporte creado
 */
export const handleHubCentralWebhook = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  
  try {
    // Verificar firma HMAC
    const signature = req.headers['x-hub-signature-256'] as string;
    const rawPayload = JSON.stringify(req.body);
    
    if (!signature) {
      res.status(401).json({
        success: false,
        error: 'Missing signature header'
      });
      return;
    }

    if (!verifyHmacSignature(rawPayload, signature)) {
      console.error('Invalid HMAC signature for webhook');
      res.status(401).json({
        success: false,
        error: 'Invalid signature'
      });
      return;
    }

    const payload: HubCentralWebhookPayload = req.body;
    
    console.log(`📨 CRM Webhook received: ${payload.eventType} | Order: ${payload.orderId}`);

    // Validar payload básico
    if (!payload.eventType || !payload.orderId || !payload.clientData) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields in payload'
      });
      return;
    }

    // Procesar según el tipo de evento
    let result;
    switch (payload.eventType) {
      case 'client_lead_created':
        result = await processClientLeadCreated(payload);
        break;
        
      case 'client_purchase_completed':
        result = await processClientPurchaseCompleted(payload);
        break;
        
      case 'client_delivery_confirmed':
        result = await processClientDeliveryConfirmed(payload);
        break;
        
      case 'client_feedback_received':
        result = await processClientFeedbackReceived(payload);
        break;
        
      case 'client_support_ticket':
        result = await processClientSupportTicket(payload);
        break;
        
      default:
        console.warn(`⚠️ Evento CRM no soportado: ${payload.eventType}`);
        res.status(400).json({
          success: false,
          error: `Unsupported event type: ${payload.eventType}`
        });
        return;
    }

    const processingTime = Date.now() - startTime;
    console.log(`✅ CRM Webhook procesado en ${processingTime}ms: ${payload.eventType}`);

    // Enviar confirmación asíncrona al Hub Central
    setImmediate(async () => {
      try {
        await WEBHOOK_SERVICE.sendConfirmationToHubCentral(payload.orderId, payload.eventType, {
          success: true,
          crmRecordId: result.crmRecordId,
          clientStatus: result.clientStatus,
          processingTime
        });
      } catch (error) {
        console.error('Error enviando confirmación al Hub Central:', error);
      }
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

    // Enviar confirmación de error al Hub Central
    setImmediate(async () => {
      try {
        const payload: HubCentralWebhookPayload = req.body;
        await WEBHOOK_SERVICE.sendConfirmationToHubCentral(payload.orderId, payload.eventType, {
          success: false,
          error: error.message,
          processingTime
        });
      } catch (confirmError) {
        console.error('Error enviando confirmación de error al Hub Central:', confirmError);
      }
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error processing CRM webhook',
      processingTime
    });
  }
};

/**
 * Procesa evento de nuevo lead creado
 */
async function processClientLeadCreated(payload: HubCentralWebhookPayload) {
  const leadData: ClientLeadData = {
    email: payload.clientData.email,
    name: payload.clientData.name || 'Lead desde eCommerce',
    ...(payload.clientData.phone && { phone: payload.clientData.phone }),
    leadSource: 'ecommerce_form',
    orderId: payload.orderId,
    ...(payload.metadata && { metadata: payload.metadata })
  };

  const result = await CRM_SYNC_SERVICE.createOrUpdateLead(leadData);
  
  console.log(`👤 Lead creado/actualizado en CRM: ${result.crmRecordId}`);
  
  return result;
}

/**
 * Procesa evento de compra completada
 */
async function processClientPurchaseCompleted(payload: HubCentralWebhookPayload) {
  const purchaseData: ClientPurchaseData = {
    email: payload.clientData.email,
    name: payload.clientData.name || 'Cliente eCommerce',
    ...(payload.clientData.phone && { phone: payload.clientData.phone }),
    orderId: payload.orderId,
    orderTotal: payload.orderData?.total || 0,
    orderCurrency: payload.orderData?.currency || 'COP',
    products: payload.orderData?.items || [],
    purchaseDate: new Date(),
    ...(payload.metadata && { metadata: payload.metadata })
  };

  const result = await CRM_SYNC_SERVICE.processPurchaseAndUpgradeClient(purchaseData);
  
  console.log(`💰 Compra procesada en CRM: ${result.crmRecordId} | Status: ${result.clientStatus}`);
  
  return result;
}

/**
 * Procesa evento de entrega confirmada
 */
async function processClientDeliveryConfirmed(payload: HubCentralWebhookPayload) {
  const result = await CRM_SYNC_SERVICE.updateClientDeliveryStatus(
    payload.clientData.email,
    payload.orderId,
    'delivered'
  );
  
  console.log(`📦 Estado de entrega actualizado en CRM: ${result.crmRecordId}`);
  
  return result;
}

/**
 * Procesa evento de feedback recibido
 */
async function processClientFeedbackReceived(payload: HubCentralWebhookPayload) {
  const feedbackData = {
    email: payload.clientData.email,
    orderId: payload.orderId,
    rating: payload.metadata?.rating || 0,
    comment: payload.metadata?.comment || '',
    feedbackDate: new Date()
  };

  const result = await CRM_SYNC_SERVICE.recordClientFeedback(feedbackData);
  
  console.log(`⭐ Feedback registrado en CRM: ${result.crmRecordId} | Rating: ${feedbackData.rating}`);
  
  return result;
}

/**
 * Procesa evento de ticket de soporte
 */
async function processClientSupportTicket(payload: HubCentralWebhookPayload) {
  const ticketData = {
    email: payload.clientData.email,
    orderId: payload.orderId,
    subject: payload.metadata?.subject || 'Consulta desde eCommerce',
    description: payload.metadata?.description || '',
    priority: payload.metadata?.priority || 'medium',
    ticketDate: new Date()
  };

  const result = await CRM_SYNC_SERVICE.createSupportTicket(ticketData);
  
  console.log(`🎫 Ticket de soporte creado en CRM: ${result.crmRecordId} | Prioridad: ${ticketData.priority}`);
  
  return result;
}

/**
 * Endpoint de health check específico para webhooks CRM
 */
export const healthCheck = (_req: Request, res: Response): void => {
  res.json({
    success: true,
    service: 'ApiSoftia CRM Webhooks',
    status: 'operational',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: {
      webhook: '/api/webhooks/hub-central',
      health: '/api/webhooks/health'
    }
  });
};
