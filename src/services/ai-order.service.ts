// src/services/ai-order.service.ts - SERVICIO DE PEDIDOS CON IA REAL
import { Product } from '../types/index'
import { smartSearchService } from './smart-search.service'
import { intentClassifier } from './intent-classifier.service'

interface AIOrderMatch {
    product: Product
    quantity: number
    confidence: number
    autoSelected: boolean // Si fue selección automática
}

interface AIOrderResult {
    matches: AIOrderMatch[]
    needsClarification: boolean
    clarificationMessage?: string
    options?: Product[]
}

class AIOrderService {
    private readonly GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
    private readonly API_KEY = process.env.GEMINI_API_KEY || ''
    private readonly TIMEOUT = 8000

    /**
     * Procesar pedido con IA - TOMA DECISIONES AUTOMÁTICAS
     */
    async processOrder(userMessage: string, allProducts: Product[]): Promise<AIOrderResult> {
        try {
            // 1. Dividir en múltiples solicitudes si hay "y"
            const requests = this.splitRequests(userMessage)

            const allMatches: AIOrderMatch[] = []
            const needsClarification: Product[] = []

            // 2. Procesar cada solicitud
            for (const request of requests) {
                const result = await this.processSingleRequest(request, allProducts)

                if (result.match) {
                    allMatches.push(result.match)
                } else if (result.needsChoice && result.options) {
                    // Solo clarificar si las opciones son MUY diferentes
                    if (this.needsUserChoice(result.options)) {
                        needsClarification.push(...result.options.slice(0, 4))
                    } else {
                        // Auto-seleccionar el más barato
                        const cheapest = result.options.sort((a, b) => a.ventas - b.ventas)[0]
                        const quantity = this.extractQuantity(request) || 1
                        allMatches.push({
                            product: cheapest,
                            quantity,
                            confidence: 0.85,
                            autoSelected: true
                        })
                    }
                }
            }

            // 3. Decidir si necesita clarificación
            if (allMatches.length === 0 && needsClarification.length > 0) {
                return {
                    matches: [],
                    needsClarification: true,
                    clarificationMessage: this.buildSimpleClarification(needsClarification),
                    options: needsClarification
                }
            }

            return {
                matches: allMatches,
                needsClarification: false
            }

        } catch (error) {
            console.error('Error en AI Order Service:', error)
            // Fallback a búsqueda simple
            return this.fallbackSearch(userMessage, allProducts)
        }
    }

    /**
     * Procesar una sola solicitud con IA
     */
    private async processSingleRequest(
        request: string,
        allProducts: Product[]
    ): Promise<{ match?: AIOrderMatch; needsChoice?: boolean; options?: Product[] }> {

        // Extraer información básica
        const quantity = this.extractQuantity(request) || 1
        const keywords = this.extractKeywords(request)

        // Buscar productos candidatos
        const searchResults = await smartSearchService.search(request, allProducts, {
            maxResults: 10,
            minScore: 0.5
        })

        if (searchResults.length === 0) {
            return {}
        }

        const candidates = searchResults.map(r => r.product)

        // Si hay 1 solo, match perfecto
        if (candidates.length === 1) {
            return {
                match: {
                    product: candidates[0],
                    quantity,
                    confidence: 0.95,
                    autoSelected: false
                }
            }
        }

        // Si hay 2-5, usar IA para elegir o auto-seleccionar
        if (candidates.length <= 5) {
            // Si el API key está disponible, usar IA
            if (this.API_KEY) {
                try {
                    const aiChoice = await this.getAIRecommendation(request, candidates)
                    if (aiChoice) {
                        return {
                            match: {
                                product: aiChoice,
                                quantity,
                                confidence: 0.90,
                                autoSelected: true
                            }
                        }
                    }
                } catch (error) {
                    // Continuar con lógica de fallback
                }
            }

            // Fallback: elegir el más barato
            return {
                needsChoice: true,
                options: candidates
            }
        }

        // Si hay muchos (>5), necesita clarificación
        return {
            needsChoice: true,
            options: candidates.slice(0, 5)
        }
    }

