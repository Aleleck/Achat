// src/services/experimental/context.service.ts
import { Product } from '../../types/index'

interface ConversationMessage {
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
    metadata?: {
        products?: Product[]
        intent?: string
        entities?: Record<string, any>
    }
}

interface ConversationContext {
    userId: string
    messages: ConversationMessage[]
    currentIntent?: string
    lastProducts?: Product[]
    preferences?: UserPreferences
    sessionStart: Date
    lastActivity: Date
}

interface UserPreferences {
    favoriteProducts?: string[]
    brands?: string[]
    categories?: string[]
    budgetRange?: { min: number; max: number }
}

class ContextService {
    private contexts: Map<string, ConversationContext> = new Map()
    private readonly MAX_MESSAGES = 20 // Mantener últimos 20 mensajes
    private readonly SESSION_TIMEOUT = 30 * 60 * 1000 // 30 minutos

    /**
     * Obtener o crear contexto de conversación
     */
    getContext(userId: string): ConversationContext {
        let context = this.contexts.get(userId)

        if (!context || this.isSessionExpired(context)) {
            context = this.createNewContext(userId)
            this.contexts.set(userId, context)
        }

        return context
    }

    /**
     * Agregar mensaje del usuario
     */
    addUserMessage(
        userId: string,
        content: string,
        metadata?: ConversationMessage['metadata']
    ): void {
        const context = this.getContext(userId)

        context.messages.push({
            role: 'user',
            content,
            timestamp: new Date(),
            metadata
        })

        context.lastActivity = new Date()
        this.trimMessages(context)
    }

    /**
     * Agregar respuesta del asistente
     */
    addAssistantMessage(
        userId: string,
        content: string,
        metadata?: ConversationMessage['metadata']
    ): void {
        const context = this.getContext(userId)

        context.messages.push({
            role: 'assistant',
            content,
            timestamp: new Date(),
            metadata
        })

        context.lastActivity = new Date()
        this.trimMessages(context)
    }

    /**
     * Actualizar intención actual
     */
    updateIntent(userId: string, intent: string): void {
        const context = this.getContext(userId)
        context.currentIntent = intent
    }

    /**
     * Guardar productos vistos recientemente
     */
    setLastProducts(userId: string, products: Product[]): void {
        const context = this.getContext(userId)
        context.lastProducts = products
    }

    /**
     * Obtener productos vistos recientemente
     */
    getLastProducts(userId: string): Product[] | undefined {
        const context = this.getContext(userId)
        return context.lastProducts
    }

    /**
     * Obtener historial de mensajes
     */
    getMessageHistory(userId: string, limit?: number): ConversationMessage[] {
        const context = this.getContext(userId)
        const messages = context.messages

        if (limit) {
            return messages.slice(-limit)
        }

        return messages
    }

    /**
     * Formatear historial para prompt de LLM
     */
    formatHistoryForLLM(userId: string, limit: number = 10): string {
        const messages = this.getMessageHistory(userId, limit)
        
        return messages
            .map(msg => {
                const role = msg.role === 'user' ? 'Cliente' : 'Asistente'
                return `${role}: ${msg.content}`
            })
            .join('\n')
    }

    /**
     * Analizar patrones de conversación
     */
    analyzeConversationPatterns(userId: string): {
        mentionedProducts: string[]
        mentionedCategories: string[]
        mentionedBrands: string[]
        priceRange?: { min: number; max: number }
    } {
        const context = this.getContext(userId)
        const mentionedProducts: Set<string> = new Set()
        const mentionedCategories: Set<string> = new Set()
        const mentionedBrands: Set<string> = new Set()
        const prices: number[] = []

        for (const msg of context.messages) {
            if (msg.metadata?.products) {
                msg.metadata.products.forEach(p => {
                    mentionedProducts.add(p.descripcion)
                    if (p.categoria) mentionedCategories.add(p.categoria)
                    if (p.marca) mentionedBrands.add(p.marca)
                    prices.push(p.ventas)
                })
            }
        }

        let priceRange: { min: number; max: number } | undefined
        if (prices.length > 0) {
            priceRange = {
                min: Math.min(...prices),
                max: Math.max(...prices)
            }
        }

        return {
            mentionedProducts: Array.from(mentionedProducts),
            mentionedCategories: Array.from(mentionedCategories),
            mentionedBrands: Array.from(mentionedBrands),
            priceRange
        }
    }

    /**
     * Actualizar preferencias del usuario
     */
    updatePreferences(userId: string, preferences: Partial<UserPreferences>): void {
        const context = this.getContext(userId)
        context.preferences = {
            ...context.preferences,
            ...preferences
        }
    }

    /**
     * Obtener resumen del contexto
     */
    getContextSummary(userId: string): string {
        const context = this.getContext(userId)
        const patterns = this.analyzeConversationPatterns(userId)

        let summary = '📊 CONTEXTO DE CONVERSACIÓN:\n'

        if (context.currentIntent) {
            summary += `🎯 Intención actual: ${context.currentIntent}\n`
        }

        if (patterns.mentionedProducts.length > 0) {
            summary += `🛍️ Productos consultados: ${patterns.mentionedProducts.slice(0, 3).join(', ')}\n`
        }

        if (patterns.mentionedCategories.length > 0) {
            summary += `📂 Categorías de interés: ${patterns.mentionedCategories.join(', ')}\n`
        }

        if (patterns.priceRange) {
            summary += `💰 Rango de precios: $${patterns.priceRange.min.toLocaleString()} - $${patterns.priceRange.max.toLocaleString()}\n`
        }

        summary += `💬 Mensajes en sesión: ${context.messages.length}\n`

        return summary
    }

    /**
     * Limpiar sesión
     */
    clearContext(userId: string): void {
        this.contexts.delete(userId)
    }

    /**
     * Verificar si la sesión expiró
     */
    private isSessionExpired(context: ConversationContext): boolean {
        const now = Date.now()
        const lastActivity = context.lastActivity.getTime()
        return now - lastActivity > this.SESSION_TIMEOUT
    }

    /**
     * Crear nuevo contexto
     */
    private createNewContext(userId: string): ConversationContext {
        return {
            userId,
            messages: [],
            sessionStart: new Date(),
            lastActivity: new Date()
        }
    }

    /**
     * Mantener solo los últimos N mensajes
     */
    private trimMessages(context: ConversationContext): void {
        if (context.messages.length > this.MAX_MESSAGES) {
            context.messages = context.messages.slice(-this.MAX_MESSAGES)
        }
    }

    /**
     * Limpiar sesiones inactivas (ejecutar periódicamente)
     */
    cleanupInactiveSessions(): number {
        let cleaned = 0
        const now = Date.now()

        for (const [userId, context] of this.contexts.entries()) {
            if (now - context.lastActivity.getTime() > this.SESSION_TIMEOUT) {
                this.contexts.delete(userId)
                cleaned++
            }
        }

        return cleaned
    }
}

export const contextService = new ContextService()

// Limpiar sesiones inactivas cada 10 minutos
setInterval(() => {
    const cleaned = contextService.cleanupInactiveSessions()
    if (cleaned > 0) {
        console.log(`🧹 Limpiadas ${cleaned} sesiones inactivas`)
    }
}, 10 * 60 * 1000)