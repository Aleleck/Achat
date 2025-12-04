// src/services/rag.service.ts - CON FALLBACK
import { Product } from '../types/index'
import { smartSearchService } from './smart-search.service'
import { contextService } from './context.service'

interface RAGResponse {
    answer: string
    products: Product[]
    confidence: number
    reasoning?: string
}

class RAGService {
    private readonly GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
    private readonly API_KEY = process.env.GEMINI_API_KEY || ''
    private readonly TIMEOUT = 5000 // 5 segundos
    private geminiAvailable = true

    /**
     * Búsqueda inteligente con fallback automático
     */
    async intelligentSearch(
        query: string,
        userId: string,
        allProducts: Product[]
    ): Promise<RAGResponse> {
        try {
            // Si Gemini no está disponible, usar búsqueda tradicional
            if (!this.API_KEY || !this.geminiAvailable) {
                return this.fallbackSearch(query, allProducts)
            }

            // Intentar con Gemini (con timeout)
            try {
                return await this.searchWithGemini(query, userId, allProducts)
            } catch (error) {
                console.warn('⚠️ Gemini no disponible, usando búsqueda local')
                this.geminiAvailable = false
                return this.fallbackSearch(query, allProducts)
            }

        } catch (error) {
            console.error('Error en búsqueda inteligente:', error)
            return this.fallbackSearch(query, allProducts)
        }
    }

    /**
     * Búsqueda con Gemini (con timeout)
     */
    private async searchWithGemini(
        query: string,
        userId: string,
        allProducts: Product[]
    ): Promise<RAGResponse> {
        const context = contextService.getContext(userId)
        const history = contextService.formatHistoryForLLM(userId, 5)
        const patterns = contextService.analyzeConversationPatterns(userId)

        const searchResults = await smartSearchService.search(query, allProducts, {
            maxResults: 20,
            includeCategories: true
        })

        if (searchResults.length === 0) {
            throw new Error('No results from search')
        }

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
    }

    /**
     * Búsqueda fallback sin IA
     */
    private async fallbackSearch(
        query: string,
        allProducts: Product[]
    ): Promise<RAGResponse> {
        const results = await smartSearchService.search(query, allProducts, {
            maxResults: 10,
            includeCategories: true
        })

        if (results.length === 0) {
            return {
                answer: 'No encontré productos que coincidan.',
                products: [],
                confidence: 0
            }
        }

        return {
            answer: 'Encontré estos productos:',
            products: results.map(r => r.product).slice(0, 5),
            confidence: 0.7,
            reasoning: 'Búsqueda tradicional por relevancia'
        }
    }

    /**
     * Llamar a Gemini con timeout
     */
    private async getGeminiRecommendations(
        query: string,
        products: Product[],
        conversationHistory: string,
        patterns: any
    ): Promise<{
        explanation: string
        products: Product[]
        confidence: number
        reasoning: string
    }> {
        const productsInfo = products.slice(0, 15).map((p, i) => ({
            id: i,
            name: p.descripcion,
            price: p.ventas,
            category: p.categoria,
            brand: p.marca
        }))

        const prompt = `Cliente: "${query}"
Productos disponibles: ${JSON.stringify(productsInfo)}

Selecciona los 3-5 productos MÁS RELEVANTES.

Responde SOLO con JSON:
{
  "explanation": "Texto breve",
  "recommendedIds": [0, 2],
  "reasoning": "Por qué",
  "confidence": 0.85
}`

        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT)

            const response = await fetch(`${this.GEMINI_API}?key=${this.API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.5,
                        maxOutputTokens: 500
                    }
                }),
                signal: controller.signal
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`)
            }

            const data = await response.json()
            const geminiText = data.candidates[0]?.content?.parts[0]?.text || ''
            
            let cleaned = geminiText.replace(/```json|```/g, '').trim()
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
            if (jsonMatch) cleaned = jsonMatch[0]
            
            const result = JSON.parse(cleaned)

            const recommendedProducts = (result.recommendedIds || [])
                .map((id: number) => products[id])
                .filter(Boolean)

            return {
                explanation: result.explanation || 'Productos recomendados:',
                products: recommendedProducts.length > 0 ? recommendedProducts : products.slice(0, 5),
                confidence: result.confidence || 0.7,
                reasoning: result.reasoning || 'Recomendación de IA'
            }

        } catch (error: any) {
            if (error.name === 'AbortError') {
                throw new Error('Timeout')
            }
            throw error
        }
    }
}

export const ragService = new RAGService()