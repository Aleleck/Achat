// src/flows/smart-order.flow.ts
import { addKeyword, EVENTS } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import { JsonFileDB as Database } from '@builderbot/database-json'
import { smartOrderService } from '../services/smart-order.service'
import { contextService } from '../services/context.service'
import { excelService } from '../services/excel.service'

/**
 * Flow principal de pedidos inteligentes
 */
export const smartOrderFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer(
        '🛒 *PEDIDO INTELIGENTE*\n\n' +
        '💬 Dime qué necesitas de forma natural, por ejemplo:\n\n' +
        '• _"Quiero 2 litros de leche alpina"_\n' +
        '• _"Dame 3 panes tajados"_\n' +
        '• _"Necesito arroz y aceite"_\n' +
        '• _"1kg de queso campesino"_\n\n' +
        '✨ Entiendo cantidades, marcas y medidas\n' +
        '📝 Escribe *VER* para ver tu carrito\n' +
        '🔙 Escribe *MENU* para volver',
        { capture: true },
        async (ctx, { flowDynamic, state, fallBack, gotoFlow }) => {
            const message = ctx.body.trim().toLowerCase()
            const userId = ctx.from

            // Comandos especiales
            if (message === 'menu') {
                smartOrderService.clearOrder(userId)
                const { menuFlow } = await import('./welcome.flow.js')
                return gotoFlow(menuFlow)
            }

            if (message === 'ver' || message === 'carrito') {
                const order = smartOrderService.getOrder(userId)
                if (order && order.items.length > 0) {
                    await flowDynamic(smartOrderService.formatOrder(order))
                    await flowDynamic(
                        '💬 *Opciones:*\n' +
                        '1️⃣ Agregar más productos\n' +
                        '2️⃣ Finalizar pedido\n' +
                        '3️⃣ Vaciar carrito\n' +
                        '4️⃣ Volver al menú'
                    )
                    return gotoFlow(cartOptionsFlow)
                } else {
                    await flowDynamic('🛒 Tu carrito está vacío')
                    return fallBack()
                }
            }

            // Procesar mensaje con IA
            await flowDynamic('🤖 Procesando...')

            try {
                const result = await smartOrderService.processOrderMessage(message, userId)

                // Enviar respuesta
                await flowDynamic(result.message)

                // Si necesita confirmación, ir a flow de confirmación
                if (result.needsConfirmation && result.action === 'clarify') {
                    await state.update({ 
                        pendingProducts: result.products,
                        originalMessage: message 
                    })
                    return gotoFlow(clarificationFlow)
                }

                // Si agregó exitosamente, mostrar opciones
                if (result.success && result.action === 'add') {
                    await flowDynamic(
                        '\n💬 *¿Qué deseas hacer?*\n' +
                        '• Agregar otro producto (escríbelo)\n' +
                        '• *VER* - Ver carrito completo\n' +
                        '• *FINALIZAR* - Confirmar pedido\n' +
                        '• *MENU* - Volver al menú'
                    )
                }

                // Continuar en el mismo flow para próximo mensaje
                return fallBack()

            } catch (error) {
                console.error('Error procesando pedido:', error)
                await flowDynamic(
                    '❌ Hubo un error. ¿Podrías reformular tu pedido?\n\n' +
                    '💡 Ejemplo: _"Quiero 2 litros de leche"_'
                )
                return fallBack()
            }
        }
    )

/**
 * Flow de clarificación cuando hay ambigüedad
 */
const clarificationFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer(
        '💬 Escribe el *número* del producto que deseas o el nombre completo:',
        { capture: true },
        async (ctx, { flowDynamic, state, gotoFlow, fallBack }) => {
            const response = ctx.body.trim()
            const userId = ctx.from
            const pendingProducts = state.get('pendingProducts') as any[]

            if (!pendingProducts || pendingProducts.length === 0) {
                await flowDynamic('❌ Error: no hay productos pendientes')
                return gotoFlow(smartOrderFlow)
            }

            // Verificar si es un número
            const num = parseInt(response)
            let selectedProduct = null

            if (!isNaN(num) && num > 0 && num <= pendingProducts.length) {
                selectedProduct = pendingProducts[num - 1]
            } else {
                // Buscar por nombre
                const normalized = response.toLowerCase()
                selectedProduct = pendingProducts.find(p =>
                    p.descripcion.toLowerCase().includes(normalized)
                )
            }

            if (!selectedProduct) {
                await flowDynamic('❌ No encontré ese producto. Intenta de nuevo:')
                return fallBack()
            }

            // Preguntar cantidad
            await state.update({ selectedProduct })
            await flowDynamic(
                `✅ Seleccionaste: *${selectedProduct.descripcion}*\n\n` +
                `💰 Precio: ${excelService.formatPrice(selectedProduct.ventas)}\n\n` +
                `🔢 ¿Cuántos deseas? (escribe un número)`
            )

            return gotoFlow(quantityFlow)
        }
    )

