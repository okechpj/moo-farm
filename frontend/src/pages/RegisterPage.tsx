import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AlertBanner, Button, Card, Input } from '../components/ui';
import { useT } from '../i18n/translations';
import { ApiClientError, apiRequest } from '../lib/apiClient';
import { useAuthStore } from '../stores/authStore';
import { AuthSessionPayload } from '../types/api';

export function RegisterPage() {
  const t = useT();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [farmName, setFarmName] = useState('');
  const [farmLocation, setFarmLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest<AuthSessionPayload>('/auth/register', {
        method: 'POST',
        skipAuth: true,
        body: {
          fullName,
          phone,
          email: email.trim() || undefined,
          password,
          farmName,
          farmLocation: farmLocation.trim() || undefined,
        },
      });
      setSession(data);
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Could not create account. Please check your details.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f9f4] flex flex-col justify-center px-4 py-8">
      <div className="mx-auto w-full max-w-md space-y-4">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1b6b3a]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Sign In
        </Link>

        <Card>
          <div className="mb-5">
            <h1 className="text-xl font-bold text-slate-900">{t.auth.registerTitle}</h1>
            <p className="mt-1 text-sm text-slate-600">{t.auth.registerSubtitle}</p>
          </div>

          {error && (
            <div className="mb-4">
              <AlertBanner tone="error" message={error} />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t.auth.fullNameLabel}
              placeholder="e.g. Grace Wanjiku"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />

            <Input
              label={t.auth.phoneLabel}
              type="tel"
              placeholder="0712 345 678"
              hint="Kenyan mobile number (07XX or 01XX)."
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />

            <Input
              label={t.auth.emailOptionalLabel}
              type="email"
              placeholder="grace@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <Input
              label={t.auth.passwordLabel}
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />

            <div className="pt-2 border-t border-slate-100 space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Your First Farm
              </p>

              <Input
                label={t.auth.farmNameLabel}
                placeholder="e.g. Kiambu Green Dairy"
                value={farmName}
                onChange={(e) => setFarmName(e.target.value)}
                required
              />

              <Input
                label={t.auth.farmLocationLabel}
                placeholder="e.g. Limuru, Kiambu County"
                value={farmLocation}
                onChange={(e) => setFarmLocation(e.target.value)}
              />
            </div>

            <Button type="submit" loading={loading} className="w-full">
              {t.auth.createAccount}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
