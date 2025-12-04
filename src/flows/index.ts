// src/flows/index.ts
export { welcomeFlow, menuFlow } from './welcome.flow'
export { priceInquiryFlow } from './price-inquiry.flow'
export { advisorFlow } from './advisor.flow'

// Exportar todos los flows de búsqueda de precios
export * from './price-inquiry.flow'

// Exportar el flujo de pedidos inteligente
export * from './smart-order.flow'