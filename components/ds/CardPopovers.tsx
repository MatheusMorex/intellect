import React, { useState } from 'react';

export function PopoverLabel({ label, value, onChange }: { label: string, value: string, onChange: (val: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5 p-2 bg-secondary/20 border border-border rounded-lg">
      <label className="text-[10px] font-bold text-muted-foreground uppercase">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:ring-1 ring-primary"
      />
    </div>
  );
}

export function ChecklistItem({ text, completed, onToggle }: { text: string, completed: boolean, onToggle: () => void }) {
  return (
    <div className="flex items-center gap-2 p-2 hover:bg-secondary/30 rounded-md transition-colors group">
      <input
        type="checkbox"
        checked={completed}
        onChange={onToggle}
        className="rounded border-border w-3 h-3"
      />
      <span className={`text-sm ${completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
        {text}
      </span>
    </div>
  );
}
