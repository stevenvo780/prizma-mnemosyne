import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';

// Validar secretos criticos en producción
function validateProductionSecrets() {
  if (nodeEnv === 'production') {
    if (!process.env.HUB_CENTRAL_WEBHOOK_SECRET) {
      throw new Error('HUB_CENTRAL_WEBHOOK_SECRET must be configured in production');
    }
    if (!process.env.WEBHOOK_SECRET) {
      throw new Error('WEBHOOK_SECRET must be configured in production');
    }
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET must be configured in production');
    }
  }
}

validateProductionSecrets();

export const config = {
  port: parseInt(process.env.PORT || '3005', 10),
  nodeEnv,
  softIA: {
    baseUrl: process.env.SOFT_IA_BASE_URL || 'https://api.soft-ia.com',
    apiKey: process.env.SOFT_IA_API_KEY || '',
    apiSecret: process.env.SOFT_IA_API_SECRET || '',
  },
  database: {
    url: process.env.DATABASE_URL || '',
  },
  jwt: {
    // En desarrollo usa default, en producción requiere env var
    secret: process.env.JWT_SECRET || (nodeEnv === 'production' ? (() => { throw new Error('JWT_SECRET required in production'); })() : 'default-secret'),
  },
  webhook: {
    // En desarrollo usa default, en producción requiere env var
    secret: process.env.WEBHOOK_SECRET || (nodeEnv === 'production' ? (() => { throw new Error('WEBHOOK_SECRET required in production'); })() : 'webhook-secret'),
  },
  hubCentral: {
    // En desarrollo usa default, en producción requiere env var
    webhookSecret: process.env.HUB_CENTRAL_WEBHOOK_SECRET || (nodeEnv === 'production' ? (() => { throw new Error('HUB_CENTRAL_WEBHOOK_SECRET required in production'); })() : 'nous-secret-key-2024'),
    apiKey: process.env.HUB_CENTRAL_API_KEY || (nodeEnv === 'production' ? (() => { throw new Error('HUB_CENTRAL_API_KEY required in production'); })() : 'nous-api-key-2024'),
  },
};