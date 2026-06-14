import { SoftIAClient } from './softia-client';
import { EcommerceEvent, ClientStatus } from '../types/client';

export class EcommerceHandler {
  private softIAClient: SoftIAClient;

  constructor() {
    this.softIAClient = new SoftIAClient();
  }

  async handleEcommerceEvent(event: EcommerceEvent): Promise<void> {
    try {
      switch (event.eventType) {
        case 'order_created':
          await this.handleOrderCreated(event);
          break;
        case 'order_completed':
          await this.handleOrderCompleted(event);
          break;
        case 'order_cancelled':
          await this.handleOrderCancelled(event);
          break;
        case 'cart_abandoned':
          await this.handleCartAbandoned(event);
          break;
        case 'customer_registered':
          await this.handleCustomerRegistered(event);
          break;
        default:
          console.warn(`Unknown event type: ${event.eventType}`);
      }
    } catch (error) {
      console.error('Error handling ecommerce event:', error);
      throw error;
    }
  }

  private async handleOrderCreated(event: EcommerceEvent): Promise<void> {
    try {
      let client = await this.findOrCreateClient(event.clientEmail);
      
      if (client.status === ClientStatus.LEAD || client.status === ClientStatus.PROSPECT) {
        client = await this.softIAClient.updateClientStatus(client.id, ClientStatus.ACTIVE);
      }

      await this.softIAClient.assignTag(client.id, 'recent-order');
      
      console.log(`Order created event processed for client: ${client.email}`);
    } catch (error) {
      console.error('Error handling order created:', error);
      throw error;
    }
  }

  private async handleOrderCompleted(event: EcommerceEvent): Promise<void> {
    try {
      const client = await this.findOrCreateClient(event.clientEmail);
      
      await this.softIAClient.updateClientStatus(client.id, ClientStatus.ACTIVE);
      await this.softIAClient.assignTag(client.id, 'completed-purchase');
      
      if (event.orderData && event.orderData.total > 1000) {
        await this.softIAClient.assignTag(client.id, 'high-value-customer');
      }
      
      console.log(`Order completed event processed for client: ${client.email}`);
    } catch (error) {
      console.error('Error handling order completed:', error);
      throw error;
    }
  }

  private async handleOrderCancelled(event: EcommerceEvent): Promise<void> {
    try {
      const client = await this.findOrCreateClient(event.clientEmail);
      
      await this.softIAClient.assignTag(client.id, 'cancelled-order');
      
      console.log(`Order cancelled event processed for client: ${client.email}`);
    } catch (error) {
      console.error('Error handling order cancelled:', error);
      throw error;
    }
  }

  private async handleCartAbandoned(event: EcommerceEvent): Promise<void> {
    try {
      const client = await this.findOrCreateClient(event.clientEmail);
      
      await this.softIAClient.assignTag(client.id, 'cart-abandoned');
      if (client.status === ClientStatus.LEAD) {
        await this.softIAClient.updateClientStatus(client.id, ClientStatus.PROSPECT);
      }
      
      console.log(`Cart abandoned event processed for client: ${client.email}`);
    } catch (error) {
      console.error('Error handling cart abandoned:', error);
      throw error;
    }
  }

  private async handleCustomerRegistered(event: EcommerceEvent): Promise<void> {
    try {
      await this.findOrCreateClient(event.clientEmail, ClientStatus.LEAD);
      
      console.log(`Customer registered event processed for client: ${event.clientEmail}`);
    } catch (error) {
      console.error('Error handling customer registered:', error);
      throw error;
    }
  }

  private async findOrCreateClient(email: string, initialStatus: ClientStatus = ClientStatus.PROSPECT) {
    try {
      const clients = await this.softIAClient.listClients(1, 100);
      const existingClient = clients.clients.find(c => c.email === email);
      
      if (existingClient) {
        return existingClient;
      }

      const newClient = await this.softIAClient.createClient({
        name: email.split('@')[0],
        email,
        status: initialStatus,
        tags: ['ecommerce-customer'],
      });
      
      return newClient;
    } catch (error) {
      console.error('Error finding or creating client:', error);
      throw error;
    }
  }
}