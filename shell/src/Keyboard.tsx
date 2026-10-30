// An on-screen keyboard, as the panel has no other. It's for short things like addresses, so it
// favours the characters those use.
import { mdiBackspaceOutline, mdiClose } from "@mdi/js";
import { useState } from "react";
import { IconButton } from "./controls";
import { Icon } from "./Icon";

const LETTERS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const SYMBOLS = ["1234567890", "-_/:;()&@", "#?=+%.,"];

type KeyboardProps = {
  label: string;
  value: string;
  hidden?: boolean;
  onDone: (text: string) => void;
  onCancel: () => void;
};

export function Keyboard({ label, value, hidden, onDone, onCancel }: KeyboardProps) {
  const [text, setText] = useState(value);
  const [shift, setShift] = useState(false);
  const [symbols, setSymbols] = useState(false);
  const add = (key: string) => {
    setText((current) => current + key);
    setShift(false);
  };
  const rows = symbols ? SYMBOLS : LETTERS;
  return (
    <div className="keyboard">
      <div className="keyboard-head">
        <span className="label">{label}</span>
        <IconButton icon={mdiClose} label="Cancel" onClick={onCancel} />
      </div>
      <div className="keyboard-text">
        {hidden ? "•".repeat(text.length) : text}
        <i />
      </div>
      {rows.map((row) => (
        <div key={row} className="keys">
          {[...row].map((key) => {
            const shown = shift ? key.toUpperCase() : key;
            return (
              <button key={key} className="chip" onClick={() => add(shown)}>
                {shown}
              </button>
            );
          })}
        </div>
      ))}
      <div className="keys">
        <button className="chip wide" onClick={() => setSymbols(!symbols)}>
          {symbols ? "abc" : "123"}
        </button>
        <button className="chip wide" data-selected={shift || undefined} onClick={() => setShift(!shift)}>
          shift
        </button>
        <button className="chip" onClick={() => add(":")}>
          :
        </button>
        <button className="chip" onClick={() => add("/")}>
          /
        </button>
        <button className="chip space" aria-label="Space" onClick={() => add(" ")} />
        <button className="chip" onClick={() => add(".")}>
          .
        </button>
        <button className="chip wide" aria-label="Delete" onClick={() => setText(text.slice(0, -1))}>
          <Icon path={mdiBackspaceOutline} />
        </button>
        <button className="chip wide" data-selected onClick={() => onDone(text)}>
          done
        </button>
      </div>
    </div>
  );
}
