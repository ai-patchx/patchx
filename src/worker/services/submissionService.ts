import { Env, Submission } from '../types'
import { getKvNamespace, KVLike } from '../kv'
import { generateId } from '../utils'
import { UploadService } from './uploadService'
import { GerritService } from './gerritService'
import { EmailService } from './emailService'
import { GitService } from './gitService'
import { getD1Database, queryD1First } from '../d1'
import type { D1Database } from '@cloudflare/workers-types'

export class SubmissionService {
  private env: Env
  private uploadService: UploadService
  private gerritService: GerritService
  private emailService: EmailService
  private gitService: GitService
  private kv: KVLike

  constructor(env: Env) {
    this.env = env
    this.kv = getKvNamespace(env)
    this.uploadService = new UploadService(env)
    this.gerritService = new GerritService(env)
    this.emailService = new EmailService(env)
    this.gitService = new GitService(env)
  }

  async createSubmission(
    uploadId: string,
    subject: string,
    description: string,
    branch: string,
    model?: string,
    notificationEmails?: string[],
    notificationCc?: string[],
    remoteNodeId?: string,
    gitRepository?: string
  ): Promise<Submission> {
    // Get uploaded file
    const upload = await this.uploadService.getUpload(uploadId)
    if (!upload) {
      throw new Error('Upload file does not exist')
    }

    if (upload.validationStatus === 'invalid') {
      throw new Error(`File validation failed: ${upload.validationError}`)
    }

    const id = generateId()
    const submission: Submission = {
      id,
      uploadId,
      filename: upload.filename,
      project: upload.project,
      subject,
      description,
      branch,
      status: 'pending',
      model,
      notificationEmails: EmailService.normalizeEmails(notificationEmails),
      notificationCc: EmailService.normalizeEmails(notificationCc),
      remoteNodeId,
      gitRepository,
      logs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // Store to KV
    await this.kv.put(`submissions:${id}`, JSON.stringify(submission))

    return submission
  }

  private async addLog(submissionId: string, message: string): Promise<void> {
    try {
      const submission = await this.getSubmission(submissionId)
      if (!submission) {
        console.warn(`[SubmissionService] Cannot add log to non-existent submission ${submissionId}: ${message}`)
        return
      }

      if (!submission.logs) {
        submission.logs = []
      }

      const timestamp = new Date().toLocaleTimeString('en-US')
      submission.logs.push(`[${timestamp}] ${message}`)
      submission.updatedAt = new Date().toISOString()

      await this.kv.put(`submissions:${submissionId}`, JSON.stringify(submission))
    } catch (error) {
      // Log error but don't throw - we don't want log failures to break the submission
      console.error(`[SubmissionService] Failed to add log to submission ${submissionId}:`, error)
      console.error(`[SubmissionService] Log message that failed: ${message}`)
    }
  }

  async submitToGerrit(submissionId: string): Promise<Submission> {
    let submission: Submission | null = null

    try {
      submission = await this.getSubmission(submissionId)
      if (!submission) {
        throw new Error('Submission record does not exist')
      }

      // Update status to processing
      submission.status = 'processing'
      submission.updatedAt = new Date().toISOString()
      if (!submission.logs) {
        submission.logs = []
      }
      // Save initial status immediately so frontend can see it's processing
      await this.kv.put(`submissions:${submissionId}`, JSON.stringify(submission))
      console.log(`[SubmissionService] Saved initial processing status for ${submissionId}`)

      // Add initial logs with error handling - don't throw on log failures
      // Add logs directly to submission object first, then save
      const timestamp = new Date().toLocaleTimeString('en-US')
      submission.logs.push(`[${timestamp}] [Info] Starting submission process...`)
      submission.logs.push(`[${timestamp}] [Info] Submission service initialized`)
      submission.logs.push(`[${timestamp}] [Info] Submission ID: ${submissionId}`)
      submission.logs.push(`[${timestamp}] [Info] Upload ID: ${submission.uploadId}`)
      submission.updatedAt = new Date().toISOString()

      // Save with initial logs immediately
      await this.kv.put(`submissions:${submissionId}`, JSON.stringify(submission))
      console.log(`[SubmissionService] Saved initial logs for ${submissionId}, log count: ${submission.logs.length}`)

      // Now try to add logs using addLog (which will save again, but that's okay)
      // This ensures logs are visible even if addLog has issues
      try {
        await this.addLog(submissionId, '[Info] Logging system initialized')
      } catch (logError) {
        console.error(`[SubmissionService] addLog failed for ${submissionId}, but initial logs are already saved:`, logError)
        // Don't throw - we've already saved the initial logs
      }

      // Log D1 database availability check
      try {
        const db = getD1Database(this.env)
        await this.addLog(submissionId, '[Info] D1 database connection available')
      } catch (dbCheckError) {
        const dbErrorMsg = dbCheckError instanceof Error ? dbCheckError.message : String(dbCheckError)
        await this.addLog(submissionId, `[Warning] D1 database not available: ${dbErrorMsg}`)
        await this.addLog(submissionId, '[Info] Remote node features may be limited')
      }

      try {
        await this.addLog(submissionId, '[Info] Sending notification...')
        await this.sendNotification(submission, 'processing')
        await this.addLog(submissionId, '[Info] Notification sent successfully')
      } catch (notifError) {
        // Non-fatal, just log it
        await this.addLog(submissionId, `[Warning] Failed to send notification: ${notifError instanceof Error ? notifError.message : String(notifError)}`)
      }

      // Get uploaded file content
      await this.addLog(submissionId, `[Info] Retrieving upload with ID: ${submission.uploadId}`)
      const uploadStartTime = Date.now()
      const upload = await this.uploadService.getUpload(submission.uploadId)
      const uploadDuration = Date.now() - uploadStartTime
      await this.addLog(submissionId, `[Info] Upload retrieval completed in ${uploadDuration}ms`)
      if (!upload) {
        await this.addLog(submissionId, `[Error] Upload not found for ID: ${submission.uploadId}`)
        throw new Error('Upload file does not exist')
      }

      await this.addLog(submissionId, `[Success] File uploaded: ${upload.filename}`)

      // If remote node and git repository are specified, execute git commands first
      if (submission.remoteNodeId && submission.gitRepository) {
        await this.addLog(submissionId, '[Info] Remote node and git repository configured - executing git workflow')

        // Check if D1 database is available before proceeding with remote node workflow
        let canUseRemoteNode = false
        try {
          const db = getD1Database(this.env)
          canUseRemoteNode = true
          await this.addLog(submissionId, '[Info] D1 database available for remote node configuration')
        } catch (dbError) {
          const dbErrorMsg = dbError instanceof Error ? dbError.message : String(dbError)
          await this.addLog(submissionId, `[Error] Cannot use remote node: D1 database not available: ${dbErrorMsg}`)
          await this.addLog(submissionId, '[Warning] Skipping git workflow. Will submit directly to Gerrit.')
          canUseRemoteNode = false
        }

        if (canUseRemoteNode) {
          try {
            await this.addLog(submissionId, '[Info] Starting git workflow on remote node...')
            await this.addLog(submissionId, `[Info] Repository: ${submission.gitRepository}`)
            await this.addLog(submissionId, `[Info] Branch: ${submission.branch}`)
            await this.addLog(submissionId, `[Info] Remote Node ID: ${submission.remoteNodeId}`)

            // Get remote node to retrieve workingHome (with timeout)
            let workingHome: string | undefined
            try {
              await this.addLog(submissionId, '[Info] Retrieving remote node configuration...')
              const db = getD1Database(this.env)

            // Add timeout to D1 query (2 seconds - shorter timeout to fail fast)
            const QUERY_TIMEOUT_MS = 2000
            let timeoutId: ReturnType<typeof setTimeout> | null = null
            let queryResolved = false

            // Wrap D1 query in a Promise for proper timeout handling
            const nodeQueryPromise = queryD1First<{ working_home: string | null }>(
              db,
              'SELECT working_home FROM remote_nodes WHERE id = ?',
              [submission.remoteNodeId]
            ).then((node) => {
              if (!queryResolved) {
                queryResolved = true
                if (timeoutId) {
                  clearTimeout(timeoutId)
                  timeoutId = null
                }
                return node
              }
              return null
            }).catch((error) => {
              if (!queryResolved) {
                queryResolved = true
                if (timeoutId) {
                  clearTimeout(timeoutId)
                  timeoutId = null
                }
                throw error
              }
              return null
            })

            const timeoutPromise = new Promise<null>((resolve) => {
              timeoutId = setTimeout(() => {
                if (!queryResolved) {
                  queryResolved = true
                  resolve(null)
                }
              }, QUERY_TIMEOUT_MS)
            })

            const node = await Promise.race([nodeQueryPromise, timeoutPromise])

            // Clean up timeout if query resolved first
            if (timeoutId) {
              clearTimeout(timeoutId)
              timeoutId = null
            }

            if (node) {
              workingHome = node.working_home || undefined
              if (workingHome) {
                await this.addLog(submissionId, `[Info] Using working home from remote node: ${workingHome}`)
              } else {
                await this.addLog(submissionId, '[Info] No working home configured, using default: ~/git-work')
              }
            } else {
              const errorMsg = 'Node not found or query timeout'
              await this.addLog(submissionId, `[Warning] Could not retrieve remote node configuration: ${errorMsg}`)
              await this.addLog(submissionId, `[Debug] This may indicate a database connection issue. Continuing with default working home.`)
            }
          } catch (nodeFetchError) {
            const errorMsg = nodeFetchError instanceof Error ? nodeFetchError.message : String(nodeFetchError)
            await this.addLog(submissionId, `[Warning] Failed to get remote node configuration: ${errorMsg}`)
            await this.addLog(submissionId, `[Info] Continuing with default working home: ~/git-work`)
            // Don't throw - continue with default working home
          }

          await this.addLog(submissionId, '[Info] Step 1: Cloning repository...')
          await this.addLog(submissionId, '[Info] Calling git service executeGitWorkflow...')
          await this.addLog(submissionId, '[Info] This may take several minutes, please wait...')

          // Pass undefined for workDir to let git service use workingHome from node configuration
          // The git service will auto-generate a target directory within the workingHome
          const gitWorkflowPromise = this.gitService.executeGitWorkflow(
            submission.remoteNodeId,
            submission.gitRepository,
            submission.branch,
            upload.content,
            undefined, // Let git service use workingHome from node and auto-generate targetDir
            async (message: string) => {
              await this.addLog(submissionId, message)
            }
          )

          // Add timeout (10 minutes)
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error('Git workflow timed out after 10 minutes'))
            }, 600000) // 10 minutes
          })

          // Pass log callback to git service for real-time logging
          const gitResult = await Promise.race([gitWorkflowPromise, timeoutPromise])

          await this.addLog(submissionId, '[Info] Git workflow execution completed')

          // Debug: Log if we got results
          if (!gitResult.results.clone && !gitResult.results.apply) {
            await this.addLog(submissionId, '[Warning] Git workflow returned no results')
          } else {
            await this.addLog(submissionId, `[Info] Git workflow returned results: clone=${!!gitResult.results.clone}, checkout=${!!gitResult.results.checkout}, apply=${!!gitResult.results.apply}, status=${!!gitResult.results.status}`)
          }

          // Log git clone results (output already logged via callback, but log summary)
          if (gitResult.results.clone) {
            // Log summary and any additional info not captured by callback
            if (gitResult.results.clone.success) {
              // Success already logged by callback
              if (!gitResult.results.clone.output || gitResult.results.clone.output.trim().length === 0) {
                await this.addLog(submissionId, '[Warning] Git clone succeeded but produced no output')
              }
            } else {
              const errorMsg = gitResult.results.clone.error || 'Unknown error'
              const isTimeout = errorMsg.includes('timed out') || errorMsg.includes('timeout')
              // Error already logged by callback, but add timeout warning if needed
              if (isTimeout) {
                await this.addLog(submissionId, '[Warning] Command timed out - this may indicate network issues or the command is taking too long')
              }
            }
          } else {
            await this.addLog(submissionId, '[Error] Git clone did not execute - no result returned')
          }

          // Log checkout results (output already logged via callback)
          if (gitResult.results.checkout) {
            // Summary already logged by callback
            if (!gitResult.results.checkout.success && !gitResult.results.checkout.output) {
              await this.addLog(submissionId, `[Warning] Branch checkout failed with no output: ${gitResult.results.checkout.error || 'Unknown error'}`)
            }
          }

          // Log patch apply results (output already logged via callback)
          if (gitResult.results.apply) {
            // Summary already logged by callback
            if (!gitResult.results.apply.success) {
              const errorMsg = gitResult.results.apply.error || 'Unknown error'
              const isTimeout = errorMsg.includes('timed out') || errorMsg.includes('timeout')
              if (isTimeout) {
                await this.addLog(submissionId, '[Warning] Command timed out - this may indicate network issues or the command is taking too long')
              }
            } else if (!gitResult.results.apply.output || gitResult.results.apply.output.trim().length === 0) {
              await this.addLog(submissionId, '[Info] Patch applied successfully (no output from git apply)')
            }
          }

          // Log status results
          if (gitResult.results.status) {
            if (gitResult.results.status.output) {
              await this.addLog(submissionId, '[Info] Repository status:')
              const lines = gitResult.results.status.output.split('\n').filter(l => l.trim())
              for (const line of lines) {
                await this.addLog(submissionId, `[Git Status] ${line}`)
              }
            }
          }

          if (!gitResult.success) {
            throw new Error(`Git workflow failed: ${gitResult.error || 'Unknown error'}`)
          }

          await this.addLog(submissionId, '[Success] Git workflow completed successfully')
        } catch (gitError) {
          const errorMsg = gitError instanceof Error ? gitError.message : String(gitError)
          const errorStack = gitError instanceof Error ? gitError.stack : undefined
          await this.addLog(submissionId, `[Error] Git workflow failed: ${errorMsg}`)
          if (errorStack) {
            await this.addLog(submissionId, `[Error] Stack trace: ${errorStack}`)
          }
          // Don't throw - continue to Gerrit submission even if git workflow fails
          // The user might still want to submit the patch directly
          await this.addLog(submissionId, '[Warning] Continuing to Gerrit submission despite git workflow failure')
          }
        } else {
          // D1 database not available, skip git workflow
          await this.addLog(submissionId, '[Info] Skipping git workflow due to D1 database unavailability')
        }
      } else {
        // Log if git workflow is not being executed
        await this.addLog(submissionId, '[Info] Git workflow check:')
        if (!submission.remoteNodeId) {
          await this.addLog(submissionId, '[Info] - No remote node selected - skipping git workflow')
        }
        if (!submission.gitRepository) {
          await this.addLog(submissionId, '[Info] - No git repository configured - skipping git workflow')
        }
        if (submission.remoteNodeId && submission.gitRepository) {
          await this.addLog(submissionId, '[Warning] Both remote node and git repository are set, but git workflow was not executed (this should not happen)')
        }
      }

      // Submit to Gerrit (always submit to Gerrit, unless only remote node workflow is desired)
      // For now, we'll submit to Gerrit in all cases
      await this.addLog(submissionId, '[Info] Submitting patch to Gerrit...')
      await this.addLog(submissionId, `[Info] Project: ${submission.project}`)
      await this.addLog(submissionId, `[Info] Subject: ${submission.subject}`)
      await this.addLog(submissionId, '[Info] This may take up to 3 minutes, please wait...')

      // Add timeout wrapper for Gerrit submission (3 minutes total)
      const gerritTimeoutMs = 180000 // 3 minutes
      const gerritSubmissionPromise = this.gerritService.submitToGerrit(
        submission.uploadId,
        submission.subject,
        submission.description,
        submission.branch,
        submission.project,
        upload.content,
        gerritTimeoutMs
      )

      // Add timeout (3 minutes)
      const gerritTimeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Gerrit submission timed out after ${gerritTimeoutMs / 1000} seconds`))
        }, gerritTimeoutMs)
      })

      // Race between submission and timeout
      const gerritResult = await Promise.race([gerritSubmissionPromise, gerritTimeoutPromise])

      await this.addLog(submissionId, `[Success] Patch submitted to Gerrit successfully`)
      await this.addLog(submissionId, `[Success] Change ID: ${gerritResult.changeId}`)
      await this.addLog(submissionId, `[Success] Change URL: ${gerritResult.changeUrl}`)

      // Update submission record
      submission.status = 'completed'
      submission.changeId = gerritResult.changeId
      submission.changeUrl = gerritResult.changeUrl
      submission.updatedAt = new Date().toISOString()

      await this.kv.put(`submissions:${submissionId}`, JSON.stringify(submission))
      await this.sendNotification(submission, 'completed')

      return submission
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Submission failed'
      const errorStack = error instanceof Error ? error.stack : undefined

      console.error(`[SubmissionService] Error processing submission ${submissionId}:`, errorMsg, errorStack)

      // Try to update submission with error, even if addLog fails
      try {
        // Get fresh submission state
        const failedSubmission = await this.getSubmission(submissionId)
        if (failedSubmission) {
          failedSubmission.status = 'failed'
          failedSubmission.error = errorMsg
          failedSubmission.updatedAt = new Date().toISOString()
          if (!failedSubmission.logs) {
            failedSubmission.logs = []
          }
          failedSubmission.logs.push(`[${new Date().toLocaleTimeString('en-US')}] [Error] Submission failed: ${errorMsg}`)
          if (errorStack) {
            failedSubmission.logs.push(`[${new Date().toLocaleTimeString('en-US')}] [Error] Stack: ${errorStack.substring(0, 500)}`)
          }
          await this.kv.put(`submissions:${submissionId}`, JSON.stringify(failedSubmission))

          // Try to send notification (non-blocking)
          try {
            await this.sendNotification(failedSubmission, 'failed')
          } catch (notifError) {
            console.error(`[SubmissionService] Failed to send failure notification for ${submissionId}:`, notifError)
          }
        } else {
          console.error(`[SubmissionService] Could not retrieve submission ${submissionId} to update error status`)
        }
      } catch (updateError) {
        console.error(`[SubmissionService] Failed to update error status for submission ${submissionId}:`, updateError)
      }

      throw error
    }
  }

  async getSubmission(id: string): Promise<Submission | null> {
    const data = await this.kv.get(`submissions:${id}`)
    return data ? JSON.parse(data) : null
  }

  async getSubmissionStatus(id: string): Promise<{
    status: string
    changeId?: string
    changeUrl?: string
    createdAt: string
    error?: string
    logs?: string[]
  }> {
    const submission = await this.getSubmission(id)
    if (!submission) {
      throw new Error('Submission record does not exist')
    }

    // Ensure logs array exists
    if (!submission.logs) {
      submission.logs = []
    }

    // Debug: Log status retrieval (only occasionally to avoid spam)
    const shouldLog = Math.random() < 0.1 // Log 10% of requests
    if (shouldLog) {
      console.log(`[Submission Status] ID: ${id}, Status: ${submission.status}, Logs count: ${submission.logs.length}`)
    }

    return {
      status: submission.status,
      changeId: submission.changeId,
      changeUrl: submission.changeUrl,
      createdAt: submission.createdAt,
      error: submission.error,
      logs: submission.logs
    }
  }

  private async sendNotification(submission: Submission, stage: Submission['status']) {
    try {
      await this.emailService.sendSubmissionStatusEmail(submission, stage)
    } catch (error) {
      console.error('Failed to dispatch email notification:', error)
    }
  }
}