#!/bin/bash

# Test de integración para ApiSoftia CRM Webhooks
# Este script verifica que la integración con Hub Central funcione correctamente

echo "🧪 Iniciando tests de integración ApiSoftia CRM..."

API_BASE_URL="http://localhost:3005"
HUB_CENTRAL_URL="http://localhost:3007"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para mostrar resultados
show_result() {
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✅ $2${NC}"
  else
    echo -e "${RED}❌ $2${NC}"
  fi
}

# Función para verificar respuesta JSON
check_json_response() {
  local response="$1"
  local expected_field="$2"
  
  if echo "$response" | jq -e ".$expected_field" > /dev/null 2>&1; then
    return 0
  else
    return 1
  fi
}

echo ""
echo "📋 1. Verificando salud del servicio..."

# Test 1: Health check general
response=$(curl -s -w "%{http_code}" -o /tmp/health_response.json "$API_BASE_URL/health")
http_code="${response: -3}"

if [ "$http_code" -eq 200 ]; then
  show_result 0 "Health check general"
else
  show_result 1 "Health check general (HTTP $http_code)"
fi

# Test 2: Health check específico de webhooks CRM
response=$(curl -s -w "%{http_code}" -o /tmp/webhook_health_response.json "$API_BASE_URL/api/webhooks/crm/health")
http_code="${response: -3}"

if [ "$http_code" -eq 200 ]; then
  show_result 0 "Health check webhooks CRM"
else
  show_result 1 "Health check webhooks CRM (HTTP $http_code)"
fi

echo ""
echo "🔐 2. Verificando seguridad HMAC..."

# Test 3: Webhook sin firma (debe fallar)
response=$(curl -s -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "client_lead_created",
    "orderId": "test-order-001",
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
    "clientData": {
      "email": "test@example.com",
      "name": "Test User"
    }
  }' \
  -o /tmp/no_signature_response.json \
  "$API_BASE_URL/api/webhooks/hub-central")
http_code="${response: -3}"

if [ "$http_code" -eq 401 ]; then
  show_result 0 "Rechazo webhook sin firma HMAC"
else
  show_result 1 "Rechazo webhook sin firma HMAC (esperaba 401, obtuvo $http_code)"
fi

# Test 4: Webhook con firma inválida (debe fallar)
response=$(curl -s -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=invalid_signature" \
  -d '{
    "eventType": "client_lead_created",
    "orderId": "test-order-002",
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
    "clientData": {
      "email": "test@example.com",
      "name": "Test User"
    }
  }' \
  -o /tmp/invalid_signature_response.json \
  "$API_BASE_URL/api/webhooks/hub-central")
http_code="${response: -3}"

if [ "$http_code" -eq 401 ]; then
  show_result 0 "Rechazo webhook con firma inválida"
else
  show_result 1 "Rechazo webhook con firma inválida (esperaba 401, obtuvo $http_code)"
fi

echo ""
echo "👤 3. Testing eventos de lead..."

# Función para generar firma HMAC válida
generate_hmac() {
  local payload="$1"
  local secret="hub-central-secret-key-2024"
  echo -n "$payload" | openssl dgst -sha256 -hmac "$secret" | sed 's/^.* //'
}

# Test 5: Crear lead válido
payload='{
  "eventType": "client_lead_created",
  "orderId": "lead-test-001",
  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
  "clientData": {
    "email": "newlead@test.com",
    "name": "Nuevo Lead Test",
    "phone": "+573001234567"
  },
  "metadata": {
    "source": "integration_test",
    "campaign": "test_campaign"
  }
}'

signature="sha256=$(generate_hmac "$payload")"

response=$(curl -s -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $signature" \
  -d "$payload" \
  -o /tmp/lead_create_response.json \
  "$API_BASE_URL/api/webhooks/hub-central")
http_code="${response: -3}"

if [ "$http_code" -eq 200 ]; then
  if check_json_response "$(cat /tmp/lead_create_response.json)" "success"; then
    show_result 0 "Creación de lead válido"
  else
    show_result 1 "Creación de lead válido (respuesta malformada)"
  fi
else
  show_result 1 "Creación de lead válido (HTTP $http_code)"
fi

echo ""
echo "💰 4. Testing eventos de compra..."

# Test 6: Procesar compra válida
payload='{
  "eventType": "client_purchase_completed",
  "orderId": "purchase-test-001",
  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
  "clientData": {
    "email": "customer@test.com",
    "name": "Cliente Test",
    "phone": "+573001234567"
  },
  "orderData": {
    "total": 250000,
    "currency": "COP",
    "items": [
      {
        "productId": "prod-001",
        "name": "Producto Test",
        "quantity": 2,
        "price": 125000
      }
    ]
  },
  "metadata": {
    "paymentMethod": "credit_card",
    "source": "integration_test"
  }
}'

signature="sha256=$(generate_hmac "$payload")"

