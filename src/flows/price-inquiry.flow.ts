// src/flows/price-inquiry.flow.ts
import { addKeyword, EVENTS } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import { JsonFileDB as Database } from '@builderbot/database-json'
import { messages } from '../utils/messages.js'
import { excelService } from '../services/excel.service.js'

// Declarar primero priceNextActionFlow
const priceNextActionFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer('', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        const option = ctx.body.trim()

        switch (option) {
            case '1':
                // Buscar otro producto
                return gotoFlow(priceSearchFlow)
            case '2':
                // Ir a realizar pedido
                const { orderFlow } = await import('./order.flow.js')
                return gotoFlow(orderFlow)
            case '3':
                // Volver al menú
                const { menuFlow } = await import('./welcome.flow.js')
                return gotoFlow(menuFlow)
            default:
                return fallBack(messages.errors.invalidOption)
        }
    })

// Ahora declarar priceSearchFlow que usa priceNextActionFlow
const priceSearchFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer(messages.priceInquiry.start, { capture: true }, async (ctx, { flowDynamic, gotoFlow, state, fallBack }) => {
        const query = ctx.body.toLowerCase().trim()

        // Permitir volver al menú
        if (query === 'menu') {
            const { menuFlow } = await import('./welcome.flow.js')
            return gotoFlow(menuFlow)
        }

        try {
            // Buscar productos
            const products = await excelService.searchProducts(query)

            if (products.length === 0) {
                await flowDynamic(messages.priceInquiry.notFound)
                return fallBack()
            }

            // Guardar resultados en el estado
            await state.update({ lastSearchResults: products })

            // Mostrar resultados
            const productList = excelService.formatProductList(products)
            await flowDynamic(messages.priceInquiry.resultsHeader + productList)
            await flowDynamic(messages.priceInquiry.nextAction)

        } catch (error) {
            console.error('Error en búsqueda:', error)
            await flowDynamic(messages.errors.productsNotLoaded)
            const { menuFlow } = await import('./welcome.flow.js')
            return gotoFlow(menuFlow)
        }
    }, [priceNextActionFlow])

export const priceInquiryFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAction(async (_, { gotoFlow, state }) => {
        await state.update({ currentFlow: 'prices' })
        return gotoFlow(priceSearchFlow)
    })