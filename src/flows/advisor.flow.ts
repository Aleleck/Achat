// src/flows/advisor.flow.ts
import { addKeyword, EVENTS } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import { JsonFileDB as Database } from '@builderbot/database-json'
import { messages } from '../utils/messages.js'

const advisorWaitFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer(messages.advisor.start, { delay: 1000 })
    .addAnswer(messages.advisor.connected, { delay: 3000 })
    .addAnswer(
        '¿En qué podemos ayudarte hoy? Un asesor humano revisará tu mensaje.',
        { capture: true },
        async (ctx, { flowDynamic, state }) => {
            // Aquí podrías implementar lógica para notificar a asesores reales
            // Por ejemplo: guardar en base de datos, enviar webhook, etc.
            
            await state.update({ 
                advisorRequest: {
                    message: ctx.body,
                    timestamp: new Date().toISOString(),
                    phone: ctx.from
                }
            })

            await flowDynamic([
                '✅ Tu solicitud ha sido registrada.',
                'Un asesor se comunicará contigo lo antes posible.',
                '',
                'Mientras tanto, puedes escribir *MENU* para volver al inicio.'
            ])
        }
    )

const advisorOfflineFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer(messages.advisor.offline, { capture: true }, async (ctx, { gotoFlow, fallBack, state }) => {
        const option = ctx.body.trim()

        switch (option) {
            case '1':
                // Dejar mensaje
                await state.update({ currentFlow: 'advisor' })
                return gotoFlow(advisorMessageFlow)
            case '2':
                // Volver al menú
                const { menuFlow } = await import('./welcome.flow.js')
                return gotoFlow(menuFlow)
            default:
                return fallBack(messages.errors.invalidOption)
        }
    })

const advisorMessageFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAnswer(
        '📝 Por favor escribe tu mensaje o consulta.\n\nNos comunicaremos contigo lo antes posible.',
        { capture: true },
        async (ctx, { flowDynamic, gotoFlow, state }) => {
            // Guardar mensaje
            await state.update({ 
                advisorMessage: {
                    message: ctx.body,
                    timestamp: new Date().toISOString(),
                    phone: ctx.from
                }
            })

            await flowDynamic([
                '✅ Tu mensaje ha sido guardado.',
                'Te contactaremos pronto.',
                '',
                '¿Deseas volver al menú? Escribe *MENU*'
            ])

            // Opcional: esperar respuesta del usuario
            const { menuFlow } = await import('./welcome.flow.js')
            return gotoFlow(menuFlow)
        }
    )

export const advisorFlow = addKeyword<Provider, Database>(EVENTS.ACTION)
    .addAction(async (ctx, { gotoFlow, state }) => {
        await state.update({ currentFlow: 'advisor' })
        
        // Lógica para verificar si hay asesores disponibles
        // Por ahora, siempre redirigimos a la espera
        const isBusinessHours = checkBusinessHours()
        
        if (isBusinessHours) {
            return gotoFlow(advisorWaitFlow)
        } else {
            return gotoFlow(advisorOfflineFlow)
        }
    })

// Función auxiliar para verificar horario de atención
function checkBusinessHours(): boolean {
    const now = new Date()
    const day = now.getDay() // 0 = Domingo, 6 = Sábado
    const hour = now.getHours()
    
    // Lunes a Sábado (1-6), de 8 AM a 8 PM
    if (day >= 1 && day <= 6 && hour >= 8 && hour < 20) {
        return true
    }
    
    return false
}