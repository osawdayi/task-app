"use client";

import { useState, useEffect, useCallback } from "react";
import { useTaskManager } from "@/hooks/useTaskManager";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import TaskList from "@/components/TaskList";
import { CreateTaskForm } from "@/components/CreateTaskForm";
import { PlusCircle, ClipboardList } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createBrowserClient } from "@supabase/ssr";
import { format } from "date-fns";

export default function Dashboard() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [lastModified, setLastModified] = useState<Date | null>(null);
  const { createTask, refreshTasks, tasks, deleteTask, toggleTaskComplete } =
    useTaskManager();
  const { session } = useAuth();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Fetch dashboard last modified timestamp
  const fetchLastModified = useCallback(async () => {
    if (!session?.user) return;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("dashboard_last_modified")
        .eq("user_id", session.user.id)
        .single();

      if (error) throw error;
      if (data?.dashboard_last_modified) {
        setLastModified(new Date(data.dashboard_last_modified));
      }
    } catch (error: any) {
      console.error("Error fetching dashboard last modified:", error);
    }
  }, [session, supabase]);

  useEffect(() => {
    fetchLastModified();
  }, [fetchLastModified, tasks]);

  // Refresh timestamp when page becomes visible (e.g., when navigating back)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchLastModified();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchLastModified]);

  const handleCreateTask = async (title: string, description: string) => {
    await createTask(title, description);
    await refreshTasks();
    console.log(`New Task Created: ${title}`);
    setIsDialogOpen(false);
    // Refresh last modified timestamp
    await fetchLastModified();
  };

  const handleDeleteTask = async (taskId: string) => {
    await deleteTask(taskId);
    await fetchLastModified();
  };

  const handleToggleComplete = async (taskId: string, completed: boolean) => {
    await toggleTaskComplete(taskId, completed);
    await fetchLastModified();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Your Tasks</h1>
          {lastModified && (
            <p className="text-sm text-muted-foreground mt-1">
              Last modified: {format(lastModified, "PPpp")}
            </p>
          )}
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
