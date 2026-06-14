import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { Client, CreateClientRequest, UpdateClientRequest, ClientTag } from '../types/client';

export class SoftIAClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.softIA.baseUrl,
      headers: {
        'Authorization': `Bearer ${config.softIA.apiKey}`,
        'Content-Type': 'application/json',
        'X-API-Secret': config.softIA.apiSecret,
      },
      timeout: 10000,
    });
  }

  async createClient(clientData: CreateClientRequest): Promise<Client> {
    try {
      const response = await this.client.post('/clients', {
        ...clientData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return response.data;
    } catch (error) {
      console.error('Error creating client in Soft-IA:', error);
      throw new Error('Failed to create client in CRM');
    }
  }

  async getClient(clientId: string): Promise<Client> {
    try {
      const response = await this.client.get(`/clients/${clientId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching client from Soft-IA:', error);
      throw new Error('Failed to fetch client from CRM');
    }
  }

  async updateClient(clientId: string, updateData: UpdateClientRequest): Promise<Client> {
    try {
      const response = await this.client.put(`/clients/${clientId}`, {
        ...updateData,
        updatedAt: new Date(),
      });
      return response.data;
    } catch (error) {
      console.error('Error updating client in Soft-IA:', error);
      throw new Error('Failed to update client in CRM');
    }
  }

  async deleteClient(clientId: string): Promise<void> {
    try {
      await this.client.delete(`/clients/${clientId}`);
    } catch (error) {
      console.error('Error deleting client from Soft-IA:', error);
      throw new Error('Failed to delete client from CRM');
    }
  }

  async listClients(page: number = 1, limit: number = 50): Promise<{ clients: Client[]; total: number }> {
    try {
      const response = await this.client.get('/clients', {
        params: { page, limit },
      });
      return response.data;
    } catch (error) {
      console.error('Error listing clients from Soft-IA:', error);
      throw new Error('Failed to list clients from CRM');
    }
  }

  async assignTag(clientId: string, tagId: string): Promise<void> {
    try {
      await this.client.post(`/clients/${clientId}/tags`, { tagId });
    } catch (error) {
      console.error('Error assigning tag in Soft-IA:', error);
      throw new Error('Failed to assign tag to client');
    }
  }

  async removeTag(clientId: string, tagId: string): Promise<void> {
    try {
      await this.client.delete(`/clients/${clientId}/tags/${tagId}`);
    } catch (error) {
      console.error('Error removing tag in Soft-IA:', error);
      throw new Error('Failed to remove tag from client');
    }
  }

  async listTags(): Promise<ClientTag[]> {
    try {
      const response = await this.client.get('/tags');
      return response.data;
    } catch (error) {
      console.error('Error listing tags from Soft-IA:', error);
      throw new Error('Failed to list tags from CRM');
    }
  }

  async createTag(name: string, color?: string, description?: string): Promise<ClientTag> {
    try {
      const response = await this.client.post('/tags', { name, color, description });
      return response.data;
    } catch (error) {
      console.error('Error creating tag in Soft-IA:', error);
      throw new Error('Failed to create tag in CRM');
    }
  }

  async updateClientStatus(clientId: string, status: string): Promise<Client> {
    try {
      const response = await this.client.patch(`/clients/${clientId}/status`, { status });
      return response.data;
    } catch (error) {
      console.error('Error updating client status in Soft-IA:', error);
      throw new Error('Failed to update client status in CRM');
    }
  }

  async findClientByEmail(email: string): Promise<Client | null> {
    try {
      const response = await this.client.get('/clients/search', {
        params: { email }
      });
      
      if (response.data && response.data.clients && response.data.clients.length > 0) {
        return response.data.clients[0];
      }
      
      return null;
    } catch (error: any) {
      // Si es error 404, el cliente no existe
      if (error.response?.status === 404) {
        return null;
      }
      
      console.error('Error searching client by email in Soft-IA:', error);
      throw new Error('Failed to search client by email in CRM');
    }
  }
}