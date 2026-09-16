import React, { useState } from 'react';
import {
  X,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  Check,
  AlertCircle,
  Shield,
  MapPin,
  Moon,
  KeyRound
} from 'lucide-react';
import { AuthUser } from '../types';
import { authService, DEMO_USERS } from '../services/authService';

interface LoginPageProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: AuthUser) => void;
  initialMode?: 'signin' | 'signup';
}

export const LoginPage: React.FC<LoginPageProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  initialMode = 'signin'
}) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode);

  // Sign In fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Sign Up fields
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [bio, setBio] = useState('');
  const [region, setRegion] = useState('Bhubaneswar area');
  const [nearbyConsent, setNearbyConsent] = useState(true);

  // Forgot password fields
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetSentMessage, setResetSentMessage] = useState<string | null>(null);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  if (!isOpen) return null;

  // Password strength calculation
  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return 0;
    let score = 0;
    if (pwd.length >= 6) score++;
    if (pwd.length >= 10) score++;
    if (/[A-Z]/.test(pwd) || /[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return score;
  };

  const passwordStrength = getPasswordStrength(signupPassword);

  // Handle Real Email Sign In with Supabase Auth
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const result = await authService.loginWithEmail(email, password);
      setIsLoading(false);

      if (result.success && result.user) {
        setSuccessMessage(`Welcome back, ${result.user.name}`);
        setTimeout(() => {
          onLoginSuccess(result.user!);
          onClose();
        }, 500);
      } else {
        setError(result.error || 'Failed to authenticate.');
      }
    } catch (err: any) {
      setIsLoading(false);
      setError(err.message || 'An unexpected error occurred during sign-in.');
    }
  };

  // Handle Real Email Registration with Supabase Auth
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const result = await authService.signupWithEmail({
        name,
        handle,
        email: signupEmail,
        password: signupPassword,
        bio,
        region,
        nearbyOptIn: nearbyConsent
      });
      setIsLoading(false);

      if (result.success) {
        if (result.user) {
          setSuccessMessage(
            result.message || `Account created! Welcome to SIIMR, ${result.user.name}`
          );
          setTimeout(() => {
            onLoginSuccess(result.user!);
            onClose();
          }, 600);
        } else {
          // Email confirmation is required, session is null: do NOT call onLoginSuccess
          setSuccessMessage(
            result.message || 'Account created! Please check your email to confirm your account before signing in.'
          );
        }
      } else {
        setError(result.error || 'Could not create account.');
      }
    } catch (err: any) {
      setIsLoading(false);
      setError(err.message || 'Registration failed.');
    }
  };

  // Handle Real Google Sign-In with Supabase Auth OAuth
  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccessMessage(null);
    setIsGoogleLoading(true);

    try {
      const result = await authService.loginWithGoogle();
      setIsGoogleLoading(false);

      if (!result.success) {
        setError(result.error || 'Google authentication could not be completed.');
      } else if (result.url) {
        setSuccessMessage('Redirecting to Google authentication...');
        window.location.href = result.url;
      }
    } catch (err: any) {
      setIsGoogleLoading(false);
      setError(err.message || 'Google authentication encountered an error.');
    }
  };

  // Handle Quick Demo Persona Switch (Development / Testing Only)
  const handleSelectDemoUser = (user: typeof DEMO_USERS[0]) => {
    setError(null);
    const switched = authService.switchDemoAccount(user.id);
    if (switched) {
      setSuccessMessage(`Loaded preview: ${switched.name} (${switched.handle})`);
      setTimeout(() => {
        onLoginSuccess(switched);
        onClose();
      }, 350);
    }
  };

  // Handle Guest Explorer
  const handleContinueAsGuest = async () => {
    const guest = await authService.logout();
    setSuccessMessage('Continuing as Guest Wanderer');
    setTimeout(() => {
      onLoginSuccess(guest);
      onClose();
    }, 350);
  };

  // Handle Forgot Password with Supabase Auth
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const res = await authService.sendPasswordReset(forgotEmail);
    setIsLoading(false);

    if (res.success) {
      setResetSentMessage(res.message);
    } else {
      setError(res.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in select-none">
      <div className="bg-[#FAF8F5] w-full max-w-md rounded-3xl shadow-2xl border border-white/70 max-h-[92vh] flex flex-col overflow-hidden relative font-sans-ui">
        
        {/* Header */}
        <div className="pt-5 px-6 pb-3 bg-[#FAF8F5] border-b border-[#1A1C23]/8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#5438FF]/10 text-[#5438FF] flex items-center justify-center shadow-xs">
              <Moon className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-serif-dream font-bold text-base text-[#1A1C23] tracking-tight">
                  siimr
                </span>
                <span className="text-[10px] bg-[#5438FF]/10 text-[#5438FF] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
                  <Shield className="w-2.5 h-2.5" />
                  Supabase Auth
                </span>
              </div>
              <p className="text-[11px] text-[#1A1C23]/60 leading-none mt-0.5">
                Cloud Identity & Nocturnal Archive
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#1A1C23]/5 flex items-center justify-center text-[#1A1C23] hover:bg-[#1A1C23]/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher: Sign In vs Create Account */}
        {mode !== 'forgot' && (
          <div className="flex border-b border-[#1A1C23]/8 bg-[#F3EFEA] px-6 pt-2">
            <button
              onClick={() => {
                setMode('signin');
                setError(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 pb-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 text-center ${
                mode === 'signin'
                  ? 'border-[#5438FF] text-[#5438FF]'
                  : 'border-transparent text-[#1A1C23]/50 hover:text-[#1A1C23]'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setMode('signup');
                setError(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 pb-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 text-center ${
                mode === 'signup'
                  ? 'border-[#5438FF] text-[#5438FF]'
                  : 'border-transparent text-[#1A1C23]/50 hover:text-[#1A1C23]'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">

          {/* Feedback Messages */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <div className="leading-snug">{error}</div>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 animate-in fade-in">
              <Check className="w-4 h-4 shrink-0 text-emerald-600" />
              <span className="font-semibold">{successMessage}</span>
            </div>
          )}

          {/* Social Auth: Continue with Google */}
          {mode !== 'forgot' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading || isLoading}
                className="w-full py-2.5 px-4 bg-white hover:bg-stone-50 active:scale-[0.99] border border-[#1A1C23]/15 text-[#1A1C23] rounded-xl font-bold text-xs flex items-center justify-center gap-2.5 transition-all shadow-xs disabled:opacity-60"
              >
                {isGoogleLoading ? (
                  <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-[#5438FF] border-t-transparent" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.94 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                )}
                <span>Continue with Google</span>
              </button>

              <div className="flex items-center gap-2">
                <div className="h-px bg-[#1A1C23]/10 flex-1" />
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#1A1C23]/40">
                  {mode === 'signin' ? 'Or continue with Email' : 'Or register with Email'}
                </span>
                <div className="h-px bg-[#1A1C23]/10 flex-1" />
              </div>
            </div>
          )}

          {/* 1. SIGN IN MODE */}
          {mode === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#1A1C23]/70 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#1A1C23]/40">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="dreamer@example.com"
                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-[#1A1C23]/15 rounded-xl text-xs text-[#1A1C23] placeholder-[#1A1C23]/40 focus:outline-hidden focus:border-[#5438FF] focus:ring-1 focus:ring-[#5438FF]"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#1A1C23]/70">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setError(null);
                      setForgotEmail(email);
                    }}
                    className="text-[11px] text-[#5438FF] hover:underline font-medium"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#1A1C23]/40">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2.5 bg-white border border-[#1A1C23]/15 rounded-xl text-xs text-[#1A1C23] placeholder-[#1A1C23]/40 focus:outline-hidden focus:border-[#5438FF] focus:ring-1 focus:ring-[#5438FF]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#1A1C23]/40 hover:text-[#1A1C23]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-[#5438FF] hover:bg-[#4326f5] active:scale-[0.99] text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-[#5438FF]/20 disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* 2. SIGN UP MODE */}
          {mode === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#1A1C23]/70 mb-1">
                  Full Name / Display Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sylvan Vance"
                  className="w-full px-3 py-2 bg-white border border-[#1A1C23]/15 rounded-xl text-xs text-[#1A1C23] placeholder-[#1A1C23]/40 focus:outline-hidden focus:border-[#5438FF]"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#1A1C23]/70 mb-1">
                  Dream Handle
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-mono text-[#5438FF] font-bold">
                    @
                  </span>
                  <input
                    type="text"
                    value={handle.replace(/^@/, '')}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="somnambulist"
                    className="w-full pl-7 pr-3 py-2 bg-white border border-[#1A1C23]/15 rounded-xl text-xs text-[#1A1C23] font-mono placeholder-[#1A1C23]/40 focus:outline-hidden focus:border-[#5438FF]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#1A1C23]/70 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#1A1C23]/40">
                    <Mail className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="dreamer@example.com"
                    className="w-full pl-8 pr-3 py-2 bg-white border border-[#1A1C23]/15 rounded-xl text-xs text-[#1A1C23] placeholder-[#1A1C23]/40 focus:outline-hidden focus:border-[#5438FF]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#1A1C23]/70 mb-1">
                  Create Password
                </label>
                <input
                  type="password"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full px-3 py-2 bg-white border border-[#1A1C23]/15 rounded-xl text-xs text-[#1A1C23] placeholder-[#1A1C23]/40 focus:outline-hidden focus:border-[#5438FF]"
                  required
                />
                {/* Strength Meter */}
                {signupPassword.length > 0 && (
                  <div className="mt-1.5 flex items-center gap-1">
                    {[1, 2, 3, 4].map((step) => (
                      <div
                        key={step}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          passwordStrength >= step
                            ? passwordStrength >= 3
                              ? 'bg-emerald-500'
                              : 'bg-amber-400'
                            : 'bg-zinc-200'
                        }`}
                      />
                    ))}
                    <span className="text-[10px] text-[#1A1C23]/50 ml-1">
                      {passwordStrength >= 3 ? 'Strong' : 'Moderate'}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#1A1C23]/70 mb-1">
                  Region (For Last Night Radar)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#1A1C23]/40">
                    <MapPin className="w-3.5 h-3.5" />
                  </div>
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-white border border-[#1A1C23]/15 rounded-xl text-xs text-[#1A1C23] focus:outline-hidden focus:border-[#5438FF]"
                  >
                    <option value="Bhubaneswar area">Bhubaneswar area</option>
                    <option value="Kyoto metro">Kyoto metro</option>
                    <option value="London / Greenwich">London / Greenwich</option>
                    <option value="Pacific Northwest">Pacific Northwest</option>
                    <option value="Berlin metro">Berlin metro</option>
                    <option value="Unlisted Private">Unlisted / Hidden</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#1A1C23]/70 mb-1">
                  Personal Intention / Bio
                </label>
                <input
                  type="text"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="e.g. Lucid explorer & recurring motif archivist"
                  className="w-full px-3 py-2 bg-white border border-[#1A1C23]/15 rounded-xl text-xs text-[#1A1C23] placeholder-[#1A1C23]/40 focus:outline-hidden focus:border-[#5438FF]"
                />
              </div>

              <div className="p-3 bg-white rounded-xl border border-[#1A1C23]/10 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[#1A1C23]/80">
                  <input
                    type="checkbox"
                    checked={nearbyConsent}
                    onChange={(e) => setNearbyConsent(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-[#5438FF] focus:ring-[#5438FF]"
                  />
                  <div className="text-[11px] leading-tight">
                    <span className="font-bold text-[#1A1C23]">Opt-in to Last Night Nearby radar</span>
                    <p className="text-[#1A1C23]/60 mt-0.5">
                      Contributes anonymized motifs without exposing exact timestamps or coordinates.
                    </p>
                  </div>
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-[#5438FF] hover:bg-[#4326f5] active:scale-[0.99] text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-[#5438FF]/20 disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <span>Create Account</span>
                    <Sparkles className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* 3. FORGOT PASSWORD MODE */}
          {mode === 'forgot' && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <div className="w-10 h-10 rounded-full bg-[#5438FF]/10 text-[#5438FF] mx-auto flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h3 className="font-serif-dream font-bold text-base text-[#1A1C23]">
                  Reset Password
                </h3>
                <p className="text-xs text-[#1A1C23]/60 max-w-xs mx-auto">
                  Enter your email address to receive a secure password reset link via Supabase Auth.
                </p>
              </div>

              {resetSentMessage ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs space-y-3">
                  <div className="flex items-center gap-2 font-bold text-emerald-800">
                    <Check className="w-4 h-4" />
                    <span>Reset Email Sent</span>
                  </div>
                  <p>{resetSentMessage}</p>
                  <button
                    onClick={() => {
                      setMode('signin');
                      setResetSentMessage(null);
                    }}
                    className="w-full py-2 bg-emerald-700 text-white rounded-xl font-bold text-xs hover:bg-emerald-800 transition-colors"
                  >
                    Return to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#1A1C23]/70 mb-1">
                      Account Email
                    </label>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="dreamer@example.com"
                      className="w-full px-3 py-2.5 bg-white border border-[#1A1C23]/15 rounded-xl text-xs text-[#1A1C23] focus:outline-hidden focus:border-[#5438FF]"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 bg-[#5438FF] text-white rounded-xl font-bold text-xs hover:bg-[#4326f5] transition-colors disabled:opacity-50"
                  >
                    {isLoading ? 'Sending...' : 'Send Reset Link'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode('signin')}
                    className="w-full py-2 text-xs font-semibold text-[#1A1C23]/70 hover:text-[#1A1C23] text-center block"
                  >
                    Back to Sign In
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Development / Testing Persona Switcher */}
          <div className="pt-2 border-t border-[#1A1C23]/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#1A1C23]/50">
                Testing Personas (Development Preview)
              </span>
              <span className="text-[10px] text-[#5438FF] font-semibold">
                Preview Only
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {DEMO_USERS.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleSelectDemoUser(user)}
                  className="p-2 bg-white hover:bg-[#F3EFEA] border border-[#1A1C23]/10 rounded-xl text-left transition-colors flex items-center gap-2 group"
                >
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-7 h-7 rounded-full object-cover border border-[#1A1C23]/10"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-[#1A1C23] truncate group-hover:text-[#5438FF]">
                      {user.name}
                    </div>
                    <div className="text-[10px] text-[#1A1C23]/50 truncate">
                      {user.handle}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Continue as Guest option */}
            <button
              type="button"
              onClick={handleContinueAsGuest}
              className="w-full py-2 text-center text-xs text-[#1A1C23]/60 hover:text-[#1A1C23] font-medium transition-colors"
            >
              Or explore as <span className="underline font-bold">Guest Wanderer</span> without signing in
            </button>
          </div>

        </div>

        {/* Footer info */}
        <div className="px-6 py-2.5 bg-[#F3EFEA] border-t border-[#1A1C23]/8 flex items-center justify-between text-[10px] text-[#1A1C23]/60">
          <span className="flex items-center gap-1 font-medium">
            <Shield className="w-3 h-3 text-[#5438FF]" />
            Supabase Auth & Cloud Identity
          </span>
          <span className="font-mono text-[9px] text-[#1A1C23]/40">Production Vault</span>
        </div>

      </div>
    </div>
  );
};
