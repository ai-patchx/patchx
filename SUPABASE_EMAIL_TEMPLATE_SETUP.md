# Supabase Email Template Configuration

## Issue
You're receiving confirmation emails with "Follow this link to confirm your user" instead of verification codes.

## Solution
You need to update your Supabase email templates to use OTP codes instead of confirmation links.

## Steps to Configure

1. **Access Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project

2. **Navigate to Email Templates**
   - Go to **Authentication** → **Email Templates** in the left sidebar

3. **Update the "Confirm Signup" Template**
   - Find the **"Confirm Signup"** template
   - Click **Edit** to modify it

4. **Replace the Template Content**

   **Remove this (old confirmation link template):**
   ```html
   <h2>Confirm your signup</h2>
   <p>Follow this link to confirm your user:</p>
   <p><a href="{{ .ConfirmationURL }}">{{ .ConfirmationURL }}</a></p>
   ```

   **Replace with this (OTP code template):**
   ```html
   <h2>Verify your email</h2>
   <p>Your verification code is:</p>
   <h1 style="font-size: 32px; letter-spacing: 8px; text-align: center; margin: 20px 0;">{{ .Token }}</h1>
   <p>Enter this 8-digit code in the registration form to complete your signup.</p>
   <p><small>This code expires in 5 minutes.</small></p>
   ```

5. **Save the Changes**
   - Click **Save** to apply the new template

## Important Notes

- The `{{ .Token }}` variable contains the 8-digit OTP code
- The `{{ .ConfirmationURL }}` variable is for confirmation links (not needed for OTP flow)
- After updating the template, new registrations will receive verification codes instead of links
- Existing users who already received confirmation links can still use them (backward compatible)

## Testing

After updating the template:
1. Register a new account
2. Check your email - you should receive an 8-digit code
3. Enter the code in the registration modal to verify

## Alternative: Using Magic Link Template

If you want to keep both options, you can also update the "Magic Link" template similarly, but for signup we primarily need the "Confirm Signup" template.
