---
name: windows-python-command
description: Nesta máquina o Python não está instalado desde 2026-10-20 (use node para scripts); comandos de shell na pasta do OneDrive são lentos
metadata:
  node_type: memory
  type: reference
  originSessionId: 351c2ee0-c9f0-4d3a-b389-38df447a7364
  modified: 2026-10-20T16:06:34.771Z
---

Em 2026-10-20, `C:\Python314` não existia mais:
- `py -0p` ainda aponta para ele e falha;
- `python` e `python3` caem no atalho da Microsoft Store (código de saída 49).

Para scripts rápidos (editar arquivos, ler JSON, ler transcrições), use `node -e` ou um `.cjs`/`.ts` com `node --import ./tests/alias.mjs` no projeto. O `replica/design/build_tokens.py` precisa de Python: se ele for necessário, reinstale antes (depois do "sim" do usuário). O usuário falou em formatar o PC em 2026-10-20.

Comandos de shell que tocam a pasta do projeto no OneDrive chegaram a passar de 60 a 120 s; rode em segundo plano ou com timeout maior.
