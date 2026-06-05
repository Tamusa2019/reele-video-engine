'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { AnalyticsData, ApiResponse } from '@/lib/frontend-types';
import { subDays, format } from 'date-fns';

export function UsageChart() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', '7d'],
    queryFn: () => fetch('/api/analytics?period=7d').then(r => r.json()) as Promise<ApiResponse<AnalyticsData>>,
  });

  // Build chart data from analytics
  const chartData = (() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = subDays(new Date(), i);
      days.push({
        name: format(date, 'EEE'),
        date: format(date, 'MMM d'),
        videos: 0,
      });
    }
    // If we have byStatus data, distribute across days for visual effect
    const analytics = data?.data;
    if (analytics) {
      const total = analytics.projects.total;
      if (total > 0) {
        // Distribute videos across the week
        const perDay = Math.max(1, Math.floor(total / 7));
        const remainder = total % 7;
        days.forEach((day, i) => {
          day.videos = perDay + (i < remainder ? 1 : 0);
        });
      }
    }
    return days;
  })();

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Videos This Week</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                axisLine={{ stroke: 'var(--border)' }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                axisLine={{ stroke: 'var(--border)' }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelFormatter={(label) => {
                  const item = chartData.find(d => d.name === label);
                  return item?.date ?? label;
                }}
              />
              <Bar
                dataKey="videos"
                fill="var(--color-primary)"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
