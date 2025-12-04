// src/services/intent-classifier.service.ts

interface ClassifiedIntent {
    intent: 'add_to_cart' | 'search_product' | 'ask_price' | 'ask_info' | 'modify_order' | 'finalize_order' | 'greet' | 'other'
    confidence: number
    entities: {
        product?: string
        quantity?: number
        unit?: string
        brand?: string
        category?: string
        priceRange?: { min?: number; max?: number }
    }
}

class IntentClassifierService {
    /**
     * Clasificar intención usando reglas + patrones
     */
    async classifyIntent(message: string): Promise<ClassifiedIntent> {
        const normalized = message.toLowerCase().trim()
        
        // 1. Detectar saludos
        if (this.isGreeting(normalized)) {
            return {
                intent: 'greet',
                confidence: 0.95,
                entities: {}
            }
        }

        // 2. Detectar orden de agregar al carrito
        const addToCartMatch = this.detectAddToCart(normalized)
        if (addToCartMatch) {
            return addToCartMatch
        }

        // 3. Detectar búsqueda de precio
        if (this.isPriceInquiry(normalized)) {
            return {
                intent: 'ask_price',
                confidence: 0.90,
                entities: this.extractProductEntity(normalized)
            }
        }

        // 4. Detectar búsqueda de información
        if (this.isInfoInquiry(normalized)) {
            return {
                intent: 'ask_info',
                confidence: 0.85,
                entities: this.extractProductEntity(normalized)
            }
        }

        // 5. Detectar modificación de orden
        if (this.isOrderModification(normalized)) {
            return {
                intent: 'modify_order',
                confidence: 0.88,
                entities: this.extractProductEntity(normalized)
            }
        }

        // 6. Detectar finalización de orden
        if (this.isOrderFinalization(normalized)) {
            return {
                intent: 'finalize_order',
                confidence: 0.92,
                entities: {}
            }
        }

        // 7. Default: búsqueda de producto
        return {
            intent: 'search_product',
            confidence: 0.70,
            entities: this.extractAllEntities(normalized)
        }
    }

    /**
     * Extraer entidades (cantidad, unidad, producto, marca)
     */
    extractAllEntities(text: string): ClassifiedIntent['entities'] {
        const entities: ClassifiedIntent['entities'] = {}

        // Extraer cantidad y unidad
        const quantityMatch = this.extractQuantityAndUnit(text)
        if (quantityMatch) {
            entities.quantity = quantityMatch.quantity
            entities.unit = quantityMatch.unit
        }

        // Extraer producto
        const productMatch = this.extractProductEntity(text)
        if (productMatch.product) {
            entities.product = productMatch.product
        }

        // Extraer marca
        const brand = this.extractBrand(text)
        if (brand) {
            entities.brand = brand
        }

        // Extraer rango de precio
        const priceRange = this.extractPriceRange(text)
        if (priceRange) {
            entities.priceRange = priceRange
        }

        return entities
    }

    /**
     * Detectar intención de agregar al carrito
     */
    private detectAddToCart(text: string): ClassifiedIntent | null {
        const patterns = [
            /(?:quiero|necesito|dame|agrega(?:r)?|pon(?:er)?|añad(?:e|ir)?)\s+(.+)/i,
            /(\d+(?:\.\d+)?)\s*(kg|gramos?|g|litros?|l|unidades?|u)?\s+(?:de\s+)?(.+)/i,
            /(.+)\s+(?:por favor|porfavor)/i
        ]

        for (const pattern of patterns) {
            const match = text.match(pattern)
            if (match) {
                const entities = this.extractAllEntities(text)
                
                // Solo clasificar como add_to_cart si tiene cantidad o palabras clave
                const hasQuantity = entities.quantity !== undefined
                const hasKeyword = /(quiero|necesito|dame|agrega|pon|añad)/i.test(text)
                
                if (hasQuantity || hasKeyword) {
                    return {
                        intent: 'add_to_cart',
                        confidence: hasQuantity ? 0.92 : 0.80,
                        entities
                    }
                }
            }
        }

        return null
    }

