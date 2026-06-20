# Mnemosyne

API de integración con el CRM Soft-IA (tercero) para gestionar clientes, etiquetas y estados, con notificaciones de ecommerce.

## Características

- ✅ Gestión completa de clientes (crear, leer, actualizar, eliminar)
- 🏷️ Sistema de etiquetas/tags para clientes
- 📊 Gestión de estados de clientes (lead, prospect, active, inactive, churned)
- 🛒 Webhooks para eventos de ecommerce
- 🔐 Autenticación con API key
- ✨ Validación de datos con Zod
- 🛡️ Middlewares de seguridad

## Instalación

```bash
npm install
```

## Configuración

1. Copia el archivo de ejemplo de variables de entorno:
```bash
cp .env.example .env
```

2. Configura las variables de entorno en `.env`:
```env
PORT=3000
NODE_ENV=development
SOFT_IA_BASE_URL=https://api.soft-ia.com
SOFT_IA_API_KEY=tu_api_key_aqui
SOFT_IA_API_SECRET=tu_api_secret_aqui
WEBHOOK_SECRET=tu_webhook_secret_aqui
```

## Uso

### Desarrollo
```bash
npm run dev
```

### Producción
```bash
npm run build
npm start
```

## Endpoints API

### Autenticación
Todos los endpoints requieren el header `X-API-Key` con tu API key de Soft-IA.

### Clientes

#### Crear cliente
```http
POST /api/clients
Content-Type: application/json
X-API-Key: your-api-key

{
  "name": "Juan Pérez",
  "email": "juan@ejemplo.com",
  "phone": "+34123456789",
  "company": "Empresa SA",
  "status": "lead",
  "tags": ["nuevo", "ecommerce"]
}
```

#### Obtener cliente
```http
GET /api/clients/:id
X-API-Key: your-api-key
```

#### Actualizar cliente
```http
PUT /api/clients/:id
Content-Type: application/json
X-API-Key: your-api-key

{
  "status": "active",
  "tags": ["cliente-activo"]
}
```

#### Listar clientes
```http
GET /api/clients?page=1&limit=50
X-API-Key: your-api-key
```

#### Asignar etiqueta
```http
POST /api/clients/:id/tags
Content-Type: application/json
X-API-Key: your-api-key

{
  "tagId": "tag-id-123"
}
```

#### Actualizar estado
```http
PATCH /api/clients/:id/status
Content-Type: application/json
X-API-Key: your-api-key

{
  "status": "active"
}
```

### Etiquetas

#### Listar etiquetas
```http
GET /api/tags
X-API-Key: your-api-key
```

#### Crear etiqueta
```http
POST /api/tags
Content-Type: application/json
X-API-Key: your-api-key

{
  "name": "VIP",
  "color": "#ff0000",
  "description": "Clientes VIP"
}
```

### Webhooks de Ecommerce

#### Webhook de eventos
```http
POST /api/webhooks/ecommerce
Content-Type: application/json
X-Webhook-Signature: sha256=signature

{
  "eventType": "order_completed",
  "clientEmail": "cliente@ejemplo.com",
  "orderData": {
    "orderId": "ORD-123",
    "total": 150.00,
    "currency": "EUR",
    "items": [
      {
        "productId": "PROD-1",
        "name": "Producto 1",
        "quantity": 2,
        "price": 75.00
      }
    ]
  }
}
```

## Estados de Cliente

- `lead`: Cliente potencial
- `prospect`: Prospecto interesado
- `active`: Cliente activo
- `inactive`: Cliente inactivo
- `churned`: Cliente perdido

## Eventos de Ecommerce

- `order_created`: Pedido creado
- `order_completed`: Pedido completado
- `order_cancelled`: Pedido cancelado
- `cart_abandoned`: Carrito abandonado
- `customer_registered`: Cliente registrado

## Estructura del Proyecto

```
src/
├── config/           # Configuración
├── middleware/       # Middlewares
├── routes/          # Rutas de la API
├── services/        # Servicios de negocio
├── types/           # Tipos TypeScript
├── validation/      # Esquemas de validación
└── index.ts         # Punto de entrada
```

## Scripts

- `npm run dev` - Ejecutar en modo desarrollo
- `npm run build` - Compilar TypeScript
- `npm start` - Ejecutar en producción
- `npm run lint` - Linting del código
- `npm test` - Ejecutar tests

## Seguridad

- Autenticación con API key
- Validación de firmas de webhooks
- Middlewares de seguridad (helmet, cors)
- Validación estricta de entrada de datos