export const app = {
  getHealth: async (): Promise<{ status: string }> => ({ status: 'ok' }),
};
