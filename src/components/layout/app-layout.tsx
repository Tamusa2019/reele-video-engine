'use client';

import { useAppStore } from '@/lib/store';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { CreateProjectView } from '@/components/create-project/create-project-view';
import { ProjectDetailView } from '@/components/project-detail/project-detail-view';
import { VideoHistoryView } from '@/components/video-history/video-history-view';
import { BrandKitsView } from '@/components/brand-kits/brand-kits-view';
import { TemplatesView } from '@/components/templates/templates-view';
import { SettingsView } from '@/components/settings/settings-view';
import { ThemeProvider } from 'next-themes';
import { QueryProvider } from '@/lib/query-provider';

function ViewRenderer() {
  const { currentView } = useAppStore();

  switch (currentView) {
    case 'dashboard':
      return <DashboardView />;
    case 'create':
      return <CreateProjectView />;
    case 'project-detail':
      return <ProjectDetailView />;
    case 'history':
      return <VideoHistoryView />;
    case 'brand-kits':
      return <BrandKitsView />;
    case 'templates':
      return <TemplatesView />;
    case 'settings':
      return <SettingsView />;
    case 'admin':
      return <DashboardView />;
    default:
      return <DashboardView />;
  }
}

export function AppLayout() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <QueryProvider>
        <div className="flex h-screen overflow-hidden bg-background">
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto custom-scrollbar">
              <ViewRenderer />
            </main>
          </div>
        </div>
      </QueryProvider>
    </ThemeProvider>
  );
}
