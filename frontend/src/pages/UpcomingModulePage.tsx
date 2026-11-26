import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Badge, Card } from '../components/ui';
import { useAuthStore } from '../stores/authStore';

interface UpcomingModulePageProps {
  title: string;
  phase: string;
  description: string;
  requiredPermission: string;
}

export function UpcomingModulePage({
  title,
  phase,
  description,
  requiredPermission,
}: UpcomingModulePageProps) {
  const hasPermission = useAuthStore((s) => s.hasPermission(requiredPermission));

  if (!hasPermission) {
    return (
      <Card className="text-center py-10 space-y-3">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Access Restricted</h1>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          Your current farm role does not have permission to open <strong>{title}</strong>.
        </p>
        <div className="pt-2">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-[#1b6b3a] px-5 py-2.5 text-sm font-bold text-white"
          >
            Back to Dashboard
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <Badge tone="blue">{phase}</Badge>
      <h1 className="text-2xl font-extrabold text-slate-900">{title}</h1>
      <p className="text-sm text-slate-600">{description}</p>
      <div className="pt-2">
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-xl bg-[#e6f2ea] px-4 py-2.5 text-sm font-bold text-[#14532d]"
        >
          Return to Dashboard
        </Link>
      </div>
    </Card>
  );
}
