// src/flows/price-inquiry-enhanced.flow.ts
import { addKeyword, EVENTS } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import { JsonFileDB as Database } from '@builderbot/database-json'
import { messages } from '../utils/messages'
import { excelService } from '../services/excel.service'

// Flow para búsqueda por categoría
export const searchByCategoryFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer('', {}, async (ctx, { flowDynamic }) => {
        const categories = excelService.getCategories()
        
        if (categories.length === 0) {
            await flowDynamic('⚠️ No hay categorías disponibles')
            return
        }

        let message = '📂 *CATEGORÍAS DISPONIBLES*\n\n'
        categories.forEach((cat, i) => {
            message += `${i + 1}. ${cat}\n`
        })
        message += '\n💬 Escribe el *nombre* o *número* de la categoría'

        await flowDynamic(message)
    })
    .addAnswer('', { capture: true }, async (ctx, { flowDynamic, gotoFlow, fallBack }) => {
        const input = ctx.body.trim()
        
        if (input.toLowerCase() === 'menu') {
            const { menuFlow } = await import('./welcome.flow.js')
            return gotoFlow(menuFlow)
        }

        const categories = excelService.getCategories()
        let selectedCategory: string | undefined

        // Verificar si es un número
        const num = parseInt(input)
        if (!isNaN(num) && num > 0 && num <= categories.length) {
            selectedCategory = categories[num - 1]
        } else {
            // Buscar por nombre
            selectedCategory = categories.find(cat => 
                cat.toLowerCase().includes(input.toLowerCase())
            )
        }

        if (!selectedCategory) {
            await flowDynamic('❌ Categoría no encontrada. Intenta de nuevo.')
            return fallBack()
        }

        try {
            const products = await excelService.searchByCategory(selectedCategory)
            
            if (products.length === 0) {
                await flowDynamic(`No hay productos en la categoría *${selectedCategory}*`)
                return fallBack()
            }

            const productList = excelService.formatProductList(products)
            await flowDynamic(`📦 *${selectedCategory}*\n\n${productList}`)
            await flowDynamic(messages.priceInquiry.nextAction)
            return gotoFlow(priceNextActionFlow)

        } catch (error) {
            console.error('Error buscando por categoría:', error)
            await flowDynamic(messages.errors.productsNotLoaded)
            return fallBack()
        }
    })

// Flow de opciones de búsqueda
export const searchOptionsFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer(
        `🔍 *OPCIONES DE BÚSQUEDA*\n\n` +
        `1️⃣ Buscar por nombre\n` +
        `2️⃣ Ver por categorías\n` +
        `3️⃣ Buscar por marca\n` +
        `4️⃣ Volver al menú\n\n` +
        `💬 Escribe el número de tu opción`,
        { capture: true },
        async (ctx, { gotoFlow, fallBack }) => {
            const option = ctx.body.trim()

            switch (option) {
                case '1':
                    return gotoFlow(priceSearchFlow)
                case '2':
                    return gotoFlow(searchByCategoryFlow)
                case '3':
                    return gotoFlow(searchByBrandFlow)
                case '4':
                    const { menuFlow } = await import('./welcome.flow.js')
                    return gotoFlow(menuFlow)
                default:
                    return fallBack(messages.errors.invalidOption)
            }
        }
    )

// Flow para búsqueda por marca
export const searchByBrandFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer(
        '🏷️ *BÚSQUEDA POR MARCA*\n\n' +
        'Escribe el nombre de la marca que deseas buscar\n' +
        'Ejemplo: _Alpina_, _Diana_, _Nestlé_',
        { capture: true },
        async (ctx, { flowDynamic, gotoFlow, fallBack }) => {
            const brand = ctx.body.trim()

            if (brand.toLowerCase() === 'menu') {
                const { menuFlow } = await import('./welcome.flow.js')
                return gotoFlow(menuFlow)
            }

            try {
                const products = await excelService.searchByBrand(brand)

                if (products.length === 0) {
                    await flowDynamic(`❌ No encontré productos de la marca *${brand}*`)
                    return fallBack()
                }

                const productList = excelService.formatProductList(products)
                await flowDynamic(`🏷️ *Productos de ${brand}*\n\n${productList}`)
                await flowDynamic(messages.priceInquiry.nextAction)
                return gotoFlow(priceNextActionFlow)

            } catch (error) {
                console.error('Error buscando por marca:', error)
                await flowDynamic(messages.errors.productsNotLoaded)
                return fallBack()
            }
        }
    )

