// src/services/rag.service.ts
import { Product } from '../types/index'
import { smartSearchService } from './smart-search.service'
import { contextService } from './context.service'
import { rateLimiter } from './rate-limiter.service'

interface RAGResponse {
    answer: string
    products: Product[]
    confidence: number
    reasoning?: string
}

class RAGService {
    // Gemini API es GRATIS con límites generosos
    private readonly GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
    private readonly API_KEY = process.env.GEMINI_API_KEY || ''
    private readonly USE_RATE_LIMITER = true

    /**
     * Búsqueda inteligente con RAG - combina búsqueda vectorial + LLM
     */
    async intelligentSearch(
        query: string,
        userId: string,
        allProducts: Product[]
    ): Promise<RAGResponse> {
        try {
            // 1. Obtener contexto de conversación
            const context = contextService.getContext(userId)
            const history = contextService.formatHistoryForLLM(userId, 5)
            const patterns = contextService.analyzeConversationPatterns(userId)

            // 2. Búsqueda inicial con el servicio existente
            const searchResults = await smartSearchService.search(query, allProducts, {
                maxResults: 20,
                includeCategories: true
            })

            // 3. Si no hay resultados, intentar expandir búsqueda
            if (searchResults.length === 0) {
                return {
                    answer: 'No encontré productos que coincidan con tu búsqueda. ¿Podrías ser más específico o intentar con otras palabras?',
                    products: [],
                    confidence: 0
                }
            }

            // 4. Usar Gemini para entender mejor la intención y recomendar
            const recommendations = await this.getGeminiRecommendations(
                query,
                searchResults.map(r => r.product),
                history,
                patterns
            )

            return {
                answer: recommendations.explanation,
                products: recommendations.products,
                confidence: recommendations.confidence,
                reasoning: recommendations.reasoning
            }

        } catch (error) {
            console.error('Error en RAG search:', error)
            
            // Fallback a búsqueda tradicional
            const results = await smartSearchService.search(query, allProducts, {
                maxResults: 10
            })

            return {
                answer: 'Encontré estos productos que podrían interesarte:',
                products: results.map(r => r.product),
                confidence: 0.7
            }
        }
    }

