import { create } from 'zustand';

export type AppView = 'dashboard' | 'create' | 'project-detail' | 'history' | 'brand-kits' | 'templates' | 'settings' | 'admin';

interface AppState {
  currentView: AppView;
  selectedProjectId: string | null;
  sidebarOpen: boolean;
  selectedTemplateId: string | null;

  setView: (view: AppView) => void;
  selectProject: (id: string) => void;
  toggleSidebar: () => void;
  setSelectedTemplateId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'dashboard',
  selectedProjectId: null,
  sidebarOpen: true,
  selectedTemplateId: null,

  setView: (view) => set({ currentView: view, selectedProjectId: view !== 'project-detail' ? null : undefined }),
  selectProject: (id) => set({ selectedProjectId: id, currentView: 'project-detail' }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSelectedTemplateId: (id) => set({ selectedTemplateId: id }),
}));
