import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { apiError } from '../api/client';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const [sessionConflict, setSessionConflict] = useState(false);
  const [pendingCreds, setPendingCreds]       = useState<{ username: string; password: string } | null>(null);
  const [forceLoading, setForceLoading]       = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(username, password);
      navigate(user.mustChangePwd ? '/change-password' : '/members', { replace: true });
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409 &&
          err.response.data?.error === 'SESSION_ACTIVE') {
        setPendingCreds({ username, password });
        setSessionConflict(true);
      } else {
        setError(apiError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForceLogin = async () => {
    if (!pendingCreds) return;
    setForceLoading(true);
    try {
      const user = await login(pendingCreds.username, pendingCreds.password, true);
      navigate(user.mustChangePwd ? '/change-password' : '/members', { replace: true });
    } catch (err) {
      setSessionConflict(false);
      setPendingCreds(null);
      setError(apiError(err));
    } finally {
      setForceLoading(false);
    }
  };

  const handleCancelForce = () => {
    setSessionConflict(false);
    setPendingCreds(null);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center px-16 text-white"
        style={{ background: 'linear-gradient(145deg, #1B2D6B 0%, #0f1e4a 100%)' }}
      >
        <img src="/logo.png" alt="Leisure Holidays" className="w-80 mb-10 drop-shadow-lg" />
        <p className="text-2xl font-light tracking-widest text-amber-400 text-center uppercase">
          Discover The World
        </p>
        <p className="text-2xl font-light tracking-widest text-amber-400 text-center uppercase mb-8">
          Discover Yourself
        </p>
        <p className="text-sm text-blue-200 text-center max-w-xs leading-relaxed">
          Member Management System — internal staff portal
        </p>
      </div>

      {/* Right panel — login form */}
      <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 px-6 py-12">
        {/* Logo for small screens */}
        <div className="lg:hidden mb-8 flex flex-col items-center">
          <img src="/logo.png" alt="Leisure Holidays" className="w-56 mb-3" />
          <p className="text-sm font-semibold tracking-widest text-amber-600 uppercase text-center">
            Discover The World · Discover Yourself
          </p>
        </div>

        <div className="w-full max-w-sm">
          <h2 className="mb-2 text-2xl font-bold text-gray-800">Welcome back</h2>
          <p className="mb-8 text-sm text-gray-500">Sign in to your account to continue</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            {error && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
                {error}
              </div>
            )}
            <Button
              type="submit"
              loading={loading}
              className="w-full justify-center"
              size="lg"
              style={{ backgroundColor: '#1B2D6B' } as React.CSSProperties}
            >
              Sign in
            </Button>
          </form>

          <p className="mt-10 text-center text-xs text-gray-400">
            © {new Date().getFullYear()} Leisure Holidays Bhd. All rights reserved.
          </p>
        </div>
      </div>

      <Modal
        open={sessionConflict}
        title="Active Session Detected"
        onClose={handleCancelForce}
        size="sm"
      >
        <p className="text-sm text-gray-600 mb-5">
          You are already logged in from another browser or device.
          Do you want to end that session and log in here?
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={handleCancelForce} disabled={forceLoading}>
            No, stay on login
          </Button>
          <Button variant="danger" loading={forceLoading} onClick={handleForceLogin}>
            Yes, end other session
          </Button>
        </div>
      </Modal>
    </div>
  );
}
