// src/utils/messages.ts
import { config } from '../config/index.js'

export const messages = {
    welcome: `🛒 ¡Bienvenido a *${config.business.name}*!

Hablas con Atenea. ¿Qué te gustaría hacer?`,

    mainMenu: `
╔════════════════════╗
║   MENÚ PRINCIPAL   ║
╚════════════════════╝

1️⃣ 💰 Consultar precios
2️⃣ 🛒 Realizar pedido
3️⃣ 👤 Hablar con asesor

📝 Escribe el *número* de la opción
✏️ O escribe *MENU* en cualquier momento para volver aquí`,

    priceInquiry: {
        start: `💰 *CONSULTA DE PRECIOS*

Por favor, escribe el nombre del producto que deseas buscar.

Ejemplo: _arroz_, _aceite_, _leche_

✏️ Escribe *MENU* para volver al menú principal`,
        
        notFound: `❌ No encontré productos con ese nombre.

Intenta con otro término de búsqueda o escribe *MENU* para volver.`,
        
        resultsHeader: `✅ Encontré los siguientes productos:\n\n`,
        
        nextAction: `
¿Qué deseas hacer ahora?

1️⃣ Buscar otro producto
2️⃣ Hacer un pedido
3️⃣ Volver al menú

Escribe el número de tu opción`
    },

    order: {
        start: `🛒 *REALIZAR PEDIDO*

Vamos a crear tu pedido paso a paso.

Escribe el nombre del producto que deseas agregar.

✏️ Escribe *MENU* para cancelar y volver`,
        
        askQuantity: (productName: string) => 
            `¿Cuántas unidades de *${productName}* deseas?\n\n📦 Escribe la cantidad (1-100)`,
        
        invalidQuantity: `❌ Cantidad inválida. Por favor escribe un número entre 1 y 100`,
        
        added: (productName: string, quantity: number) => 
            `✅ Agregado: *${quantity}x ${productName}*`,
        
        continueOrder: `
¿Qué deseas hacer?

1️⃣ Agregar otro producto
2️⃣ Ver mi pedido actual
3️⃣ Finalizar pedido
4️⃣ Cancelar pedido

Escribe el número de tu opción`,

        confirmOrder: (orderSummary: string) => 
            `${orderSummary}

¿Deseas confirmar este pedido?

✅ Escribe *SI* para confirmar
❌ Escribe *NO* para cancelar`,
        
        confirmed: `✅ *¡Pedido confirmado!*

Tu pedido ha sido registrado exitosamente.
En breve nos comunicaremos contigo para coordinar la entrega.

📞 ${config.business.phone}

¿Deseas hacer algo más?

1️⃣ Nuevo pedido
2️⃣ Volver al menú`,
        
        cancelled: `❌ Pedido cancelado

Tu carrito ha sido vaciado. ¿Deseas volver al menú?

✏️ Escribe *MENU*`
    },

    advisor: {
        start: `👤 *SOLICITUD DE ASESOR*

Un momento por favor, estoy conectándote con un asesor humano...

⏱️ Tiempo de espera aproximado: 2-5 minutos

Horario de atención: ${config.business.schedule}

✏️ Escribe *MENU* para volver mientras esperas`,
        
        connected: `✅ *¡Asesor conectado!*

Un miembro de nuestro equipo te atenderá en breve.`,
        
        offline: `⚠️ Lo sentimos, en este momento no hay asesores disponibles.

Horario de atención:
${config.business.schedule}

¿Deseas dejar un mensaje o volver al menú?

1️⃣ Dejar mensaje
2️⃣ Volver al menú`
    },

    errors: {
        generic: `❌ Lo siento, ocurrió un error.

Por favor intenta nuevamente o escribe *MENU* para volver al inicio.`,
        
        invalidOption: `❌ Opción no válida.

Por favor escribe una opción del menú.`,
        
        productsNotLoaded: `❌ Error cargando productos.

Por favor intenta más tarde o contacta con un asesor.`
    },

    goodbye: `👋 ¡Gracias por tu preferencia!

Vuelve pronto a *${config.business.name}*`
}