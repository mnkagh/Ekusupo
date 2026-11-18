import { useQuery } from '@tanstack/react-query';

export interface AuthUser {
  id: string;
  email: string;
}

export function useAuth() {
  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      if (!response.ok) return { user: null };
      return response.json() as Promise<{ user: AuthUser | null }>;
    },
    staleTime: 30_000,
  });

  return {
    user: data?.user ?? null,
    isGuest: !data?.user,
  };
}