    /**
     * Extraer cantidad y unidad de medida
     */
    private extractQuantityAndUnit(text: string): { quantity: number; unit: string } | null {
        // Patrones de cantidad + unidad
        const patterns = [
            // "2kg", "2 kg", "2.5 kilos"
            /(\d+(?:\.\d+)?)\s*(kg|kilogramos?|kilos?)/i,
            // "500g", "500 gramos"
            /(\d+(?:\.\d+)?)\s*(g|gramos?)/i,
            // "1L", "1 litro", "2.5 litros"
            /(\d+(?:\.\d+)?)\s*(l|litros?)/i,
            // "3 unidades", "5u"
            /(\d+)\s*(unidades?|u|piezas?|pzas?)/i,
            // Solo número (asumimos unidades)
            /^(\d+)\s+(?!kg|g|l)/i
        ]

        for (const pattern of patterns) {
            const match = text.match(pattern)
            if (match) {
                const quantity = parseFloat(match[1])
                let unit = match[2]?.toLowerCase() || 'unidades'

                // Normalizar unidades
                unit = this.normalizeUnit(unit)

                return { quantity, unit }
            }
        }

        return null
    }

    /**
     * Normalizar unidades de medida
     */
    private normalizeUnit(unit: string): string {
        const unitMap: Record<string, string> = {
            'kg': 'kilogramos',
            'kilo': 'kilogramos',
            'kilos': 'kilogramos',
            'kilogramo': 'kilogramos',
            'g': 'gramos',
            'gramo': 'gramos',
            'l': 'litros',
            'litro': 'litros',
            'u': 'unidades',
            'unidad': 'unidades',
            'pieza': 'unidades',
            'piezas': 'unidades',
            'pza': 'unidades',
            'pzas': 'unidades'
        }

        return unitMap[unit.toLowerCase()] || unit
    }

    /**
     * Extraer nombre del producto
     */
    private extractProductEntity(text: string): { product?: string } {
        // Remover palabras de acción y cantidad
        let clean = text
            .replace(/(?:quiero|necesito|dame|agrega(?:r)?|pon(?:er)?|añad(?:e|ir)?)\s+/gi, '')
            .replace(/\d+(?:\.\d+)?\s*(?:kg|g|l|litros?|gramos?|kilos?|unidades?|u|piezas?|pzas?)\s+(?:de\s+)?/gi, '')
            .replace(/(?:cuanto cuesta|precio de|valor de)\s*/gi, '')
            .replace(/por favor|porfavor/gi, '')
            .trim()

        if (clean.length > 2) {
            return { product: clean }
        }

        return {}
    }

    /**
     * Extraer marca mencionada
     */
    private extractBrand(text: string): string | undefined {
        // Lista de marcas comunes (esto debería venir de la BD o Excel)
        const commonBrands = [
            'alpina', 'diana', 'nestlé', 'nestle', 'coca cola', 'cocacola',
            'postobon', 'colanta', 'parmalat', 'fruco', 'zenú', 'zenu',
            'ranchera', 'piko riko', 'yupi', 'colombina', 'bimbo', 'roa',
            'la constancia', 'la egipciana', 'super ricas', 'oma', 'rica',
            'doña pepa', 'festival', 'jet', 'milo', 'nescafe', 'juan valdez'
        ]

        const normalized = text.toLowerCase()
        for (const brand of commonBrands) {
            if (normalized.includes(brand)) {
                return brand
            }
        }

        return undefined
    }

    /**
     * Extraer rango de precio
     */
    private extractPriceRange(text: string): { min?: number; max?: number } | undefined {
        // Patrones: "menos de 5000", "entre 3000 y 5000", "máximo 10000"
        
        // "menos de X", "máximo X"
        const maxMatch = text.match(/(?:menos de|max(?:imo)?|hasta)\s*\$?\s*(\d+(?:,\d+)?)/i)
        if (maxMatch) {
            return { max: parseInt(maxMatch[1].replace(',', '')) }
        }

        // "más de X", "mínimo X"
        const minMatch = text.match(/(?:m[aá]s de|min(?:imo)?|desde)\s*\$?\s*(\d+(?:,\d+)?)/i)
        if (minMatch) {
            return { min: parseInt(minMatch[1].replace(',', '')) }
        }

        // "entre X y Y"
        const rangeMatch = text.match(/entre\s*\$?\s*(\d+(?:,\d+)?)\s*y\s*\$?\s*(\d+(?:,\d+)?)/i)
        if (rangeMatch) {
            return {
                min: parseInt(rangeMatch[1].replace(',', '')),
                max: parseInt(rangeMatch[2].replace(',', ''))
            }
        }

        return undefined
    }

    /**
     * Detectar si es saludo
     */
    private isGreeting(text: string): boolean {
        const greetings = [
            'hola', 'hello', 'hi', 'buenos dias', 'buenas tardes', 
            'buenas noches', 'buenas', 'que tal', 'hey', 'ey',
            'buen dia', 'buena tarde', 'buena noche'
        ]
        return greetings.some(g => text.startsWith(g))
    }

