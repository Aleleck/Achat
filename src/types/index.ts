// src/types/index.ts
export interface Product {
    descripcion: string
    ventas: number
    categoria?: string
    marca?: string
    unidad?: string
    codigoBarras?: string
    keywords?: string[]
}

export interface OrderItem {
    product: Product
    quantity: number
}

export interface Order {
    items: OrderItem[]
    total: number
    customerPhone: string
    customerName?: string
    status: 'pending' | 'confirmed' | 'cancelled'
}

export interface UserState {
    name?: string
    currentFlow?: 'menu' | 'prices' | 'order' | 'advisor'
    order?: {
        items: OrderItem[]
    }
    lastSearchResults?: Product[]
}