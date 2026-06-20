import { SoftIAClient } from './softia-client';
import { outboxService } from './outboxService';
import {
  ClientLeadData,
  ClientPurchaseData,
  ClientFeedbackData,
  ClientSupportTicketData,
  CrmSyncResult
} from '../types/hubCentralTypes';
import { Client, ClientStatus } from '../types/client';
import { publishCustomerUpdate } from '../prizma/hub';

export class CrmSyncService {
  private softIAClient: SoftIAClient;

  constructor() {
    this.softIAClient = new SoftIAClient();
    this.setupRetryProcessor();
  }

  /**
   * Initializes the retry processor to periodically attempt failed events
   */
  private setupRetryProcessor(): void {
    // Process pending events every 30 seconds
    setInterval(async () => {
      try {
        const pendingEvents = await outboxService.getPendingEvents();

        for (const event of pendingEvents) {
          await this.processOutboxEvent(event);
        }
      } catch (error) {
        console.error('[retry-processor] Error processing pending events:', error);
      }
    }, 30000);

    // Listen for events marked as ready for retry
    outboxService.on('retry_ready', async (eventId: string) => {
      try {
        const event = await outboxService.getEvent(eventId);
        if (event) {
          await this.processOutboxEvent(event);
        }
      } catch (error) {
        console.error('[retry-processor] Error processing retry_ready event:', error);
      }
    });
  }

  /**
   * Processes an outbox event, attempting to sync to CRM
   */
  private async processOutboxEvent(event: any): Promise<void> {
    try {
      await outboxService.markInProgress(event.id);

      switch (event.type) {
        case 'lead_sync':
          await this.createOrUpdateLeadInternal(event.payload);
          break;
        case 'purchase_sync':
          await this.processPurchaseAndUpgradeClientInternal(event.payload);
          break;
        case 'delivery_update':
          await this.updateClientDeliveryStatusInternal(
            event.payload.clientEmail,
            event.payload.orderId,
            event.payload.status
          );
          break;
        case 'feedback_record':
          await this.recordClientFeedbackInternal(event.payload);
          break;
        case 'support_ticket':
          await this.createSupportTicketInternal(event.payload);
          break;
        default:
          console.warn(`[outbox] Unknown event type: ${event.type}`);
      }

      await outboxService.markCompleted(event.id);
      console.log(`[outbox] Event ${event.id} (${event.type}) completed successfully`);
    } catch (error: any) {
      console.error(`[outbox] Error processing event ${event.id}:`, error);
      await outboxService.markFailed(event.id, error, error.stack);
    }
  }

  /**
   * Public API: Crea o actualiza un lead en el CRM (with outbox persistence)
   * Returns immediately after persisting to outbox; actual sync happens asynchronously.
   */
  async createOrUpdateLead(leadData: ClientLeadData, idempotencyKey?: string): Promise<CrmSyncResult> {
    try {
      // Persist to outbox immediately for reliability
      const outboxEvent = await outboxService.addEvent(
        'lead_sync',
        leadData,
        idempotencyKey || `lead_${leadData.email}_${Date.now()}`
      );

      // Attempt immediate sync (non-blocking failure)
      this.processOutboxEvent(outboxEvent).catch(error => {
        console.warn(`[createOrUpdateLead] Initial sync attempt failed, will retry: ${error.message}`);
      });

      return {
        success: true,
        crmRecordId: outboxEvent.id,
        clientStatus: 'syncing',
        message: 'Lead sincronización iniciada (encolada para reintentos)'
      };
    } catch (error: any) {
      console.error('Error en createOrUpdateLead:', error);
      throw new Error(`Error encolando lead: ${error.message}`);
    }
  }