    /**
     * Detectar si es consulta de precio
     */
    private isPriceInquiry(text: string): boolean {
        return /(?:cuanto cuesta|precio|valor|costo|cuánto|cuanto vale)/i.test(text)
    }

    /**
     * Detectar si es consulta de información
     */
    private isInfoInquiry(text: string): boolean {
        return /(?:que es|qué es|información|info|detalles|características|descripcion|contenido)/i.test(text)
    }

    /**
     * Detectar modificación de orden
     */
    private isOrderModification(text: string): boolean {
        return /(?:elimina|quita|remueve|cambia|modifica|borra|saca|retira)/i.test(text)
    }

    /**
     * Detectar finalización de orden
     */
    private isOrderFinalization(text: string): boolean {
        return /(?:finalizar|terminar|listo|confirmar|enviar|pedido completo|ya|eso es todo)/i.test(text)
    }

    /**
     * Convertir unidades a cantidad estándar del producto
     */
    convertToProductQuantity(
        requestedQuantity: number,
        requestedUnit: string,
        productUnit: string,
        productSize: number
    ): number {
        // Si las unidades coinciden, retornar cantidad directa
        if (requestedUnit === productUnit) {
            return Math.ceil(requestedQuantity / productSize)
        }

        // Conversiones de peso
        if (requestedUnit === 'kilogramos' && productUnit === 'gramos') {
            const totalGrams = requestedQuantity * 1000
            return Math.ceil(totalGrams / productSize)
        }

        if (requestedUnit === 'gramos' && productUnit === 'kilogramos') {
            const totalKg = requestedQuantity / 1000
            return Math.ceil(totalKg / productSize)
        }

        // Conversiones de volumen
        if (requestedUnit === 'litros' && productUnit === 'mililitros') {
            const totalMl = requestedQuantity * 1000
            return Math.ceil(totalMl / productSize)
        }

        if (requestedUnit === 'mililitros' && productUnit === 'litros') {
            const totalL = requestedQuantity / 1000
            return Math.ceil(totalL / productSize)
        }

        // Si no podemos convertir, retornar la cantidad como está
        return requestedQuantity
    }

    /**
     * Analizar si el mensaje parece una selección numérica
     * Por ejemplo: "el 2", "el primero", "opcion 3"
     */
    isNumericSelection(text: string): { isSelection: boolean; index?: number } {
        // Patrones para detectar selecciones
        const patterns = [
            /(?:el |la |opcion |opción )?(\d+)/i,  // "el 2", "opcion 3"
            /(?:el |la )?primer[oa]/i,              // "el primero"
            /(?:el |la )?segund[oa]/i,              // "la segunda"
            /(?:el |la )?tercer[oa]/i,              // "el tercero"
            /(?:el |la )?cuart[oa]/i,               // "la cuarta"
            /(?:el |la )?quint[oa]/i                // "el quinto"
        ]

        // Verificar si es un número directo
        const numMatch = text.match(/^(\d+)$/)
        if (numMatch) {
            return {
                isSelection: true,
                index: parseInt(numMatch[1]) - 1
            }
        }

        // Verificar otros patrones
        for (const pattern of patterns) {
            if (pattern.test(text)) {
                const match = text.match(/\d+/)
                if (match) {
                    return {
                        isSelection: true,
                        index: parseInt(match[0]) - 1
                    }
                }

                // Manejar palabras (primero, segundo, etc.)
                if (/primer/i.test(text)) return { isSelection: true, index: 0 }
                if (/segund/i.test(text)) return { isSelection: true, index: 1 }
                if (/tercer/i.test(text)) return { isSelection: true, index: 2 }
                if (/cuart/i.test(text)) return { isSelection: true, index: 3 }
                if (/quint/i.test(text)) return { isSelection: true, index: 4 }
            }
        }

        return { isSelection: false }
    }

    /**
     * Detectar cantidad implícita en el texto
     * Por ejemplo: "un kilo", "media libra", "dos litros"
     */
    detectImplicitQuantity(text: string): number | null {
        const quantityWords: Record<string, number> = {
            'un': 1, 'una': 1, 'uno': 1,
            'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5,
            'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10,
            'medio': 0.5, 'media': 0.5,
            'par': 2, 'docena': 12, 'media docena': 6
        }

        const normalized = text.toLowerCase()
        for (const [word, quantity] of Object.entries(quantityWords)) {
            if (normalized.includes(word)) {
                return quantity
            }
        }

        return null
    }
}

export const intentClassifier = new IntentClassifierService()