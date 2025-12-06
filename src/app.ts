// src/app.ts - CON LOGS LIMPIOS
import 'dotenv/config'
import { createBot, createProvider, createFlow } from '@builderbot/bot'
import { JsonFileDB as Database } from '@builderbot/database-json'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import { config } from './config/index'
import { excelService } from './services/excel.service'
import { validateData, sendMessageSchema, blacklistSchema } from './utils/validation'
import { 
    welcomeFlow, 
    menuFlow,
    priceInquiryFlow, 
    priceSearchFlow,
    searchOptionsFlow,
    searchByCategoryFlow,
    
    searchByBrandFlow,
    priceNextActionFlow,
    advisorFlow,
    smartOrderFlow,
    orderKeywordFlow
} from './flows/index.js'

// ========================================
// FILTRAR LOGS DE BAILEYS
// ========================================
const originalConsoleLog = console.log
console.log = function(...args: any[]) {
    // Filtrar logs de sesión de Baileys
    const message = args.join(' ')
    if (
        message.includes('Closing session') ||
        message.includes('SessionEntry') ||
        message.includes('chainKey') ||
        message.includes('Buffer')
    ) {
        return // No imprimir estos logs
    }
    originalConsoleLog.apply(console, args)
}

const main = async () => {
    console.log('🤖 Iniciando bot de supermercado...')

    // Cargar productos al inicio (crítico)
    try {
        await excelService.loadProducts()
        const products = await excelService.getProducts()

        if (products.length === 0) {
            console.error('❌ ERROR CRÍTICO: No se encontraron productos en el Excel')
            console.error('📁 Verifica que ./assets/productos.xlsx existe y tiene datos en la hoja "Prod"')
            console.error('🛑 El bot no puede funcionar sin productos. Abortando...')
            process.exit(1)
        }

        console.log(`✅ ${products.length} productos cargados exitosamente`)
    } catch (error) {
        console.error('❌ ERROR CRÍTICO cargando productos:', error)
        console.error('📁 Verifica que ./assets/productos.xlsx existe y es un archivo Excel válido')
        console.error('🛑 El bot no puede funcionar sin productos. Abortando...')
        process.exit(1)
    }

    // Verificar configuración
    const geminiEnabled = !!process.env.GEMINI_API_KEY
    console.log(`🧠 IA (Gemini): ${geminiEnabled ? '✅ Habilitada' : '⚠️ Deshabilitada (usando búsqueda local)'}`)

    // Crear adaptadores
    const adapterFlow = createFlow([
        welcomeFlow,
        menuFlow,
        
        // Precios
        priceInquiryFlow,
        priceSearchFlow,
        searchOptionsFlow,
        searchByCategoryFlow,
        searchByBrandFlow,
        priceNextActionFlow,
        
        // Pedidos (inteligente)
        smartOrderFlow,
        orderKeywordFlow,
        
        // Asesor
        advisorFlow,
    ])
    
    const adapterProvider = createProvider(Provider, {
        ...config.baileys,
        version: config.baileys.version as [number, number, number],
        writeMyself: 'both',
        host: {
            phone: '573053012883'
        }
    })
    
    const adapterDB = new Database(config.database)

    // Crear bot
    const { handleCtx, httpServer } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    // ========================================
    // API ENDPOINTS
    // ========================================

    /**
     * POST /v1/messages
     * Enviar mensaje a un número
     */
    adapterProvider.server.post(
        '/v1/messages',
        handleCtx(async (bot, req, res) => {
            try {
                // Validar datos de entrada
                const validation = validateData(sendMessageSchema, req.body)

                if (!validation.success) {
                    res.writeHead(400, { 'Content-Type': 'application/json' })
                    return res.end(JSON.stringify({
                        error: (validation as { success: false; error: string }).error
                    }))
                }

                const { number, message, urlMedia } = validation.data

                await bot.sendMessage(number, message, {
                    media: urlMedia ?? null
                })

                res.writeHead(200, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({
                    status: 'sent',
                    number,
                    message
                }))
            } catch (error) {
                console.error('❌ Error enviando mensaje:', error)
                res.writeHead(500, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ error: 'Internal error' }))
            }
        })
    )

    /**
     * POST /v1/reload-products
     * Recargar productos desde Excel
     */
    adapterProvider.server.post(
        '/v1/reload-products',
        handleCtx(async (bot, req, res) => {
            try {
                await excelService.loadProducts()
                console.log('🔄 Productos recargados')
                res.writeHead(200, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ 
                    status: 'success',
                    message: 'Products reloaded'
                }))
            } catch (error) {
                console.error('❌ Error recargando productos:', error)
                res.writeHead(500, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ 
                    error: 'Failed to reload products' 
                }))
            }
        })
    )

    /**
     * POST /v1/blacklist
     * Gestionar lista negra
     */
    adapterProvider.server.post(
        '/v1/blacklist',
        handleCtx(async (bot, req, res) => {
            try {
                // Validar datos de entrada
                const validation = validateData(blacklistSchema, req.body)

                if (!validation.success) {
                    res.writeHead(400, { 'Content-Type': 'application/json' })
                    return res.end(JSON.stringify({
                        error: (validation as { success: false; error: string }).error
                    }))
                }

                const { number, intent } = validation.data

                if (intent === 'remove') {
                    bot.blacklist.remove(number)
                } else {
                    bot.blacklist.add(number)
                }

                res.writeHead(200, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({
                    status: 'ok',
                    number,
                    intent
                }))
            } catch (error) {
                console.error('❌ Error en blacklist:', error)
                res.writeHead(500, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ error: 'Internal error' }))
            }
        })
    )

    /**
     * GET /health
     * Health check
     */
    adapterProvider.server.get('/health', async (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ 
            status: 'ok',
            timestamp: new Date().toISOString(),
            features: {
                ai_enabled: geminiEnabled,
                products_loaded: (await excelService.getProducts()).length > 0
            }
        }))
    })

    /**
     * GET /v1/stats
     * Estadísticas
     */
    adapterProvider.server.get('/v1/stats', async (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ 
            products: (await excelService.getProducts()).length,
            categories: excelService.getCategories().length,
            uptime: process.uptime(),
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
            }
        }))
    })

    // Iniciar servidor HTTP
    httpServer(+config.port)
    
    console.log(`✅ Bot iniciado correctamente`)
    console.log(`🌐 API: http://localhost:${config.port}`)
    console.log(`📊 Stats: http://localhost:${config.port}/v1/stats`)
    console.log(`📱 Escaneá el código QR para conectar WhatsApp\n`)
}

// Manejo de errores globales
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error)
})

process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled Rejection:', error)
})

// Iniciar aplicación
main().catch(console.error)