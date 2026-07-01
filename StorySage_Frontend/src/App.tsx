import { lazy, Suspense, type ReactNode } from 'react';
import { ConfigProvider, Spin, theme } from 'antd';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import { useAuthStore } from './stores/authStore';

const ChatPage = lazy(() => import('./components/chat/ChatPage'));
const Login = lazy(() => import('./components/user/Login'));
const Register = lazy(() => import('./components/user/Register'));
const Home = lazy(() => import('./components/Home'));
const Header = lazy(() => import('./components/layout/Header'));
const BiographyPage = lazy(() => import('./components/biography/BiographyPage'));
const AdminPage = lazy(() => import('./components/admin/AdminPage'));

function RouteFallback() {
  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-[#f4f8ec]">
      <Spin size="large" />
    </div>
  );
}

function App() {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);

  const AuthenticatedLayout = ({ children }: { children: ReactNode }) => (
    <div className="flex flex-col h-screen">
      <Header />
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#10805a',
          colorLink: '#10805a',
          colorSuccess: '#2f9b69',
          colorInfo: '#10805a',
          colorBgBase: '#f4f8ec',
          colorTextBase: '#17352b',
          borderRadius: 16,
          fontFamily: 'Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif',
        },
        components: {
          Button: {
            controlHeightLG: 46,
            borderRadius: 999,
            fontWeight: 700,
          },
          Card: {
            borderRadiusLG: 28,
          },
          Input: {
            borderRadiusLG: 18,
          },
        },
      }}
    >
      <div className="w-full h-full">
        <Router>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/" element={
                isAuthenticated ? (
                  <AuthenticatedLayout>
                    <Home />
                  </AuthenticatedLayout>
                ) : <Navigate to="/login" />
              } />
              <Route path="/chat" element={
                isAuthenticated ? (
                  <AuthenticatedLayout>
                    <ChatPage />
                  </AuthenticatedLayout>
                ) : <Navigate to="/login" />
              } />
              <Route path="/user_chat" element={
                isAuthenticated ? (
                  <AuthenticatedLayout>
                    <ChatPage />
                  </AuthenticatedLayout>
                ) : <Navigate to="/login" />
              } />
              <Route path="/biography" element={
                isAuthenticated ? (
                  <AuthenticatedLayout>
                    <BiographyPage />
                  </AuthenticatedLayout>
                ) : <Navigate to="/login" />
              } />
            </Routes>
          </Suspense>
        </Router>
      </div>
    </ConfigProvider>
  );
}

export default App;
