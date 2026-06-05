'use client';

import { StatsCards } from './stats-cards';
import { RecentProjects } from './recent-projects';
import { UsageChart } from './usage-chart';
import { Button } from '@/components/ui/button';
import { PlusCircle, Zap } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { motion } from 'framer-motion';

export function DashboardView() {
  const { setView } = useAppStore();

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      {/* Quick Action Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground p-6">
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Create a New Video
              </h2>
              <p className="text-sm text-primary-foreground/80 mt-1">
                Generate AI-powered reels in minutes with your brand and style
              </p>
            </div>
            <Button
              onClick={() => setView('create')}
              className="bg-accent hover:bg-accent/90 text-accent-foreground font-medium"
              size="lg"
            >
              <PlusCircle className="w-5 h-5 mr-2" />
              Create Video
            </Button>
          </div>
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-1/2 w-24 h-24 bg-white/5 rounded-full translate-y-1/2" />
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <StatsCards />
      </motion.div>

      {/* Chart + Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <UsageChart />
      </motion.div>

      {/* Recent Projects */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        <RecentProjects />
      </motion.div>
    </div>
  );
}
