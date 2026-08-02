import { Loader2, WifiOff } from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './api/queries';
import { AppShell } from './components/AppShell';
import { ChangePasswordScreen } from './components/ChangePasswordScreen';
import { LoginScreen } from './components/LoginScreen';
import { DashboardView } from './views/DashboardView';
import { EmployeesView } from './views/EmployeesView';

export default function App() {
  const { data: user, isLoading, error } = useSession();

  if (isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center text-slate-400">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <WifiOff className="size-8 text-slate-400" />
        <p className="font-medium">Der Server ist nicht erreichbar.</p>
        <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
          Läuft HÄPPI-Flow auf dem Praxis-Rechner? Ohne den Server kann diese Seite keine Daten
          anzeigen.
        </p>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  // Der erzwungene Wechsel des Startpassworts laesst sich nicht umgehen -
  // es gibt in diesem Zustand keine andere Route.
  if (user.mustChangePassword) {
    return <ChangePasswordScreen />;
  }

  return (
    <Routes>
      <Route element={<AppShell user={user} />}>
        <Route index element={<DashboardView user={user} />} />
        <Route path="mitarbeiter" element={<EmployeesView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
