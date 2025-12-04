// src/flows/smart-order.flow.ts - DECISIONES AUTOMÁTICAS
import { addKeyword, EVENTS } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import { JsonFileDB as Database } from '@builderbot/database-json'
import { smartOrderService } from '../services/smart-order.service'
import { excelService } from '../services/excel.service'
import { smartMatcherService } from '../services/smart-matcher.service'
import { intentClassifier } from '../services/intent-classifier.service'

/**
 * Flow principal - TOMA DECISIONES AUTOMÁTICAS
 */
export const smartOrderFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer(
        '🛒 *HACER PEDIDO*\n\n' +
        '💬 Dime qué necesitas:\n\n' +
        '✨ *Ejemplos:*\n' +
        '• _"2 arroces roa de libra y aceite de litro"_\n' +
        '• _"leche alpina grande"_\n' +
        '• _"pan tajado y jamón"_\n\n' +
        '📝 *VER* - Ver carrito | *MENU* - Volver',
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
                        '\n💬 Escribe más productos, *FINALIZAR* para confirmar, o *MENU*'
                    )
                    return gotoFlow(quickActionsFlow)
                } else {
                    await flowDynamic('🛒 Tu carrito está vacío')
                    return fallBack()
                }
            }

            if (message === 'finalizar' || message === 'confirmar') {
                return gotoFlow(finalizeOrderFlow)
            }

            if (message === 'vaciar' || message === 'limpiar') {
                smartOrderService.clearOrder(userId)
                await flowDynamic('🗑️ Carrito vaciado')
                return fallBack()
            }

            // ========================================
            // PROCESAMIENTO INTELIGENTE AUTOMÁTICO
            // ========================================
            await flowDynamic('🔍 Buscando...')

            try {
                const allProducts = await excelService.getProducts()
                
                // Usar el matcher inteligente
                const matchResult = await smartMatcherService.smartMatch(message, allProducts)

                // CASO 1: Matches automáticos exitosos
                if (matchResult.matches && matchResult.matches.length > 0) {
                    let totalCost = 0
                    let addedItems: string[] = []

                    // Agregar todos los matches automáticamente
                    for (const match of matchResult.matches) {
                        smartOrderService.addItem(userId, {
                            product: match.product,
                            quantity: match.quantity
                        })

                        const subtotal = match.product.ventas * match.quantity
                        totalCost += subtotal

                        addedItems.push(
                            `✅ ${match.product.descripcion}\n` +
                            `   🔢 Cantidad: ${match.quantity}\n` +
                            `   💰 ${excelService.formatPrice(match.product.ventas)} c/u\n` +
                            `   💵 Subtotal: ${excelService.formatPrice(subtotal)}`
                        )
                    }

                    // Mensaje de confirmación
                    await flowDynamic(
                        `✅ *¡Agregado al carrito!*\n\n` +
                        addedItems.join('\n\n') +
                        `\n\n━━━━━━━━━━━━━━━━\n` +
                        `💵 *Subtotal: ${excelService.formatPrice(totalCost)}*`
                    )

                    const order = smartOrderService.getOrder(userId)
                    if (order) {
                        await flowDynamic(
                            `🛒 *Total del carrito: ${excelService.formatPrice(order.total)}*\n` +
                            `📦 ${order.items.length} producto(s)\n\n` +
                            `💬 Escribe más productos, *FINALIZAR*, o *VER*`
                        )
                    }

                    return fallBack()
                }

                // CASO 2: Necesita clarificación
                if (matchResult.needsClarification && matchResult.ambiguousProducts) {
                    await state.update({ 
                        ambiguousProducts: matchResult.ambiguousProducts,
                        originalMessage: message
                    })

                    await flowDynamic(matchResult.clarificationMessage!)
                    return gotoFlow(clarifySelectionFlow)
                }

                // CASO 3: No se encontró nada
                await flowDynamic(
                    '❌ No encontré productos que coincidan.\n\n' +
                    '💡 Intenta con:\n' +
                    '• Nombres más simples (_"arroz"_, _"aceite"_)\n' +
                    '• Marcas conocidas (_"roa"_, _"diana"_, _"alpina"_)\n' +
                    '• Escribe *MENU* para volver'
                )
                return fallBack()

            } catch (error) {
                console.error('Error procesando pedido:', error)
                await flowDynamic('❌ Error. Intenta de nuevo o escribe *MENU*')
                return fallBack()
            }
        }
    )

/**
 * Flow de clarificación - SOLO cuando realmente es necesario
 */
const clarifySelectionFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer('', { capture: true }, async (ctx, { flowDynamic, state, gotoFlow, fallBack }) => {
        const response = ctx.body.trim().toLowerCase()
        const userId = ctx.from
        const ambiguousProducts = state.get('ambiguousProducts') as any[]

        if (!ambiguousProducts || ambiguousProducts.length === 0) {
            return gotoFlow(smartOrderFlow)
        }

        if (response === 'nada' || response === 'ninguno') {
            await flowDynamic('👌 Entendido. ¿Qué más buscas?')
            return gotoFlow(smartOrderFlow)
        }

        // Detectar selección
        const selection = intentClassifier.isNumericSelection(response)
        let selectedProduct = null

        if (selection.isSelection && selection.index !== undefined) {
            if (selection.index < ambiguousProducts.length) {
                selectedProduct = ambiguousProducts[selection.index]
            }
        }

        if (!selectedProduct) {
            await flowDynamic('❌ No entendí. Escribe el número del 1 al ' + ambiguousProducts.length)
            return fallBack()
        }

        // Preguntar cantidad
        await state.update({ selectedProduct })
        await flowDynamic(
            `✅ *${selectedProduct.descripcion}*\n` +
            `💰 ${excelService.formatPrice(selectedProduct.ventas)}\n\n` +
            `🔢 ¿Cuántos? (Ejemplo: _"2"_, _"1"_)`
        )

        return gotoFlow(quickQuantityFlow)
    })

