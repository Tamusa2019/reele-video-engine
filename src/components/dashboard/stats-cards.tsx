'use client';

import { useQuery } from '@tanstack/react-query';
import { Video, Coins, Calendar, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { AnalyticsData, ApiResponse, CreditsData } from '@/lib/frontend-types';

export function StatsCards() {
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/analytics?period=30d').then(r => r.json()) as Promise<ApiResponse<AnalyticsData>>,
  });

  const { data: creditsData, isLoading: creditsLoading } = useQuery({
    queryKey: ['credits'],
    queryFn: () => fetch('/api/credits').then(r => r.json()) as Promise<ApiResponse<CreditsData>>,
  });

  const analytics = analyticsData?.data;
  const credits = creditsData?.data;

  const stats = [
    {
      title: 'Total Videos',
      value: analytics?.projects.total ?? 0,
      icon: Video,
      description: 'All time videos generated',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    },
    {
      title: 'Credits Remaining',
      value: credits?.credits ?? 0,
      icon: Coins,
      description: `of ${credits?.plan === 'pro' ? '50' : '10'} plan credits`,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
    },
    {
      title: 'This Month',
      value: analytics?.projects.completed ?? 0,
      icon: Calendar,
      description: `${analytics?.projects.successRate ?? 0}% success rate`,
      color: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-950/30',
    },
    {
      title: 'Avg Render Time',
      value: analytics?.workflows.avgGenerationTimeMs
        ? `${(analytics.workflows.avgGenerationTimeMs / 1000).toFixed(1)}s`
        : '0s',
      icon: Clock,
      description: 'Average generation time',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    },
  ];

  const isLoading = analyticsLoading || creditsLoading;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title} className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <Icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
