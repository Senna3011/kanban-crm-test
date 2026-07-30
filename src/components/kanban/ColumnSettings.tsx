'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import type { ColumnData } from '@/types';

interface Props {
  columns: ColumnData[];
  onChange: (columns: ColumnData[]) => void;
  onClose: () => void;
}

const COLORS = ['#6b7280', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export default function ColumnSettings({ columns, onChange, onClose }: Props) {
  const [localCols, setLocalCols] = useState<ColumnData[]>(columns);

  function addColumn() {
    const maxPos = Math.max(...localCols.map((c) => c.position), -1);
    const newCol: ColumnData = {
      id: `col-${Date.now()}`,
      title: 'New Column',
      position: maxPos + 1,
      color: COLORS[localCols.length % COLORS.length],
      isSystem: false,
      cards: [],
    };
    setLocalCols([...localCols, newCol]);
  }

  function renameColumn(id: string, title: string) {
    setLocalCols(localCols.map((c) => (c.id === id ? { ...c, title } : c)));
  }

  function changeColor(id: string, color: string) {
    setLocalCols(localCols.map((c) => (c.id === id ? { ...c, color } : c)));
  }

  function deleteColumn(id: string) {
    const col = localCols.find((c) => c.id === id);
    if (col?.isSystem) return;
    setLocalCols(localCols.filter((c) => c.id !== id));
  }

  function moveUp(id: string) {
    const idx = localCols.findIndex((c) => c.id === id);
    if (idx <= 0) return;
    const newCols = [...localCols];
    [newCols[idx - 1], newCols[idx]] = [newCols[idx], newCols[idx - 1]];
    newCols.forEach((c, i) => (c.position = i));
    setLocalCols(newCols);
  }

  function moveDown(id: string) {
    const idx = localCols.findIndex((c) => c.id === id);
    if (idx >= localCols.length - 1) return;
    const newCols = [...localCols];
    [newCols[idx], newCols[idx + 1]] = [newCols[idx + 1], newCols[idx]];
    newCols.forEach((c, i) => (c.position = i));
    setLocalCols(newCols);
  }

  function save() {
    onChange(localCols);
    onClose();
  }

  return (
    <Modal open={true} onClose={onClose} title="Manage Columns">
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {localCols.map((col) => (
          <div key={col.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
            <div className="flex flex-col gap-0.5">
              <button onClick={() => moveUp(col.id)} className="text-xs text-gray-400 hover:text-gray-700">&uarr;</button>
              <button onClick={() => moveDown(col.id)} className="text-xs text-gray-400 hover:text-gray-700">&darr;</button>
            </div>
            <input
              className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded"
              value={col.title}
              onChange={(e) => renameColumn(col.id, e.target.value)}
              disabled={col.isSystem}
            />
            <div className="flex gap-1">
              {COLORS.map((color) => (
                <button
                  key={color}
                  className={`w-4 h-4 rounded-full ${col.color === color ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => changeColor(col.id, color)}
                />
              ))}
            </div>
            {!col.isSystem && (
              <button onClick={() => deleteColumn(col.id)} className="text-red-400 hover:text-red-600 text-sm">&times;</button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <Button variant="secondary" size="sm" onClick={addColumn}>+ Add Column</Button>
        <Button size="sm" onClick={save}>Save</Button>
      </div>
    </Modal>
  );
}