// Flow de siguiente acción
export const priceNextActionFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer('', { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        const option = ctx.body.trim()

        switch (option) {
            case '1':
                return gotoFlow(searchOptionsFlow)
            case '2':
                const { orderFlow } = await import('./order.flow.js')
                return gotoFlow(orderFlow)
            case '3':
                const { menuFlow } = await import('./welcome.flow.js')
                return gotoFlow(menuFlow)
            default:
                return fallBack(messages.errors.invalidOption)
        }
    })

// Flow de búsqueda principal mejorado
export const priceSearchFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer(
        '🔍 *BÚSQUEDA INTELIGENTE*\n\n' +
        'Escribe lo que buscas y yo encontraré los mejores resultados\n\n' +
        '💡 *Ejemplos:*\n' +
        '• _"leche alpina"_ → productos específicos\n' +
        '• _"arros"_ → tolera errores de escritura\n' +
        '• _"aceite girasol"_ → combina palabras\n\n' +
        '✏️ Escribe *MENU* para volver',
        { capture: true },
        async (ctx, { flowDynamic, gotoFlow, state, fallBack }) => {
            const query = ctx.body.toLowerCase().trim()

            if (query === 'menu') {
                const { menuFlow } = await import('./welcome.flow.js')
                return gotoFlow(menuFlow)
            }

            // Mostrar mensaje de búsqueda
            await flowDynamic('🔍 Buscando...')

            try {
                // Primero intentar obtener sugerencias si la query es muy corta
                if (query.length < 4) {
                    const suggestions = await excelService.getSuggestions(query)
                    if (suggestions.length > 0) {
                        await flowDynamic(
                            `💡 *¿Quisiste buscar?*\n\n` +
                            suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n') +
                            `\n\nEscribe tu búsqueda de nuevo con más detalle`
                        )
                        return fallBack()
                    }
                }

                // Búsqueda inteligente
                const products = await excelService.searchProducts(query, {
                    maxResults: 15,
                    includeScore: true
                })

                if (products.length === 0) {
                    await flowDynamic(messages.priceInquiry.notFound)
                    await flowDynamic('💡 *Sugerencias:*\n' +
                        '• Intenta con menos palabras\n' +
                        '• Verifica la ortografía\n' +
                        '• Busca por categorías (opción 2)')
                    return fallBack()
                }

                // Guardar resultados
                await state.update({ lastSearchResults: products })

                // Mostrar resultados con relevancia
                const productList = excelService.formatProductList(products, true)
                
                let message = '✅ *RESULTADOS DE BÚSQUEDA*\n\n'
                message += productList
                message += '\n\n🎯 = Coincidencia exacta\n'
                message += '✅ = Muy relevante\n'
                message += '🔍 = Relacionado'

                await flowDynamic(message)

                // Si hay muchos resultados, avisar
                if (products.length >= 15) {
                    await flowDynamic('ℹ️ Se muestran los 15 resultados más relevantes. Refina tu búsqueda para más precisión.')
                }

                await flowDynamic(messages.priceInquiry.nextAction)
                return gotoFlow(priceNextActionFlow)

            } catch (error) {
                console.error('Error en búsqueda:', error)
                await flowDynamic(messages.errors.productsNotLoaded)
                const { menuFlow } = await import('./welcome.flow.js')
                return gotoFlow(menuFlow)
            }
        }
    )

// Flow principal de consulta de precios
export const priceInquiryFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAction(async (_, { gotoFlow, state }) => {
        await state.update({ currentFlow: 'prices' })
        return gotoFlow(searchOptionsFlow)
    })