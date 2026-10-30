// Settings: the panel, its theme and faces, and each plugin. A plugin's screen is built from the
// schema in its manifest, so a plugin needs no UI of its own to be configured.
import { useState } from "react";
import { Choices, Slider } from "./controls";
import { faceChoices, modularTiles } from "./faces";
import { Keyboard } from "./Keyboard";
import { allTiles, updatePanel, updatePlugin, useStore, type PanelSettings, type PluginSummary, type SettingField } from "./store";

const MODULAR_TILES = 3;

const NIGHT_OPTIONS = [
  { value: "auto", label: "22:00 to 07:00" },
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

const SLEEP_OPTIONS = [
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "60 minutes" },
  { value: "0", label: "Never" },
];

const ON_OFF = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

export function PanelControls() {
  const panel = useStore().snapshot?.panel;
  if (!panel) return null;
  return (
    <>
      <Slider
        label="Brightness"
        value={panel.brightness}
        min={5}
        max={100}
        step={5}
        format={(value) => `${value}%`}
        onChange={(brightness) => updatePanel({ brightness })}
      />
      <Choices
        label="Night mode"
        options={NIGHT_OPTIONS}
        value={panel.night}
        onChange={(night) => updatePanel({ night: night as PanelSettings["night"] })}
      />
      <Choices
        label="Turn the screen off after"
        options={SLEEP_OPTIONS}
        value={String(panel.blankAfter)}
        onChange={(minutes) => updatePanel({ blankAfter: Number(minutes) })}
      />
    </>
  );
}

// A set of chips that can each be on or off, rather than one of several.
function Toggles({ label, options, on, onChange }: { label: string; options: { value: string; label: string }[]; on: string[]; onChange: (on: string[]) => void }) {
  return (
    <div className="choices">
      <div className="label">{label}</div>
      <div className="options">
        {options.map(({ value, label: name }) => (
          <button
            key={value}
            className="chip"
            data-selected={on.includes(value) || undefined}
            onClick={() => onChange(on.includes(value) ? on.filter((other) => other !== value) : [...on, value])}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThemeSettings() {
  const { panel, themes = [] } = useStore().snapshot ?? {};
  if (!panel) return null;
  const options = [{ value: "", label: "As set up" }, ...themes.map((theme) => ({ value: theme, label: theme }))];
  return <Choices label="Theme" options={options} value={panel.theme} onChange={(theme) => updatePanel({ theme })} />;
}

function FaceSettings() {
  const store = useStore();
  const panel = store.snapshot?.panel;
  if (!panel) return null;
  const tiles = allTiles(store);
  const bigs = tiles.filter(({ value, kind }) => value != null && kind !== "summary");
  const small = tiles.filter(({ kind }) => kind !== "scene" && kind !== "media");
  const { main, small: shown } = modularTiles(store);
  const faces = faceChoices.map(({ id, name }) => ({ value: id, label: name }));
  return (
    <>
      <Toggles
        label="Faces"
        options={faces}
        on={panel.faces}
        // Always in the same order, whichever was turned on last.
        onChange={(on) => updatePanel({ faces: faceChoices.map(({ id }) => id).filter((id) => on.includes(id)) })}
      />
      {bigs.length > 0 && (
        <Choices
          label="Modular: main window"
          options={bigs.map(({ id, name, room }) => ({ value: id, label: room ? `${room}: ${name}` : name }))}
          value={main?.id}
          onChange={(id) => updatePanel({ modular: { ...panel.modular, main: id } })}
        />
      )}
      {small.length > 0 && (
        <Toggles
          label={`Modular: up to ${MODULAR_TILES} small tiles`}
          options={small.map(({ id, name, room }) => ({ value: id, label: room ? `${room}: ${name}` : name }))}
          on={shown.map(({ id }) => id)}
          onChange={(on) => updatePanel({ modular: { ...panel.modular, tiles: on.slice(-MODULAR_TILES) } })}
        />
      )}
    </>
  );
}

function Field({ field, value, onSave, onEdit }: { field: SettingField; value: string | number | boolean | undefined; onSave: (value: unknown) => void; onEdit: () => void }) {
  switch (field.type) {
    case "boolean":
      return <Choices label={field.label} options={ON_OFF} value={value ? "on" : "off"} onChange={(next) => onSave(next === "on")} />;
    case "select":
      return <Choices label={field.label} options={field.options} value={String(value ?? "")} onChange={onSave} />;
    case "number":
      return (
        <Slider
          label={field.label}
          value={Number(value ?? field.min)}
          min={field.min}
          max={field.max}
          step={field.step}
          format={(number) => String(number)}
          onChange={onSave}
        />
      );
    default:
      return (
        <button className="field" onClick={onEdit}>
          <span className="label">{field.label}</span>
          <span className="field-value">{String(value ?? "") || "Not set"}</span>
          {field.description && <span className="dim field-help">{field.description}</span>}
        </button>
      );
  }
}

function statusLine({ enabled, status }: PluginSummary) {
  if (!enabled) return "Off";
  if (status.message) return status.message;
  return status.state === "ok" ? "Connected" : status.state === "starting" ? "Starting…" : "Waiting";
}

function PluginSettings({ plugin }: { plugin: PluginSummary }) {
  const [editing, setEditing] = useState<SettingField>();
  const save = (key: string, value: unknown) => updatePlugin(plugin.id, { values: { [key]: value } });
  return (
    <>
      <div className="dim">{plugin.description}</div>
      <div data-problem={plugin.status.state === "error" || undefined} className="plugin-status">
        {statusLine(plugin)}
      </div>
      <Choices
        label="Plugin"
        options={ON_OFF}
        value={plugin.enabled ? "on" : "off"}
        onChange={(next) => updatePlugin(plugin.id, { enabled: next === "on" })}
      />
      {plugin.schema.map((field) => (
        <Field
          key={field.key}
          field={field}
          value={plugin.values[field.key]}
          onSave={(value) => save(field.key, value)}
          onEdit={() => setEditing(field)}
        />
      ))}
      {editing && (
        <Keyboard
          label={editing.label}
          // A secret can only be replaced, as byobud never sends it back.
          value={editing.type === "secret" ? "" : String(plugin.values[editing.key] ?? "")}
          hidden={editing.type === "secret"}
          onDone={(text) => {
            save(editing.key, text);
            setEditing(undefined);
          }}
          onCancel={() => setEditing(undefined)}
        />
      )}
    </>
  );
}

export function SettingsApp() {
  const plugins = useStore().snapshot?.plugins ?? [];
  const [page, setPage] = useState("display");
  const plugin = plugins.find(({ id }) => id === page);
  const pages = [
    { id: "display", name: "Display" },
    { id: "theme", name: "Theme" },
    { id: "faces", name: "Faces" },
    ...plugins.map(({ id, name }) => ({ id, name })),
  ];
  return (
    <div className="rooms">
      <div className="room-list scroll">
        {pages.map(({ id, name }) => (
          <button key={id} aria-current={id === page || undefined} onClick={() => setPage(id)}>
            {name}
          </button>
        ))}
      </div>
      <div className="settings scroll">
        {page === "display" && <PanelControls />}
        {page === "theme" && <ThemeSettings />}
        {page === "faces" && <FaceSettings />}
        {plugin && <PluginSettings key={plugin.id} plugin={plugin} />}
      </div>
    </div>
  );
}
