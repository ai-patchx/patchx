import { Env, Submission } from '../types'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i

type SubmissionStage = Submission['status']

const STATUS_COPY: Record<SubmissionStage, { title: string; description: string }> = {
  pending: {
    title: 'Submission received',
    description: 'We have recorded your patch and will start processing shortly.'
  },
  processing: {
    title: 'Submission is processing',
    description: 'Your patch is being uploaded to AOSP Gerrit. We will send another update once it completes.'
  },
  completed: {
    title: 'Submission completed',
    description: 'Your patch was successfully submitted to AOSP Gerrit.'
  },
  failed: {
    title: 'Submission failed',
    description: 'We were unable to submit your patch to AOSP Gerrit.'
  }
}

export class EmailService {
  constructor(private env: Env) {}

  static normalizeEmails(emails?: string[] | null): string[] {
    if (!Array.isArray(emails)) {
      return []
    }
    const unique = new Set(
      emails
        .map(email => email?.trim().toLowerCase())
        .filter((email): email is string => !!email && EMAIL_REGEX.test(email))
    )
    return Array.from(unique)
  }

  async sendSubmissionStatusEmail(submission: Submission, stage: SubmissionStage): Promise<boolean> {
    const recipients = EmailService.normalizeEmails(submission.notificationEmails)
    if (!recipients.length) {
      return false
    }

    if (!this.env.MAILCHANNELS_FROM_EMAIL) {
      console.warn('Email notification skipped: MAILCHANNELS_FROM_EMAIL is not configured')
      return false
    }

    const ccRecipients = EmailService.normalizeEmails(submission.notificationCc).filter(
      email => !recipients.includes(email)
    )

    const statusInfo = STATUS_COPY[stage]
    const statusPageBase = this.env.VITE_PUBLIC_SITE_URL?.replace(/\/$/, '')
    const statusPageUrl = statusPageBase ? `${statusPageBase}/status/${submission.id}` : undefined

    const plainText = this.buildPlainText(submission, stage, statusInfo.description, statusPageUrl)
    const html = this.buildHtml(submission, stage, statusInfo.description, statusPageUrl)

    const personalization: Record<string, unknown> = {
      to: recipients.map(email => ({ email })),
      headers: {
        'X-Entity-Ref-ID': submission.id
      }
    }

    if (ccRecipients.length) {
      personalization.cc = ccRecipients.map(email => ({ email }))
    }

    const payload = {
      personalizations: [personalization],
      from: {
        email: this.env.MAILCHANNELS_FROM_EMAIL,
        name: this.env.MAILCHANNELS_FROM_NAME || 'PatchX Notifications'
      },
      subject: `[PatchX] ${statusInfo.title}: ${submission.subject}`,
      content: [
        { type: 'text/plain', value: plainText },
        { type: 'text/html', value: html }
      ],
      ...(this.env.MAILCHANNELS_REPLY_TO_EMAIL
        ? {
            reply_to: {
              email: this.env.MAILCHANNELS_REPLY_TO_EMAIL,
              name: this.env.MAILCHANNELS_FROM_NAME || 'PatchX Notifications'
            }
          }
        : {})
    }

    try {
      const endpoint = this.env.MAILCHANNELS_API_ENDPOINT || 'https://api.mailchannels.net/tx/v1/send'
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }

      // Add API key if configured (for MailChannels paid plans)
      if (this.env.MAILCHANNELS_API_KEY) {
        headers['Authorization'] = `Bearer ${this.env.MAILCHANNELS_API_KEY}`
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Failed to send submission notification:', response.status, errorText)
        return false
      }

      return true
    } catch (error) {
      console.error('Unexpected error while sending submission notification:', error)
      return false
    }
  }

  private buildPlainText(
    submission: Submission,
    stage: SubmissionStage,
    description: string,
    statusPageUrl?: string
  ): string {
    const lines = [
      description,
      '',
      `Submission ID: ${submission.id}`,
      `Project: ${submission.project}`,
      `Branch: ${submission.branch}`,
      `Subject: ${submission.subject}`,
      `Status: ${stage}`
    ]

    if (submission.changeId) {
      lines.push(`Change ID: ${submission.changeId}`)
    }

    if (submission.changeUrl) {
      lines.push(`Gerrit Change: ${submission.changeUrl}`)
    }

    if (submission.error) {
      lines.push('', `Error: ${submission.error}`)
    }

    if (statusPageUrl) {
      lines.push('', `View live status: ${statusPageUrl}`)
    }

    lines.push('', 'This is an automated message from PatchX.')

    return lines.join('\n')
  }

  private buildHtml(
    submission: Submission,
    stage: SubmissionStage,
    description: string,
    statusPageUrl?: string
  ): string {
    const statusColor = stage === 'completed' ? '#16a34a' : stage === 'failed' ? '#dc2626' : '#2563eb'

    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: ${statusColor}; margin-bottom: 8px;">${description}</h2>
        <p style="margin-bottom: 16px;">Here are the latest details of your submission:</p>
        <table style="border-collapse: collapse; width: 100%; max-width: 560px;">
          <tbody>
            ${this.buildRow('Submission ID', submission.id)}
            ${this.buildRow('Project', submission.project)}
            ${this.buildRow('Branch', submission.branch)}
            ${this.buildRow('Subject', submission.subject)}
            ${this.buildRow('Status', stage)}
            ${submission.changeId ? this.buildRow('Change ID', submission.changeId) : ''}
            ${submission.changeUrl
              ? this.buildRow(
                  'Gerrit Change',
                  `<a href="${this.escapeHtml(submission.changeUrl)}" target="_blank">${this.escapeHtml(
                    submission.changeUrl
                  )}</a>`,
                  { isHtml: true }
                )
              : ''}
            ${submission.error ? this.buildRow('Error', submission.error) : ''}
          </tbody>
        </table>
        ${
          statusPageUrl
            ? `<p style="margin-top: 16px;">
                View live status:
                <a href="${statusPageUrl}" target="_blank">${statusPageUrl}</a>
              </p>`
            : ''
        }
        <p style="margin-top: 24px; color: #64748b; font-size: 12px;">
          This email was sent automatically by PatchX.
        </p>
      </div>
    `
  }

  private buildRow(label: string, value: string, options?: { isHtml?: boolean }): string {
    return `
      <tr>
        <td style="padding: 6px 8px; font-weight: bold; color: #475569; width: 140px;">${this.escapeHtml(label)}</td>
        <td style="padding: 6px 8px; color: #0f172a;">${options?.isHtml ? value : this.escapeHtml(value)}</td>
      </tr>
    `
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, char => {
      switch (char) {
        case '&':
          return '&amp;'
        case '<':
          return '&lt;'
        case '>':
          return '&gt;'
        case '"':
          return '&quot;'
        case "'":
          return '&#39;'
        default:
          return char
      }
    })
  }
}

export const isValidEmail = (email: string): boolean => EMAIL_REGEX.test(email.trim().toLowerCase())

