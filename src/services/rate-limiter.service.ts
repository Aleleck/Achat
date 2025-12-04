// src/services/rate-limiter.service.ts
/**
 * Rate Limiter para Gemini API
 * Límite: 15 requests/minuto (gratis)
 */

interface RateLimitEntry {
    count: number
    resetTime: number
}

class RateLimiterService {
    private limits: Map<string, RateLimitEntry> = new Map()
    private readonly MAX_REQUESTS_PER_MINUTE = 15
    private readonly WINDOW_MS = 60 * 1000 // 1 minuto

    /**
     * Verificar si se puede hacer un request
     */
    async canMakeRequest(userId: string = 'global'): Promise<boolean> {
        const now = Date.now()
        const entry = this.limits.get(userId)

        // Si no hay entrada o el tiempo expiró, crear nueva
        if (!entry || now > entry.resetTime) {
            this.limits.set(userId, {
                count: 1,
                resetTime: now + this.WINDOW_MS
            })
            return true
        }

        // Si ya alcanzó el límite
        if (entry.count >= this.MAX_REQUESTS_PER_MINUTE) {
            return false
        }

        // Incrementar contador
        entry.count++
        return true
    }

    /**
     * Obtener tiempo restante hasta el reset
     */
    getTimeUntilReset(userId: string = 'global'): number {
        const entry = this.limits.get(userId)
        if (!entry) return 0

        const now = Date.now()
        const remaining = entry.resetTime - now
        return remaining > 0 ? remaining : 0
    }

    /**
     * Obtener requests restantes
     */
    getRemainingRequests(userId: string = 'global'): number {
        const entry = this.limits.get(userId)
        if (!entry) return this.MAX_REQUESTS_PER_MINUTE

        const now = Date.now()
        if (now > entry.resetTime) {
            return this.MAX_REQUESTS_PER_MINUTE
        }

        return Math.max(0, this.MAX_REQUESTS_PER_MINUTE - entry.count)
    }

    /**
     * Esperar si es necesario (con retry automático)
     */
    async waitIfNeeded(userId: string = 'global'): Promise<void> {
        const canRequest = await this.canMakeRequest(userId)
        
        if (!canRequest) {
            const waitTime = this.getTimeUntilReset(userId)
            console.log(`⏳ Rate limit alcanzado. Esperando ${Math.ceil(waitTime / 1000)}s...`)
            
            await new Promise(resolve => setTimeout(resolve, waitTime + 100))
            
            // Después de esperar, resetear el límite
            this.limits.delete(userId)
        }
    }

    /**
     * Limpiar entradas expiradas (ejecutar periódicamente)
     */
    cleanup(): void {
        const now = Date.now()
        for (const [userId, entry] of this.limits.entries()) {
            if (now > entry.resetTime) {
                this.limits.delete(userId)
            }
        }
    }
}

export const rateLimiter = new RateLimiterService()

// Limpiar entradas expiradas cada 2 minutos
setInterval(() => {
    rateLimiter.cleanup()
}, 2 * 60 * 1000)