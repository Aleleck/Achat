// src/services/smart-matcher.service.ts
import { Product } from '../types/index'
import { intentClassifier } from './intent-classifier.service'

interface SmartMatch {
    product: Product
    quantity: number
    confidence: number
    reason: string
}

interface MatchResult {
    matches: SmartMatch[]
    needsClarification: boolean
    clarificationMessage?: string
    ambiguousProducts?: Product[]
}

class SmartMatcherService {
    /**
     * Matcher inteligente que toma decisiones automáticas
     */
    async smartMatch(userMessage: string, allProducts: Product[]): Promise<MatchResult> {
        const normalized = userMessage.toLowerCase()
        
        // 1. Extraer intención y entidades
        const intent = await intentClassifier.classifyIntent(userMessage)
        
        // 2. Dividir en múltiples solicitudes si hay "y" o saltos de línea
        const requests = this.splitRequests(normalized)
        
        const matches: SmartMatch[] = []
        const ambiguous: Product[] = []
        
        // 3. Procesar cada solicitud
        for (const request of requests) {
            const result = await this.matchSingleRequest(request, allProducts, intent)
            
            if (result.match) {
                matches.push(result.match)
            } else if (result.candidates && result.candidates.length > 0) {
                ambiguous.push(...result.candidates.slice(0, 3))
            }
        }
        
        // 4. Decidir si necesita clarificación
        if (matches.length === 0 && ambiguous.length > 0) {
            return {
                matches: [],
                needsClarification: true,
                clarificationMessage: this.buildClarificationMessage(requests, ambiguous),
                ambiguousProducts: ambiguous
            }
        }
        
        return {
            matches,
            needsClarification: false
        }
    }

    /**
     * Dividir mensaje en múltiples solicitudes
     */
    private splitRequests(message: string): string[] {
        // Dividir por "y" o saltos de línea
        let parts = message.split(/\s+y\s+|\n/)
        
        // Limpiar y filtrar
        return parts
            .map(p => p.trim())
            .filter(p => p.length > 2)
    }

    /**
     * Emparejar una sola solicitud con productos
     */
    private async matchSingleRequest(
        request: string,
        allProducts: Product[],
        globalIntent: any
    ): Promise<{ match?: SmartMatch; candidates?: Product[] }> {
        
        // Extraer información clave
        const keywords = this.extractKeywords(request)
        const quantity = this.extractQuantity(request)
        const unit = this.extractUnit(request)
        const brand = this.extractBrand(request)
        
        // Buscar productos candidatos
        let candidates = this.findCandidates(keywords, allProducts)
        
        if (candidates.length === 0) {
            return { candidates: [] }
        }
        
        // Filtrar por marca si se especificó
        if (brand) {
            const brandFiltered = candidates.filter(p => 
                p.marca && p.marca.toLowerCase().includes(brand.toLowerCase())
            )
            if (brandFiltered.length > 0) {
                candidates = brandFiltered
            }
        }
        
        // Filtrar por unidad/tamaño si se especificó
        if (unit) {
            const unitFiltered = this.filterByUnit(candidates, unit)
            if (unitFiltered.length > 0) {
                candidates = unitFiltered
            }
        }
        
        // Si solo queda 1, es el match perfecto
        if (candidates.length === 1) {
            return {
                match: {
                    product: candidates[0],
                    quantity: quantity || 1,
                    confidence: 0.95,
                    reason: 'Coincidencia exacta con especificaciones'
                }
            }
        }
        
        // Si quedan varios, elegir el mejor automáticamente
        if (candidates.length > 1 && candidates.length <= 5) {
            const best = this.chooseBest(candidates, request, quantity, unit)
            return {
                match: {
                    product: best,
                    quantity: quantity || 1,
                    confidence: 0.80,
                    reason: 'Mejor opción basada en precio y especificaciones'
                }
            }
        }
        
        // Si hay muchos, devolver para clarificación
        return { candidates: candidates.slice(0, 5) }
    }

    /**
     * Extraer palabras clave del request
     */
    private extractKeywords(text: string): string[] {
        // Remover cantidades y unidades
        let clean = text
            .replace(/\d+(?:\.\d+)?\s*(kg|kilogramos?|kilos?|g|gramos?|l|litros?|ml|mililitros?|lb|libras?|unidades?|u)/gi, '')
            .replace(/\d+/g, '')
            .trim()
        
        // Separar en palabras
        const words = clean.split(/\s+/)
        
        // Filtrar palabras importantes (> 3 letras)
        return words.filter(w => w.length > 3)
    }

    /**
     * Extraer cantidad del texto
     */
    private extractQuantity(text: string): number | null {
        // Buscar número + unidad o solo número
        const patterns = [
            /(\d+(?:\.\d+)?)\s*(?:kg|kilos?|g|gramos?|l|litros?|lb|libras?|unidades?|u)/i,
            /(\d+(?:\.\d+)?)/
        ]
        
        for (const pattern of patterns) {
            const match = text.match(pattern)
            if (match) {
                return parseFloat(match[1])
            }
        }
        
        // Detectar cantidades en palabras
        const implicit = intentClassifier.detectImplicitQuantity(text)
        return implicit
    }

