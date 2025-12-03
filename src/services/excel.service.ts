import { readFileSync } from 'fs'
import * as XLSX from 'xlsx'
import { config } from '../config/index'
import { Product } from '../types/index'
import { smartSearchService } from './smart-search.service'

class ExcelService {
    private products: Product[] = []
    private lastLoad: Date | null = null
    private readonly cacheTime = 5 * 60 * 1000 // 5 minutos
    private categories: string[] = []

    async loadProducts(): Promise<void> {
        try {
            // Leer el archivo como buffer
            const fileBuffer = readFileSync(config.excel.productsPath)
      
            // Parsear el buffer con XLSX
            const workbook = XLSX.read(fileBuffer, { type: 'buffer' })
            const sheet = workbook.Sheets[config.excel.sheetName]
      
            if (!sheet) {
                throw new Error(`No se encontró la hoja: ${config.excel.sheetName}`)
            }
      
            const data = XLSX.utils.sheet_to_json(sheet) as any[]
            
            this.products = data.map(row => {
                const descripcion = row.DESCRIPCION || row.descripcion || ''
                return {
                    descripcion,
                    ventas: Number(row.VENTA1 || row.ventas || 0),
                    categoria: row.CATEGORIA || row.categoria || this.extractCategory(descripcion),
                    marca: row.MARCA || row.marca || this.extractBrand(descripcion),
                    codigoBarras: row.CODIGO_BARRAS || row.codigoBarras || row.codigo,
                    keywords: this.generateKeywords(descripcion)
                } as Product
            }).filter(p => p.descripcion && p.ventas > 0)

            this.categories = smartSearchService.extractCategories(this.products)
            this.lastLoad = new Date()
            console.log(`✅ ${this.products.length} productos cargados`)
            console.log(`📂 ${this.categories.length} categorías encontradas`)
        } catch (error) {
            console.error('❌ Error cargando productos:', error)
            throw new Error('No se pudo cargar el archivo de productos')
        }   
    }

    async getProducts(): Promise<Product[]> {
        if (!this.lastLoad || Date.now() - this.lastLoad.getTime() > this.cacheTime) {
            await this.loadProducts()
        }
        return this.products
    }

    /**
     * Búsqueda inteligente de productos
     */
    async searchProducts(query: string, options?: {
        maxResults?: number
        includeScore?: boolean
    }): Promise<Product[]> {
        const products = await this.getProducts()
        
        if (!query || query.trim().length === 0) {
            return []
        }

        // Usar el servicio de búsqueda inteligente
        const results = await smartSearchService.search(query, products, {
            maxResults: options?.maxResults || 15,
            minScore: 0.3,
            includeCategories: true
        })

        // Retornar solo los productos (o con score si se solicita)
        if (options?.includeScore) {
            return results.map(r => ({
                ...r.product,
                // @ts-ignore - añadir score temporalmente
                _searchScore: r.score,
                _matchType: r.matchType
            }))
        }

        return results.map(r => r.product)
    }

    /**
     * Obtener sugerencias de búsqueda
     */
    async getSuggestions(query: string): Promise<string[]> {
        const products = await this.getProducts()
        return smartSearchService.getSuggestions(query, products, 5)
    }

    /**
     * Buscar por categoría
     */
    async searchByCategory(category: string): Promise<Product[]> {
        const products = await this.getProducts()
        const normalized = category.toLowerCase().trim()
        
        return products.filter(p => 
            p.categoria && p.categoria.toLowerCase().includes(normalized)
        ).slice(0, 20)
    }

    /**
     * Buscar por marca
     */
    async searchByBrand(brand: string): Promise<Product[]> {
        const products = await this.getProducts()
        return smartSearchService.searchByBrand(brand, products)
    }

    /**
     * Buscar por código de barras
     */
    async searchByBarcode(barcode: string): Promise<Product | undefined> {
        const products = await this.getProducts()
        return smartSearchService.searchByBarcode(barcode, products)
    }

    /**
     * Obtener todas las categorías disponibles
     */
    getCategories(): string[] {
        return this.categories
    }

    /**
     * Obtener producto por nombre exacto
     */
    async getProductByName(name: string): Promise<Product | undefined> {
        const products = await this.getProducts()
        return products.find(p => 
            p.descripcion.toLowerCase() === name.toLowerCase().trim()
        )
    }

