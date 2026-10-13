export const MOCK_COST_SETTINGS = {
  salesTaxPct: 5.0,
  metaAdsTaxPct: 2.0,
  extraTaxes: [
    { id: 't1', name: 'Taxa de Operação', value: 1.5, kind: 'percent' },
    { id: 't2', name: 'Taxa Fixa Processamento', value: 2.0, kind: 'fixed' },
  ],
  validFrom: '2026-10-01'
};

export const MOCK_PRODUCT_COSTS = [
  { id: 'p1', name: 'Produto Alpha', costCents: 4500 },
  { id: 'p2', name: 'Produto Beta', costCents: 8500 },
];