  /**
   * Internal method: performs the actual CRM sync for a lead
   */
  private async createOrUpdateLeadInternal(leadData: ClientLeadData): Promise<void> {
    // Buscar cliente existente por email
    let client = await this.findClientByEmail(leadData.email);

    if (client) {
      // Cliente existe - actualizar información si es necesario
      if (client.status === ClientStatus.INACTIVE || client.status === ClientStatus.CHURNED) {
        // Reactivar cliente inactivo
        client = await this.softIAClient.updateClientStatus(client.id, ClientStatus.LEAD);
        await this.softIAClient.assignTag(client.id, 'reactivated-lead');
      }

      // Actualizar información del lead
      await this.softIAClient.updateClient(client.id, {
        name: leadData.name,
        ...(leadData.phone && { phone: leadData.phone }),
        customFields: {
          ...client.customFields,
          lastLeadSource: leadData.leadSource,
          lastOrderId: leadData.orderId,
          leadTimestamp: new Date().toISOString()
        }
      });

      await this.softIAClient.assignTag(client.id, `lead-source-${leadData.leadSource}`);

      // Prizma: notificar al ecosistema que el cliente CRM cambió (no bloqueante).
      try {
        await publishCustomerUpdate({
          id: client.id,
          name: leadData.name,
          email: leadData.email,
          ...(leadData.phone && { phone: leadData.phone }),
        });
      } catch (error) {
        console.warn(`[createOrUpdateLeadInternal] Prizma hub update failed: ${error}`);
      }
    } else {
      // Crear nuevo cliente como lead
      const newClient = await this.softIAClient.createClient({
        name: leadData.name,
        email: leadData.email,
        ...(leadData.phone && { phone: leadData.phone }),
        status: ClientStatus.LEAD,
        tags: [`lead-source-${leadData.leadSource}`, 'new-lead'],
        customFields: {
          leadSource: leadData.leadSource,
          firstOrderId: leadData.orderId,
          leadTimestamp: new Date().toISOString(),
          metadata: leadData.metadata
        }
      });

      // Prizma: notificar al ecosistema que se creó/actualizó el cliente CRM (no bloqueante).
      try {
        await publishCustomerUpdate({
          id: newClient.id,
          name: leadData.name,
          email: leadData.email,
          ...(leadData.phone && { phone: leadData.phone }),
        });
      } catch (error) {
        console.warn(`[createOrUpdateLeadInternal] Prizma hub update failed: ${error}`);
      }
    }
  }

  /**
   * Public API: Procesa una compra y actualiza el estado del cliente (with outbox persistence)
   */
  async processPurchaseAndUpgradeClient(purchaseData: ClientPurchaseData, idempotencyKey?: string): Promise<CrmSyncResult> {
    try {
      // Persist to outbox immediately for reliability
      const outboxEvent = await outboxService.addEvent(
        'purchase_sync',
        purchaseData,
        idempotencyKey || `purchase_${purchaseData.email}_${purchaseData.orderId}_${Date.now()}`
      );

      // Attempt immediate sync (non-blocking failure)
      this.processOutboxEvent(outboxEvent).catch(error => {
        console.warn(`[processPurchaseAndUpgradeClient] Initial sync attempt failed, will retry: ${error.message}`);
      });

      return {
        success: true,
        crmRecordId: outboxEvent.id,
        clientStatus: 'syncing',
        message: 'Compra sincronización iniciada (encolada para reintentos)',
        metadata: {
          orderTotal: purchaseData.orderTotal,
          currency: purchaseData.orderCurrency,
          products: purchaseData.products.length
        }
      };
    } catch (error: any) {
      console.error('Error en processPurchaseAndUpgradeClient:', error);
      throw new Error(`Error encolando compra: ${error.message}`);
    }
  }

  /**
   * Internal method: performs the actual CRM sync for a purchase
   */
  private async processPurchaseAndUpgradeClientInternal(purchaseData: ClientPurchaseData): Promise<void> {
    // Buscar o crear cliente
    let client = await this.findClientByEmail(purchaseData.email);

    if (!client) {
      // Crear cliente nuevo directamente como activo (ya realizó compra)
      client = await this.softIAClient.createClient({
        name: purchaseData.name,
        email: purchaseData.email,
        ...(purchaseData.phone && { phone: purchaseData.phone }),
        status: ClientStatus.ACTIVE,
        tags: ['new-customer', 'first-purchase'],
        customFields: {
          firstPurchaseDate: purchaseData.purchaseDate.toISOString(),
          firstOrderId: purchaseData.orderId,
          totalPurchases: 1,
          totalSpent: purchaseData.orderTotal,
          currency: purchaseData.orderCurrency
        }
      });
    } else {
      // Cliente existe - actualizar estado a activo si no lo está
      if (client.status !== ClientStatus.ACTIVE) {
        client = await this.softIAClient.updateClientStatus(client.id, ClientStatus.ACTIVE);
        await this.softIAClient.assignTag(client.id, 'converted-to-customer');
      }

      // Actualizar información de compras
      const currentTotalPurchases = client.customFields?.totalPurchases || 0;
      const currentTotalSpent = client.customFields?.totalSpent || 0;

      await this.softIAClient.updateClient(client.id, {
        customFields: {
          ...client.customFields,
          lastPurchaseDate: purchaseData.purchaseDate.toISOString(),
          lastOrderId: purchaseData.orderId,
          totalPurchases: currentTotalPurchases + 1,
          totalSpent: currentTotalSpent + purchaseData.orderTotal,
          currency: purchaseData.orderCurrency
        }
      });

      // Asignar tags basados en el valor de la compra
      if (purchaseData.orderTotal > 500000) { // > 500k COP
        await this.softIAClient.assignTag(client.id, 'high-value-customer');
      }

      if (currentTotalPurchases + 1 >= 3) {
        await this.softIAClient.assignTag(client.id, 'repeat-customer');
      }
    }

    // Registrar la compra
    await this.recordPurchase(client.id, purchaseData);

    // Prizma: el cliente CRM cambió de estado tras la compra (no bloqueante).
    try {
      await publishCustomerUpdate({
        id: client.id,
        name: purchaseData.name,
        email: purchaseData.email,
        ...(purchaseData.phone && { phone: purchaseData.phone }),
      });
    } catch (error) {
      console.warn(`[processPurchaseAndUpgradeClientInternal] Prizma hub update failed: ${error}`);
    }
  }

