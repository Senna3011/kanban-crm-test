'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import toast from 'react-hot-toast';
import type { ColumnData } from '@/types';

interface Props {
  columns: ColumnData[];
  boardId?: string;
  onChange: (columns?: ColumnData[]) => void;
  onClose: () => void;
}

const COLORS = ['#6b7280', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export default function ColumnSettings({ columns, boardId, onChange, onClose }: Props) {
  const [localCols, setLocalCols] = useState<ColumnData[]>(columns);
  const [saving, setSaving] = useState(false);

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

  async function handleSave() {
    setSaving(true);
    try {
      // 1. Identify newly added columns (id starts with 'col-')
      const newCols = localCols.filter((c) => c.id.startsWith('col-'));
      const existingCols = localCols.filter((c) => !c.id.startsWith('col-'));

      // 2. Identify deleted column IDs
      const currentIds = new Set(localCols.map((c) => c.id));
      const deletedIds = columns.filter((c) => !currentIds.has(c.id) && !c.isSystem).map((c) => c.id);

      // Create new columns via POST /api/columns
      for (const col of newCols) {
        await fetch('/api/columns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: col.title,
            position: col.position,
            color: col.color,
            boardId,
          }),
        });
      }

      // Update existing and delete removed via PUT /api/columns
      const putRes = await fetch('/api/columns', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columns: existingCols.map((c) => ({
            id: c.id,
            title: c.title,
            position: c.position,
            color: c.color,
          })),
          deleteIds: deletedIds,
        }),
      });

      if (!putRes.ok) {
        const errData = await putRes.json().catch(() => ({}));
        throw new Error(errData?.error || 'Failed to save column changes');
      }

      toast.success('Column settings saved successfully!');
      onChange();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Error saving column settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="Manage Columns">
      <div className="space-y-2.5 max-h-80 sm:max-h-96 overflow-y-auto pr-1">
        {localCols.map((col) => (
          <div key={col.id} className="flex items-center gap-1.5 sm:gap-2 p-2 sm:p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl">
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => moveUp(col.id)}
                className="p-0.5 text-xs text-slate-400 hover:text-slate-700 leading-none cursor-pointer"
                title="Move column left"
              >
                &uarr;
              </button>
              <button
                type="button"
                onClick={() => moveDown(col.id)}
                className="p-0.5 text-xs text-slate-400 hover:text-slate-700 leading-none cursor-pointer"
                title="Move column right"
              >
                &darr;
              </button>
            </div>
            <input
              className="flex-1 min-w-0 px-2 sm:px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium disabled:bg-slate-100 disabled:text-slate-400"
              value={col.title}
              onChange={(e) => renameColumn(col.id, e.target.value)}
              disabled={col.isSystem}
            />
            <div className="flex gap-1 items-center flex-wrap max-w-[84px] sm:max-w-none">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`w-3.5 h-3.5 rounded-full transition-transform cursor-pointer ${col.color === color ? 'ring-2 ring-offset-1 ring-primary-500 scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: color }}
                  onClick={() => changeColor(col.id, color)}
                />
              ))}
            </div>
            {!col.isSystem && (
              <button
                type="button"
                onClick={() => deleteColumn(col.id)}
                className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors flex-shrink-0 cursor-pointer"
                title="Delete column"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
        <Button variant="secondary" size="sm" onClick={addColumn} disabled={saving}>
          + Add Column
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </Modal>
  );
}
