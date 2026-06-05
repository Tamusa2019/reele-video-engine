'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { User, Coins, Key, Sliders, AlertTriangle, Lock } from 'lucide-react';
import type { CreditsData, ApiResponse } from '@/lib/frontend-types';
import { format } from 'date-fns';

export function SettingsView() {
  const { data: creditsData, isLoading } = useQuery({
    queryKey: ['credits'],
    queryFn: () => fetch('/api/credits').then(r => r.json()) as Promise<ApiResponse<CreditsData>>,
  });

  const credits = creditsData?.data;
  const usage = credits?.recentUsage ?? [];

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account, credits, and preferences
        </p>
      </div>

      {/* Profile Section */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="w-4 h-4" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={credits?.name ?? 'Demo User'} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={credits?.email ?? 'demo@reele.app'} disabled />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Profile information is managed by your authentication provider
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Credits Section */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="w-4 h-4" />
            Credits
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <>
              <div className="flex items-center justify-between p-4 rounded-lg bg-accent/10">
                <div>
                  <p className="text-sm text-muted-foreground">Current Balance</p>
                  <p className="text-3xl font-bold text-accent">{credits?.credits ?? 0}</p>
                </div>
                <div className="text-right">
                  <Badge variant="secondary" className="capitalize">
                    {credits?.plan ?? 'free'} plan
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    {credits?.totalCreditsUsed ?? 0} total used
                  </p>
                </div>
              </div>

              {/* Usage History */}
              {usage.length > 0 && (
                <>
                  <h4 className="text-sm font-medium pt-2">Recent Usage</h4>
                  <div className="max-h-64 overflow-y-auto custom-scrollbar">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Action</TableHead>
                          <TableHead>Credits</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usage.map((record) => (
                          <TableRow key={record.id}>
                            <TableCell className="text-sm">
                              {record.action.replace(/_/g, ' ')}
                            </TableCell>
                            <TableCell>
                              <span className="text-accent font-medium">
                                -{record.creditsUsed}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {format(new Date(record.createdAt), 'MMM d, h:mm a')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* API Keys Section */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="w-4 h-4" />
            API Keys
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-center">
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-muted">
              <Lock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                API Key management coming soon
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preferences Section */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sliders className="w-4 h-4" />
            Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Default Language</Label>
              <Select defaultValue="en">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ar">Arabic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default Platform</Label>
              <Select defaultValue="instagram_reels">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="facebook_reels">Facebook Reels</SelectItem>
                  <SelectItem value="instagram_reels">Instagram Reels</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="youtube_shorts">YouTube Shorts</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default Duration</Label>
              <Select defaultValue="30">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 seconds</SelectItem>
                  <SelectItem value="30">30 seconds</SelectItem>
                  <SelectItem value="45">45 seconds</SelectItem>
                  <SelectItem value="60">60 seconds</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-0 shadow-sm border-t-2 border-t-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <AlertTriangle className="w-4 h-4" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Delete Account</p>
              <p className="text-xs text-muted-foreground">
                Permanently delete your account and all data
              </p>
            </div>
            <Button variant="outline" disabled className="text-destructive">
              Coming Soon
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
