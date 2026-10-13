import React, { useState } from 'react';

export default function Page() {
  const [form, setForm] = useState({
    url: '',
    source: '',
    medium: '',
    campaign: '',
    content: '',
    term: '',
  });

  const generatedUrl = form.url
    ? `${form.url}${form.url.includes('?') ? '&' : '?'}utm_source=${form.source || 'manual'}&utm_medium=${form.medium || 'organic'}&utm_campaign=${form.campaign || 'default'}&utm_content=${form.content || ''}&utm_term=${form.term || ''}`
    : '';

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rastreamento</h1>
          <p className="text-muted-foreground">Configure as UTMs e o script de rastreio da Shopify</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Gerador de UTMs */}
        <div className="space-y-6">
          <div className="p-6 bg-background border border-border rounded-xl shadow-sm space-y-6">
            <h2 className="text-lg font-bold">Gerador de UTMs Orgânicas</h2>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase">URL da Página de Destino</label>
                <input
                  type="text"
                  placeholder="https://loja.com/produto"
                  className="w-full p-2 bg-secondary/30 border border-border rounded-md text-sm focus:ring-2 ring-primary outline-none transition-all"
                  value={form.url}
                  onChange={e => setForm({...form, url: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">utm_source (Obrigatório)</label>
                  <input
                    type="text"
                    placeholder="instagram, whatsapp..."
                    className="w-full p-2 bg-secondary/30 border border-border rounded-md text-sm focus:ring-2 ring-primary outline-none transition-all"
                    value={form.source}
                    onChange={e => setForm({...form, source: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">utm_medium</label>
                  <input
                    type="text"
                    placeholder="bio, story, organic..."
                    className="w-full p-2 bg-secondary/30 border border-border rounded-md text-sm focus:ring-2 ring-primary outline-none transition-all"
                    value={form.medium}
                    onChange={e => setForm({...form, medium: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase">utm_campaign</label>
                <input
                  type="text"
                  placeholder="campanha_verao_2026"
                  className="w-full p-2 bg-secondary/30 border border-border rounded-md text-sm focus:ring-2 ring-primary outline-none transition-all"
                  value={form.campaign}
                  onChange={e => setForm({...form, campaign: e.target.value})}
                />
              </div>
            </div>

            <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg space-y-3">
              <label className="text-xs font-bold text-primary uppercase">URL Final Gerada</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={generatedUrl}
                  className="flex-1 p-2 bg-background border border-border rounded-md text-xs font-mono truncate"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(generatedUrl)}
                  className="px-3 py-1 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:opacity-90"
                >
                  Copiar
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Scripts e Modelos */}
        <div className="space-y-6">
          <div className="p-6 bg-background border border-border rounded-xl shadow-sm space-y-6">
            <h2 className="text-lg font-bold">Modelos de Parâmetros</h2>

            <div className="space-y-4">
              <div className="p-4 bg-secondary/20 border border-border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">Meta Ads</span>
                  <span className="text-[10px] bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded-full border border-blue-500/20 font-bold">Sufixo de URL</span>
                </div>
                <code className="block p-2 bg-background border border-border rounded text-[10px] font-mono break-all">
                  utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText('utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}')}
                  className="w-full py-1.5 bg-secondary rounded text-xs font-medium hover:bg-secondary/80 transition-colors"
                >
                  Copiar Modelo
                </button>
              </div>

              <div className="p-4 bg-secondary/20 border border-border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">Google Ads</span>
                  <span className="text-[10px] bg-red-500/10 text-red-600 px-2 py-0.5 rounded-full border border-red-500/20 font-bold">Sufixo de URL Final</span>
                </div>
                <code className="block p-2 bg-background border border-border rounded text-[10px] font-mono break-all">
                  utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText('utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}')}
                  className="w-full py-1.5 bg-secondary rounded text-xs font-medium hover:bg-secondary/80 transition-colors"
                >
                  Copiar Modelo
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 bg-background border border-border rounded-xl shadow-sm space-y-4">
            <h2 className="text-lg font-bold">Script de Rastreio</h2>
            <p className="text-sm text-muted-foreground">
              Copie e cole este script no cabeçalho (&lt;head&gt;) da sua página de vendas externa para garantir que as UTMs sejam preservadas.
            </p>
            <div className="relative group">
              <pre className="p-3 bg-secondary/30 border border-border rounded-lg text-[10px] font-mono overflow-x-auto">
                {`<script>
  (function() {
    const params = new URLSearchParams(window.location.search);
    const utms = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    const storage = {};
    utms.forEach(u => {
      if(params.has(u)) storage[u] = params.get(u);
    });
    if(Object.keys(storage).length > 0) {
      localStorage.setItem('intellect_utms', JSON.stringify(storage));
    }
  })();
</script>`}
              </pre>
              <button
                onClick={() => navigator.clipboard.writeText(`(function() {
    const params = new URLSearchParams(window.location.search);
    const utms = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    const storage = {};
    utms.forEach(u => {
      if(params.has(u)) storage[u] = params.get(u);
    });
    if(Object.keys(storage).length > 0) {
      localStorage.setItem('intellect_utms', JSON.stringify(storage));
    }
  })();`)}
                className="absolute top-2 right-2 p-1 bg-primary text-primary-foreground rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Copiar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
