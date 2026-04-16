"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { fmtDateDisplay, toLocalMidnight } from "@/lib/dateUtils";

interface Props {
  className?: string;
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const toMidnight = (iso: string) => toLocalMidnight(iso);
const fmtDisplay  = (iso: string) => fmtDateDisplay(iso);

export default function DateRangePicker({
  className,
  from,
  to,
  onFromChange,
  onToChange,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [selecting, setSelecting] = useState<"from" | "to">("from");
  const [hovered, setHovered] = useState<Date | null>(null);

  const fromDate = toMidnight(from);
  const toDate = toMidnight(to);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate dropdown position when opening
  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const dropdownWidth = 320;
      const padding = 16;
      
      // Center the dropdown below the button
      const buttonCenter = rect.left + rect.width / 2;
      let leftPos = buttonCenter - dropdownWidth / 2;
      
      // Ensure it doesn't go off the left side of screen
      leftPos = Math.max(padding, leftPos);
      
      // Ensure it doesn't go off the right side of screen
      leftPos = Math.min(leftPos, window.innerWidth - dropdownWidth - padding);
      
      setDropdownPos({
        top: rect.bottom + 8,
        left: leftPos,
      });
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSelecting("from");
        setHovered(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  }

  function handleDayClick(day: Date) {
    const iso = day.toISOString();

    if (selecting === "from") {
      onFromChange(iso);
      if (day >= toDate) onToChange(iso);
      setSelecting("to");
    } else {
      if (day < fromDate) return;
      onToChange(iso);
      setSelecting("from");
      setOpen(false);
      setHovered(null);
    }
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();

  const cells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];

  while (cells.length % 7 !== 0) cells.push(null);

  function getDayClass(day: Date | null): string {
    if (!day) return "";

    const isFrom = day.getTime() === fromDate.getTime();
    const isTo = day.getTime() === toDate.getTime();
    const isToday =
      day.getTime() ===
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    const isDisabled = selecting === "to" && day < fromDate;

    const effectiveTo =
      selecting === "to" && hovered && hovered >= fromDate ? hovered : toDate;

    const inRange = day > fromDate && day < effectiveTo;

    if (isDisabled) return "text-gray-300 cursor-not-allowed";

    if (isFrom || isTo)
      return "bg-[#E84040] text-white font-bold shadow";

    if (inRange)
      return "bg-red-100 text-[#E84040]";

    if (isToday)
      return "border border-[#E84040] text-[#E84040]";

    return "text-gray-700 hover:bg-gray-100";
  }

  return (
    <div ref={wrapRef} className={className}>
      {/* Trigger */}
      <button
        ref={btnRef}
        onClick={() => {
          setOpen((o) => !o);
          setSelecting("from");
        }}
        className="flex items-center gap-2 px-4 py-2 border rounded-xl bg-white"
      >
        <CalendarDays size={16} className="text-red-500" />
        <span className="text-sm font-semibold">{fmtDisplay(from)}</span>
        <span className="text-gray-400">→</span>
        <span className="text-sm font-semibold">{fmtDisplay(to)}</span>
        {open && <X size={14} />}
      </button>

      {/* DROPDOWN positioned below the button */}
      {open && mounted &&
        createPortal(
          <div
            className="fixed bg-white rounded-2xl shadow-2xl p-5 w-[320px] border border-gray-100"
            style={{
              top: dropdownPos.top,
              left: dropdownPos.left,
              zIndex: 99999,
            }}
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded-lg">
                <ChevronLeft size={20} />
              </button>
              <span className="font-bold text-gray-800">
                {MONTHS[viewMonth]} {viewYear}
              </span>
              <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded-lg">
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Days */}
            <div className="grid grid-cols-7 text-xs text-gray-400 mb-2">
              {DAYS.map((d) => (
                <div key={d} className="text-center py-1">{d}</div>
              ))}
            </div>

            {/* Dates */}
            <div>
              {Array.from({ length: cells.length / 7 }, (_, row) => (
                <div key={row} className="grid grid-cols-7">
                  {cells.slice(row * 7, row * 7 + 7).map((day, i) => (
                    <div key={i} className="flex justify-center py-1">
                      {day ? (
                        <button
                          onClick={() => handleDayClick(day)}
                          onMouseEnter={() => setHovered(day)}
                          onMouseLeave={() => setHovered(null)}
                          className={`w-9 h-9 rounded-full text-sm flex items-center justify-center transition-colors ${getDayClass(day)}`}
                        >
                          {day.getDate()}
                        </button>
                      ) : (
                        <div className="w-9 h-9" />
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Footer hint */}
            <div className="mt-4 pt-3 border-t border-gray-100 text-center">
              <span className="text-xs text-gray-500">
                {selecting === "from" ? "Select start date" : "Select end date"}
              </span>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
