import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertBanner, Button, Card, Input } from '../components/ui';
import { ApiClientError, apiRequest } from '../lib/apiClient';
import { useAuthStore } from '../stores/authStore';
import { FarmMembership } from '../types/api';

export function CreateFarmPage() {
  const navigate = useNavigate();
  const updateMemberships = useAuthStore((s) => s.updateMemberships);
  const setActiveFarmId = useAuthStore((s) => s.setActiveFarmId);

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const created = await apiRequest<{ farm: { id: string } }>('/farms', {
        method: 'POST',
        body: { name, location: location.trim() || undefined },
      });

      const list = await apiRequest<{ farms: FarmMembership[] }>('/farms');
      updateMemberships(list.farms);
      setActiveFarmId(created.farm.id);
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Could not create farm. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f9f4] flex flex-col justify-center px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <Card>
          <h1 className="text-xl font-bold text-slate-900">Create Your Dairy Farm</h1>
          <p className="mt-1 text-sm text-slate-600">
            Default timezone is Africa/Nairobi and currency is Kenyan Shillings (KES).
          </p>

          {error && (
            <div className="mt-4">
              <AlertBanner tone="error" message={error} />
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <Input
              label="Farm Name"
              placeholder="e.g. Nyeri Highlands Dairy"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <Input
              label="Location (Optional)"
              placeholder="e.g. Karatina, Nyeri County"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />

            <Button type="submit" loading={loading} className="w-full">
              Create Farm
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
