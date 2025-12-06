# Servicios Experimentales

Esta carpeta contiene código que podría ser útil en el futuro pero actualmente no está en uso.

## Contenido

### `context.service.ts`

**Estado**: No utilizado actualmente

**Funcionalidad**:
- Gestión de contexto de conversación
- Historial de mensajes por usuario
- Análisis de patrones de compra
- Gestión de preferencias de usuario

**Por qué no se usa**:
- El flujo actual del bot no requiere mantener contexto extendido
- `rag.service.ts` era el único consumidor y también fue deprecado

**Posibles usos futuros**:
- Sistema de recomendaciones basado en historial
- Análisis de comportamiento del cliente
- Personalización de respuestas
- Marketing dirigido

**Integración futura**: Si se decide usar, importar desde aquí y conectar en los flows principales.
