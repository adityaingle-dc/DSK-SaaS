import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ValuationList from './pages/ValuationList.jsx';
import ValuationForm from './pages/ValuationForm.jsx';
import ValuationView from './pages/ValuationView.jsx';
import Team from './pages/Team.jsx';
import TeamMember from './pages/TeamMember.jsx';
import Activity from './pages/Activity.jsx';
import Customers from './pages/Customers.jsx';
import CustomerView from './pages/CustomerView.jsx';
import Reports from './pages/Reports.jsx';
import GenerateReport from './pages/GenerateReport.jsx';
import StoredReport from './report/StoredReport.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import ReportPage from './report/ReportPage.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <div className="center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  // accounts created / reset by the superadmin must set their own password first
  if (user.mustChangePassword && pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  return children;
}

function SuperadminOnly({ children }) {
  const { isSuperadmin } = useAuth();
  return isSuperadmin ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="valuations" element={<ValuationList />} />
        <Route path="valuations/new" element={<SuperadminOnly><ValuationForm /></SuperadminOnly>} />
        <Route path="valuations/:id" element={<ValuationView />} />
        <Route path="valuations/:id/edit" element={<ValuationForm />} />
        <Route path="valuations/:id/report" element={<SuperadminOnly><ReportPage /></SuperadminOnly>} />
        <Route path="change-password" element={<ChangePassword />} />
        <Route path="team" element={<SuperadminOnly><Team /></SuperadminOnly>} />
        <Route path="team/:id" element={<SuperadminOnly><TeamMember /></SuperadminOnly>} />
        <Route path="activity" element={<SuperadminOnly><Activity /></SuperadminOnly>} />
        <Route path="customers" element={<SuperadminOnly><Customers /></SuperadminOnly>} />
        <Route path="customers/:id" element={<SuperadminOnly><CustomerView /></SuperadminOnly>} />
        <Route path="reports" element={<SuperadminOnly><Reports /></SuperadminOnly>} />
        <Route path="reports/new" element={<SuperadminOnly><GenerateReport /></SuperadminOnly>} />
        <Route path="reports/:id" element={<SuperadminOnly><StoredReport /></SuperadminOnly>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
