/**
 * Tipos para la integración con Hub Central
 * Estas interfaces definen la estructura de datos para webhooks y sincronización CRM
 */

export interface HubCentralWebhookPayload {
  eventType: 'client_lead_created' | 'client_purchase_completed' | 'client_delivery_confirmed' | 
            'client_feedback_received' | 'client_support_ticket';
  orderId: string;
  timestamp: string;
  clientData: {
    email: string;
    name?: string;
    phone?: string;
    address?: string;
  };
  orderData?: {
    total: number;
    currency: string;
    items: Array<{
      productId: string;
      name: string;
      quantity: number;
      price: number;
    }>;
  };
  metadata?: Record<string, any>;
}

export interface ClientLeadData {
  email: string;
  name: string;
  phone?: string;
  leadSource: string;
  orderId: string;
  metadata?: Record<string, any>;
}

export interface ClientPurchaseData {
  email: string;
  name: string;
  phone?: string;
  orderId: string;
  orderTotal: number;
  orderCurrency: string;
  products: Array<{
    productId: string;
    name: string;
    quantity: number;
    price: number;
  }>;
  purchaseDate: Date;
  metadata?: Record<string, any>;
}

export interface ClientFeedbackData {
  email: string;
  orderId: string;
  rating: number;
  comment: string;
  feedbackDate: Date;
}

export interface ClientSupportTicketData {
  email: string;
  orderId: string;
  subject: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  ticketDate: Date;
}

export interface CrmSyncResult {
  success: boolean;
  crmRecordId: string;
  clientStatus: string;
  message?: string;
  metadata?: Record<string, any>;
}

export interface WebhookConfirmation {
  success: boolean;
  crmRecordId?: string;
  clientStatus?: string;
  processingTime: number;
  error?: string;
}

export interface CrmClientRecord {
  id: string;
  email: string;
  name: string;
  phone?: string;
  status: 'lead' | 'prospect' | 'active' | 'inactive' | 'churned';
  tags: string[];
  leadSource?: string;
  totalPurchases: number;
  lastPurchaseDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  customFields?: Record<string, any>;
}

export interface CrmPurchaseRecord {
  id: string;
  clientId: string;
  orderId: string;
  total: number;
  currency: string;
  products: Array<{
    productId: string;
    name: string;
    quantity: number;
    price: number;
  }>;
  purchaseDate: Date;
  deliveryStatus?: 'pending' | 'shipped' | 'delivered' | 'cancelled';
  metadata?: Record<string, any>;
}

export interface CrmFeedbackRecord {
  id: string;
  clientId: string;
  orderId: string;
  rating: number;
  comment: string;
  feedbackDate: Date;
  metadata?: Record<string, any>;
}

export interface CrmSupportTicketRecord {
  id: string;
  clientId: string;
  orderId?: string;
  subject: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  assignedTo?: string;
  metadata?: Record<string, any>;
}
