// src/services/smart-search.service.ts
import { Product } from '../types/index'

interface SearchResult {
    product: Product
    score: number
    matchType: 'exact' | 'fuzzy' | 'partial' | 'keyword' | 'category'
}

class SmartSearchService {
    /**
     * Búsqueda inteligente principal
     */
    async search(query: string, products: Product[], options?: {
        maxResults?: number
        minScore?: number
        includeCategories?: boolean
    }): Promise<SearchResult[]> {
        const maxResults = options?.maxResults || 15
        const minScore = options?.minScore || 0.3
        
        const searchTerm = this.normalizeText(query)
        const results: SearchResult[] = []

        // 1. Búsqueda exacta (score: 1.0)
        const exactMatches = this.exactSearch(searchTerm, products)
        results.push(...exactMatches)

        // 2. Búsqueda parcial de palabras (score: 0.8-0.9)
        const partialMatches = this.partialSearch(searchTerm, products)
        results.push(...partialMatches)

        // 3. Búsqueda por keywords (score: 0.7-0.8)
        const keywordMatches = this.keywordSearch(searchTerm, products)
        results.push(...keywordMatches)

        // 4. Búsqueda difusa (tolera errores) (score: 0.5-0.7)
        const fuzzyMatches = this.fuzzySearch(searchTerm, products)
        results.push(...fuzzyMatches)

        // 5. Búsqueda por categoría (score: 0.4-0.6)
        if (options?.includeCategories) {
            const categoryMatches = this.categorySearch(searchTerm, products)
            results.push(...categoryMatches)
        }

        // Eliminar duplicados y ordenar por score
        const uniqueResults = this.removeDuplicates(results)
        const sortedResults = uniqueResults
            .filter(r => r.score >= minScore)
            .sort((a, b) => b.score - a.score)
            .slice(0, maxResults)

        return sortedResults
    }

    /**
     * Búsqueda exacta
     */
    private exactSearch(query: string, products: Product[]): SearchResult[] {
        const results: SearchResult[] = []
        
        for (const product of products) {
            const normalized = this.normalizeText(product.descripcion)
            
            if (normalized === query) {
                results.push({
                    product,
                    score: 1.0,
                    matchType: 'exact'
                })
            }
        }
        
        return results
    }

    /**
     * Búsqueda parcial - todas las palabras de la query deben estar presentes
     */
    private partialSearch(query: string, products: Product[]): SearchResult[] {
        const results: SearchResult[] = []
        const queryWords = query.split(/\s+/).filter(w => w.length > 2)
        
        if (queryWords.length === 0) return results

        for (const product of products) {
            const normalized = this.normalizeText(product.descripcion)
            const productWords = normalized.split(/\s+/)
            
            let matchedWords = 0
            let totalRelevance = 0

            for (const qWord of queryWords) {
                // Buscar coincidencia exacta de palabra
                if (productWords.some(pWord => pWord === qWord)) {
                    matchedWords++
                    totalRelevance += 1.0
                }
                // Buscar si la palabra del producto contiene la palabra buscada
                else if (productWords.some(pWord => pWord.includes(qWord) && qWord.length > 3)) {
                    matchedWords++
                    totalRelevance += 0.8
                }
            }

            // Solo considerar si todas las palabras de búsqueda se encontraron
            if (matchedWords === queryWords.length) {
                const score = 0.85 + (totalRelevance / queryWords.length * 0.15)
                results.push({
                    product,
                    score: Math.min(score, 0.95),
                    matchType: 'partial'
                })
            }
        }
        
        return results
    }

    /**
     * Búsqueda por palabras clave
     */
    private keywordSearch(query: string, products: Product[]): SearchResult[] {
        const results: SearchResult[] = []
        
        for (const product of products) {
            if (!product.keywords || product.keywords.length === 0) continue
            
            const normalizedKeywords = product.keywords.map(k => this.normalizeText(k))
            const matchingKeywords = normalizedKeywords.filter(k => 
                k.includes(query) || query.includes(k)
            )
            
            if (matchingKeywords.length > 0) {
                const score = 0.7 + (matchingKeywords.length * 0.05)
                results.push({
                    product,
                    score: Math.min(score, 0.85),
                    matchType: 'keyword'
                })
            }
        }
        
        return results
    }

