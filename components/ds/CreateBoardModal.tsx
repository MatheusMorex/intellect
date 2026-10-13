import React, { useState } from 'react';

export default function Page() {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    background: 'color',
    workspace: 'w1',
    visibility: 'private'
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="bg-background border border-border w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <h2 className="text-xl font-bold">Criar Novo Quadro</h2>
          <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-secondary rounded-full transition-colors">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase">Título do Quadro</label>
            <input
              type="text"
              placeholder="Ex: Planejamento de Lançamento"
              className="w-full p-3 bg-secondary/30 border border-border rounded-lg text-sm focus:ring-2 ring-primary outline-none"
              value={form.name}
              onChange={e => setForm({...form, name: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase">Fundo do Quadro</label>
            <div className="grid grid-cols-3 gap-2">
              {['color', 'gradient', 'photo'].map(type => (
                <button
                  key={type}
                  onClick={() => setForm({...form, background: type})}
                  className={`p-2 text-xs rounded-md border transition-all ${
                    form.background === type
                    ? 'border-primary bg-primary/10 text-primary font-bold'
                    : 'border-border bg-secondary/20 text-muted-foreground hover:border-primary/30'
                  }`}
                >
                  {type === 'color' ? 'Cor' : type === 'gradient' ? 'Gradiente' : 'Foto'}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Workspace</label>
              <select className="w-full p-2 bg-secondary/30 border border-border rounded-lg text-sm outline-none">
                <option value="w1">INtellect Main</option>
                <option value="w2">Outro Workspace</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Visibilidade</label>
              <select className="w-full p-2 bg-secondary/30 border border-border rounded-lg text-sm outline-none">
                <option value="private">Privado</option>
                <option value="workspace">Workspace</option>
                <option value="public">Público</option>
              </select>
            </div>
          </div>
        </div>

        <div className="p-6 bg-secondary/20 border-t border-border flex justify-end gap-3">
          <button onClick={() => setIsOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Cancelar
          </button>
          <button className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-bold hover:opacity-90 transition-opacity">
            Criar Quadro
          </button>
        </div>
      </div>
    </div>
  );
}
