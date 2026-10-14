// Leitura dos anúncios em frases: explica o que os números do Meta e do Google
// estão dizendo, para a pessoa entender o que acontece e decidir o próximo
// passo. Primeiro o fato (com o número), depois a comparação com a média da
// conta no mesmo período e, quando houver uma referência de mercado
// conhecida, um "considere que...". A decisão fica sempre com quem opera.
//
// Função pura; os testes ficam em tests/ad-insights.test.ts.

import { integer, money, percentOf } from "./format";

/** Referências de mercado usadas nas frases (ajuste aqui se a operação usar outras). */
export const REFERENCES = {
  /** Frequência que costuma favorecer a conversão (referência do dono da INtellect). */
  frequency: { min: 2, max: 3 },
  /** Hook (visualizações de 3 s ÷ impressões) que muitos gestores usam como bom. */
  hook: { min: 0.25, max: 0.3 },
  /** Diferença em relação à média da conta que vale comentar. */
  relevantDiff: 0.2,
  /** Período mínimo, em dias, para falar de frequência baixa. */
  minDaysForLowFrequency: 7,
} as const;

export type InsightMetrics = {
  spendCents: number;
  impressions: number;
  reach: number | null;
  frequency: number | null;
  clicks: number;
  ctr: number | null;
  cpmCents: number | null;
  cpcCents: number | null;
  sales: number;
  cpaCents: number | null;
  revenueCents: number;
  roas: number | null;
  videoViews: number;
  hookRate: number | null;
  holdRate: number | null;
  targetCpaCents?: number | null;
};

export type InsightLevel = "contas" | "campanhas" | "conjuntos" | "anuncios" | "palavras";

export type InsightInput = {
  provider: "meta" | "google";
  level: InsightLevel;
  metrics: InsightMetrics;
  /** Média da conta (todos os anúncios da plataforma) no mesmo período. */
  baseline: InsightMetrics;
  /** false quando o item é a conta inteira (não há com o que comparar). */
  compare: boolean;
  currency: string;
  /** Dias do período escolhido. */
  days: number;
};

/** Pedaço de frase; { strong } é um número ou termo em destaque. */
export type Part = string | { strong: string };
export type Sentence = Part[];

const SUBJECT: Record<InsightLevel, { of: string; itself: string; plural: boolean }> = {
  anuncios: { of: "do seu anúncio", itself: "o anúncio", plural: false },
  conjuntos: { of: "do conjunto", itself: "os anúncios do conjunto", plural: true },
  campanhas: { of: "da campanha", itself: "os anúncios da campanha", plural: true },
  contas: { of: "da conta", itself: "os anúncios da conta", plural: true },
  palavras: { of: "da palavra-chave", itself: "a palavra-chave", plural: false },
};

const decimal = (value: number, digits = 1) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

/** Alcance arredondado para leitura: centenas até 100 mil, milhares acima. */
export function roundReach(reach: number) {
  if (reach < 1000) return reach;
  if (reach < 100_000) return Math.round(reach / 100) * 100;
  return Math.round(reach / 1000) * 1000;
}

/** Quanto `value` está acima (+) ou abaixo (−) de `base`, em fração. null quando não dá para comparar. */
function diff(value: number | null | undefined, base: number | null | undefined) {
  if (value == null || base == null || base === 0) return null;
  return value / base - 1;
}

const pct = (fraction: number) => percentOf(Math.abs(fraction), 0) ?? "0%";

