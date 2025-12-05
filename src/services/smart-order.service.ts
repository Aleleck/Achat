// src/services/smart-order.service.ts
import { Order, OrderItem, Product } from '../types/index'
import { excelService } from './excel.service'
import { intentClassifier } from './intent-classifier.service'
import { contextService } from './context.service'
import { ragService } from './rag.service'

interface ProcessedOrderIntent {
    success: boolean
    action: 'add' | 'search' | 'clarify' | 'error'
    message: string
    products?: Product[]
    quantity?: number
    needsConfirmation?: boolean
}

class SmartOrderService {
    private orders: Map<string, Order> = new Map()

    /**
     * Procesar mensaje de orden con IA
     */
    async processOrderMessage(
        message: string,
        userId: string
    ): Promise<ProcessedOrderIntent> {
        try {
            // 1. Clasificar intención
            const intent = await intentClassifier.classifyIntent(message)
            
            // 2. Guardar en contexto
            contextService.addUserMessage(userId, message, { 
                intent: intent.intent,
                entities: intent.entities 
            })

            // 3. Procesar según intención
            switch (intent.intent) {
                case 'add_to_cart':
                    return await this.handleAddToCart(intent, userId, message)
                
                case 'search_product':
                    return await this.handleProductSearch(intent, userId, message)
                
                case 'modify_order':
                    return await this.handleOrderModification(intent, userId)
                
                case 'finalize_order':
                    return await this.handleOrderFinalization(userId)
                
                default:
                    return await this.handleProductSearch(intent, userId, message)
            }

        } catch (error) {
            console.error('Error procesando mensaje de orden:', error)
            return {
                success: false,
                action: 'error',
                message: 'Hubo un error procesando tu solicitud. ¿Podrías intentar de nuevo?'
            }
        }
    }

    /**
     * Manejar agregar al carrito
     */
    private async handleAddToCart(
        intent: any,
        userId: string,
        originalMessage: string
    ): Promise<ProcessedOrderIntent> {
        const allProducts = await excelService.getProducts()

        // 1. Buscar producto
        let candidateProducts: Product[] = []

        if (intent.entities.product) {
            const searchResults = await excelService.searchProducts(
                intent.entities.product,
                { maxResults: 10 }
            )
            candidateProducts = searchResults
        }

        // Si no hay productos, buscar con RAG
        if (candidateProducts.length === 0) {
            const ragResults = await ragService.intelligentSearch(
                originalMessage,
                userId,
                allProducts
            )

            if (ragResults.products.length === 0) {
                return {
                    success: false,
                    action: 'search',
                    message: '❌ No encontré productos que coincidan con tu búsqueda.\n\n💡 Intenta con otras palabras o busca por categorías.'
                }
            }

            candidateProducts = ragResults.products
        }

        // 2. Resolver ambigüedad si hay múltiples productos
        if (candidateProducts.length > 1) {
            // Guardar productos para que el usuario elija
            contextService.setLastProducts(userId, candidateProducts)

            let clarificationMsg = '🤔 Encontré varias opciones:\n\n'
            candidateProducts.slice(0, 5).forEach((p, i) => {
                clarificationMsg += `${i + 1}. ${p.descripcion}\n`
                clarificationMsg += `   💰 ${excelService.formatPrice(p.ventas)}\n\n`
            })
            clarificationMsg += '💡 ¿Cuál prefieres? (Escribe el número)'

            return {
                success: false,
                action: 'clarify',
                message: clarificationMsg,
                products: candidateProducts.slice(0, 5),
                needsConfirmation: true
            }
        }

        const selectedProduct = candidateProducts[0]

        // 3. Determinar cantidad
        let quantity = 1

        if (intent.entities.quantity && intent.entities.unit) {
            // Si el usuario especificó cantidad y unidad, usar classifier para convertir
            quantity = intentClassifier.convertToProductQuantity(
                intent.entities.quantity,
                intent.entities.unit,
                selectedProduct.unidad || 'unidades',
                1 // Asumimos tamaño 1 si no está especificado
            )
        } else if (intent.entities.quantity) {
            quantity = intent.entities.quantity
        } else {
            // Por defecto 1 unidad
            quantity = 1
        }

        // 4. Agregar al carrito
        const orderItem: OrderItem = {
            product: selectedProduct,
            quantity
        }

        this.addItem(userId, orderItem)

        // 5. Construir mensaje de confirmación
        const subtotal = selectedProduct.ventas * quantity
        let confirmationMessage = `✅ *Agregado al carrito*\n\n`
        confirmationMessage += `📦 ${selectedProduct.descripcion}\n`
        confirmationMessage += `🔢 Cantidad: ${quantity} ${selectedProduct.unidad || 'unidad(es)'}\n`
        confirmationMessage += `💰 Precio unit: ${excelService.formatPrice(selectedProduct.ventas)}\n`
        confirmationMessage += `💵 Subtotal: ${excelService.formatPrice(subtotal)}\n\n`
        
        const order = this.getOrder(userId)
        if (order) {
            confirmationMessage += `🛒 Total del carrito: ${excelService.formatPrice(order.total)}`
        }

        // Guardar en contexto
        contextService.addAssistantMessage(userId, confirmationMessage, {
            products: [selectedProduct]
        })

        return {
            success: true,
            action: 'add',
            message: confirmationMessage,
            products: [selectedProduct],
            quantity
        }
    }