/**
 * Flow para capturar cantidad rápidamente
 */
const quickQuantityFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer('', { capture: true }, async (ctx, { flowDynamic, state, gotoFlow }) => {
        const input = ctx.body.trim()
        const userId = ctx.from
        const selectedProduct = state.get('selectedProduct')

        if (!selectedProduct) {
            return gotoFlow(smartOrderFlow)
        }

        // Extraer cantidad
        let quantity = parseInt(input)
        
        if (isNaN(quantity) || quantity < 1 || quantity > 100) {
            // Intentar detectar cantidad en palabras
            const implicit = intentClassifier.detectImplicitQuantity(input)
            quantity = implicit || 1
        }

        // Agregar al carrito
        smartOrderService.addItem(userId, {
            product: selectedProduct,
            quantity
        })

        const subtotal = selectedProduct.ventas * quantity
        await flowDynamic(
            `✅ *¡Agregado!*\n\n` +
            `📦 ${selectedProduct.descripcion}\n` +
            `🔢 ${quantity} unidad(es)\n` +
            `💵 ${excelService.formatPrice(subtotal)}`
        )

        const order = smartOrderService.getOrder(userId)
        if (order) {
            await flowDynamic(
                `\n🛒 *Total: ${excelService.formatPrice(order.total)}* (${order.items.length} productos)\n\n` +
                `💬 Escribe más productos, *FINALIZAR*, o *VER*`
            )
        }

        return gotoFlow(smartOrderFlow)
    })

/**
 * Flow de acciones rápidas
 */
const quickActionsFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer('', { capture: true }, async (ctx, { gotoFlow }) => {
        const option = ctx.body.trim().toLowerCase()
        const userId = ctx.from

        if (option === 'finalizar' || option === 'confirmar') {
            return gotoFlow(finalizeOrderFlow)
        }

        if (option === 'vaciar' || option === 'limpiar') {
            smartOrderService.clearOrder(userId)
            await ctx.flowDynamic('🗑️ Carrito vaciado')
            return gotoFlow(smartOrderFlow)
        }

        if (option === 'menu') {
            const { menuFlow } = await import('./welcome.flow.js')
            return gotoFlow(menuFlow)
        }

        // Cualquier otro texto = agregar producto
        return gotoFlow(smartOrderFlow)
    })

/**
 * Flow de finalización
 */
const finalizeOrderFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer('', {}, async (ctx, { flowDynamic }) => {
        const userId = ctx.from
        const order = smartOrderService.getOrder(userId)

        if (!order || order.items.length === 0) {
            await flowDynamic('🛒 Tu carrito está vacío')
            return ctx.gotoFlow(smartOrderFlow)
        }

        await flowDynamic(
            '📋 *RESUMEN DE TU PEDIDO*\n\n' +
            smartOrderService.formatOrder(order) +
            '\n\n━━━━━━━━━━━━━━━━\n\n' +
            '¿Confirmas este pedido?\n' +
            '✅ *SÍ* | ❌ *NO*'
        )
    })
    .addAnswer('', { capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
        const response = ctx.body.toLowerCase().trim()
        const userId = ctx.from

        if (response === 'si' || response === 'sí' || response === 'yes') {
            const order = smartOrderService.getOrder(userId)
            
            if (order) {
                order.status = 'confirmed'
                const orderNumber = `ORD-${Date.now().toString().slice(-8)}`
                
                await flowDynamic(
                    '✅ *¡PEDIDO CONFIRMADO!*\n\n' +
                    `📝 Orden: *${orderNumber}*\n` +
                    `💰 Total: *${excelService.formatPrice(order.total)}*\n` +
                    `📦 ${order.items.length} producto(s)\n\n` +
                    '━━━━━━━━━━━━━━━━\n\n' +
                    '📞 Te contactaremos pronto para coordinar la entrega.\n\n' +
                    '¡Gracias por tu compra! 🎉'
                )

                smartOrderService.clearOrder(userId)
            }

            const { menuFlow } = await import('./welcome.flow.js')
            return gotoFlow(menuFlow)

        } else {
            await flowDynamic(
                '❌ Pedido cancelado\n\n' +
                'Escribe más productos, *VER* tu carrito, o *MENU*'
            )
            return gotoFlow(smartOrderFlow)
        }
    })

/**
 * Keywords para iniciar pedido
 */
export const orderKeywordFlow = addKeyword<Provider, Database>([
    'pedido',
    'comprar',
    'quiero',
    'necesito',
    'ordenar',
    'pedir'
])
    .addAction(async (_, { gotoFlow }) => {
        return gotoFlow(smartOrderFlow)
    })