    /**
     * Extraer categoría del nombre del producto
     */
    private extractCategory(descripcion: string): string {
        const desc = descripcion.toLowerCase()
        
        // Definir categorías comunes
        const categoryKeywords: { [key: string]: string[] } = {
            'Lácteos': ['leche', 'queso', 'yogurt', 'mantequilla', 'crema'],
            'Carnes': ['carne', 'pollo', 'res', 'cerdo', 'pavo', 'chorizo', 'salchicha'],
            'Panadería': ['pan', 'galleta', 'torta', 'ponque', 'bizcocho'],
            'Bebidas': ['gaseosa', 'jugo', 'agua', 'refresco', 'coca', 'pepsi'],
            'Aseo': ['jabon', 'shampoo', 'detergente', 'limpiador', 'desinfectante'],
            'Granos': ['arroz', 'frijol', 'lenteja', 'garbanzo', 'arveja'],
            'Aceites': ['aceite', 'manteca'],
            'Enlatados': ['atun', 'sardina', 'enlatado', 'conserva'],
            'Snacks': ['papas', 'chitos', 'doritos', 'snack', 'galletas'],
            'Cereales': ['cereal', 'avena', 'granola'],
            'Condimentos': ['sal', 'azucar', 'condimento', 'salsa', 'mayonesa']
        }
        
        for (const [category, keywords] of Object.entries(categoryKeywords)) {
            if (keywords.some(keyword => desc.includes(keyword))) {
                return category
            }
        }
        
        return 'General'
    }

    /**
     * Extraer marca del nombre del producto
     */
    private extractBrand(descripcion: string): string | undefined {
        // Lista de marcas conocidas (puedes expandir esto)
        const knownBrands = [
            'ALPINA', 'COLANTA', 'NESTLE', 'COCA COLA', 'PEPSI',
            'RAMO', 'BIMBO', 'DIANA', 'ROA', 'FAZENDA',
            'NOEL', 'FESTIVAL', 'COLOMBINA', 'JUMBO', 'EXITO'
        ]
        
        const descUpper = descripcion.toUpperCase()
        
        for (const brand of knownBrands) {
            if (descUpper.includes(brand)) {
                return brand
            }
        }
        
        return undefined
    }

    /**
     * Generar keywords para búsqueda
     */
    private generateKeywords(descripcion: string): string[] {
        const keywords = new Set<string>()
        const words = descripcion.toLowerCase().split(/\s+/)
        
        // Agregar palabras individuales
        for (const word of words) {
            if (word.length > 3) {
                keywords.add(word)
            }
        }
        
        // Agregar sinónimos comunes
        const synonyms: { [key: string]: string[] } = {
            'leche': ['lacteo', 'dairy'],
            'arroz': ['grano', 'cereal'],
            'aceite': ['oleo', 'grasa'],
            'pan': ['panaderia', 'bread'],
            'carne': ['proteina', 'meat']
        }
        
        for (const word of words) {
            if (synonyms[word]) {
                synonyms[word].forEach(syn => keywords.add(syn))
            }
        }
        
        return Array.from(keywords)
    }

    /**
     * Formatear precio
     */
    formatPrice(price: number): string {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0
        }).format(price)
    }

    /**
     * Formatear lista de productos con información de relevancia
     */
    formatProductList(products: Product[], includeRelevance: boolean = false): string {
        if (products.length === 0) {
            return '❌ No se encontraron productos'
        }

        return products.map((p, i) => {
            let line = `${i + 1}. *${p.descripcion}*`
            
            if (p.marca) {
                line += ` - ${p.marca}`
            }
            
            line += ` - ${this.formatPrice(p.ventas)}`
            
            if (includeRelevance && '_matchType' in p) {
                // @ts-ignore
                const matchType = p._matchType
                const emoji = matchType === 'exact' ? '🎯' : matchType === 'partial' ? '✅' : '🔍'
                line += ` ${emoji}`
            }
            
            return line
        }).join('\n')
    }

    /**
     * Formatear lista con categorías
     */
    formatProductListWithCategories(products: Product[]): string {
        if (products.length === 0) {
            return '❌ No se encontraron productos'
        }

        // Agrupar por categoría
        const grouped = new Map<string, Product[]>()
        
        for (const product of products) {
            const category = product.categoria || 'Sin categoría'
            if (!grouped.has(category)) {
                grouped.set(category, [])
            }
            grouped.get(category)!.push(product)
        }

        let result = ''
        for (const [category, prods] of grouped.entries()) {
            result += `\n📦 *${category}*\n`
            result += prods.map((p, i) => 
                `  ${i + 1}. ${p.descripcion} - ${this.formatPrice(p.ventas)}`
            ).join('\n')
            result += '\n'
        }

        return result
    }
}

export const excelService = new ExcelService()