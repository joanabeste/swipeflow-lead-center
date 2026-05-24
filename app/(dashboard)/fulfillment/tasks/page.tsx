import { loadAllTasks } from "@/lib/fulfillment/data";
import { TasksView } from "./_components/tasks-view";

export default async function TasksPage() {
  const tasks = await loadAllTasks();
  return <TasksView tasks={tasks} />;
}