    /**
     * Manejar búsqueda de productos
     */
    private async handleProductSearch(
        intent: any,
        userId: string,
        originalMessage: string
    ): Promise<ProcessedOrderIntent> {
        const allProducts = await excelService.getProducts()

        // Usar RAG para búsqueda inteligente
        const ragResults = await ragService.intelligentSearch(
            originalMessage,
            userId,
            allProducts
        )

        if (ragResults.products.length === 0) {
            return {
                success: false,
                action: 'search',
                message: '❌ No encontré productos que coincidan.\n\n💡 Intenta con otras palabras o explícame mejor qué necesitas.'
            }
        }

        // Formatear resultados
        let message = `${ragResults.answer}\n\n`
        
        ragResults.products.forEach((product, i) => {
            message += `${i + 1}. *${product.descripcion}*\n`
            message += `   💰 ${excelService.formatPrice(product.ventas)}`
            if (product.unidad) {
                message += ` x ${product.unidad}`
            }
            if (product.marca) {
                message += ` - ${product.marca}`
            }
            message += '\n\n'
        })

        message += `💬 *¿Quieres agregar alguno?*\nDime algo como: _"Agrega el 2"_ o _"Quiero 3 del primero"_`

        // Guardar productos en contexto
        contextService.setLastProducts(userId, ragResults.products)
        contextService.addAssistantMessage(userId, message, {
            products: ragResults.products
        })

        return {
            success: true,
            action: 'search',
            message,
            products: ragResults.products
        }
    }

    /**
     * Manejar modificación de orden
     */
    private async handleOrderModification(
        intent: any,
        userId: string
    ): Promise<ProcessedOrderIntent> {
        const order = this.getOrder(userId)

        if (!order || order.items.length === 0) {
            return {
                success: false,
                action: 'error',
                message: '🛒 Tu carrito está vacío. No hay nada que modificar.'
            }
        }

        // Aquí podrías implementar lógica más compleja de modificación
        return {
            success: true,
            action: 'search',
            message: `Tu carrito actual:\n\n${this.formatOrder(order)}\n\n¿Qué deseas modificar?`,
            products: order.items.map(i => i.product)
        }
    }

    /**
     * Manejar finalización de orden
     */
    private async handleOrderFinalization(userId: string): Promise<ProcessedOrderIntent> {
        const order = this.getOrder(userId)

        if (!order || order.items.length === 0) {
            return {
                success: false,
                action: 'error',
                message: '🛒 Tu carrito está vacío. Agrega productos antes de finalizar.'
            }
        }

        return {
            success: true,
            action: 'search',
            message: `📋 *Resumen de tu pedido:*\n\n${this.formatOrder(order)}\n\n¿Confirmas el pedido? (Sí/No)`,
            products: order.items.map(i => i.product),
            needsConfirmation: true
        }
    }

    // ============================================
    // Métodos auxiliares de gestión de órdenes
    // ============================================

    createOrder(customerPhone: string): Order {
        const order: Order = {
            items: [],
            total: 0,
            customerPhone,
            status: 'pending'
        }
        this.orders.set(customerPhone, order)
        return order
    }

    getOrder(customerPhone: string): Order | undefined {
        return this.orders.get(customerPhone)
    }

    addItem(customerPhone: string, item: OrderItem): Order {
        let order = this.getOrder(customerPhone)
        if (!order) {
            order = this.createOrder(customerPhone)
        }

        const existingItem = order.items.find(
            i => i.product.descripcion === item.product.descripcion
        )

        if (existingItem) {
            existingItem.quantity += item.quantity
        } else {
            order.items.push(item)
        }

        this.updateTotal(order)
        return order
    }

    removeItem(customerPhone: string, productName: string): Order | undefined {
        const order = this.getOrder(customerPhone)
        if (!order) return undefined

        order.items = order.items.filter(
            i => i.product.descripcion !== productName
        )
        this.updateTotal(order)
        return order
    }

    clearOrder(customerPhone: string): void {
        this.orders.delete(customerPhone)
        contextService.clearContext(customerPhone)
    }

    private updateTotal(order: Order): void {
        order.total = order.items.reduce(
            (sum, item) => sum + (item.product.ventas * item.quantity),
            0
        )
    }

    formatOrder(order: Order): string {
        if (order.items.length === 0) {
            return '🛒 Tu carrito está vacío'
        }

        let message = ''
        
        order.items.forEach((item, i) => {
            const subtotal = item.product.ventas * item.quantity
            message += `${i + 1}. *${item.product.descripcion}*\n`
            message += `   📦 Cantidad: ${item.quantity}\n`
            message += `   💰 ${excelService.formatPrice(item.product.ventas)} c/u\n`
            message += `   💵 Subtotal: ${excelService.formatPrice(subtotal)}\n\n`
        })

        message += `━━━━━━━━━━━━━━━━\n`
        message += `*🛒 TOTAL: ${excelService.formatPrice(order.total)}*`

        return message
    }

    validateQuantity(quantity: string): number | null {
        const num = parseInt(quantity, 10)
        if (isNaN(num) || num < 1 || num > 100) {
            return null
        }
        return num
    }
}

export const smartOrderService = new SmartOrderService()