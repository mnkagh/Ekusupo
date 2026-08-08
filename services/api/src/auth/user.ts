export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

/** What a route handler gets back — never the hash. */
export type PublicUser = Omit<User, "passwordHash">;

export function toPublicUser(user: User): PublicUser {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}
