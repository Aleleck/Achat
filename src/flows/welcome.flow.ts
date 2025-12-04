// src/flows/welcome.flow.ts - CORREGIDO
import { addKeyword, EVENTS } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import { JsonFileDB as Database } from '@builderbot/database-json'
import { messages } from '../utils/messages'

export const menuFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer(messages.mainMenu, { capture: true }, async (ctx, { gotoFlow, fallBack, state }) => {
        const option = ctx.body.trim()
        
        await state.update({ currentFlow: 'menu' })

        switch (option) {
            case '1':
                const { priceInquiryFlow } = await import('./price-inquiry.flow.js')
                return gotoFlow(priceInquiryFlow)
            
            case '2':
                // ← AQUÍ ESTABA EL PROBLEMA: Redirigir al smartOrderFlow
                const { smartOrderFlow } = await import('./smart-order.flow.js')
                return gotoFlow(smartOrderFlow)
            
            case '3':
                const { advisorFlow } = await import('./advisor.flow.js')
                return gotoFlow(advisorFlow)
            
            default:
                return fallBack(messages.errors.invalidOption)
        }
    })

export const welcomeFlow = addKeyword<Provider, Database>([
    'hola',
    'hello',
    'hi',
    'buenas',
    'buenos dias',
    'buenas tardes',
    'buenas noches',
    'menu',
    'inicio',
    'start'
])
    .addAnswer(messages.welcome, { delay: 500 })
    .addAction(async (_, { gotoFlow }) => {
        return gotoFlow(menuFlow)
    })