/**
 * Flow para capturar cantidad
 */
const quantityFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer('', { capture: true }, async (ctx, { flowDynamic, state, gotoFlow }) => {
        const quantity = smartOrderService.validateQuantity(ctx.body)
        const userId = ctx.from
        const selectedProduct = state.get('selectedProduct')

        if (!quantity) {
            await flowDynamic('❌ Cantidad inválida. Debe ser entre 1 y 100')
            await flowDynamic('🔢 Escribe la cantidad de nuevo:')
            return gotoFlow(quantityFlow)
        }

        if (!selectedProduct) {
            await flowDynamic('❌ Error: producto no seleccionado')
            return gotoFlow(smartOrderFlow)
        }

        // Agregar al carrito
        smartOrderService.addItem(userId, {
            product: selectedProduct,
            quantity
        })

        const subtotal = selectedProduct.ventas * quantity
        await flowDynamic(
            `✅ *Agregado al carrito*\n\n` +
            `📦 ${selectedProduct.descripcion}\n` +
            `🔢 Cantidad: ${quantity}\n` +
            `💵 Subtotal: ${excelService.formatPrice(subtotal)}`
        )

        const order = smartOrderService.getOrder(userId)
        if (order) {
            await flowDynamic(`🛒 Total del carrito: ${excelService.formatPrice(order.total)}`)
        }

        await flowDynamic(
            '\n💬 *¿Qué deseas hacer?*\n' +
            '• Agregar otro producto (escríbelo)\n' +
            '• *VER* - Ver carrito completo\n' +
            '• *FINALIZAR* - Confirmar pedido\n' +
            '• *MENU* - Volver al menú'
        )

        return gotoFlow(smartOrderFlow)
    })

/**
 * Flow de opciones del carrito
 */
const cartOptionsFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer('', { capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
        const option = ctx.body.trim()
        const userId = ctx.from

        switch (option) {
            case '1':
                // Agregar más productos
                return gotoFlow(smartOrderFlow)

            case '2':
                // Finalizar pedido
                return gotoFlow(finalizeOrderFlow)

            case '3':
                // Vaciar carrito
                smartOrderService.clearOrder(userId)
                await flowDynamic('🗑️ Carrito vaciado')
                return gotoFlow(smartOrderFlow)

            case '4':
                // Volver al menú
                const { menuFlow } = await import('./welcome.flow.js')
                return gotoFlow(menuFlow)

            default:
                await flowDynamic('❌ Opción inválida. Escribe 1, 2, 3 o 4')
                return gotoFlow(cartOptionsFlow)
        }
    })

/**
 * Flow de finalización de pedido
 */
const finalizeOrderFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer('', {}, async (ctx, { flowDynamic }) => {
        const userId = ctx.from
        const order = smartOrderService.getOrder(userId)

        if (!order || order.items.length === 0) {
            await flowDynamic('🛒 Tu carrito está vacío')
            return
        }

        await flowDynamic(
            '📋 *RESUMEN DE TU PEDIDO*\n\n' +
            smartOrderService.formatOrder(order) +
            '\n\n¿Confirmas este pedido? (Sí/No)'
        )
    })
    .addAnswer('', { capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
        const response = ctx.body.toLowerCase().trim()
        const userId = ctx.from

        if (response === 'si' || response === 'sí' || response === 'yes') {
            const order = smartOrderService.getOrder(userId)
            
            if (order) {
                order.status = 'confirmed'
                
                // Aquí integrarías con tu sistema de órdenes
                // Por ejemplo: enviar a base de datos, notificar al admin, etc.
                
                await flowDynamic(
                    '✅ *¡PEDIDO CONFIRMADO!*\n\n' +
                    `📝 Número de orden: ${Date.now()}\n` +
                    `💰 Total: ${excelService.formatPrice(order.total)}\n\n` +
                    '📞 Te contactaremos pronto para coordinar la entrega.\n\n' +
                    '¡Gracias por tu compra! 🎉'
                )

                smartOrderService.clearOrder(userId)
            }

            const { menuFlow } = await import('./welcome.flow.js')
            return gotoFlow(menuFlow)

        } else {
            await flowDynamic('❌ Pedido cancelado')
            smartOrderService.clearOrder(userId)
            const { menuFlow } = await import('./welcome.flow.js')
            return gotoFlow(menuFlow)
        }
    })

/**
 * Keyword alternativo para iniciar pedido
 */
export const orderKeywordFlow = addKeyword<Provider, Database>([
    'pedido',
    'comprar',
    'quiero',
    'necesito',
    'ordenar'
])
    .addAction(async (_, { gotoFlow }) => {
        return gotoFlow(smartOrderFlow)
    })