    /**
     * Extraer unidad de medida
     */
    private extractUnit(text: string): string | null {
        const units = {
            'libra': ['lb', 'libras?'],
            'kilo': ['kg', 'kilos?', 'kilogramos?'],
            'gramo': ['g', 'gramos?'],
            'litro': ['l', 'litros?'],
            'mililitro': ['ml', 'mililitros?']
        }
        
        for (const [unit, patterns] of Object.entries(units)) {
            for (const pattern of patterns) {
                const regex = new RegExp(`\\b${pattern}\\b`, 'i')
                if (regex.test(text)) {
                    return unit
                }
            }
        }
        
        return null
    }

    /**
     * Extraer marca mencionada
     */
    private extractBrand(text: string): string | null {
        const brands = [
            'roa', 'diana', 'caribe', 'florhuila', 'alpina', 'colanta',
            'nestle', 'nestlé', 'coca cola', 'cocacola', 'postobon',
            'oleollano', 'oleocali', 'soya', 'girasol', 'vital', 'gourmet'
        ]
        
        for (const brand of brands) {
            if (text.includes(brand)) {
                return brand
            }
        }
        
        return null
    }

    /**
     * Buscar productos candidatos
     */
    private findCandidates(keywords: string[], products: Product[]): Product[] {
        const candidates: Product[] = []
        
        for (const product of products) {
            const desc = product.descripcion.toLowerCase()
            
            // Verificar si todas las keywords están en la descripción
            const matchCount = keywords.filter(kw => desc.includes(kw)).length
            
            if (matchCount > 0) {
                candidates.push(product)
            }
        }
        
        // Ordenar por relevancia (más keywords coincidentes primero)
        return candidates.sort((a, b) => {
            const scoreA = keywords.filter(kw => a.descripcion.toLowerCase().includes(kw)).length
            const scoreB = keywords.filter(kw => b.descripcion.toLowerCase().includes(kw)).length
            return scoreB - scoreA
        })
    }

    /**
     * Filtrar por unidad/tamaño
     */
    private filterByUnit(products: Product[], requestedUnit: string): Product[] {
        const filtered: Product[] = []
        
        // Mapeo de unidades a patrones en descripciones
        const unitPatterns: Record<string, RegExp[]> = {
            'libra': [/\b(lb|libras?)\b/i, /500\s*g/i],
            'kilo': [/\b(kg|kilos?)\b/i, /1000\s*g/i, /\b1\s*kg\b/i],
            'litro': [/\b(l|litros?)\b/i, /1000\s*(ml|cc)/i, /\b1\s*l\b/i],
            'gramo': [/\b(g|gramos?)\b/i],
            'mililitro': [/\b(ml|cc)\b/i]
        }
        
        const patterns = unitPatterns[requestedUnit] || []
        
        for (const product of products) {
            const desc = product.descripcion.toLowerCase()
            
            for (const pattern of patterns) {
                if (pattern.test(desc)) {
                    filtered.push(product)
                    break
                }
            }
        }
        
        return filtered
    }

    /**
     * Elegir el mejor producto automáticamente
     */
    private chooseBest(
        candidates: Product[],
        request: string,
        quantity: number | null,
        unit: string | null
    ): Product {
        // Estrategia: Mejor relación calidad-precio
        
        // 1. Si hay marca conocida, priorizar
        const withBrand = candidates.filter(p => p.marca)
        if (withBrand.length > 0) {
            // Ordenar por precio (más económico)
            return withBrand.sort((a, b) => a.ventas - b.ventas)[0]
        }
        
        // 2. Si no, elegir el más económico
        return candidates.sort((a, b) => a.ventas - b.ventas)[0]
    }

    /**
     * Construir mensaje de clarificación
     */
    private buildClarificationMessage(requests: string[], products: Product[]): string {
        let message = '🤔 Encontré varias opciones para tu búsqueda:\n\n'
        
        products.forEach((p, i) => {
            message += `${i + 1}. ${p.descripcion}\n`
            message += `   💰 $${p.ventas.toLocaleString()}`
            if (p.marca) message += ` - ${p.marca}`
            message += '\n\n'
        })
        
        message += '💡 ¿Cuál prefieres? (Escribe el número)'
        
        return message
    }

    /**
     * Validar si un producto cumple con los requisitos
     */
    private validateMatch(
        product: Product,
        keywords: string[],
        unit: string | null,
        brand: string | null
    ): number {
        let score = 0
        const desc = product.descripcion.toLowerCase()
        
        // Puntos por keywords
        for (const kw of keywords) {
            if (desc.includes(kw)) score += 10
        }
        
        // Puntos por unidad
        if (unit) {
            const unitPatterns = {
                'libra': /\b(lb|500g)\b/i,
                'kilo': /\b(kg|1000g)\b/i,
                'litro': /\b(l|1000ml)\b/i
            }
            
            const pattern = unitPatterns[unit as keyof typeof unitPatterns]
            if (pattern && pattern.test(desc)) {
                score += 20
            }
        }
        
        // Puntos por marca
        if (brand && product.marca && product.marca.toLowerCase().includes(brand)) {
            score += 30
        }
        
        return score
    }
}

export const smartMatcherService = new SmartMatcherService()