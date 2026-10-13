// Deixa os testes (node --test) importarem código que usa o atalho "@/..." e
// imports sem extensão, como o Next faz. Uso: node --import ./tests/alias.mjs --test
import { register } from "node:module";

register("./alias-hooks.mjs", import.meta.url);
