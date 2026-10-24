"""Gera tokens.css e theme.css a partir de tokens.json e confere o contraste.

    python replica/design/build_tokens.py
    python replica/design/build_tokens.py --out C:/Users/Soare/dev/intellect/app

Com --out, grava os dois arquivos também na pasta do app (o globals.css do app
importa os dois).

Rode de novo sempre que mudar tokens.json (inclusive no /replica-brand).
Sai com código 1 se algum par de cor falhar no nível AA, em qualquer tema.
Usa o contrast.py da skill replica-design (~/.claude/skills/replica-design).
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "replica-design"))
try:
    import contrast  # noqa: E402
except ImportError:
    sys.exit("build_tokens: não achei o contrast.py da skill replica-design")

HEADER = "/* Gerado por replica/design/build_tokens.py a partir de tokens.json. Não edite à mão. */\n"
HUES = ["green", "yellow", "orange", "red", "purple", "blue", "sky", "lime", "pink", "black"]


def px(n):
    return "%gpx" % n


def colour_block(colours, shadows, overlay):
    lines = ["  --ds-%s: %s;" % (k, v) for k, v in colours.items()]
    lines += ["  --ds-shadow-%s: %s;" % (k, v) for k, v in shadows.items()]
    lines.append("  --ds-overlay: %s;" % overlay)
    return "\n".join(lines)


def build_css(t):
    a = t["alpha"]
    root = [
        "  color-scheme: light;",
        colour_block(t["color"], t["shadow"], a["overlay"]),
        "  --ds-board-header: %s;" % a["board-header"],
        "  --ds-pattern-ink: %s;" % a["pattern-ink"],
        "  --ds-pattern-ink-on-bold: %s;" % a["pattern-ink-on-bold"],
        *["  --ds-brand-%s: %s;" % (k, v) for k, v in t["brand"].items()],
        "  --ds-font-sans: %s;" % t["font"]["sans"],
        "  --ds-font-mono: %s;" % t["font"]["mono"],
    ]
    for name, s in t["type"].items():
        root.append("  --ds-fs-%s: %s; --ds-lh-%s: %s; --ds-fw-%s: %d;" % (
            name, px(s["size"]), name, px(s["line"]), name, s["weight"]))
    for name, r in t["radius"].items():
        root.append("  --ds-radius-%s: %s;" % (name, px(r)))
    for name, m in t["motion"].items():
        root.append("  --ds-%s: %s;" % (name if name.startswith("ease") else "motion-" + name, m))
    for name, v in t["layout"].items():
        root.append("  --ds-%s: %s;" % (name, px(v)))
    for name, z in t["z"].items():
        root.append("  --ds-z-%s: %d;" % (name, z))
    for hue, pattern in t["label-pattern"].items():
        root.append("  --ds-pattern-%s: %s;" % (hue, pattern))

    dark = "\n".join([
        "  color-scheme: dark;",
        colour_block(t["color-dark"], t["shadow-dark"], a["overlay-dark"]),
    ])
    still = "\n".join("  --ds-motion-%s: 0ms;" % k for k in t["motion"] if not k.startswith("ease"))
    return HEADER + "\n".join([
        ":root {", *root, "}",
        "",
        "/* Tema escuro: escolhido pelo usuário (data-theme) ou pelo sistema quando o tema é automático. */",
        ':root[data-theme="dark"] {', dark, "}",
        "@media (prefers-color-scheme: dark) {",
        '  :root:not([data-theme="light"]) {',
        dark.replace("\n", "\n  ").replace("  color-scheme", "    color-scheme", 1),
        "  }",
        "}",
        "",
        "/* Reduzir animações: preferência do sistema ou do perfil (data-motion). */",
        ':root[data-motion="reduced"] {', still, "}",
        "@media (prefers-reduced-motion: reduce) {",
        "  :root {", still.replace("  --", "    --"), "  }",
        "}",
        "",
    ])


def build_theme(t):
    """Tailwind v4: mapeia os tokens nos nomes que o shadcn/ui usa, mais os nossos."""
    c = {
        # nomes do shadcn/ui -> papel no tokens.json
        "background": "bg", "foreground": "text",
        "card": "surface", "card-foreground": "text",
        "popover": "surface", "popover-foreground": "text",
        "primary": "accent", "primary-foreground": "on-accent", "primary-hover": "accent-hover",
        "primary-subtle": "accent-subtle",
        "secondary": "surface-hover", "secondary-foreground": "text",
        "muted": "surface-sunken", "muted-foreground": "text-muted",
        "accent": "surface-hover", "accent-foreground": "text",
        "destructive": "danger", "destructive-foreground": "on-danger",
        "border": "border", "input": "border-input", "ring": "ring",
        "sidebar": "surface", "sidebar-foreground": "text",
        "sidebar-primary": "accent", "sidebar-primary-foreground": "on-accent",
        "sidebar-accent": "surface-hover", "sidebar-accent-foreground": "text",
        "sidebar-border": "border", "sidebar-ring": "ring",
        # papéis que o shadcn não tem
        "surface": "surface", "surface-sunken": "surface-sunken", "surface-hover": "surface-hover",
        "danger": "danger", "danger-subtle": "danger-subtle", "on-danger": "on-danger",
        "success": "success", "success-subtle": "success-subtle", "on-success": "on-success",
        "warning": "warning", "warning-subtle": "warning-subtle", "on-warning": "on-warning",
    }
    lines = ["  --color-%s: var(--ds-%s);" % (k, v) for k, v in c.items()]
    for k in t["color"]:
        if k.startswith("label-") or k.startswith("chart-"):
            lines.append("  --color-%s: var(--ds-%s);" % (k, k))
    lines.append("  --color-overlay: var(--ds-overlay);")
    lines += ["  --color-brand-%s: var(--ds-brand-%s);" % (k, k) for k in t["brand"]]
    lines += [
        "  --font-sans: var(--ds-font-sans);",
        "  --font-mono: var(--ds-font-mono);",
    ]
    for name in t["type"]:
        lines.append("  --text-%s: var(--ds-fs-%s); --text-%s--line-height: var(--ds-lh-%s); --text-%s--font-weight: var(--ds-fw-%s);"
                     % (name, name, name, name, name, name))
    for name in ("sm", "md", "lg"):
        lines.append("  --radius-%s: var(--ds-radius-%s);" % (name, name))
    for name in t["shadow"]:
        lines.append("  --shadow-%s: var(--ds-shadow-%s);" % (name, name))
    lines += [
        "  --ease-ds: var(--ds-ease);",
        "  --default-transition-duration: var(--ds-motion-fast);",
        "  --default-transition-timing-function: var(--ds-ease);",
        "  --container-content: var(--ds-content-max);",
        "  --container-form: var(--ds-form-max);",
        "  --container-list: var(--ds-list-width);",
        "  --container-card-modal: var(--ds-card-modal);",
        "  --container-side-panel: var(--ds-side-panel);",
    ]
    return HEADER + "\n".join([
        "/* No app, o globals.css importa tailwindcss, tw-animate-css, tokens.css e este arquivo. */",
        "",
        "/* dark: segue o data-theme que o next-themes põe no <html>. */",
        "@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));",
        "/* colorblind: modo para daltônicos (data-colorblind no <html>, preferência do perfil). */",
        "@custom-variant colorblind (&:where([data-colorblind=on], [data-colorblind=on] *));",
        "",
        "@theme inline {",
        *lines,
        "}",
        "",
        "@layer base {",
        "  * { border-color: var(--ds-border); }",
        "  html { font-family: var(--ds-font-sans); }",
        "  body { background: var(--ds-bg); color: var(--ds-text); font-size: var(--ds-fs-sm); line-height: var(--ds-lh-sm); }",
        "  :focus-visible { outline: 2px solid var(--ds-ring); outline-offset: 2px; }",
        "  .tabular { font-variant-numeric: tabular-nums; }",
        "}",
        "",
        "/* Reduzir animações vale também para as animações dos componentes do shadcn. */",
        "@media (prefers-reduced-motion: reduce) {",
        "  *, ::before, ::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }",
        "}",
        '[data-motion="reduced"] *, [data-motion="reduced"] ::before, [data-motion="reduced"] ::after {',
        "  animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important;",
        "}",
        "",
    ])


def check(t):
    report, fails = [], 0
    for theme, key in (("claro", "color"), ("escuro", "color-dark")):
        cols = {k: v for k, v in t[key].items()}
        missing = set(t["color"]) ^ set(cols)
        if missing:
            report.append("tema %s: papéis diferentes entre os temas: %s" % (theme, ", ".join(sorted(missing))))
            fails += 1
        rows = contrast.check(cols, t["pairs"])
        fails += sum(1 for r in rows if "error" in r or not r["aa"])
        report.append("Tema %s" % theme)
        report.append(contrast.render(rows))
        report.append("")
    return "\n".join(report), fails


def main():
    ap = argparse.ArgumentParser(description="Gera tokens.css e theme.css e confere o contraste.")
    ap.add_argument("--out", action="append", default=[], help="pasta extra onde gravar os dois arquivos (ex.: a pasta app do projeto)")
    args = ap.parse_args()
    with open(os.path.join(HERE, "tokens.json"), encoding="utf-8") as fh:
        t = json.load(fh)
    for hue in HUES:
        for tone in ("label-%s-subtle", "label-%s", "label-%s-bold"):
            if tone % hue not in t["color"]:
                sys.exit("build_tokens: falta %s" % (tone % hue))
    for folder in [HERE] + args.out:
        for name, text in (("tokens.css", build_css(t)), ("theme.css", build_theme(t))):
            with open(os.path.join(folder, name), "w", encoding="utf-8", newline="\n") as fh:
                fh.write(text)
    report, fails = check(t)
    with open(os.path.join(HERE, "contrast-report.txt"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(report + "\n")
    print(report)
    print("tokens.css e theme.css gerados em: %s" % ", ".join([HERE] + args.out))
    print("contraste ok nos dois temas" if not fails else "%d pares falhando" % fails)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
