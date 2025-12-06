// src/services/order.service.ts
import { Order, OrderItem } from '../types/index'
import { excelService } from './excel.service'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

class OrderService {
    private orders: Map<string, Order> = new Map()
    private readonly ORDERS_FILE = join(process.cwd(), 'data', 'orders.json')
    private readonly HISTORY_FILE = join(process.cwd(), 'data', 'orders-history.json')

    constructor() {
        this.loadOrders()
    }

    /**
     * Cargar pedidos desde archivo JSON
     */
    private loadOrders(): void {
        try {
            // Asegurar que existe la carpeta data
            const dataDir = join(process.cwd(), 'data')
            if (!existsSync(dataDir)) {
                mkdirSync(dataDir, { recursive: true })
            }

            if (existsSync(this.ORDERS_FILE)) {
                const data = readFileSync(this.ORDERS_FILE, 'utf-8')
                const parsed = JSON.parse(data)

                // Convertir objeto a Map
                this.orders = new Map(Object.entries(parsed))
                console.log(`📦 ${this.orders.size} pedidos activos cargados desde disco`)
            }
        } catch (error) {
            console.error('❌ Error cargando pedidos:', error)
            this.orders = new Map()
        }
    }

    /**
     * Guardar pedidos en archivo JSON (no bloqueante)
     */
    private saveOrders(): void {
        try {
            const data = Object.fromEntries(this.orders)
            writeFileSync(this.ORDERS_FILE, JSON.stringify(data, null, 2))
        } catch (error) {
            console.error('❌ Error guardando pedidos:', error)
        }
    }

    /**
     * Guardar pedido confirmado en historial
     */
    private saveToHistory(order: Order): void {
        try {
            let history: Order[] = []

            if (existsSync(this.HISTORY_FILE)) {
                const data = readFileSync(this.HISTORY_FILE, 'utf-8')
                history = JSON.parse(data)
            }

            // Agregar timestamp al pedido
            const orderWithTimestamp = {
                ...order,
                confirmedAt: new Date().toISOString(),
                orderNumber: `ORD-${Date.now().toString().slice(-8)}`
            }

            history.push(orderWithTimestamp)

            // Guardar solo últimos 1000 pedidos
            if (history.length > 1000) {
                history = history.slice(-1000)
            }

            writeFileSync(this.HISTORY_FILE, JSON.stringify(history, null, 2))
        } catch (error) {
            console.error('❌ Error guardando en historial:', error)
        }
    }

    createOrder(customerPhone: string): Order {
        const order: Order = {
            items: [],
            total: 0,
            customerPhone,
            status: 'pending'
        }
        this.orders.set(customerPhone, order)
        this.saveOrders()
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

        // Buscar si el producto ya existe en el pedido
        const existingItem = order.items.find(
            i => i.product.descripcion === item.product.descripcion
        )

        if (existingItem) {
            existingItem.quantity += item.quantity
        } else {
            order.items.push(item)
        }

        this.updateTotal(order)
        this.saveOrders()
        return order
    }

    removeItem(customerPhone: string, productName: string): Order | undefined {
        const order = this.getOrder(customerPhone)
        if (!order) return undefined

        order.items = order.items.filter(
            i => i.product.descripcion !== productName
        )
        this.updateTotal(order)
        this.saveOrders()
        return order
    }

    clearOrder(customerPhone: string): void {
        this.orders.delete(customerPhone)
        this.saveOrders()
    }

    /**
     * Confirmar pedido y moverlo al historial
     */
    confirmOrder(customerPhone: string): Order | undefined {
        const order = this.getOrder(customerPhone)
        if (!order) return undefined

        order.status = 'confirmed'
        this.saveToHistory(order)
        this.clearOrder(customerPhone)
        return order
    }

    /**
     * Obtener todos los pedidos activos
     */
    getAllOrders(): Order[] {
        return Array.from(this.orders.values())
    }

    /**
     * Obtener historial de pedidos confirmados
     */
    getOrderHistory(limit?: number): any[] {
        try {
            if (!existsSync(this.HISTORY_FILE)) {
                return []
            }

            const data = readFileSync(this.HISTORY_FILE, 'utf-8')
            const history = JSON.parse(data)

            if (limit) {
                return history.slice(-limit)
            }

            return history
        } catch (error) {
            console.error('❌ Error leyendo historial:', error)
            return []
        }
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

        let message = '🛒 *TU PEDIDO*\n\n'
        
        order.items.forEach((item, i) => {
            const subtotal = item.product.ventas * item.quantity
            message += `${i + 1}. *${item.product.descripcion}*\n`
            message += `   Cantidad: ${item.quantity}\n`
            message += `   Precio unit: ${excelService.formatPrice(item.product.ventas)}\n`
            message += `   Subtotal: ${excelService.formatPrice(subtotal)}\n\n`
        })

        message += `━━━━━━━━━━━━━━━━\n`
        message += `*TOTAL: ${excelService.formatPrice(order.total)}*`

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

export const orderService = new OrderService()