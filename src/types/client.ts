export interface Client {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  status: ClientStatus;
  tags: string[];
  customFields?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export enum ClientStatus {
  LEAD = 'lead',
  PROSPECT = 'prospect',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  CHURNED = 'churned'
}

export interface CreateClientRequest {
  name: string;
  email: string;
  phone?: string | undefined;
  company?: string | undefined;
  status?: ClientStatus | undefined;
  tags?: string[] | undefined;
  customFields?: Record<string, any> | undefined;
}

export interface UpdateClientRequest {
  name?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  company?: string | undefined;
  status?: ClientStatus | undefined;
  tags?: string[] | undefined;
  customFields?: Record<string, any> | undefined;
}

export interface ClientTag {
  id: string;
  name: string;
  color?: string;
  description?: string;
}

export interface EcommerceEvent {
  eventType: 'order_created' | 'order_completed' | 'order_cancelled' | 'cart_abandoned' | 'customer_registered';
  clientEmail: string;
  clientId?: string | undefined;
  orderData?: {
    orderId: string;
    total: number;
    currency: string;
    items: Array<{
      productId: string;
      name: string;
      quantity: number;
      price: number;
    }>;
  } | undefined;
  timestamp: Date;
  metadata?: Record<string, any> | undefined;
}