    /**
     * Obtener recomendaciones usando Gemini
     */
    private async getGeminiRecommendations(
        query: string,
        products: Product[],
        conversationHistory: string,
        patterns: ReturnType<typeof contextService.analyzeConversationPatterns>
    ): Promise<{
        explanation: string
        products: Product[]
        confidence: number
        reasoning: string
    }> {
        // Preparar información de productos para Gemini
        const productsInfo = products.slice(0, 15).map((p, i) => ({
            id: i,
            name: p.descripcion,
            price: p.ventas,
            category: p.categoria,
            brand: p.marca,
            unit: p.unidad
        }))

        const prompt = this.buildRAGPrompt(query, productsInfo, conversationHistory, patterns)

        try {
            // Verificar rate limit antes de hacer el request
            if (this.USE_RATE_LIMITER) {
                await rateLimiter.waitIfNeeded()
            }

            const response = await fetch(`${this.GEMINI_API}?key=${this.API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 1024
                    }
                })
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(`Gemini API error: ${error.error?.message || response.status}`)
            }

            const data = await response.json()
            const geminiResponse = data.candidates[0]?.content?.parts[0]?.text || ''

            // Parsear respuesta de Gemini
            return this.parseGeminiResponse(geminiResponse, products)

        } catch (error) {
            console.error('Error llamando a Gemini:', error)
            
            // Fallback: retornar los primeros 5 productos
            return {
                explanation: 'Basándome en tu búsqueda, estos son los productos más relevantes:',
                products: products.slice(0, 5),
                confidence: 0.6,
                reasoning: 'Fallback a búsqueda estándar'
            }
        }
    }

    /**
     * Construir prompt para Gemini
     */
    private buildRAGPrompt(
        query: string,
        products: any[],
        history: string,
        patterns: any
    ): string {
        return `Eres un asistente de supermercado experto. Tu tarea es ayudar al cliente a encontrar los mejores productos según su consulta.

CONSULTA DEL CLIENTE: "${query}"

HISTORIAL DE CONVERSACIÓN:
${history || 'Sin historial previo'}

PATRONES DETECTADOS:
- Productos consultados: ${patterns.mentionedProducts.join(', ') || 'Ninguno'}
- Categorías de interés: ${patterns.mentionedCategories.join(', ') || 'Ninguna'}
- Marcas mencionadas: ${patterns.mentionedBrands.join(', ') || 'Ninguna'}
- Rango de precio: ${patterns.priceRange ? `$${patterns.priceRange.min} - $${patterns.priceRange.max}` : 'No definido'}

PRODUCTOS DISPONIBLES:
${JSON.stringify(products, null, 2)}

INSTRUCCIONES:
1. Analiza la consulta del cliente considerando el contexto e historial
2. Selecciona los 3-5 productos MÁS RELEVANTES según la necesidad del cliente
3. Considera precio, marca, categoría y preferencias previas
4. Si el cliente menciona cantidad o medida (ej: "2kg", "1L"), considera el tamaño del producto

FORMATO DE RESPUESTA (JSON):
{
  "explanation": "Explicación breve y amigable de por qué recomiendas estos productos (máximo 2 líneas)",
  "recommendedIds": [0, 3, 7],
  "reasoning": "Razonamiento técnico de la selección",
  "confidence": 0.85
}

RESPONDE SOLO CON EL JSON, SIN TEXTO ADICIONAL NI MARKDOWN.`
    }

    /**
     * Parsear respuesta de Gemini
     */
    private parseGeminiResponse(
        response: string,
        allProducts: Product[]
    ): {
        explanation: string
        products: Product[]
        confidence: number
        reasoning: string
    } {
        try {
            // Limpiar respuesta de posibles markdown o texto extra
            let cleaned = response.trim()
            
            // Remover bloques de código markdown si existen
            cleaned = cleaned.replace(/```json\n?/g, '')
            cleaned = cleaned.replace(/```\n?/g, '')
            cleaned = cleaned.trim()

            // Intentar extraer JSON si hay texto adicional
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
                cleaned = jsonMatch[0]
            }

            const parsed = JSON.parse(cleaned)

            // Obtener productos recomendados
            const recommendedProducts = (parsed.recommendedIds || [])
                .map((id: number) => allProducts[id])
                .filter(Boolean)

            return {
                explanation: parsed.explanation || 'Aquí están los productos que encontré:',
                products: recommendedProducts.length > 0 ? recommendedProducts : allProducts.slice(0, 5),
                confidence: parsed.confidence || 0.7,
                reasoning: parsed.reasoning || 'Recomendación basada en relevancia'
            }

        } catch (error) {
            console.error('Error parseando respuesta de Gemini:', error)
            console.log('Respuesta original:', response)
            
            return {
                explanation: 'Estos son los productos más relevantes para tu búsqueda:',
                products: allProducts.slice(0, 5),
                confidence: 0.6,
                reasoning: 'Error en parseo, usando fallback'
            }
        }
    }

    /**
     * Resolver ambigüedades en la orden
     */
    async resolveOrderAmbiguity(
        userMessage: string,
        candidateProducts: Product[],
        userId: string
    ): Promise<{
        clarificationNeeded: boolean
        message?: string
        suggestedProduct?: Product
    }> {
        // Si solo hay 1 producto, no hay ambigüedad
        if (candidateProducts.length === 1) {
            return {
                clarificationNeeded: false,
                suggestedProduct: candidateProducts[0]
            }
        }

        // Si hay muchos productos similares, usar Gemini para decidir
        if (candidateProducts.length > 5) {
            const history = contextService.formatHistoryForLLM(userId, 3)
            
            const prompt = `El cliente escribió: "${userMessage}"

Hay ${candidateProducts.length} productos que podrían coincidir:
${candidateProducts.slice(0, 10).map((p, i) => `${i + 1}. ${p.descripcion} - ${p.ventas} - ${p.unidad || ''}`).join('\n')}

${history ? `Contexto previo:\n${history}` : ''}

¿Cuál es el producto más probable que el cliente quiere? O ¿necesitamos hacer una pregunta de clarificación?

Responde SOLO con este JSON:
{
  "needsClarification": true/false,
  "productIndex": 0-9 (si no necesita clarificación),
  "clarificationMessage": "Pregunta para el cliente (si la necesita)"
}`

            try {
                // Verificar rate limit
                if (this.USE_RATE_LIMITER) {
                    await rateLimiter.waitIfNeeded()
                }

                const response = await fetch(`${this.GEMINI_API}?key=${this.API_KEY}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: prompt }]
                        }],
                        generationConfig: {
                            temperature: 0.5,
                            maxOutputTokens: 500
                        }
                    })
                })

                const data = await response.json()
                const geminiText = data.candidates[0]?.content?.parts[0]?.text || ''
                
                // Limpiar y parsear
                let cleaned = geminiText.replace(/```json|```/g, '').trim()
                const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
                if (jsonMatch) cleaned = jsonMatch[0]
                
                const result = JSON.parse(cleaned)

                if (result.needsClarification) {
                    return {
                        clarificationNeeded: true,
                        message: result.clarificationMessage
                    }
                } else {
                    return {
                        clarificationNeeded: false,
                        suggestedProduct: candidateProducts[result.productIndex]
                    }
                }

            } catch (error) {
                console.error('Error resolviendo ambigüedad:', error)
            }
        }

        // Fallback: pedir clarificación
        return {
            clarificationNeeded: true,
            message: `Encontré ${candidateProducts.length} productos similares. ¿Cuál prefieres?\n\n` +
                candidateProducts.slice(0, 5).map((p, i) => 
                    `${i + 1}. ${p.descripcion} - $${p.ventas.toLocaleString()}`
                ).join('\n')
        }
    }

    /**
     * Interpretar cantidad y medida con contexto
     */
    async interpretQuantity(
        userMessage: string,
        product: Product,
        userId: string
    ): Promise<{
        quantity: number
        explanation?: string
    }> {
        const history = contextService.formatHistoryForLLM(userId, 3)

        const prompt = `Cliente: "${userMessage}"
Producto: ${product.descripcion} - Unidad: ${product.unidad || 'unidad'} - Precio: $${product.ventas}

${history ? `Historial:\n${history}` : ''}

¿Cuántas unidades de este producto quiere el cliente?
Considera:
- Si menciona kg, litros, etc., convierte a unidades del producto
- Si no especifica cantidad, sugiere 1 unidad
- Si dice "un poco", "algo", sugiere cantidad razonable

Responde SOLO con JSON:
{
  "quantity": 1,
  "explanation": "Por qué elegiste esa cantidad"
}`

        try {
            // Verificar rate limit
            if (this.USE_RATE_LIMITER) {
                await rateLimiter.waitIfNeeded()
            }

            const response = await fetch(`${this.GEMINI_API}?key=${this.API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        temperature: 0.5,
                        maxOutputTokens: 300
                    }
                })
            })

            const data = await response.json()
            const geminiText = data.candidates[0]?.content?.parts[0]?.text || ''
            
            let cleaned = geminiText.replace(/```json|```/g, '').trim()
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
            if (jsonMatch) cleaned = jsonMatch[0]
            
            const result = JSON.parse(cleaned)

            return {
                quantity: result.quantity || 1,
                explanation: result.explanation
            }

        } catch (error) {
            console.error('Error interpretando cantidad:', error)
            return { quantity: 1 }
        }
    }
}

export const ragService = new RAGService()