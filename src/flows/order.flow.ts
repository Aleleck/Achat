// src/flows/order.flow.ts
import { addKeyword, EVENTS } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import { JsonFileDB as Database } from '@builderbot/database-json'
import { messages } from '../utils/messages.js'
import { excelService } from '../services/excel.service.js'
import { orderService } from '../services/order.service.js'
import { OrderItem } from '../types/index.js'

// Declarar flows en orden correcto para evitar uso antes de declaración

const orderFinalFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer('', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        const option = ctx.body.trim()

        switch (option) {
            case '1':
                return gotoFlow(orderProductSearchFlow)
            case '2':
                const { menuFlow } = await import('./welcome.flow.js')
                return gotoFlow(menuFlow)
            default:
                return fallBack(messages.errors.invalidOption)
        }
    })

const orderConfirmFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer('', {}, async (ctx, { flowDynamic }) => {
        const order = orderService.getOrder(ctx.from)
        if (!order) {
            await flowDynamic(messages.errors.generic)
            return
        }

        const orderSummary = orderService.formatOrder(order)
        await flowDynamic(messages.order.confirmOrder(orderSummary))
    })
    .addAnswer('', { capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
        const response = ctx.body.toLowerCase().trim()

        if (response === 'si' || response === 'sí' || response === 'yes') {
            // Confirmar pedido
            const order = orderService.getOrder(ctx.from)
            if (order) {
                order.status = 'confirmed'
                // Aquí podrías guardar en base de datos, enviar notificación, etc.
                
                await flowDynamic(messages.order.confirmed)
                orderService.clearOrder(ctx.from)
            }
            return gotoFlow(orderFinalFlow)
        } else {
            // Cancelar
            orderService.clearOrder(ctx.from)
            await flowDynamic(messages.order.cancelled)
            const { menuFlow } = await import('./welcome.flow.js')
            return gotoFlow(menuFlow)
        }
    })

const orderContinueFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer('', { capture: true }, async (ctx, { flowDynamic, gotoFlow, fallBack }) => {
        const option = ctx.body.trim()

        switch (option) {
            case '1':
                // Agregar otro producto
                return gotoFlow(orderProductSearchFlow)
            
            case '2':
                // Ver pedido actual
                const currentOrder = orderService.getOrder(ctx.from)
                if (currentOrder) {
                    await flowDynamic(orderService.formatOrder(currentOrder))
                    await flowDynamic(messages.order.continueOrder)
                }
                return fallBack()
            
            case '3':
                // Finalizar pedido
                const order = orderService.getOrder(ctx.from)
                if (!order || order.items.length === 0) {
                    await flowDynamic('❌ No tienes productos en el carrito')
                    return gotoFlow(orderProductSearchFlow)
                }
                return gotoFlow(orderConfirmFlow)
            
            case '4':
                // Cancelar pedido
                orderService.clearOrder(ctx.from)
                await flowDynamic(messages.order.cancelled)
                const { menuFlow } = await import('./welcome.flow.js')
                return gotoFlow(menuFlow)
            
            default:
                return fallBack(messages.errors.invalidOption)
        }
    })

const orderQuantityFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer('', { capture: true }, async (ctx, { flowDynamic, gotoFlow, state, fallBack }) => {
        const quantity = orderService.validateQuantity(ctx.body)

        if (!quantity) {
            await flowDynamic(messages.order.invalidQuantity)
            return fallBack()
        }

        const selectedProduct = state.get('selectedProduct')
        if (!selectedProduct) {
            await flowDynamic(messages.errors.generic)
            return gotoFlow(orderProductSearchFlow)
        }

        // Agregar al pedido
        const orderItem: OrderItem = {
            product: selectedProduct,
            quantity
        }

        orderService.addItem(ctx.from, orderItem)

        await flowDynamic(messages.order.added(selectedProduct.descripcion, quantity))
        await flowDynamic(messages.order.continueOrder)

        return gotoFlow(orderContinueFlow)
    })

const orderProductSearchFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer(messages.order.start, { capture: true }, async (ctx, { flowDynamic, gotoFlow, state, fallBack }) => {
        const query = ctx.body.toLowerCase().trim()

        if (query === 'menu') {
            orderService.clearOrder(ctx.from)
            const { menuFlow } = await import('./welcome.flow.js')
            return gotoFlow(menuFlow)
        }

        try {
            const products = await excelService.searchProducts(query)

            if (products.length === 0) {
                await flowDynamic(messages.priceInquiry.notFound)
                return fallBack()
            }

            // Si hay múltiples resultados, mostrar lista
            if (products.length > 1) {
                const productList = excelService.formatProductList(products)
                await flowDynamic(`Encontré varios productos:\n\n${productList}`)
                await flowDynamic('Por favor escribe el nombre *exacto* del producto que deseas agregar')
                return fallBack()
            }

            // Si hay un solo resultado, continuar con cantidad
            await state.update({ selectedProduct: products[0] })
            await flowDynamic(messages.order.askQuantity(products[0].descripcion))
            return gotoFlow(orderQuantityFlow)

        } catch (error) {
            console.error('Error buscando producto:', error)
            await flowDynamic(messages.errors.productsNotLoaded)
            const { menuFlow } = await import('./welcome.flow.js')
            return gotoFlow(menuFlow)
        }
    })

export const orderFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAction(async (ctx, { gotoFlow, state }) => {
        await state.update({ currentFlow: 'order' })
        orderService.createOrder(ctx.from)
        return gotoFlow(orderProductSearchFlow)
    })