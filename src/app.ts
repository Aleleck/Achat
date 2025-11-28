// src/app.ts
import { createBot, createProvider, createFlow } from '@builderbot/bot'
import { JsonFileDB as Database } from '@builderbot/database-json'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import { config } from './config/index.js'
import { excelService } from './services/excel.service.js'
import { 
    welcomeFlow, 
    menuFlow,
    priceInquiryFlow, 
    orderFlow, 
    advisorFlow 
} from './flows/index.js'

const main = async () => {
    console.log('🤖 Iniciando bot de supermercado...')

    // Cargar productos al inicio
    try {
        await excelService.loadProducts()
    } catch (error) {
        console.error('⚠️ Error cargando productos iniciales:', error)
        console.log('El bot iniciará pero las consultas de productos fallarán')
    }

    // Crear adaptadores
    const adapterFlow = createFlow([
        welcomeFlow,
        menuFlow,
        priceInquiryFlow,
        orderFlow,
        advisorFlow
    ])
    
    const adapterProvider = createProvider(Provider, config.baileys)
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
     * Body: { number: string, message: string, urlMedia?: string }
     */
    adapterProvider.server.post(
        '/v1/messages',
        handleCtx(async (bot, req, res) => {
            try {
                const { number, message, urlMedia } = req.body
                
                if (!number || !message) {
                    res.writeHead(400, { 'Content-Type': 'application/json' })
                    return res.end(JSON.stringify({ 
                        error: 'number and message are required' 
                    }))
                }

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
                console.error('Error sending message:', error)
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
                res.writeHead(200, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ 
                    status: 'success',
                    message: 'Products reloaded'
                }))
            } catch (error) {
                console.error('Error reloading products:', error)
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
     * Body: { number: string, intent: 'add' | 'remove' }
     */
    adapterProvider.server.post(
        '/v1/blacklist',
        handleCtx(async (bot, req, res) => {
            try {
                const { number, intent } = req.body
                
                if (!number || !intent) {
                    res.writeHead(400, { 'Content-Type': 'application/json' })
                    return res.end(JSON.stringify({ 
                        error: 'number and intent are required' 
                    }))
                }

                if (intent === 'remove') {
                    bot.blacklist.remove(number)
                } else if (intent === 'add') {
                    bot.blacklist.add(number)
                } else {
                    res.writeHead(400, { 'Content-Type': 'application/json' })
                    return res.end(JSON.stringify({ 
                        error: 'intent must be add or remove' 
                    }))
                }

                res.writeHead(200, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ 
                    status: 'ok', 
                    number, 
                    intent 
                }))
            } catch (error) {
                console.error('Error managing blacklist:', error)
                res.writeHead(500, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ error: 'Internal error' }))
            }
        })
    )

    /**
     * GET /health
     * Health check endpoint
     */
    adapterProvider.server.get('/health', (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ 
            status: 'ok',
            timestamp: new Date().toISOString()
        }))
    })

    // Iniciar servidor HTTP
    httpServer(+config.port)
    
    console.log(`✅ Bot iniciado correctamente`)
    console.log(`🌐 Servidor HTTP en puerto ${config.port}`)
    console.log(`📱 Escaneá el código QR para conectar WhatsApp`)
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