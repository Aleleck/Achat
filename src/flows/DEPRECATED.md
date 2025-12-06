# Flows Deprecados

## `order-legacy.flow.ts` ⚠️ DEPRECADO

**Estado**: Mantenido por compatibilidad, pero no se recomienda su uso.

**Razón de deprecación**: Ha sido reemplazado por `smart-order.flow.ts` que ofrece:
- Procesamiento con IA (Google Gemini)
- Menos pasos para el usuario
- Confirmación directa (sin preguntar SI/NO)
- Soporte para lenguaje natural ("2 arroces y aceite")
- Auto-selección inteligente de productos

**Flow antiguo** (`order-legacy.flow.ts`):
```
1. Buscar producto
2. Mostrar resultados
3. Pedir nombre exacto
4. Pedir cantidad
5. ¿Agregar otro?
6. Confirmar pedido (SI/NO)
```

**Flow nuevo** (`smart-order.flow.ts`):
```
1. "2 arroces y aceite"
2. ✅ Agregados al carrito
3. FINALIZAR
4. ✅ Pedido confirmado (directo)
```

**Migración**: Todos los flows ahora usan `smart-order.flow.ts`.

**¿Eliminar?**: Se puede eliminar completamente si no se necesita retrocompatibilidad.
