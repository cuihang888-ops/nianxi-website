import React, { useEffect, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { ANIMAL_TYPES } from "./farm-state.js";

export function companionName(animal, tr) {
  const spec = ANIMAL_TYPES[animal.type];
  return !animal.name || animal.name === spec.name || animal.name === spec.nameEn
    ? tr(spec.name, spec.nameEn) : animal.name;
}

export default function CompanionName({ animal, onAction, tr }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(false);
  const editButton = useRef(null);
  const name = companionName(animal, tr);
  useEffect(() => { setEditing(false); setError(false); }, [animal.id]);
  const finish = () => { setEditing(false); setError(false); requestAnimationFrame(() => editButton.current?.focus()); };
  const label = tr("修改小伙伴名字", "Rename companion");

  return <div className="companion-name">
    {editing ? <form className="companion-name-form" onSubmit={event => {
      event.preventDefault();
      if (onAction({ type: "renameAnimal", animalId: animal.id, name: draft })) finish();
      else setError(true);
    }}>
      <div className="companion-name-fields">
        <input autoFocus aria-label={tr("小伙伴名字", "Companion name")} value={draft} aria-invalid={error}
          onChange={event => { setDraft(event.target.value); setError(false); }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) {
              event.stopPropagation();
              if (event.key === "Enter") event.preventDefault();
              return;
            }
            if (event.key === "Escape") { event.stopPropagation(); finish(); }
          }} />
        <button type="submit" title={tr("保存名字", "Save name")} aria-label={tr("保存名字", "Save name")}><Check size={16} /></button>
        <button type="button" onClick={finish} title={tr("取消改名", "Cancel rename")} aria-label={tr("取消改名", "Cancel rename")}><X size={16} /></button>
      </div>
      {error && <span className="companion-name-error" role="alert">{tr("名字需要 1–12 个可见字符", "Use 1–12 visible characters")}</span>}
    </form> : <div className="companion-name-label"><h4>{name}</h4><button ref={editButton} type="button" title={label} aria-label={label} onClick={() => { setDraft(name); setError(false); setEditing(true); }}><Pencil size={14} /></button></div>}
  </div>;
}
