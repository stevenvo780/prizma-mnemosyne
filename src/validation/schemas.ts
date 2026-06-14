import { z } from 'zod';
import { ClientStatus } from '../types/client';

export const createClientSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  company: z.string().optional(),
  status: z.nativeEnum(ClientStatus).optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.any()).optional(),
});

export const updateClientSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  status: z.nativeEnum(ClientStatus).optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.any()).optional(),
});

export const tagSchema = z.object({
  name: z.string().min(1, 'Tag name is required'),
  color: z.string().optional(),
  description: z.string().optional(),
});

export const assignTagSchema = z.object({
  tagId: z.string().min(1, 'Tag ID is required'),
});

export const updateStatusSchema = z.object({
  status: z.nativeEnum(ClientStatus, {
    errorMap: () => ({ message: 'Invalid status value' }),
  }),
});

export const ecommerceEventSchema = z.object({
  eventType: z.enum(['order_created', 'order_completed', 'order_cancelled', 'cart_abandoned', 'customer_registered']),
  clientEmail: z.string().email('Valid client email is required'),
  clientId: z.string().optional(),
  orderData: z.object({
    orderId: z.string(),
    total: z.number().positive(),
    currency: z.string().length(3),
    items: z.array(z.object({
      productId: z.string(),
      name: z.string(),
      quantity: z.number().positive(),
      price: z.number().positive(),
    })),
  }).optional(),
  timestamp: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
});