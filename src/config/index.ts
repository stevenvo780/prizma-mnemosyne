import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3005', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  softIA: {
    baseUrl: process.env.SOFT_IA_BASE_URL || 'https://api.soft-ia.com',
    apiKey: process.env.SOFT_IA_API_KEY || '',
    apiSecret: process.env.SOFT_IA_API_SECRET || '',
  },
  database: {
    url: process.env.DATABASE_URL || '',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret',
  },
  webhook: {
    secret: process.env.WEBHOOK_SECRET || 'webhook-secret',
  },
};