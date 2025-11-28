// src/services/order.service.ts
import { Order, OrderItem } from '../types/index.js'
import { excelService } from './excel.service.js'

class OrderService {
    private orders: Map<string, Order> = new Map()

    createOrder(customerPhone: string): Order {
        const order: Order = {
            items: [],
            total: 0,
            customerPhone,
            status: 'pending'
        }
        this.orders.set(customerPhone, order)
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
        return order
    }

    removeItem(customerPhone: string, productName: string): Order | undefined {
        const order = this.getOrder(customerPhone)
        if (!order) return undefined

        order.items = order.items.filter(
            i => i.product.descripcion !== productName
        )
        this.updateTotal(order)
        return order
    }

    clearOrder(customerPhone: string): void {
        this.orders.delete(customerPhone)
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