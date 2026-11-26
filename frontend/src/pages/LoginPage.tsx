import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Phone, ShieldCheck } from 'lucide-react';
import { AlertBanner, Button, Card, Input } from '../components/ui';
import { useT } from '../i18n/translations';
import { ApiClientError, apiRequest } from '../lib/apiClient';
import { useAuthStore } from '../stores/authStore';
import { AuthSessionPayload } from '../types/api';

export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const locale = useAuthStore((s) => s.locale);
  const setLocale = useAuthStore((s) => s.setLocale);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest<AuthSessionPayload>('/auth/login', {
        method: 'POST',
        skipAuth: true,
        body: { identifier, password },
      });
      setSession(data);
      navigate(data.memberships.length > 0 ? '/' : '/create-farm', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Could not sign in. Please check your details and try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f9f4] flex flex-col justify-center px-4 py-8">
      <div className="mx-auto w-full max-w-md space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/icon.svg" alt="Moo Farm" className="h-12 w-12 rounded-2xl shadow-xs" />
            <div>
              <h1 className="text-2xl font-extrabold text-[#1b6b3a]">{t.appName}</h1>
              <p className="text-xs text-slate-600">{t.tagline}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLocale(locale === 'en' ? 'sw' : 'en')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700"
          >
            {locale === 'en' ? 'Kiswahili' : 'English'}
          </button>
        </div>

        <Card>
          <div className="mb-5">
            <h2 className="text-xl font-bold text-slate-900">{t.auth.loginTitle}</h2>
            <p className="mt-1 text-sm text-slate-600">{t.auth.loginSubtitle}</p>
          </div>

          {error && (
            <div className="mb-4">
              <AlertBanner tone="error" message={error} />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t.auth.identifierLabel}
              type="text"
              autoComplete="username"
              placeholder="0712 345 678"
              hint="Assistants sign in with their phone number (e.g. 0712345678)."
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />

            <Input
              label={t.auth.passwordLabel}
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <Button type="submit" loading={loading} className="w-full">
              {t.auth.signIn}
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 space-y-3">
            <Link
              to="/register"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#e6f2ea] px-4 py-3 text-sm font-bold text-[#14532d] hover:bg-[#d4eadb]"
            >
              <ShieldCheck className="h-4 w-4" />
              New Farm Owner? Create Account
            </Link>

            <Link
              to="/join"
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
            >
              <Phone className="h-4 w-4" />
              Have an Invite Code? Join as Farm Assistant
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
