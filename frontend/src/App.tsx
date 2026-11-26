import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './components/AppShell';
import { tryRefreshSession } from './lib/apiClient';
import { CowsPage } from './pages/CowsPage';
import { CreateFarmPage } from './pages/CreateFarmPage';
import { CustomersPage } from './pages/CustomersPage';
import { DashboardPage } from './pages/DashboardPage';
import { JoinFarmPage } from './pages/JoinFarmPage';
import { LoginPage } from './pages/LoginPage';
import { MilkPage } from './pages/MilkPage';
import { RegisterPage } from './pages/RegisterPage';
import { SettingsPage } from './pages/SettingsPage';
import { UpcomingModulePage } from './pages/UpcomingModulePage';
import { useAuthStore } from './stores/authStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);

  if (isBootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f9f4]">
        <div className="text-center space-y-2">
          <img src="/icon.svg" alt="Moo Farm" className="mx-auto h-12 w-12 rounded-2xl" />
          <p className="text-sm font-semibold text-slate-600">Loading Moo Farm...</p>
        </div>
      </div>
    );
  }

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function RequireFarm({ children }: { children: React.ReactNode }) {
  const memberships = useAuthStore((s) => s.memberships);
  const user = useAuthStore((s) => s.user);

  if (memberships.length === 0) {
    if (user?.accountType === 'OWNER') {
      return <Navigate to="/create-farm" replace />;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f9f4] p-4">
        <div className="max-w-md rounded-2xl bg-white p-6 border border-slate-200 text-center space-y-2">
          <h1 className="text-lg font-bold text-slate-900">No Active Farm Access</h1>
          <p className="text-sm text-slate-600">
            Your access may have been suspended or you have not been assigned to a farm yet. Please contact your farm owner.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function App() {
  const setOnline = useAuthStore((s) => s.setOnline);
  const setBootstrapping = useAuthStore((s) => s.setBootstrapping);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    tryRefreshSession().finally(() => {
      setBootstrapping(false);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline, setBootstrapping]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/join" element={<JoinFarmPage />} />

          <Route
            path="/create-farm"
            element={
              <RequireAuth>
                <CreateFarmPage />
              </RequireAuth>
            }
          />

          <Route
            element={
              <RequireAuth>
                <RequireFarm>
                  <AppShell />
                </RequireFarm>
              </RequireAuth>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/cows" element={<CowsPage />} />
            <Route path="/milk" element={<MilkPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route
              path="/health"
              element={
                <UpcomingModulePage
                  title="Animal Health & Check-Ins"
                  phase="Phase 3 — Health & Farm Monitoring"
                  description="Daily cow mood check-ins, vaccinations, illness logs, and milk withdrawal tracking."
                  requiredPermission="health.view"
                />
              }
            />
            <Route
              path="/expenses"
              element={
                <UpcomingModulePage
                  title="Expenses & Finances"
                  phase="Phase 3 — Health & Farm Monitoring"
                  description="Track farm expenses, milk revenue, cash flow, and cost per litre in KES."
                  requiredPermission="expenses.view"
                />
              }
            />
            <Route
              path="/feed"
              element={
                <UpcomingModulePage
                  title="Feed Management"
                  phase="Phase 4 — Analytics & Farm Operations"
                  description="Track daily feeding logs, feed stock inventory, and low-stock alerts."
                  requiredPermission="feed.view"
                />
              }
            />
            <Route
              path="/reports"
              element={
                <UpcomingModulePage
                  title="Reports & Exports"
                  phase="Phase 4 & 6 — Analytics & Exports"
                  description="Generate milk, customer, financial, and health reports with PDF and Excel export."
                  requiredPermission="reports.view"
                />
              }
            />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
