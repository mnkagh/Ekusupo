import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EkusupoRouter } from './router';
import { PlayerProvider } from '../features/playback/PlayerProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PlayerProvider>
        <BrowserRouter>
          <EkusupoRouter />
        </BrowserRouter>
      </PlayerProvider>
    </QueryClientProvider>
  );
}
