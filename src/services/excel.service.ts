import * as XLSX from 'xlsx'
import * as fs from 'fs' 
import { config } from '../config/index'
import { Product } from '../types/index'

class ExcelService {
    private products: Product[] = []
    private lastLoad: Date | null = null
    private readonly cacheTime = 5 * 60 * 1000 // 5 minutos

    async loadProducts(): Promise<void> {
        try {
            const workbook = XLSX.readFile(config.excel.productsPath)
            const sheet = workbook.Sheets[config.excel.sheetName]
            const data = XLSX.utils.sheet_to_json(sheet) as any[]
            
            this.products = data.map(row => ({
                descripcion: row.DESCRIPCION || row.descripcion || '',
                ventas: Number(row.VENTA1 || row.ventas || 0)
            })).filter(p => p.descripcion && p.ventas > 0)
            
            this.lastLoad = new Date()
            console.log(`✅ ${this.products.length} productos cargados`)
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

    async searchProducts(query: string): Promise<Product[]> {
        const products = await this.getProducts()
        const searchTerm = query.toLowerCase().trim()
        
        return products.filter(p => 
            p.descripcion.toLowerCase().includes(searchTerm)
        ).slice(0, 10) // Limitar a 10 resultados
    }

    async getProductByName(name: string): Promise<Product | undefined> {
        const products = await this.getProducts()
        return products.find(p => 
            p.descripcion.toLowerCase() === name.toLowerCase().trim()
        )
    }

    formatPrice(price: number): string {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0
        }).format(price)
    }

    formatProductList(products: Product[]): string {
        if (products.length === 0) {
            return '❌ No se encontraron productos'
        }

        return products.map((p, i) => 
            `${i + 1}. *${p.descripcion}* - ${this.formatPrice(p.ventas)}`
        ).join('\n')
    }
}

export const excelService = new ExcelService()