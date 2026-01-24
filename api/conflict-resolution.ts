import { EnhancedConflictResolutionService } from '../src/worker/services/enhancedConflictResolutionService'
import type { ConflictResolutionRequest } from '../src/worker/services/enhancedConflictResolutionService'
import type { Env } from '../src/worker/types'

export const config = {
  runtime: 'edge',
}

export default async function handler(req: Request, env: Env) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const body = await req.json() as ConflictResolutionRequest & {
      action: 'analyze' | 'resolve' | 'validate' | 'auto-resolve'
      resolutions?: Record<number, {
        type: 'original' | 'incoming' | 'custom'
        content: string
      }>
    }

    const service = new EnhancedConflictResolutionService(env)

    switch (body.action) {
      case 'analyze': {
        // Perform three-way diff analysis
        const threeWayDiff = service.performThreeWayDiff(
          body.originalCode,
          body.incomingCode,
          body.currentCode
        )

        return new Response(JSON.stringify({
          success: true,
          data: {
            threeWayDiff,
            conflictCount: threeWayDiff.conflicts.length,
            hasConflicts: threeWayDiff.conflicts.length > 0
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      case 'resolve': {
        // Apply conflict resolution
        if (!body.resolutions) {
          return new Response(JSON.stringify({
            error: 'Resolutions are required for resolve action'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          })
        }

        const threeWayDiff = service.performThreeWayDiff(
          body.originalCode,
          body.incomingCode,
          body.currentCode
        )

        const resolvedCode = service.applyConflictResolution(threeWayDiff, body.resolutions)

        // Validate resolution result
        const validation = service.validateResolution(
          resolvedCode,
          body.originalCode,
          body.incomingCode
        )

        // Generate report
        const report = service.generateResolutionReport(
          threeWayDiff,
          body.resolutions,
          validation
        )

        return new Response(JSON.stringify({
          success: true,
          data: {
            resolvedCode,
            validation,
            report,
            conflictCount: threeWayDiff.conflicts.length,
            resolvedCount: Object.keys(body.resolutions).length
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      case 'validate': {
        // Validate resolution result
        const resolvedCode = body.currentCode // Assume current code is resolved
        const validation = service.validateResolution(
          resolvedCode,
          body.originalCode,
          body.incomingCode
        )

        return new Response(JSON.stringify({
          success: true,
          data: {
            validation,
            isValid: validation.isValid,
            issues: validation.issues,
            warnings: validation.warnings,
            suggestions: validation.suggestions
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      case 'auto-resolve': {
        // Auto-resolve simple conflicts
        const threeWayDiff = service.performThreeWayDiff(
          body.originalCode,
          body.incomingCode,
          body.currentCode
        )

        const autoResolution = service.autoResolveSimpleConflicts(threeWayDiff)

        if (autoResolution.resolved) {
          const resolvedCode = service.applyConflictResolution(
            threeWayDiff,
            autoResolution.resolutions
          )

          const validation = service.validateResolution(
            resolvedCode,
            body.originalCode,
            body.incomingCode
          )

          return new Response(JSON.stringify({
            success: true,
            data: {
              autoResolved: true,
              resolvedCode,
              resolutions: autoResolution.resolutions,
              explanation: autoResolution.explanation,
              validation,
              resolvedCount: Object.keys(autoResolution.resolutions).length
            }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        } else {
          return new Response(JSON.stringify({
            success: true,
            data: {
              autoResolved: false,
              message: 'No simple conflicts can be auto-resolved',
              explanation: autoResolution.explanation
            }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        }
      }

      default:
        return new Response(JSON.stringify({
          error: 'Invalid action. Supported actions: analyze, resolve, validate, auto-resolve'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
    }
  } catch (error) {
    console.error('Conflict resolution error:', error)
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}