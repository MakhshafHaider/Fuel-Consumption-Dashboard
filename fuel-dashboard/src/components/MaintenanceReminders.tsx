"use client";

import { CheckCircle2, Circle, Wrench } from "lucide-react";
import { useState } from "react";

type Priority = "high" | "med" | "low";
type Task = { id: number; text: string; done: boolean; priority: Priority };

const INIT: Task[] = [
  { id:1, text:"Review weekly fuel consumption report",        done:false, priority:"high" },
  { id:2, text:"Approve Truck Alpha-12 maintenance request",   done:false, priority:"high" },
  { id:3, text:"Update fuel price rates for this month",       done:true,  priority:"med"  },
  { id:4, text:"Schedule Bus Delta-21 for service inspection", done:false, priority:"med"  },
  { id:5, text:"Send efficiency report to operations team",    done:false, priority:"low"  },
];

const PRIORITY_COLOR: Record<Priority, string> = {
  high: "#E84040",
  med:  "#F59E0B",
  low:  "#9CA3AF",
};

export default function MaintenanceReminders() {
  const [tasks, setTasks] = useState(INIT);
  const toggle  = (id: number) => setTasks(p => p.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const pending = tasks.filter(t => !t.done).length;

  return (
    <div className="card p-5 anim-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wrench size={15} style={{ color: "#E84040" }} />
          <span className="text-sm font-bold" style={{ color: "#1A1A2E" }}>Reminders</span>
        </div>
        {pending > 0 && <span className="badge-count">{pending}</span>}
      </div>

      <div className="flex flex-col gap-1">
        {tasks.map(task => (
          <button
            key={task.id}
            onClick={() => toggle(task.id)}
            className="list-row flex items-start gap-3 text-left w-full"
          >
            <div className="flex-shrink-0 mt-0.5">
              {task.done
                ? <CheckCircle2 size={16} style={{ color: "#22C55E" }} />
                : <Circle       size={16} style={{ color: "#DCDCDC" }} />
              }
            </div>
            <p
              className="flex-1 text-sm leading-snug"
              style={{
                textDecoration: task.done ? "line-through" : "none",
                color: task.done ? "#9CA3AF" : "#1A1A2E",
                fontWeight: task.done ? 400 : 500,
              }}
            >
              {task.text}
            </p>
            <div
              className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
              style={{ background: PRIORITY_COLOR[task.priority] }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
