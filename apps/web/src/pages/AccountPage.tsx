import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function AccountPage() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () =>
      fetch('/api/auth/me', { credentials: 'include' }).then((r) =>
        r.ok ? r.json() : { user: null },
      ),
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const register = useMutation({
    mutationFn: () => apiRegister(email, password),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });
  const login = useMutation({
    mutationFn: () => apiLogin(email, password),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });
  const logout = useMutation({
    mutationFn: apiLogout,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });

  return (
    <div>
      <h1>Account</h1>
      {me?.user ? (
        <div className="card" style={{ marginTop: 24 }}>
          <p>Signed in as {me.user.email}</p>
          <button onClick={() => logout.mutate()}>Sign out</button>
        </div>
      ) : (
        <div className="card" style={{ display: 'grid', gap: 12, marginTop: 24, maxWidth: 420 }}>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            type="email"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            type="password"
          />
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => register.mutate()}>Create account</button>
            <button onClick={() => login.mutate()}>Sign in</button>
          </div>
          <p style={{ color: 'var(--foreground-secondary)', fontSize: 14 }}>
            Guest mode remains available without an account.
          </p>
        </div>
      )}
    </div>
  );
}

async function apiRegister(email: string, password: string) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function apiLogin(email: string, password: string) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function apiLogout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}
