import { createContext } from "react";
import type { AuthUser } from "@/lib/api";

export type AuthValue = {
  user: AuthUser | null;
  loading: boolean;
  logoutPending: boolean;
  logoutError: string | null;
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};
export const AuthContext = createContext<AuthValue | null>(null);
