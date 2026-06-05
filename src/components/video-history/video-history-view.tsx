'use client';

import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/lib/store';
import { useState, useMemo } from 'react';
import { ProjectCard } from './project-card';
import { FiltersBar } from './filters-bar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PlusCircle, Play } from 'lucide-react';
import type { Project, ApiResponse, PLATFORM_LABELS, STATUS_COLORS } from '@/lib/frontend-types';
import { PLATFORM_LABELS as plLabels, STATUS_COLORS as stColors } from '@/lib/frontend-types';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

export function VideoHistoryView() {
  const { setView, selectProject } = useAppStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => fetch('/api/projects?limit=50').then(r => r.json()) as Promise<ApiResponse<{ projects: Project[] }>>,
  });

  const allProjects = data?.data?.projects ?? [];

  // Client-side filtering
  const filteredProjects = useMemo(() => {
    let result = allProjects;

    if (search) {
      const lowerSearch = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(lowerSearch) ||
          p.topic.toLowerCase().includes(lowerSearch)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter((p) => p.status === statusFilter);
    }

    if (platformFilter !== 'all') {
      result = result.filter((p) => p.platform === platformFilter);
    }

    return result;
  }, [allProjects, search, statusFilter, platformFilter]);

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Video History</h2>
        <Button
          onClick={() => setView('create')}
          className="bg-accent hover:bg-accent/90 text-accent-foreground"
        >
          <PlusCircle className="w-4 h-4 mr-2" />
          New Video
        </Button>
      </div>

      <FiltersBar
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        platformFilter={platformFilter}
        onPlatformFilterChange={setPlatformFilter}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="border-0 shadow-sm">
              <Skeleton className="h-40 rounded-t-lg" />
              <CardContent className="p-4">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Play className="w-8 h-8 text-muted-foreground" />
            </div>
            <h4 className="font-medium mb-1">No videos found</h4>
            <p className="text-sm text-muted-foreground mb-4">
              {search || statusFilter !== 'all' || platformFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first video to get started'}
            </p>
            <Button
              onClick={() => setView('create')}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              Create Video
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {filteredProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </motion.div>
      ) : (
        <Card className="border-0 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProjects.map((project) => (
                <TableRow
                  key={project.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => selectProject(project.id)}
                >
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {project.title}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {plLabels[project.platform as keyof typeof plLabels] ?? project.platform}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${stColors[project.status as keyof typeof stColors] ?? ''}`}>
                      {project.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{project.duration}s</TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(project.createdAt), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectProject(project.id);
                      }}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
