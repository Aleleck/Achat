// src/utils/validation.ts
import { z } from 'zod'

/**
 * Schemas de validación para API endpoints
 */

// POST /v1/messages
export const sendMessageSchema = z.object({
    number: z.string()
        .regex(/^\d{10,15}$/, 'El número debe tener entre 10 y 15 dígitos')
        .describe('Número de teléfono del destinatario'),
    message: z.string()
        .min(1, 'El mensaje no puede estar vacío')
        .max(4096, 'El mensaje es demasiado largo (máx 4096 caracteres)')
        .describe('Contenido del mensaje'),
    urlMedia: z.string()
        .url('URL de media inválida')
        .optional()
        .describe('URL opcional de imagen/video/audio')
})

// POST /v1/blacklist
export const blacklistSchema = z.object({
    number: z.string()
        .regex(/^\d{10,15}$/, 'El número debe tener entre 10 y 15 dígitos')
        .describe('Número de teléfono'),
    intent: z.enum(['add', 'remove'], {
        message: 'intent debe ser "add" o "remove"'
    }).describe('Acción a realizar')
})

/**
 * Función helper para validar datos
 */
export function validateData<T>(
    schema: z.ZodSchema<T>,
    data: unknown
): { success: true; data: T } | { success: false; error: string } {
    try {
        const validated = schema.parse(data)
        return { success: true, data: validated }
    } catch (error) {
        if (error instanceof z.ZodError) {
            const firstError = error.issues[0]
            return {
                success: false,
                error: `${firstError.path.join('.')}: ${firstError.message}`
            }
        }
        return { success: false, error: 'Error de validación desconocido' }
    }
}
