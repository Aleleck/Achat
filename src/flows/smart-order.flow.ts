// src/flows/smart-order.flow.ts - CON IA REAL Y MENSAJES SIMPLIFICADOS
import { addKeyword, EVENTS } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import { JsonFileDB as Database } from '@builderbot/database-json'
import { orderService } from '../services/order.service'
import { excelService } from '../services/excel.service'
import { aiOrderService } from '../services/ai-order.service'
import { intentClassifier } from '../services/intent-classifier.service'
import { Order } from '../types/index'

/**
 * Formatear carrito de forma simple
 */
function formatSimpleCart(order: Order): string {
    if (!order || order.items.length === 0) {
        return '🛒 Carrito vacío'
    }

    let msg = '🛒 *Tu carrito*\n\n'

    order.items.forEach((item, i) => {
        const subtotal = item.product.ventas * item.quantity
        msg += `${i + 1}. ${item.product.descripcion}\n`
        msg += `   ${item.quantity}x ${excelService.formatPrice(item.product.ventas)} = ${excelService.formatPrice(subtotal)}\n\n`
    })

    msg += `*Total: ${excelService.formatPrice(order.total)}*\n\n`
    msg += 'Escribe más productos, FINALIZAR o VACIAR'

    return msg
}

/**
 * Flow principal - CON IA REAL Y MENSAJES SIMPLES
 */
export const smartOrderFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer(
        '🛒 *Hacer pedido*\n\n' +
        'Dime qué necesitas:\n' +
        '_Ej: "2 arroces y aceite de litro"_\n\n' +
        'VER | FINALIZAR | MENU',
        { capture: true },
        async (ctx, { flowDynamic, state, fallBack, gotoFlow }) => {
            const message = ctx.body.trim().toLowerCase()
            const userId = ctx.from

            // Comandos especiales
            if (message === 'menu') {
                orderService.clearOrder(userId)
                const { menuFlow } = await import('./welcome.flow.js')
                return gotoFlow(menuFlow)
            }

            if (message === 'ver' || message === 'carrito') {
                const order = orderService.getOrder(userId)
                if (order && order.items.length > 0) {
                    await flowDynamic(formatSimpleCart(order))
                    return gotoFlow(quickActionsFlow)
                } else {
                    await flowDynamic('🛒 Carrito vacío\n\nEscribe lo que necesitas')
                    return fallBack()
                }
            }

            if (message === 'finalizar' || message === 'confirmar') {
                return gotoFlow(finalizeOrderFlow)
            }

            if (message === 'vaciar' || message === 'limpiar') {
                orderService.clearOrder(userId)
                await flowDynamic('🗑️ Carrito vaciado')
                return fallBack()
            }

            // ========================================
            // PROCESAMIENTO CON IA REAL
            // ========================================
            await flowDynamic('🔍 Buscando...')

            try {
                const allProducts = await excelService.getProducts()

                // Usar el servicio con IA
                const result = await aiOrderService.processOrder(message, allProducts)

                // CASO 1: Matches exitosos (automáticos o múltiples)
                if (result.matches && result.matches.length > 0) {
                    const addedItems: string[] = []

                    // Agregar todos al carrito
                    for (const match of result.matches) {
                        orderService.addItem(userId, {
                            product: match.product,
                            quantity: match.quantity
                        })

                        const subtotal = match.product.ventas * match.quantity
                        const autoNote = match.autoSelected ? ' (seleccionado automáticamente)' : ''

                        addedItems.push(
                            `✅ ${match.product.descripcion}${autoNote}\n` +
                            `   ${match.quantity}x ${excelService.formatPrice(match.product.ventas)} = ${excelService.formatPrice(subtotal)}`
                        )
                    }

                    await flowDynamic(addedItems.join('\n\n'))

                    // Resumen compacto
                    const order = orderService.getOrder(userId)
                    if (order) {
                        await flowDynamic(
                            `\n🛒 Total: ${excelService.formatPrice(order.total)} (${order.items.length} productos)\n\n` +
                            `Escribe más productos, VER o FINALIZAR`
                        )
                    }

                    return fallBack()
                }

                // CASO 2: Necesita clarificación
                if (result.needsClarification && result.options) {
                    await state.update({
                        clarificationOptions: result.options,
                        originalMessage: message
                    })

                    await flowDynamic(result.clarificationMessage!)
                    return gotoFlow(clarifySelectionFlow)
                }

                // CASO 3: No se encontró nada
                await flowDynamic(
                    '❌ No encontré ese producto.\n\n' +
                    'Intenta con otro nombre o escribe MENU'
                )
                return fallBack()

            } catch (error) {
                console.error('Error procesando pedido:', error)
                await flowDynamic('❌ Error. Intenta de nuevo')
                return fallBack()
            }
        }
    )

