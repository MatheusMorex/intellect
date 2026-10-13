import React from 'react';
import { MOCK_INTEGRATIONS } from '@/lib/mocks/integrations';

export default function Page() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Integrações</h1>
          <p className="text-muted-foreground">Conecte suas fontes de tráfego e plataforma de vendas</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Meta Ads */}
        <IntegrationCard
          id="meta"
          name="Meta Ads"
          description="Facebook e Instagram Ads"
          status={MOCK_INTEGRATIONS.meta}
          icon="💙"
        />

        {/* Google Ads */}
        <IntegrationCard
          id="google"
          name="Google Ads"
          description="Pesquisa, Display e YouTube"
          status={MOCK_INTEGRATIONS.google}
          icon="❤️"
        />

        {/* Shopify */}
        <IntegrationCard
          id="shopify"
          name="Shopify"
          description="Loja virtual e pedidos"
          status={MOCK_INTEGRATIONS.shopify}
          icon="🛍️"
          isShopify
        />
      </div>
    </div>
  );
}

function IntegrationCard({
  id,
  name,
  description,
  status,
  icon,
  isShopify = false
}: {
  id: string,
  name: string,
  description: string,
  status: any,
  icon: string,
  isShopify?: boolean
}) {
  const isConnected = status.connected;

  return (
    <div className="p-6 bg-background border border-border rounded-xl shadow-sm hover:border-primary/50 transition-colors flex flex-col h-full">
      <div className="flex items-start justify-between mb-4">
        <div className="text-3xl">{icon}</div>
        <StatusBadge connected={isConnected} />
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-bold">{name}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex-1 space-y-3 mb-6">
        {isConnected ? (
          <div className="space-y-2">
            {isShopify ? (
              <div className="text-xs space-y-1">
                <p className="text-muted-foreground">Domínio: <span className="text-foreground font-medium">{status.shopDomain}</span></p>
                <p className="text-muted-foreground">Último Pedido: <span className="text-foreground font-medium">{status.lastOrder.id}</span></p>
              </div>
            ) : (
              <div className="text-xs space-y-1">
                <p className="text-muted-foreground">Conta: <span className="text-foreground font-medium">{status.accounts[0]?.name || 'N/A'}</span></p>
                <p className="text-muted-foreground">Sincronizado: <span className="text-foreground font-medium">{new Date(status.lastSync).toLocaleDateString()}</span></p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">
            Esta integração não está configurada.
          </div>
        )}
      </div>

      <button className={`w-full py-2 rounded-md text-sm font-medium transition-colors ${
        isConnected
        ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
        : 'bg-primary text-primary-foreground hover:opacity-90'
      }`}>
        {isConnected ? 'Gerenciar' : 'Conectar Agora'}
      </button>
    </div>
  );
}

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
      connected
      ? 'bg-green-500/10 text-green-600 border-green-500/20'
      : 'bg-red-500/10 text-red-600 border-red-500/20'
    }`}>
      {connected ? 'Conectado' : 'Desconectado'}
    </span>
  );
}