  /**
   * Public API: Actualiza el estado de entrega del cliente (with outbox persistence)
   */
  async updateClientDeliveryStatus(clientEmail: string, orderId: string, status: string, idempotencyKey?: string): Promise<CrmSyncResult> {
    try {
      const outboxEvent = await outboxService.addEvent(
        'delivery_update',
        { clientEmail, orderId, status },
        idempotencyKey || `delivery_${clientEmail}_${orderId}_${Date.now()}`
      );

      this.processOutboxEvent(outboxEvent).catch(error => {
        console.warn(`[updateClientDeliveryStatus] Initial sync attempt failed, will retry: ${error.message}`);
      });

      return {
        success: true,
        crmRecordId: outboxEvent.id,
        clientStatus: 'syncing',
        message: `Estado de entrega encolado: ${status}`
      };
    } catch (error: any) {
      console.error('Error en updateClientDeliveryStatus:', error);
      throw new Error(`Error encolando estado de entrega: ${error.message}`);
    }
  }

  /**
   * Internal method: performs the actual CRM sync for delivery status
   */
  private async updateClientDeliveryStatusInternal(clientEmail: string, orderId: string, status: string): Promise<void> {
    const client = await this.findClientByEmail(clientEmail);

    if (!client) {
      throw new Error(`Cliente no encontrado: ${clientEmail}`);
    }

    // Actualizar estado de entrega en campos personalizados
    const deliveries = client.customFields?.deliveries || {};
    deliveries[orderId] = {
      status,
      updatedAt: new Date().toISOString()
    };

    await this.softIAClient.updateClient(client.id, {
      customFields: {
        ...client.customFields,
        deliveries,
        lastDeliveryUpdate: new Date().toISOString()
      }
    });

    // Asignar tag si es entrega completada
    if (status === 'delivered') {
      await this.softIAClient.assignTag(client.id, 'delivery-completed');
    }
  }

  /**
   * Public API: Registra feedback del cliente (with outbox persistence)
   */
  async recordClientFeedback(feedbackData: ClientFeedbackData, idempotencyKey?: string): Promise<CrmSyncResult> {
    try {
      const outboxEvent = await outboxService.addEvent(
        'feedback_record',
        feedbackData,
        idempotencyKey || `feedback_${feedbackData.email}_${feedbackData.orderId}_${Date.now()}`
      );

      this.processOutboxEvent(outboxEvent).catch(error => {
        console.warn(`[recordClientFeedback] Initial sync attempt failed, will retry: ${error.message}`);
      });

      return {
        success: true,
        crmRecordId: outboxEvent.id,
        clientStatus: 'syncing',
        message: 'Feedback encolado para registro',
        metadata: {
          rating: feedbackData.rating
        }
      };
    } catch (error: any) {
      console.error('Error en recordClientFeedback:', error);
      throw new Error(`Error encolando feedback: ${error.message}`);
    }
  }

