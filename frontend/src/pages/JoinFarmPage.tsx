import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AlertBanner, Button, Card, Input } from '../components/ui';
import { useT } from '../i18n/translations';
import { ApiClientError, apiRequest } from '../lib/apiClient';
import { useAuthStore } from '../stores/authStore';
import { AuthSessionPayload } from '../types/api';

export function JoinFarmPage() {
  const t = useT();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const [phone, setPhone] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest<AuthSessionPayload>('/auth/invitations/accept', {
        method: 'POST',
        skipAuth: true,
        body: { phone, inviteCode, fullName, password },
      });
      setSession(data);
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Could not accept invitation. Please check the phone number and invite code.',
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
            <h1 className="text-xl font-bold text-slate-900">{t.auth.joinTitle}</h1>
            <p className="mt-1 text-sm text-slate-600">{t.auth.joinSubtitle}</p>
          </div>

          {error && (
            <div className="mb-4">
              <AlertBanner tone="error" message={error} />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t.auth.phoneLabel}
              type="tel"
              placeholder="0712 345 678"
              hint="Use the exact phone number the farm owner invited."
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />

            <Input
              label={t.auth.inviteCodeLabel}
              type="text"
              placeholder="XXXX-XXXX"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              className="font-mono tracking-widest uppercase"
              required
            />

            <Input
              label={t.auth.fullNameLabel}
              placeholder="e.g. Peter Kamau"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />

            <Input
              label={t.auth.passwordLabel}
              type="password"
              placeholder="Choose a password (8+ characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />

            <Button type="submit" loading={loading} className="w-full">
              {t.auth.joinFarm}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
