import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getSupabaseClient } from '@/lib/supabase'
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
        const supabase = await getSupabaseClient()

        // First, check URL hash for Supabase callback (most common format)
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const hashError = hashParams.get('error')
        const hashErrorCode = hashParams.get('error_code')
        const hashErrorDescription = hashParams.get('error_description')
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const hashType = hashParams.get('type')

        // Check query parameters for errors
        const queryError = searchParams.get('error')
        const queryErrorCode = searchParams.get('error_code')
        const queryErrorDescription = searchParams.get('error_description')

        // Handle errors (check hash first, then query params)
        const error = hashError || queryError
        const errorCode = hashErrorCode || queryErrorCode
        const errorDescription = hashErrorDescription || queryErrorDescription

        if (error) {
          // Handle error cases
          if (errorCode === 'otp_expired') {
            setStatus('error')
            setMessage('The confirmation link has expired. Please register again or request a new confirmation email.')
          } else if (errorCode === 'token_not_found') {
            setStatus('error')
            setMessage('Invalid confirmation link. Please check your email and try again.')
          } else {
            setStatus('error')
            setMessage(errorDescription
              ? decodeURIComponent(errorDescription.replace(/\+/g, ' '))
              : 'Email confirmation failed. Please try again.')
          }
          return
        }

        // If we have tokens in the hash, set the session (Supabase's standard flow)
        if (accessToken && refreshToken) {
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })

          if (sessionError) {
            throw sessionError
          }

          if (data.user) {
            setStatus('success')
            setMessage('Email confirmed successfully! Redirecting...')
            await checkUser()
            setTimeout(() => {
              navigate('/submit')
            }, 2000)
            return
          }
        }

        // Check for token and type in query parameters (alternative flow)
        const token = searchParams.get('token')
        const type = searchParams.get('type') || hashType

        if (token && type === 'signup') {
          // Verify the email with the token
          const { data, error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: 'signup'
          })

          if (verifyError) {
            throw verifyError
          }

          if (data.user) {
            setStatus('success')
            setMessage('Email confirmed successfully! Redirecting...')
            await checkUser()
            setTimeout(() => {
              navigate('/submit')
            }, 2000)
            return
          }
        }

        // If no tokens found, check if user is already confirmed
        const { data: { user } } = await supabase.auth.getUser()
        if (user && user.email_confirmed_at) {
          setStatus('success')
          setMessage('Your email is already confirmed. Redirecting...')
          await checkUser()
          setTimeout(() => {
            navigate('/submit')
          }, 2000)
        } else {
          setStatus('error')
          setMessage('Invalid confirmation link. Please check your email for the correct link.')
        }
      } catch (error) {
        console.error('Email confirmation error:', error)
        setStatus('error')
        const errorMessage = error instanceof Error ? error.message : 'Failed to confirm email'
        if (errorMessage.includes('expired') || errorMessage.includes('invalid')) {
          setMessage('The confirmation link has expired or is invalid. Please register again.')
        } else {
          setMessage(`Email confirmation failed: ${errorMessage}`)
        }
      }
    }

    handleConfirmation()
  }, [searchParams, navigate, checkUser])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-dark px-4">
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
              Go to Login
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
                Go to Login
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