  /**
   * Internal method: performs the actual CRM sync for feedback
   */
  private async recordClientFeedbackInternal(feedbackData: ClientFeedbackData): Promise<void> {
    const client = await this.findClientByEmail(feedbackData.email);

    if (!client) {
      throw new Error(`Cliente no encontrado: ${feedbackData.email}`);
    }

    // Registrar feedback en campos personalizados
    const feedbacks = client.customFields?.feedbacks || [];
    feedbacks.push({
      orderId: feedbackData.orderId,
      rating: feedbackData.rating,
      comment: feedbackData.comment,
      date: feedbackData.feedbackDate.toISOString()
    });

    // Calcular rating promedio
    const avgRating = feedbacks.reduce((sum: number, f: any) => sum + f.rating, 0) / feedbacks.length;

    await this.softIAClient.updateClient(client.id, {
      customFields: {
        ...client.customFields,
        feedbacks,
        averageRating: avgRating,
        lastFeedbackDate: feedbackData.feedbackDate.toISOString()
      }
    });

    // Asignar tags basados en rating
    if (feedbackData.rating >= 4) {
      await this.softIAClient.assignTag(client.id, 'satisfied-customer');
    } else if (feedbackData.rating <= 2) {
      await this.softIAClient.assignTag(client.id, 'needs-attention');
    }
  }

  /**
   * Public API: Crea un ticket de soporte (with outbox persistence)
   */
  async createSupportTicket(ticketData: ClientSupportTicketData, idempotencyKey?: string): Promise<CrmSyncResult> {
    try {
      const outboxEvent = await outboxService.addEvent(
        'support_ticket',
        ticketData,
        idempotencyKey || `ticket_${ticketData.email}_${Date.now()}`
      );

      this.processOutboxEvent(outboxEvent).catch(error => {
        console.warn(`[createSupportTicket] Initial sync attempt failed, will retry: ${error.message}`);
      });

      return {
        success: true,
        crmRecordId: outboxEvent.id,
        clientStatus: 'syncing',
        message: 'Ticket de soporte encolado para creación',
        metadata: {
          priority: ticketData.priority
        }
      };
    } catch (error: any) {
      console.error('Error en createSupportTicket:', error);
      throw new Error(`Error encolando ticket de soporte: ${error.message}`);
    }
  }

  /**
   * Internal method: performs the actual CRM sync for support ticket
   */
  private async createSupportTicketInternal(ticketData: ClientSupportTicketData): Promise<void> {
    const client = await this.findClientByEmail(ticketData.email);

    if (!client) {
      throw new Error(`Cliente no encontrado: ${ticketData.email}`);
    }

    // Registrar ticket en campos personalizados
    const tickets = client.customFields?.supportTickets || [];
    const ticketId = `ticket_${Date.now()}`;

    tickets.push({
      id: ticketId,
      orderId: ticketData.orderId,
      subject: ticketData.subject,
      description: ticketData.description,
      priority: ticketData.priority,
      status: 'open',
      createdAt: ticketData.ticketDate.toISOString()
    });

    await this.softIAClient.updateClient(client.id, {
      customFields: {
        ...client.customFields,
        supportTickets: tickets,
        lastSupportTicketDate: ticketData.ticketDate.toISOString(),
        totalSupportTickets: tickets.length
      }
    });

    // Asignar tags basados en prioridad
    await this.softIAClient.assignTag(client.id, 'has-support-ticket');
    if (ticketData.priority === 'high' || ticketData.priority === 'urgent') {
      await this.softIAClient.assignTag(client.id, 'priority-support');
    }
  }

  /**
   * Busca un cliente por email
   */
  private async findClientByEmail(email: string): Promise<Client | null> {
    try {
      return await this.softIAClient.findClientByEmail(email);
    } catch (error) {
      // Si no se encuentra, retornar null
      return null;
    }
  }

  /**
   * Registra una compra en el historial del cliente
   */
  private async recordPurchase(clientId: string, purchaseData: ClientPurchaseData): Promise<void> {
    try {
      const client = await this.softIAClient.getClient(clientId);
      const purchases = client.customFields?.purchases || [];
      
      purchases.push({
        orderId: purchaseData.orderId,
        total: purchaseData.orderTotal,
        currency: purchaseData.orderCurrency,
        products: purchaseData.products,
        date: purchaseData.purchaseDate.toISOString(),
        metadata: purchaseData.metadata
      });
      
      await this.softIAClient.updateClient(clientId, {
        customFields: {
          ...client.customFields,
          purchases
        }
      });
    } catch (error: any) {
      console.error('Error registrando compra:', error);
      // No lanzar error aquí para no afectar el flujo principal
    }
  }
}
