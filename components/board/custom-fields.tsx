"use client";

// Campos personalizados (S07/F04): o gerenciador do quadro (menu do quadro) e o
// preenchimento no verso do card. Cada mudança no card salva sozinha.

import { Plus, Settings2, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteCustomField, saveCustomField, setCardField } from "@/server/actions/custom-fields";
import { FIELD_TYPE_LABEL, FIELD_TYPES, type FieldType, type FieldValue } from "@/lib/custom-fields";

export type FieldView = { id: string; name: string; type: FieldType; options: { id: string; label: string; color: string | null }[]; showOnFront: boolean };

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) toast.error(result.error ?? "Não deu certo.");
      else after?.();
      router.refresh();
    });
  return { pending, run };
}

// ---- gerenciador (menu do quadro) -----------------------------------------------------------

type Draft = { fieldId?: string; name: string; type: FieldType; options: { id?: string; label: string }[]; showOnFront: boolean };
const EMPTY: Draft = { name: "", type: "text", options: [], showOnFront: false };

function FieldForm({ boardId, initial, onDone }: { boardId: string; initial: Draft; onDone: () => void }) {
  const { pending, run } = useRun();
  const [draft, setDraft] = useState<Draft>(initial);
  const [option, setOption] = useState("");
  const editing = !!initial.fieldId;
  const addOption = () => {
    const label = option.trim();
    if (!label) return;
    setDraft((d) => ({ ...d, options: [...d.options, { label }] }));
    setOption("");
  };

  return (
    <form
      className="grid gap-3 rounded-md border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const options = option.trim() ? [...draft.options, { label: option.trim() }] : draft.options;
        run(() => saveCustomField({ boardId, ...draft, options }), () => {
          toast.success(editing ? "Campo salvo" : "Campo criado");
          onDone();
        });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="campo-nome">Nome do campo</Label>
        <Input id="campo-nome" value={draft.name} maxLength={100} autoFocus onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ex.: Verba, ID da campanha" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="campo-tipo">Tipo</Label>
        <Select value={draft.type} disabled={editing} onValueChange={(v) => setDraft({ ...draft, type: v as FieldType })}>
          <SelectTrigger id="campo-tipo" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {FIELD_TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {editing && <p className="text-xs text-muted-foreground">O tipo não muda depois de criado.</p>}
      </div>
      {draft.type === "list" && (
        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-sm font-medium">Opções</legend>
          {draft.options.length > 0 && (
            <ul className="grid gap-1">
              {draft.options.map((o, i) => (
                <li key={o.id ?? `nova-${i}`} className="flex items-center gap-1">
                  <Input
                    aria-label={`Opção ${i + 1}`}
                    value={o.label}
                    maxLength={100}
                    onChange={(e) => setDraft((d) => ({ ...d, options: d.options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))}
                  />
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Tirar a opção ${o.label}`} onClick={() => setDraft((d) => ({ ...d, options: d.options.filter((_, j) => j !== i) }))}>
                    <X aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-1">
            <Input
              aria-label="Nova opção"
              placeholder="Nova opção"
              value={option}
              maxLength={100}
              onChange={(e) => setOption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOption();
                }
              }}
            />
            <Button type="button" variant="secondary" onClick={addOption}>
              Adicionar
            </Button>
          </div>
        </fieldset>
      )}
      <Label className="font-normal">
        <Checkbox checked={draft.showOnFront} onCheckedChange={(v) => setDraft({ ...draft, showOnFront: v === true })} /> Mostrar na frente do card
      </Label>
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>
          {editing ? "Salvar campo" : "Criar campo"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function FieldsManager({ boardId, fields, canEdit }: { boardId: string; fields: FieldView[]; canEdit: boolean }) {
  const { run } = useRun();
  const [editing, setEditing] = useState<Draft | null>(null);

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">Informações extras em cada card deste quadro, como a verba, o ID da campanha ou a data de entrega ao cliente.</p>
      {fields.length === 0 && !editing && <p className="text-sm">Nenhum campo ainda.</p>}
      {fields.length > 0 && (
        <ul className="grid gap-2">
          {fields.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-md border p-2">
              <div className="grid min-w-0 flex-1">
                <span className="truncate font-medium">{f.name}</span>
                <span className="text-xs text-muted-foreground">
                  {FIELD_TYPE_LABEL[f.type]}
                  {f.type === "list" ? ` · ${f.options.length} ${f.options.length === 1 ? "opção" : "opções"}` : ""}
                  {f.showOnFront ? " · na frente do card" : ""}
                </span>
              </div>
              {canEdit && (
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Editar o campo ${f.name}`}
                    onClick={() => setEditing({ fieldId: f.id, name: f.name, type: f.type, options: f.options.map((o) => ({ id: o.id, label: o.label })), showOnFront: f.showOnFront })}
                  >
                    <Settings2 aria-hidden="true" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Apagar o campo ${f.name}`}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Apagar o campo {f.name}?</AlertDialogTitle>
                        <AlertDialogDescription>O valor dele some de todos os cards do quadro. Não tem como desfazer.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => run(() => deleteCustomField({ fieldId: f.id }), () => toast.success("Campo apagado"))}>
                          Apagar campo
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <FieldForm key={editing.fieldId ?? "novo"} boardId={boardId} initial={editing} onDone={() => setEditing(null)} />
      ) : (
        canEdit && (
          <div>
            <Button variant="secondary" onClick={() => setEditing(EMPTY)}>
              <Plus aria-hidden="true" />
              Novo campo
            </Button>
          </div>
        )
      )}
    </div>
  );
}

/** O gerenciador numa janela, aberto pelo botão "Campos" do verso do card. */
export function FieldsDialog({ boardId, fields, canEdit, trigger }: { boardId: string; fields: FieldView[]; canEdit: boolean; trigger: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Campos personalizados</DialogTitle>
          <DialogDescription className="sr-only">Os campos que todos os cards deste quadro têm.</DialogDescription>
        </DialogHeader>
        <FieldsManager boardId={boardId} fields={fields} canEdit={canEdit} />
      </DialogContent>
    </Dialog>
  );
}

// ---- no verso do card -----------------------------------------------------------------------

function FieldEditor({ cardId, field, value, canEdit }: { cardId: string; field: FieldView; value: FieldValue | null; canEdit: boolean }) {
  const { pending, run } = useRun();
  const id = `campo-${field.id}`;
  const initial = value == null ? "" : field.type === "number" ? (value as number).toLocaleString("pt-BR", { maximumFractionDigits: 6, useGrouping: false }) : String(value);
  const [text, setText] = useState(initial);
  const save = (next: FieldValue | null) => run(() => setCardField({ cardId, fieldId: field.id, value: next }));
  const saveText = () => {
    if (text.trim() !== initial.trim()) save(text);
  };

  if (field.type === "checkbox") {
    return (
      <Label className="h-9 font-normal">
        <Checkbox checked={value === true} disabled={!canEdit || pending} onCheckedChange={(v) => save(v === true)} aria-label={field.name} />
        {field.name}
      </Label>
    );
  }
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs font-semibold text-muted-foreground">
        {field.name}
      </Label>
      {field.type === "list" ? (
        <Select value={typeof value === "string" ? value : "__vazio"} disabled={!canEdit || pending} onValueChange={(v) => save(v === "__vazio" ? null : v)}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__vazio">Sem valor</SelectItem>
            {field.options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === "date" ? (
        <Input id={id} type="date" value={typeof value === "string" ? value : ""} disabled={!canEdit || pending} onChange={(e) => save(e.target.value || null)} />
      ) : (
        <Input
          id={id}
          value={text}
          inputMode={field.type === "number" ? "decimal" : undefined}
          maxLength={field.type === "number" ? 30 : 1000}
          disabled={!canEdit || pending}
          placeholder={field.type === "number" ? "0,00" : "Sem valor"}
          onChange={(e) => setText(e.target.value)}
          onBlur={saveText}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveText();
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              setText(initial);
            }
          }}
        />
      )}
    </div>
  );
}

export function CardFields({ cardId, fields, canEdit }: { cardId: string; fields: (FieldView & { value: FieldValue | null })[]; canEdit: boolean }) {
  if (fields.length === 0) return null;
  return (
    <section aria-labelledby="card-campos" className="grid grid-cols-1 gap-3">
      <div className="flex items-center gap-3">
        <Settings2 aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        <h3 id="card-campos" className="text-base font-semibold">
          Campos
        </h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <FieldEditor key={`${f.id}-${String(f.value)}`} cardId={cardId} field={f} value={f.value} canEdit={canEdit} />
        ))}
      </div>
    </section>
  );
}
