"use client";

import { useState, useEffect } from "react";
import { useTaskManager } from "@/hooks/useTaskManager";
import { Button } from "@/components/ui/button";
import TaskList from "@/components/TaskList";
import { CreateTaskForm } from "@/components/CreateTaskForm";
import { PlusCircle, ClipboardList } from "lucide-react";
import { createBrowserClient } from '@supabase/ssr';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function Dashboard() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [lastModified, setLastModified] = useState<string | null>(null);
  const { createTask, refreshTasks, tasks, deleteTask, toggleTaskComplete } =
    useTaskManager();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchLastModified = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("dashboard_last_modified")
        .eq("user_id", session.user.id)
        .single();

      if (error) throw error;
      setLastModified(data?.dashboard_last_modified || null);
    } catch (error) {
      console.error("Error fetching last modified:", error);
    }
  };

  useEffect(() => {
    fetchLastModified();

    // Subscribe to real-time updates for the profile
    const setupSubscription = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return null;

      const channel = supabase
        .channel(`profile-changes-${session.user.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "profiles",
            filter: `user_id=eq.${session.user.id}`,
          },
          (payload) => {
            const newTimestamp = payload.new.dashboard_last_modified;
            if (newTimestamp) {
              setLastModified(newTimestamp);
            }
          }
        )
        .subscribe();

      return channel;
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    setupSubscription().then((ch) => {
      channel = ch;
    });

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const handleCreateTask = async (title: string, description: string) => {
    await createTask(title, description);
    await refreshTasks();
    // Fallback: fetch after a short delay in case real-time doesn't work
    setTimeout(() => fetchLastModified(), 500);
    console.log(`New Task Created: ${title}`);
    setIsDialogOpen(false);
  };

  const handleDeleteTask = async (taskId: string) => {
    await deleteTask(taskId);
    // Fallback: fetch after a short delay in case real-time doesn't work
    setTimeout(() => fetchLastModified(), 500);
  };

  const handleToggleComplete = async (taskId: string, completed: boolean) => {
    await toggleTaskComplete(taskId, completed);
    // Fallback: fetch after a short delay in case real-time doesn't work
    setTimeout(() => fetchLastModified(), 500);
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Your Tasks</h1>
          <p className="text-sm text-gray-600 mt-1">
            Last modified: {formatDateTime(lastModified)}
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
              <DialogDescription>
                Enter the details for your new task below.
              </DialogDescription>
            </DialogHeader>
            <CreateTaskForm onSubmit={handleCreateTask} />
          </DialogContent>
        </Dialog>
      </div>
      {tasks.length > 0 ? (
        <div className="border rounded-md">
          <TaskList
            tasks={tasks}
            onDelete={handleDeleteTask}
            onToggleComplete={handleToggleComplete}
          />
        </div>
      ) : (
        <div className="border rounded-md p-8 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-gray-400 mb-4" />
          <p className="text-gray-500">Create a Task to get started.</p>
        </div>
      )}
    </div>
  );
}