    /**
     * Búsqueda difusa - tolera errores tipográficos
     */
    private fuzzySearch(query: string, products: Product[]): SearchResult[] {
        const results: SearchResult[] = []
        const queryWords = query.split(/\s+/).filter(w => w.length > 3)
        
        if (queryWords.length === 0) return results

        for (const product of products) {
            const normalized = this.normalizeText(product.descripcion)
            const productWords = normalized.split(/\s+/)
            
            let totalSimilarity = 0
            let matchedWords = 0

            for (const qWord of queryWords) {
                let bestSimilarity = 0
                
                for (const pWord of productWords) {
                    if (pWord.length < 3) continue
                    
                    const similarity = this.levenshteinSimilarity(qWord, pWord)
                    if (similarity > bestSimilarity) {
                        bestSimilarity = similarity
                    }
                }
                
                if (bestSimilarity > 0.7) {
                    matchedWords++
                    totalSimilarity += bestSimilarity
                }
            }

            if (matchedWords > 0 && matchedWords >= queryWords.length * 0.6) {
                const score = (totalSimilarity / queryWords.length) * 0.7
                results.push({
                    product,
                    score,
                    matchType: 'fuzzy'
                })
            }
        }
        
        return results
    }

    /**
     * Búsqueda por categoría
     */
    private categorySearch(query: string, products: Product[]): SearchResult[] {
        const results: SearchResult[] = []
        
        for (const product of products) {
            if (!product.categoria) continue
            
            const normalizedCategory = this.normalizeText(product.categoria)
            
            if (normalizedCategory.includes(query) || query.includes(normalizedCategory)) {
                results.push({
                    product,
                    score: 0.5,
                    matchType: 'category'
                })
            }
        }
        
        return results
    }

    /**
     * Calcular similitud usando distancia de Levenshtein
     */
    private levenshteinSimilarity(str1: string, str2: string): number {
        const distance = this.levenshteinDistance(str1, str2)
        const maxLength = Math.max(str1.length, str2.length)
        return 1 - (distance / maxLength)
    }

    /**
     * Distancia de Levenshtein (errores tipográficos)
     */
    private levenshteinDistance(str1: string, str2: string): number {
        const len1 = str1.length
        const len2 = str2.length
        const matrix: number[][] = []

        if (len1 === 0) return len2
        if (len2 === 0) return len1

        // Inicializar matriz
        for (let i = 0; i <= len1; i++) {
            matrix[i] = [i]
        }
        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j
        }

        // Calcular distancia
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,      // eliminación
                    matrix[i][j - 1] + 1,      // inserción
                    matrix[i - 1][j - 1] + cost // sustitución
                )
            }
        }

        return matrix[len1][len2]
    }

    /**
     * Normalizar texto para búsqueda
     */
    private normalizeText(text: string): string {
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
            .replace(/[^a-z0-9\s]/g, '') // Solo letras, números y espacios
            .replace(/\s+/g, ' ')
            .trim()
    }

    /**
     * Eliminar duplicados manteniendo el mejor score
     */
    private removeDuplicates(results: SearchResult[]): SearchResult[] {
        const map = new Map<string, SearchResult>()
        
        for (const result of results) {
            const key = result.product.descripcion
            const existing = map.get(key)
            
            if (!existing || result.score > existing.score) {
                map.set(key, result)
            }
        }
        
        return Array.from(map.values())
    }

    /**
     * Obtener sugerencias basadas en búsqueda parcial
     */
    async getSuggestions(query: string, products: Product[], limit: number = 5): Promise<string[]> {
        if (query.length < 2) return []
        
        const normalized = this.normalizeText(query)
        const suggestions = new Set<string>()
        
        for (const product of products) {
            const productNorm = this.normalizeText(product.descripcion)
            
            if (productNorm.includes(normalized)) {
                // Extraer la parte relevante
                const words = product.descripcion.split(/\s+/)
                for (const word of words) {
                    const wordNorm = this.normalizeText(word)
                    if (wordNorm.includes(normalized) && word.length > 3) {
                        suggestions.add(word)
                        if (suggestions.size >= limit) break
                    }
                }
            }
            
            if (suggestions.size >= limit) break
        }
        
        return Array.from(suggestions).slice(0, limit)
    }

    /**
     * Extraer categorías únicas de productos
     */
    extractCategories(products: Product[]): string[] {
        const categories = new Set<string>()
        
        for (const product of products) {
            if (product.categoria) {
                categories.add(product.categoria)
            }
        }
        
        return Array.from(categories).sort()
    }

    /**
     * Buscar por marca
     */
    searchByBrand(brand: string, products: Product[]): Product[] {
        const normalized = this.normalizeText(brand)
        
        return products.filter(p => {
            if (!p.marca) return false
            return this.normalizeText(p.marca).includes(normalized)
        })
    }

    /**
     * Buscar por código de barras
     */
    searchByBarcode(barcode: string, products: Product[]): Product | undefined {
        return products.find(p => p.codigoBarras === barcode)
    }
}

export const smartSearchService = new SmartSearchService()