response=$(curl -s -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $signature" \
  -d "$payload" \
  -o /tmp/purchase_response.json \
  "$API_BASE_URL/api/webhooks/hub-central")
http_code="${response: -3}"

if [ "$http_code" -eq 200 ]; then
  if check_json_response "$(cat /tmp/purchase_response.json)" "success"; then
    show_result 0 "Procesamiento de compra válida"
  else
    show_result 1 "Procesamiento de compra válida (respuesta malformada)"
  fi
else
  show_result 1 "Procesamiento de compra válida (HTTP $http_code)"
fi

echo ""
echo "📦 5. Testing eventos de entrega..."

# Test 7: Confirmar entrega
payload='{
  "eventType": "client_delivery_confirmed",
  "orderId": "delivery-test-001",
  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
  "clientData": {
    "email": "customer@test.com",
    "name": "Cliente Test"
  },
  "metadata": {
    "deliveryDate": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
    "courier": "integration_test"
  }
}'

signature="sha256=$(generate_hmac "$payload")"

response=$(curl -s -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $signature" \
  -d "$payload" \
  -o /tmp/delivery_response.json \
  "$API_BASE_URL/api/webhooks/hub-central")
http_code="${response: -3}"

if [ "$http_code" -eq 200 ]; then
  if check_json_response "$(cat /tmp/delivery_response.json)" "success"; then
    show_result 0 "Confirmación de entrega"
  else
    show_result 1 "Confirmación de entrega (respuesta malformada)"
  fi
else
  show_result 1 "Confirmación de entrega (HTTP $http_code)"
fi

echo ""
echo "⭐ 6. Testing eventos de feedback..."

# Test 8: Registrar feedback
payload='{
  "eventType": "client_feedback_received",
  "orderId": "feedback-test-001",
  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
  "clientData": {
    "email": "customer@test.com",
    "name": "Cliente Test"
  },
  "metadata": {
    "rating": 5,
    "comment": "Excelente servicio y producto",
    "source": "integration_test"
  }
}'

signature="sha256=$(generate_hmac "$payload")"

response=$(curl -s -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $signature" \
  -d "$payload" \
  -o /tmp/feedback_response.json \
  "$API_BASE_URL/api/webhooks/hub-central")
http_code="${response: -3}"

if [ "$http_code" -eq 200 ]; then
  if check_json_response "$(cat /tmp/feedback_response.json)" "success"; then
    show_result 0 "Registro de feedback"
  else
    show_result 1 "Registro de feedback (respuesta malformada)"
  fi
else
  show_result 1 "Registro de feedback (HTTP $http_code)"
fi

echo ""
echo "🎫 7. Testing eventos de soporte..."

# Test 9: Crear ticket de soporte
payload='{
  "eventType": "client_support_ticket",
  "orderId": "support-test-001",
  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
  "clientData": {
    "email": "customer@test.com",
    "name": "Cliente Test"
  },
  "metadata": {
    "subject": "Consulta sobre producto",
    "description": "Necesito información adicional sobre el producto comprado",
    "priority": "medium",
    "source": "integration_test"
  }
}'

signature="sha256=$(generate_hmac "$payload")"

response=$(curl -s -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $signature" \
  -d "$payload" \
  -o /tmp/support_response.json \
  "$API_BASE_URL/api/webhooks/hub-central")
http_code="${response: -3}"

if [ "$http_code" -eq 200 ]; then
  if check_json_response "$(cat /tmp/support_response.json)" "success"; then
    show_result 0 "Creación de ticket de soporte"
  else
    show_result 1 "Creación de ticket de soporte (respuesta malformada)"
  fi
else
  show_result 1 "Creación de ticket de soporte (HTTP $http_code)"
fi

echo ""
echo "❌ 8. Testing manejo de errores..."

# Test 10: Payload malformado
payload='{"invalid": "json structure"}'
signature="sha256=$(generate_hmac "$payload")"

response=$(curl -s -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $signature" \
  -d "$payload" \
  -o /tmp/invalid_payload_response.json \
  "$API_BASE_URL/api/webhooks/hub-central")
http_code="${response: -3}"

if [ "$http_code" -eq 400 ]; then
  show_result 0 "Manejo de payload malformado"
else
  show_result 1 "Manejo de payload malformado (esperaba 400, obtuvo $http_code)"
fi

# Test 11: Evento no soportado
payload='{
  "eventType": "unsupported_event",
  "orderId": "unsupported-test-001",
  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
  "clientData": {
    "email": "test@example.com",
    "name": "Test User"
  }
}'

signature="sha256=$(generate_hmac "$payload")"

response=$(curl -s -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $signature" \
  -d "$payload" \
  -o /tmp/unsupported_event_response.json \
  "$API_BASE_URL/api/webhooks/hub-central")
http_code="${response: -3}"

if [ "$http_code" -eq 400 ]; then
  show_result 0 "Manejo de evento no soportado"
else
  show_result 1 "Manejo de evento no soportado (esperaba 400, obtuvo $http_code)"
fi

echo ""
echo "🧹 9. Limpieza..."

# Limpiar archivos temporales
rm -f /tmp/*_response.json

echo ""
echo "📊 Resumen de tests completado"
echo -e "${YELLOW}Nota: Para tests completos, asegúrate de que:${NC}"
echo -e "${YELLOW}• ApiSoftia esté ejecutándose en puerto 3005${NC}"
echo -e "${YELLOW}• Hub Central esté ejecutándose en puerto 3007${NC}"
echo -e "${YELLOW}• Las credenciales del CRM Soft-IA estén configuradas${NC}"

echo ""
echo "✅ Tests de integración ApiSoftia completados"
