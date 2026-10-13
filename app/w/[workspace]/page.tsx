import React from 'react';
import { MOCK_WORKSPACE, MOCK_BOARDS } from '@/lib/mocks/data';

export default function Page() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Workspace: {MOCK_WORKSPACE.name}</h1>
          <p className="text-muted-foreground">Seus quadros, modelos e membros organizados por espaço.</p>
        </div>
        <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-bold hover:opacity-90 transition-opacity">
          + Criar Novo Quadro
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {MOCK_BOARDS.map(board => (
          <div
            key={board.id}
            className="group bg-background border border-border rounded-xl overflow-hidden hover:border-primary/50 transition-all cursor-pointer shadow-sm hover:shadow-md"
          >
            <div className="h-32 bg-secondary/30 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent" />
              <div className="absolute bottom-3 left-3 flex -space-x-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-6 h-6 rounded-full border-2 border-background bg-secondary" />
                ))}
              </div>
            </div>
            <div className="p-4 space-y-2">
              <h3 className="font-bold group-hover:text-primary transition-colors">{board.name}</h3>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>3 listas • 12 cards</span>
                <span className="bg-secondary px-2 py-0.5 rounded-full">Privado</span>
              </div>
            </div>
          </div>
        ))}

        {/* Empty State/Add New */}
        <div className="border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center p-6 text-muted-foreground hover:border-primary/30 hover:bg-secondary/10 transition-all cursor-pointer group">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
            <span className="text-xl font-bold">+</span>
          </div>
          <p className="text-sm font-medium">Novo Quadro</p>
        </div>
      </div>

      <div className="pt-8 border-t border-border">
        <h2 className="text-lg font-bold mb-4">Vistos Recentemente</h2>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex-shrink-0 w-48 p-3 bg-secondary/20 border border-border rounded-lg flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-primary/20 border border-primary/30" />
              <div className="truncate text-sm font-medium">Quadro de Operações {i}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
