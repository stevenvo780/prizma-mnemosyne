# Mnemosyne - Integración Webhooks Hub Central

## Descripción
Mnemosyne es el servicio de integración CRM del ecosistema Prizma que procesa eventos de clientes desde el Hub Central (Nous) para sincronizar datos hacia el CRM Soft-IA y gestionar el ciclo de vida de los clientes.

## Arquitectura de Integración

### Flujo de Datos
```
Hermes eCommerce → Hub Central (Nous) → Mnemosyne → Soft-IA CRM
                    ↓
            Confirmaciones asíncronas
```

### Eventos Soportados

#### 1. `client_lead_created`
**Propósito**: Registrar nuevos leads desde formularios web
**Acción**: Crear/actualizar cliente como Lead en CRM

**Payload**:
```json
{
  "eventType": "client_lead_created",
  "orderId": "lead-12345",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "clientData": {
    "email": "lead@example.com",
    "name": "Nuevo Lead",
    "phone": "+573001234567"
  },
  "metadata": {
    "source": "landing_page",
    "campaign": "campana_navidad"
  }
}
```

**Procesamiento**:
- Buscar cliente por email
- Si existe: actualizar información y mantener estado
- Si no existe: crear como Lead con tags apropiadas
- Asignar tag de fuente de lead

#### 2. `client_purchase_completed`
**Propósito**: Actualizar cliente tras completar compra
**Acción**: Promocionar Lead/Prospect a Cliente Activo

**Payload**:
```json
{
  "eventType": "client_purchase_completed",
  "orderId": "order-67890",
  "timestamp": "2024-01-15T11:45:00.000Z",
  "clientData": {
    "email": "customer@example.com",
    "name": "Cliente Activo",
    "phone": "+573001234567"
  },
  "orderData": {
    "total": 250000,
    "currency": "COP",
    "items": [
      {
        "productId": "prod-001",
        "name": "Producto Premium",
        "quantity": 1,
        "price": 250000
      }
    ]
  }
}
```

**Procesamiento**:
- Buscar o crear cliente
- Actualizar estado a "active"
- Registrar historial de compras
- Asignar tags basados en valor (high-value-customer si >500k)
- Calcular métricas de cliente (total gastado, número de compras)

#### 3. `client_delivery_confirmed`
**Propósito**: Confirmar entrega exitosa al cliente
**Acción**: Actualizar estado de entrega en CRM

**Payload**:
```json
{
  "eventType": "client_delivery_confirmed",
  "orderId": "order-67890",
  "timestamp": "2024-01-17T14:20:00.000Z",
  "clientData": {
    "email": "customer@example.com"
  },
  "metadata": {
    "deliveryDate": "2024-01-17T14:00:00.000Z",
    "courier": "interrapidisimo"
  }
}
```

**Procesamiento**:
- Actualizar estado de entrega específica por orderId
- Asignar tag "delivery-completed"
- Registrar fecha y detalles de entrega

#### 4. `client_feedback_received`
**Propósito**: Registrar feedback/calificación del cliente
**Acción**: Almacenar feedback y actualizar métricas de satisfacción

**Payload**:
```json
{
  "eventType": "client_feedback_received",
  "orderId": "order-67890",
  "timestamp": "2024-01-18T09:15:00.000Z",
  "clientData": {
    "email": "customer@example.com"
  },
  "metadata": {
    "rating": 5,
    "comment": "Excelente producto y servicio",
    "source": "email_survey"
  }
}
```

**Procesamiento**:
- Registrar feedback individual
- Calcular rating promedio del cliente
- Asignar tags: "satisfied-customer" (rating ≥4) o "needs-attention" (rating ≤2)

#### 5. `client_support_ticket`
**Propósito**: Crear ticket de soporte al cliente
**Acción**: Registrar solicitud de soporte en CRM

**Payload**:
```json
{
  "eventType": "client_support_ticket",
  "orderId": "order-67890",
  "timestamp": "2024-01-19T16:30:00.000Z",
  "clientData": {
    "email": "customer@example.com"
  },
  "metadata": {
    "subject": "Consulta sobre garantía",
    "description": "Necesito información sobre la garantía del producto",
    "priority": "medium"
  }
}
```

**Procesamiento**:
- Crear ticket único con ID generado
- Asignar tags "has-support-ticket" y "priority-support" (si alta prioridad)
- Incrementar contador de tickets del cliente

## Configuración Técnica

### Variables de Entorno
```env
# Servidor
PORT=3005
NODE_ENV=production

# Soft-IA CRM (tercero) — vía Mnemosyne
SOFT_IA_BASE_URL=https://api.soft-ia.com
SOFT_IA_API_KEY=your_api_key_here
SOFT_IA_API_SECRET=your_api_secret_here

# Hub Central Integration
HUB_CENTRAL_BASE_URL=http://localhost:3007
HUB_CENTRAL_API_KEY=nous-api-key-2024
HUB_CENTRAL_WEBHOOK_SECRET=nous-secret-key-2024
```

### Endpoint de Webhook
**URL**: `POST /api/webhooks/nous`
**Puerto**: 3005
**Autenticación**: HMAC-SHA256 signature
**Header**: `X-Hub-Signature-256: sha256={signature}`

### Seguridad HMAC
```javascript
const signature = crypto
  .createHmac('sha256', process.env.HUB_CENTRAL_WEBHOOK_SECRET)
  .update(JSON.stringify(payload), 'utf8')
  .digest('hex');

const expectedSignature = `sha256=${signature}`;
```

## Estados de Cliente en CRM

