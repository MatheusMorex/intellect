import React, { useState } from 'react';

export default function Page() {
  const [step, setStep] = useState(1);
  const totalSteps = 5;

  const steps = [
    {
      title: 'Plataformas de Anúncio',
      description: 'Conecte as contas que você usa para atrair tráfego.',
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-secondary/20 border border-border rounded-xl">
            <div className="flex items-center gap-3">
              <span className="text-2xl">💙</span>
              <div>
                <p className="font-bold">Meta Ads</p>
                <p className="text-xs text-muted-foreground">Facebook e Instagram</p>
              </div>
            </div>
            <button className="px-3 py-1 bg-primary text-primary-foreground rounded-md text-xs font-medium">Conectar</button>
          </div>
          <div className="flex items-center justify-between p-4 bg-secondary/20 border border-border rounded-xl">
            <div className="flex items-center gap-3">
              <span className="text-2xl">❤️</span>
              <div>
                <p className="font-bold">Google Ads</p>
                <p className="text-xs text-muted-foreground">Pesquisa e YouTube</p>
              </div>
            </div>
            <button className="px-3 py-1 bg-primary text-primary-foreground rounded-md text-xs font-medium">Conectar</button>
          </div>
        </div>
      )
    },
    {
      title: 'Loja Virtual',
      description: 'Integre sua loja para capturar as vendas automaticamente.',
      content: (
        <div className="p-6 bg-background border border-border rounded-xl text-center space-y-4">
          <span className="text-4xl">🛍️</span>
          <h3 className="font-bold">Shopify</h3>
          <p className="text-sm text-muted-foreground">Instale o app da INtellect na sua loja Shopify para sincronizar pedidos.</p>
          <button className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium">Instalar App Shopify</button>
        </div>
      )
    },
    {
      title: 'Parâmetros de URL',
      description: 'Configure como os anúncios enviam os dados para a loja.',
      content: (
        <div className="space-y-4">
          <div className="p-4 bg-secondary/20 border border-border rounded-xl">
            <p className="text-sm font-bold mb-2">Modelo Meta Ads</p>
            <code className="block p-2 bg-background border border-border rounded text-[10px] font-mono">
              utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}...
            </code>
          </div>
          <div className="p-4 bg-secondary/20 border border-border rounded-xl">
            <p className="text-sm font-bold mb-2">Modelo Google Ads</p>
            <code className="block p-2 bg-background border border-border rounded text-[10px] font-mono">
              utm_source=google&utm_medium=cpc&utm_campaign={campaignid}...
            </code>
          </div>
        </div>
      )
    },
    {
      title: 'Sincronização Inicial',
      description: 'Estamos importando seus dados históricos.',
      content: (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-muted-foreground">Importando pedidos dos últimos 30 dias...</p>
        </div>
      )
    },
    {
      title: 'Tudo Pronto!',
      description: 'Seu dashboard está configurado e pronto para uso.',
      content: (
        <div className="text-center space-y-6 py-8">
          <div className="text-6xl">🚀</div>
          <h3 className="text-xl font-bold">Configuração Concluída</h3>
          <p className="text-muted-foreground text-sm max-w-xs mx-auto">
            Agora você pode acompanhar seu ROAS e lucro em tempo real.
          </p>
          <button className="px-8 py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition-opacity">
            Ir para o Dashboard
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Configuração Inicial</h1>
        <p className="text-muted-foreground">Vamos deixar seu ambiente pronto para rastrear vendas</p>
      </div>

      {/* Progress Bar */}
      <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full bg-primary transition-all duration-500"
          style={{ width: `${(step / totalSteps) * 100}%` }}
        />
      </div>

      <div className="p-8 bg-background border border-border rounded-2xl shadow-sm space-y-8 min-h-[400px] flex flex-col">
        <div className="space-y-2">
          <span className="text-xs font-bold text-primary uppercase">Passo {step} de {totalSteps}</span>
          <h2 className="text-2xl font-bold">{steps[step-1].title}</h2>
          <p className="text-muted-foreground">{steps[step-1].description}</p>
        </div>

        <div className="flex-1">
          {steps[step-1].content}
        </div>

        <div className="flex justify-between pt-6">
          <button
            disabled={step === 1}
            onClick={() => setStep(s => s - 1)}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          >
            Voltar
          </button>
          {step < totalSteps && (
            <button
              onClick={() => setStep(s => s + 1)}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-bold hover:opacity-90 transition-opacity"
            >
              Próximo Passo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
