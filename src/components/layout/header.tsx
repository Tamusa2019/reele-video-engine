'use client';

import { useAppStore } from '@/lib/store';
import { useQuery } from '@tanstack/react-query';
import { Moon, Sun, Menu, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useTheme } from 'next-themes';
import type { CreditsData, ApiResponse } from '@/lib/frontend-types';

export function Header() {
  const { toggleSidebar } = useAppStore();
  const { theme, setTheme } = useTheme();

  const { data: creditsData } = useQuery({
    queryKey: ['credits'],
    queryFn: () => fetch('/api/credits').then(r => r.json()) as Promise<ApiResponse<CreditsData>>,
  });

  const credits = creditsData?.data?.credits ?? 0;
  const userName = creditsData?.data?.name ?? 'Demo User';

  return (
    <header className="h-16 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-30 flex items-center justify-between px-4 lg:px-6">
      {/* Left */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <div className="hidden sm:block">
          <h2 className="text-sm font-medium text-muted-foreground">Reele Video Engine</h2>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Credits */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 text-accent">
          <Coins className="w-4 h-4" />
          <span className="text-sm font-semibold">{credits}</span>
          <span className="text-xs opacity-80">credits</span>
        </div>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="h-9 w-9"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* User Avatar */}
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
            {userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