### Transiciones Automáticas
```
Lead → Prospect → Active → Inactive → Churned
  ↑      ↑         ↑        ↑
Formulario  Interacción  Compra  Sin actividad
```

### Tags Automáticas
- **Fuente**: `lead-source-{source}`, `new-lead`
- **Compras**: `first-purchase`, `repeat-customer`, `high-value-customer`
- **Estado**: `converted-to-customer`, `reactivated-lead`
- **Entrega**: `delivery-completed`
- **Satisfacción**: `satisfied-customer`, `needs-attention`
- **Soporte**: `has-support-ticket`, `priority-support`

## Campos Personalizados

### Cliente
```json
{
  "leadSource": "landing_page",
  "firstPurchaseDate": "2024-01-15T11:45:00.000Z",
  "lastPurchaseDate": "2024-01-20T09:30:00.000Z",
  "totalPurchases": 3,
  "totalSpent": 750000,
  "currency": "COP",
  "averageRating": 4.5,
  "totalSupportTickets": 1,
  "purchases": [
    {
      "orderId": "order-67890",
      "total": 250000,
      "date": "2024-01-15T11:45:00.000Z",
      "products": [...]
    }
  ],
  "feedbacks": [
    {
      "orderId": "order-67890",
      "rating": 5,
      "comment": "Excelente",
      "date": "2024-01-18T09:15:00.000Z"
    }
  ],
  "deliveries": {
    "order-67890": {
      "status": "delivered",
      "updatedAt": "2024-01-17T14:20:00.000Z"
    }
  },
  "supportTickets": [
    {
      "id": "ticket_1705672200000",
      "subject": "Consulta garantía",
      "priority": "medium",
      "status": "open",
      "createdAt": "2024-01-19T16:30:00.000Z"
    }
  ]
}
```

## Confirmaciones al Hub Central

### Confirmación Exitosa
```json
{
  "orderId": "order-67890",
  "eventType": "client_purchase_completed",
  "service": "Mnemosyne",
  "timestamp": "2024-01-15T11:45:30.000Z",
  "result": {
    "success": true,
    "crmRecordId": "client-123",
    "clientStatus": "active",
    "processingTime": 245
  }
}
```

### Confirmación de Error
```json
{
  "orderId": "order-67890",
  "eventType": "client_purchase_completed",
  "service": "Mnemosyne",
  "timestamp": "2024-01-15T11:45:30.000Z",
  "result": {
    "success": false,
    "error": "CRM API temporarily unavailable",
    "processingTime": 1205
  }
}
```

## Testing

### Ejecutar Tests
```bash
# Asegurar que Mnemosyne esté ejecutándose
npm run dev

# En otra terminal, ejecutar tests
./webhook-integration-test.sh
```

### Tests Implementados
1. ✅ Health check general y específico
2. ✅ Verificación de seguridad HMAC
3. ✅ Rechazo de requests sin firma
4. ✅ Rechazo de firmas inválidas
5. ✅ Creación de leads
6. ✅ Procesamiento de compras
7. ✅ Confirmación de entregas
8. ✅ Registro de feedback
9. ✅ Creación de tickets de soporte
10. ✅ Manejo de errores y payloads malformados
11. ✅ Eventos no soportados

## Métricas y Monitoreo

### Health Checks
- **General**: `GET /health`
- **Webhooks**: `GET /api/webhooks/crm/health`

### Logs Estructurados
```
📨 CRM Webhook received: client_purchase_completed | Order: order-67890
💰 Compra procesada en CRM: client-123 | Status: active
✅ CRM Webhook procesado en 245ms: client_purchase_completed
📤 Enviando confirmación CRM al Hub Central: client_purchase_completed | Order: order-67890
✅ Confirmación CRM enviada exitosamente: order-67890
```

## API del CRM Soft-IA

### Endpoints Utilizados
- `POST /clients` - Crear cliente
- `GET /clients/{id}` - Obtener cliente
- `PUT /clients/{id}` - Actualizar cliente
- `PATCH /clients/{id}/status` - Cambiar estado
- `GET /clients/search?email={email}` - Buscar por email
- `POST /clients/{id}/tags` - Asignar tag
- `GET /tags` - Listar tags
- `POST /tags` - Crear tag

### Autenticación Soft-IA
```javascript
headers: {
  'Authorization': `Bearer ${SOFT_IA_API_KEY}`,
  'X-API-Secret': SOFT_IA_API_SECRET,
  'Content-Type': 'application/json'
}
```

## Troubleshooting

### Errores Comunes
1. **401 Unauthorized**: Verificar firma HMAC y secret
2. **400 Bad Request**: Validar estructura del payload
3. **500 Internal Error**: Revisar conectividad con Soft-IA CRM
4. **Timeout**: Verificar disponibilidad del CRM

### Logs de Debug
```bash
# Ver logs del servidor
npm run dev

# Verificar conectividad con CRM
curl -H "Authorization: Bearer $SOFT_IA_API_KEY" \
     -H "X-API-Secret: $SOFT_IA_API_SECRET" \
     https://api.soft-ia.com/health
```

## Integraciones Relacionadas

### Hub Central (Puerto 3007)
- Recibe webhooks desde Hermes
- Distribuye a sistemas destino
- Gestiona confirmaciones y reintentos

### Hermes Backend
- Plugin nous para emisión de webhooks
- Triggers en OrderStatus.PAID

### IRIS (Puerto 3001)
- Notificaciones WhatsApp
- Eventos relacionados con entregas

### Talaria (Puerto 3006)
- Sistema de deliveries
- Confirmaciones de entrega

---

**Autor**: Sistema Prizma
**Fecha**: Enero 2024
**Versión**: 1.0.0
