import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'

export default function EmailConfirmationPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { checkUser } = useAuthStore()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Verifying your email...')

  useEffect(() => {
    const handleConfirmation = async () => {
      try {
        // NOTE: Email confirmation is not available after migrating from Supabase to D1.
        // Authentication system needs to be reimplemented.
        setStatus('error')
        setMessage(
          'Email confirmation is not available. Authentication system needs to be reimplemented after D1 migration. ' +
          'Please use Worker authentication (username/password) instead.'
        )
      } catch (error) {
        console.error('Email confirmation error:', error)
        setStatus('error')
        const errorMessage = error instanceof Error ? error.message : 'Failed to confirm email'
        setMessage(`Email confirmation failed: ${errorMessage}`)
      }
    }

    handleConfirmation()
  }, [searchParams, navigate, checkUser])

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-16 h-16 mx-auto mb-4 text-blue-600 animate-spin" />
            <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
              Verifying Email
            </h2>
            <p className="text-gray-600 dark:text-gray-300">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-600" />
            <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
              Email Confirmed!
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">{message}</p>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Go to Sign in
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-16 h-16 mx-auto mb-4 text-red-600" />
            <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
              Confirmation Failed
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">{message}</p>
            <div className="space-y-2">
              <button
                onClick={() => navigate('/')}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Go to Sign in
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Try Again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