    /**
     * Usar Gemini para elegir el mejor producto
     */
    private async getAIRecommendation(
        userRequest: string,
        candidates: Product[]
    ): Promise<Product | null> {
        try {
            const productsInfo = candidates.map((p, i) => ({
                id: i,
                name: p.descripcion,
                price: p.ventas,
                brand: p.marca || 'sin marca'
            }))

            const prompt = `El cliente pidió: "${userRequest}"

Productos disponibles:
${JSON.stringify(productsInfo, null, 2)}

Tarea: Elige EL MEJOR producto para el cliente. Considera:
- Relevancia al pedido
- Mejor precio/calidad
- Marca conocida vs genérica

Responde SOLO con JSON (sin markdown):
{
  "selectedId": 0,
  "reason": "explicación breve"
}`

            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT)

            const response = await fetch(`${this.GEMINI_API}?key=${this.API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 200
                    }
                }),
                signal: controller.signal
            })

            clearTimeout(timeoutId)

            if (!response.ok) throw new Error('API error')

            const data = await response.json()
            const text = data.candidates[0]?.content?.parts[0]?.text || ''

            const cleaned = text.replace(/```json|```/g, '').trim()
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
            if (!jsonMatch) throw new Error('No JSON found')

            const result = JSON.parse(jsonMatch[0])
            const selectedId = result.selectedId

            if (typeof selectedId === 'number' && selectedId >= 0 && selectedId < candidates.length) {
                return candidates[selectedId]
            }

            return null

        } catch (error) {
            console.log('IA no disponible, usando selección automática')
            return null
        }
    }

    /**
     * Determinar si necesita que el usuario elija
     */
    private needsUserChoice(products: Product[]): boolean {
        if (products.length <= 2) return false

        // Si los precios son muy diferentes (>30%), preguntar
        const prices = products.map(p => p.ventas).sort((a, b) => a - b)
        const minPrice = prices[0]
        const maxPrice = prices[prices.length - 1]
        const difference = (maxPrice - minPrice) / minPrice

        // Si hay diferencia >50% en precio, preguntar
        if (difference > 0.5) {
            return true
        }

        // Si hay marcas conocidas vs sin marca, preguntar
        const withBrand = products.filter(p => p.marca && p.marca.length > 0)
        const withoutBrand = products.filter(p => !p.marca || p.marca.length === 0)

        if (withBrand.length > 0 && withoutBrand.length > 0) {
            return true
        }

        return false
    }

    /**
     * Dividir solicitudes múltiples
     */
    private splitRequests(message: string): string[] {
        // Normalizar
        const normalized = message.toLowerCase()

        // Dividir por "y" pero no por "y medio", "pan y queso" (productos compuestos)
        const parts = normalized.split(/\s+y\s+(?=\d|\w{4,})/)

        return parts
            .map(p => p.trim())
            .filter(p => p.length > 2)
    }

    /**
     * Extraer cantidad del texto
     */
    private extractQuantity(text: string): number | null {
        const intent = intentClassifier.extractAllEntities(text)
        return intent.quantity || null
    }

    /**
     * Extraer keywords
     */
    private extractKeywords(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/\d+(?:\.\d+)?\s*(kg|g|l|ml|libras?|unidades?)/gi, '')
            .split(/\s+/)
            .filter(w => w.length > 3)
    }

    /**
     * Mensaje de clarificación simple
     */
    private buildSimpleClarification(products: Product[]): string {
        let msg = '¿Cuál prefieres?\n\n'

        products.forEach((p, i) => {
            msg += `${i + 1}. ${p.descripcion}\n`
            msg += `   $${p.ventas.toLocaleString()}`
            if (p.marca) msg += ` - ${p.marca}`
            msg += '\n\n'
        })

        return msg.trim()
    }

    /**
     * Fallback si falla la IA
     */
    private async fallbackSearch(query: string, allProducts: Product[]): Promise<AIOrderResult> {
        const results = await smartSearchService.search(query, allProducts, {
            maxResults: 5
        })

        if (results.length === 0) {
            return {
                matches: [],
                needsClarification: false
            }
        }

        if (results.length === 1) {
            const quantity = this.extractQuantity(query) || 1
            return {
                matches: [{
                    product: results[0].product,
                    quantity,
                    confidence: results[0].score,
                    autoSelected: false
                }],
                needsClarification: false
            }
        }

        // Múltiples resultados - auto-seleccionar el más barato
        const cheapest = results
            .map(r => r.product)
            .sort((a, b) => a.ventas - b.ventas)[0]

        const quantity = this.extractQuantity(query) || 1

        return {
            matches: [{
                product: cheapest,
                quantity,
                confidence: 0.75,
                autoSelected: true
            }],
            needsClarification: false
        }
    }
}

export const aiOrderService = new AIOrderService()
