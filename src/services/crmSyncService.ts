import { SoftIAClient } from './softia-client';
import { 
  ClientLeadData, 
  ClientPurchaseData, 
  ClientFeedbackData, 
  ClientSupportTicketData,
  CrmSyncResult
} from '../types/hubCentralTypes';
import { Client, ClientStatus } from '../types/client';
import { publishCustomerUpdate } from '../cauce/hub';

export class CrmSyncService {
  private softIAClient: SoftIAClient;

  constructor() {
    this.softIAClient = new SoftIAClient();
  }

  /**
   * Crea o actualiza un lead en el CRM
   */
  async createOrUpdateLead(leadData: ClientLeadData): Promise<CrmSyncResult> {
    try {
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

        // Olympo: notificar al ecosistema que el cliente CRM cambió (no bloqueante).
        await publishCustomerUpdate({
          id: client.id,
          name: leadData.name,
          email: leadData.email,
          ...(leadData.phone && { phone: leadData.phone }),
        });

        return {
          success: true,
          crmRecordId: client.id,
          clientStatus: client.status,
          message: 'Lead actualizado exitosamente'
        };
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

        // Olympo: notificar al ecosistema que se creó/actualizó el cliente CRM (no bloqueante).
        await publishCustomerUpdate({
          id: newClient.id,
          name: leadData.name,
          email: leadData.email,
          ...(leadData.phone && { phone: leadData.phone }),
        });

        return {
          success: true,
          crmRecordId: newClient.id,
          clientStatus: newClient.status,
          message: 'Lead creado exitosamente'
        };
      }
    } catch (error: any) {
      console.error('Error en createOrUpdateLead:', error);
      throw new Error(`Error creando/actualizando lead: ${error.message}`);
    }
  }

  /**
   * Procesa una compra y actualiza el estado del cliente
   */
  async processPurchaseAndUpgradeClient(purchaseData: ClientPurchaseData): Promise<CrmSyncResult> {
    try {
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

      // Olympo: el cliente CRM cambió de estado tras la compra (no bloqueante).
      await publishCustomerUpdate({
        id: client.id,
        name: purchaseData.name,
        email: purchaseData.email,
        ...(purchaseData.phone && { phone: purchaseData.phone }),
      });

      return {
        success: true,
        crmRecordId: client.id,
        clientStatus: client.status,
        message: 'Compra procesada y cliente actualizado exitosamente',
        metadata: {
          orderTotal: purchaseData.orderTotal,
          currency: purchaseData.orderCurrency,
          products: purchaseData.products.length
        }
      };
    } catch (error: any) {
      console.error('Error en processPurchaseAndUpgradeClient:', error);
      throw new Error(`Error procesando compra: ${error.message}`);
    }
  }

  /**
   * Actualiza el estado de entrega del cliente
   */
  async updateClientDeliveryStatus(clientEmail: string, orderId: string, status: string): Promise<CrmSyncResult> {
    try {
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
      
      return {
        success: true,
        crmRecordId: client.id,
        clientStatus: client.status,
        message: `Estado de entrega actualizado: ${status}`
      };
    } catch (error: any) {
      console.error('Error en updateClientDeliveryStatus:', error);
      throw new Error(`Error actualizando estado de entrega: ${error.message}`);
    }
  }

  /**
   * Registra feedback del cliente
   */
  async recordClientFeedback(feedbackData: ClientFeedbackData): Promise<CrmSyncResult> {
    try {
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
      
      return {
        success: true,
        crmRecordId: client.id,
        clientStatus: client.status,
        message: 'Feedback registrado exitosamente',
        metadata: {
          rating: feedbackData.rating,
          averageRating: avgRating
        }
      };
    } catch (error: any) {
      console.error('Error en recordClientFeedback:', error);
      throw new Error(`Error registrando feedback: ${error.message}`);
    }
  }

  /**
   * Crea un ticket de soporte
   */
  async createSupportTicket(ticketData: ClientSupportTicketData): Promise<CrmSyncResult> {
    try {
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
      
      return {
        success: true,
        crmRecordId: client.id,
        clientStatus: client.status,
        message: 'Ticket de soporte creado exitosamente',
        metadata: {
          ticketId,
          priority: ticketData.priority,
          totalTickets: tickets.length
        }
      };
    } catch (error: any) {
      console.error('Error en createSupportTicket:', error);
      throw new Error(`Error creando ticket de soporte: ${error.message}`);
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
