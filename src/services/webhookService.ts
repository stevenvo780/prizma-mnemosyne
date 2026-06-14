import axios from 'axios';
import { WebhookConfirmation } from '../types/hubCentralTypes';

export class WebhookService {
  private readonly hubCentralBaseUrl: string;
  private readonly hubCentralApiKey: string;

  constructor() {
    this.hubCentralBaseUrl = process.env.HUB_CENTRAL_BASE_URL || 'http://localhost:3007';
    this.hubCentralApiKey = process.env.HUB_CENTRAL_API_KEY || 'hub-central-api-key-2024';
  }

  /**
   * Envía confirmación al Hub Central después de procesar un webhook
   */
  async sendConfirmationToHubCentral(
    orderId: string, 
    eventType: string, 
    result: WebhookConfirmation
  ): Promise<void> {
    try {
      const confirmationPayload = {
        orderId,
        eventType,
        service: 'ApiSoftia',
        timestamp: new Date().toISOString(),
        result
      };

      console.log(`📤 Enviando confirmación CRM al Hub Central: ${eventType} | Order: ${orderId}`);

      const response = await axios.post(
        `${this.hubCentralBaseUrl}/api/webhooks/confirmations`,
        confirmationPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.hubCentralApiKey,
            'User-Agent': 'ApiSoftia-Webhook-Service/1.0.0'
          },
          timeout: 10000 // 10 segundos timeout
        }
      );

      if (response.status === 200) {
        console.log(`✅ Confirmación CRM enviada exitosamente: ${orderId}`);
      } else {
        console.warn(`⚠️ Respuesta inesperada del Hub Central: ${response.status}`);
      }
    } catch (error: any) {
      console.error('❌ Error enviando confirmación al Hub Central:', {
        orderId,
        eventType,
        error: error.message,
        response: error.response?.data
      });
      
      // No relanzar el error para no afectar el flujo principal
      // El Hub Central debe implementar reintentos si es necesario
    }
  }

  /**
   * Registra métricas de procesamiento de webhooks
   */
  async reportWebhookMetrics(metrics: {
    eventType: string;
    processingTime: number;
    success: boolean;
    timestamp: Date;
  }): Promise<void> {
    try {
      const metricsPayload = {
        service: 'ApiSoftia',
        ...metrics,
        timestamp: metrics.timestamp.toISOString()
      };

      await axios.post(
        `${this.hubCentralBaseUrl}/api/metrics/webhooks`,
        metricsPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.hubCentralApiKey
          },
          timeout: 5000 // 5 segundos timeout para métricas
        }
      );
    } catch (error: any) {
      // Silenciar errores de métricas para no afectar el flujo principal
      console.warn('⚠️ Error enviando métricas al Hub Central:', error.message);
    }
  }

  /**
   * Verifica la conectividad con Hub Central
   */
  async checkHubCentralConnectivity(): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.hubCentralBaseUrl}/api/health`,
        {
          headers: {
            'X-API-Key': this.hubCentralApiKey
          },
          timeout: 5000
        }
      );

      return response.status === 200;
    } catch (error) {
      console.error('❌ Hub Central no disponible:', error);
      return false;
    }
  }
}
