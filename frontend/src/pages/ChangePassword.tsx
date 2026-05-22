import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../api/auth';
import { apiError } from '../api/client';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function ChangePassword() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPwd !== confirm) { setError('Passwords do not match'); return; }
    setError('');
    setLoading(true);
    try {
      await authApi.changePassword({ currentPassword: user?.mustChangePwd ? undefined : current, newPassword: newPwd });
      await refresh();
      navigate('/members', { replace: true });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white">Change Password</h1>
          <p className="mt-1 text-slate-400 text-sm">
            {user?.mustChangePwd ? 'You must set a new password before continuing.' : 'Update your password.'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="rounded-xl bg-white p-8 shadow-2xl space-y-4">
          {!user?.mustChangePwd && (
            <Input label="Current password" type="password" value={current} onChange={e => setCurrent(e.target.value)} required />
          )}
          <Input label="New password" type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} required
            placeholder="Min 8 chars, 1 number, 1 special char" />
          <Input label="Confirm new password" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">{error}</div>}
          <Button type="submit" loading={loading} className="w-full justify-center">Set new password</Button>
        </form>
      </div>
    </div>
  );
}
