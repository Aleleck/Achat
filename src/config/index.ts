// src/config/index.ts
export const config = {
    port: process.env.PORT ?? 3008,

    database: {
        filename: 'db.json'
    },

    baileys: {
        version: [2, 3000, 1027934701] as [number, number, number],
    },

    excel: {
        productsPath: './assets/productos.xlsx',
        sheetName: 'Prod'
    },

    business: {
        name: 'AutoservicioMoravia',
        schedule: 'Lunes a Domingo: 8:00 AM - 8:00 PM',
        phone: '+57 300 123 4567'
    }
} as const