/**
 * Flow de clarificación - Simplificado
 */
const clarifySelectionFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer('', { capture: true }, async (ctx, { flowDynamic, state, gotoFlow, fallBack }) => {
        const response = ctx.body.trim().toLowerCase()
        const userId = ctx.from
        const options = state.get('clarificationOptions') as any[]

        if (!options || options.length === 0) {
            return gotoFlow(smartOrderFlow)
        }

        if (response === 'nada' || response === 'ninguno' || response === 'menu') {
            await flowDynamic('Ok')
            return gotoFlow(smartOrderFlow)
        }

        // Detectar selección
        const selection = intentClassifier.isNumericSelection(response)
        let selectedProduct = null

        if (selection.isSelection && selection.index !== undefined) {
            if (selection.index < options.length) {
                selectedProduct = options[selection.index]
            }
        }

        if (!selectedProduct) {
            await flowDynamic('Escribe el número (1-' + options.length + ')')
            return fallBack()
        }

        // Preguntar cantidad
        await state.update({ selectedProduct })
        await flowDynamic(
            `${selectedProduct.descripcion}\n` +
            `${excelService.formatPrice(selectedProduct.ventas)}\n\n` +
            `¿Cuántos?`
        )

        return gotoFlow(quickQuantityFlow)
    })

/**
 * Flow para capturar cantidad - Simplificado
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
            const implicit = intentClassifier.detectImplicitQuantity(input)
            quantity = implicit || 1
        }

        // Agregar al carrito
        orderService.addItem(userId, {
            product: selectedProduct,
            quantity
        })

        const subtotal = selectedProduct.ventas * quantity
        await flowDynamic(
            `✅ Agregado: ${selectedProduct.descripcion}\n` +
            `${quantity}x ${excelService.formatPrice(selectedProduct.ventas)} = ${excelService.formatPrice(subtotal)}`
        )

        const order = orderService.getOrder(userId)
        if (order) {
            await flowDynamic(
                `\n🛒 Total: ${excelService.formatPrice(order.total)} (${order.items.length} productos)\n\n` +
                `Escribe más productos, FINALIZAR o VER`
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
            orderService.clearOrder(userId)
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
 * Flow de finalización - Simplificado
 */
const finalizeOrderFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer('', {}, async (ctx, { flowDynamic }) => {
        const userId = ctx.from
        const order = orderService.getOrder(userId)

        if (!order || order.items.length === 0) {
            await flowDynamic('🛒 Carrito vacío')
            return ctx.gotoFlow(smartOrderFlow)
        }

        await flowDynamic(
            '📋 *Resumen*\n\n' +
            formatSimpleCart(order) +
            '\n\n¿Confirmas? (SÍ/NO)'
        )
    })
    .addAnswer('', { capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
        const response = ctx.body.toLowerCase().trim()
        const userId = ctx.from

        if (response === 'si' || response === 'sí' || response === 'yes') {
            const order = orderService.getOrder(userId)

            if (order) {
                order.status = 'confirmed'
                const orderNumber = `ORD-${Date.now().toString().slice(-8)}`

                await flowDynamic(
                    `✅ *Pedido confirmado #${orderNumber}*\n\n` +
                    `Total: ${excelService.formatPrice(order.total)}\n` +
                    `${order.items.length} producto(s)\n\n` +
                    'Te contactaremos pronto.\n¡Gracias! 🎉'
                )

                orderService.clearOrder(userId)
            }

            const { menuFlow } = await import('./welcome.flow.js')
            return gotoFlow(menuFlow)

        } else {
            await flowDynamic('❌ Cancelado\n\nEscribe más productos o MENU')
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