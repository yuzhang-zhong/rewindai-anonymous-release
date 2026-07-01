import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Define the baseline accounts prefix constant
const BASELINE_ACCOUNTS_PREFIX = "1m2kl5";
export type StudyGroup = "blank" | "contrast" | "experiment" | "anonymous";

interface AuthState {
  userId: string | null;
  token: string | null;
  studyGroup: StudyGroup;
  isAuthenticated: boolean;
  login: (userId: string, token: string, studyGroup?: StudyGroup) => void;
  setStudyGroup: (studyGroup: StudyGroup) => void;
  logout: () => void;
  isBaselineUser: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      userId: null,
      token: null,
      studyGroup: "experiment",
      isAuthenticated: false,
      login: (userId, token, studyGroup = "experiment") => set({ 
        userId, 
        token,
        studyGroup,
        isAuthenticated: true 
      }),
      setStudyGroup: (studyGroup) => set({ studyGroup }),
      logout: () => {
        set({ 
          userId: null, 
          token: null,
          studyGroup: "experiment",
          isAuthenticated: false 
        });
      },
      isBaselineUser: () => {
        const { userId } = get();
        if (!userId) return false;
        return userId.startsWith(BASELINE_ACCOUNTS_PREFIX);
      },
    }),
    {
      name: 'auth-storage',
    }
  )
); 