export function adInsights(input: InsightInput): Sentence[] {
  const { provider, level, metrics: m, baseline: b, compare, currency, days } = input;
  const s = SUBJECT[level];
  const cash = (cents: number) => money(cents, currency);
  const out: Sentence[] = [];

  if (m.spendCents <= 0 && m.impressions <= 0) {
    return [["Sem gasto no período: ainda não há números para analisar."]];
  }

  // ---- alcance e frequência (Meta) --------------------------------------------------------------
  if (provider === "meta" && m.reach != null && m.reach > 0 && m.frequency != null && m.impressions > 0) {
    out.push([
      `As impressões ${s.of} na Meta foram de `,
      { strong: integer(m.impressions) },
      ", com uma frequência de ",
      { strong: decimal(m.frequency) },
      ", ou seja, o alcance é de praticamente ",
      { strong: integer(roundReach(m.reach)) },
      " pessoas.",
    ]);
    const ref = REFERENCES.frequency;
    if (m.frequency > ref.max) {
      out.push([
        "Considere que com uma frequência de ",
        { strong: `${ref.min} a ${ref.max}` },
        " suas conversões em vendas podem aumentar: acima disso, as mesmas pessoas veem o anúncio muitas vezes e o público começa a cansar dele.",
      ]);
    } else if (m.frequency < ref.min && days >= REFERENCES.minDaysForLowFrequency) {
      out.push([
        "Considere que com uma frequência de ",
        { strong: `${ref.min} a ${ref.max}` },
        " suas conversões em vendas podem aumentar: muitas pessoas precisam ver a oferta algumas vezes antes de decidir comprar.",
      ]);
    } else if (m.frequency >= ref.min) {
      out.push(["A frequência está entre ", { strong: `${ref.min} e ${ref.max}` }, ", uma faixa que costuma favorecer as conversões em vendas."]);
    }
  }

  // ---- vídeo: visualizações, hook e hold (Meta) ----------------------------------------------------
  if (provider === "meta" && m.videoViews > 0 && m.hookRate != null) {
    const hookPer100 = Math.round(m.hookRate * 100);
    out.push([
      s.plural ? "Os vídeos tiveram " : "O vídeo teve ",
      { strong: integer(m.videoViews) },
      " visualizações de 3 segundos: um hook de ",
      { strong: percentOf(m.hookRate, 1) ?? "0%" },
      ` (a cada 100 vezes que ${s.plural ? "um vídeo" : "o vídeo"} apareceu, em ${hookPer100} a pessoa parou para assistir).`,
    ]);
    const ref = REFERENCES.hook;
    const range = `${Math.round(ref.min * 100)}% a ${Math.round(ref.max * 100)}%`;
    if (m.hookRate < ref.min) {
      out.push([
        "Considere que uma referência bastante usada no mercado é um hook acima de ",
        { strong: range },
        ": abaixo disso, o começo do vídeo não está fazendo as pessoas pararem de rolar a tela.",
      ]);
    } else if (m.hookRate >= ref.max) {
      out.push(["O hook está acima da referência de ", { strong: range }, " usada no mercado: os primeiros segundos estão prendendo a atenção."]);
    } else {
      out.push(["O hook está dentro da referência de ", { strong: range }, " usada no mercado."]);
    }

    if (m.holdRate != null) {
      out.push([
        "Das visualizações de 3 segundos, ",
        { strong: percentOf(m.holdRate, 1) ?? "0%" },
        " foram até 75% do vídeo (hold de 75%).",
      ]);
      const holdDiff = compare ? diff(m.holdRate, b.holdRate) : null;
      if (m.hookRate >= ref.min && holdDiff != null && holdDiff <= -REFERENCES.relevantDiff) {
        out.push([
          "O começo prende, mas a atenção cai antes do fim: o hold está ",
          { strong: pct(holdDiff) },
          ` abaixo da média dos vídeos da conta (${percentOf(b.holdRate, 1)}). Considere rever o que vem depois dos primeiros segundos: o ritmo, a duração e o momento em que a oferta aparece.`,
        ]);
      } else if (m.hookRate < ref.min && holdDiff != null && holdDiff >= 0) {
        out.push([
          `Quem passa dos primeiros segundos continua assistindo: o hold está na média dos vídeos da conta (${percentOf(b.holdRate, 1)}) ou acima dela. O conteúdo segura a atenção, e o ponto a trabalhar é o começo do vídeo.`,
        ]);
      } else if (holdDiff != null && holdDiff >= REFERENCES.relevantDiff) {
        out.push(["O hold está ", { strong: pct(holdDiff) }, ` acima da média dos vídeos da conta (${percentOf(b.holdRate, 1)}): o vídeo segura bem a atenção.`]);
      }
    }
  }

  // ---- cliques (Google) ------------------------------------------------------------------------------
  if (provider === "google" && m.ctr != null && m.impressions > 0) {
    out.push([
      "O CTR foi de ",
      { strong: percentOf(m.ctr, 2) ?? "0%" },
      ` (a cada 100 vezes que ${s.itself} ${s.plural ? "apareceram" : "apareceu"}, ${decimal(m.ctr * 100)} viraram clique), com CPC de `,
      { strong: cash(m.cpcCents ?? 0) },
      ".",
    ]);
    const ctrDiff = compare ? diff(m.ctr, b.ctr) : null;
    if (ctrDiff != null && Math.abs(ctrDiff) >= REFERENCES.relevantDiff) {
      out.push([
        "O CTR está ",
        { strong: pct(ctrDiff) },
        ctrDiff > 0
          ? ` acima da média da conta (${percentOf(b.ctr, 2)}): o anúncio chama mais a atenção de quem pesquisa.`
          : ` abaixo da média da conta (${percentOf(b.ctr, 2)}): o anúncio está chamando menos a atenção de quem pesquisa.`,
      ]);
    }
  }

  // ---- CPM ---------------------------------------------------------------------------------------------
  if (m.cpmCents != null && m.impressions > 0) {
    out.push(["O CPM foi de ", { strong: cash(m.cpmCents) }, ", ou seja, cada mil impressões custaram esse valor."]);
    const cpmDiff = compare ? diff(m.cpmCents, b.cpmCents) : null;
    if (cpmDiff != null && cpmDiff >= REFERENCES.relevantDiff) {
      out.push([
        "Isso está ",
        { strong: pct(cpmDiff) },
        ` acima da média da conta (${cash(b.cpmCents ?? 0)}). Considere que um CPM alto costuma vir de um público muito disputado ou de um criativo que a plataforma entrega com menos prioridade, e deixa cada venda mais cara.`,
      ]);
    } else if (cpmDiff != null && cpmDiff <= -REFERENCES.relevantDiff) {
      out.push(["Isso está ", { strong: pct(cpmDiff) }, ` abaixo da média da conta (${cash(b.cpmCents ?? 0)}): aparecer para esse público está mais barato.`]);
    }
  }

  // ---- vendas e CPA ------------------------------------------------------------------------------------
  if (m.sales > 0 && m.cpaCents != null) {
    out.push([
      "Foram ",
      { strong: `${integer(m.sales)} ${m.sales === 1 ? "venda" : "vendas"}` },
      " com CPA de ",
      { strong: cash(m.cpaCents) },
      ", ou seja, cada venda custou esse valor em anúncio.",
    ]);
    const cpaDiff = compare ? diff(m.cpaCents, b.cpaCents) : null;
    if (cpaDiff != null && cpaDiff >= REFERENCES.relevantDiff) {
      out.push(["O CPA está ", { strong: pct(cpaDiff) }, ` acima da média da conta (${cash(b.cpaCents ?? 0)}): as vendas daqui estão saindo mais caras.`]);
    } else if (cpaDiff != null && cpaDiff <= -REFERENCES.relevantDiff) {
      out.push(["O CPA está ", { strong: pct(cpaDiff) }, ` abaixo da média da conta (${cash(b.cpaCents ?? 0)}): as vendas daqui estão saindo mais baratas.`]);
    }
    if (m.targetCpaCents) {
      const targetDiff = diff(m.cpaCents, m.targetCpaCents);
      out.push([
        "O CPA desejado configurado no Google é ",
        { strong: cash(m.targetCpaCents) },
        targetDiff != null && targetDiff > 0 ? `, e o CPA real está ${pct(targetDiff)} acima dele.` : ", e o CPA real está dentro dele.",
      ]);
    }
  } else if (m.spendCents > 0) {
    out.push(["Foram ", { strong: cash(m.spendCents) }, " investidos sem nenhuma venda atribuída no período."]);
    if (m.clicks > 0) {
      out.push([
        s.plural ? "Os anúncios levaram " : `${capitalize(s.itself)} levou `,
        { strong: `${integer(m.clicks)} ${m.clicks === 1 ? "clique" : "cliques"}` },
        ` ao site (CTR de ${percentOf(m.ctr, 2) ?? "0%"}): as pessoas se interessam, mas não estão comprando. Considere olhar a página de destino, o preço e a oferta.`,
      ]);
    }
  }

  // ---- fechamento: espaço para escalar ------------------------------------------------------------------
  const roasDiff = compare ? diff(m.roas, b.roas) : null;
  const cpaVsBase = compare ? diff(m.cpaCents, b.cpaCents) : null;
  const frequencyOk = m.frequency == null || m.frequency <= REFERENCES.frequency.max;
  if (m.sales > 0 && roasDiff != null && roasDiff >= 0 && cpaVsBase != null && cpaVsBase <= 0 && frequencyOk) {
    out.push([
      m.frequency != null
        ? "O retorno está acima da média da conta, o CPA abaixo dela e a frequência ainda é saudável. "
        : "O retorno está acima da média da conta e o CPA abaixo dela. ",
      "Considere que esse é o tipo de resultado que costuma aguentar mais investimento com segurança na hora de escalar.",
    ]);
  }

  return out;
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A frase como texto corrido (para leitores de tela e testes). */
export function sentenceText(sentence: Sentence) {
  return sentence.map((p) => (typeof p === "string" ? p : p.strong)).join("");
}
