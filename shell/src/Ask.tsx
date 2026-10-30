// The assistant: a prompt line, and answers that come back as words with the live tiles they're
// about. On the panel the on-screen keyboard types; on a phone, the phone's.
import { mdiClose, mdiMicrophone } from "@mdi/js";
import { useContext, useEffect, useRef, useState, type SubmitEvent } from "react";
import { ActionButton, IconButton } from "./controls";
import { Icon } from "./Icon";
import { Keyboard } from "./Keyboard";
import { OnPhone } from "./settings";
import { act, conversationOf, findTile, useStore, type Placed, type Conversation } from "./store";
import { TileView } from "./tiles";

function Turns({ conversation }: { conversation: Placed<Conversation> }) {
  const store = useStore();
  const end = useRef<HTMLDivElement>(null);
  const { turns, busy, plugin } = conversation;
  const last = turns.at(-1);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns.length, last?.text, last?.confirm?.length]);
  return (
    <div className="ask-turns scroll">
      {turns.map(({ id, role, text, tiles = [], confirm = [] }, i) =>
        role === "user" ? (
          <div key={id} className="ask-question">
            <b>❯</b> {text}
          </div>
        ) : (
          <div key={id} className="ask-answer">
            <div>{text || (busy && i === turns.length - 1 ? <span className="dim">…</span> : "")}</div>
            {tiles.length > 0 && (
              <div className="ask-tiles">
                {tiles.flatMap(({ plugin: owner, id: tile }) => findTile(store, owner, tile) ?? []).map((tile) => (
                  <TileView key={tile.id} tile={tile} />
                ))}
              </div>
            )}
            {confirm.map(({ icon, label, selected, action }) => (
              <ActionButton key={label} icon={icon} label={label} selected={selected} onClick={() => act(plugin, action)} />
            ))}
          </div>
        ),
      )}
      <div ref={end} />
    </div>
  );
}

function PhonePrompt({ onAsk }: { onAsk: (text: string) => void }) {
  const [text, setText] = useState("");
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (text.trim()) onAsk(text);
    setText("");
  };
  return (
    <form className="ask-form" onSubmit={submit}>
      <b>❯</b>
      <input value={text} placeholder="ask byōbu" enterKeyHint="send" onChange={(event) => setText(event.target.value)} />
    </form>
  );
}

// Recording runs while the finger's down, on the panel's own microphone.
function HoldToTalk({ conversation }: { conversation: Placed<Conversation> }) {
  const { plugin, listening } = conversation;
  return (
    <button
      className="hold-to-talk"
      data-listening={listening || undefined}
      aria-label="Hold to talk"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        act(plugin, { id: "listen" });
      }}
      onPointerUp={() => act(plugin, { id: "heard" })}
      onPointerCancel={() => act(plugin, { id: "heard" })}
    >
      <Icon path={mdiMicrophone} />
    </button>
  );
}

// Everything but the prompt's own way of typing is the same on both.
export function Ask({ onClose }: { onClose?: () => void }) {
  const store = useStore();
  const onPhone = useContext(OnPhone);
  const conversation = conversationOf(store);
  const empty = (conversation?.turns.length ?? 0) === 0;
  const [byVoice] = useState(conversation?.listening);
  const [lastBefore] = useState(conversation?.turns.at(-1)?.id);
  const [typing, setTyping] = useState(!onPhone && empty && !byVoice);
  // The wake phrase opened this, and then nobody said anything.
  const nothingCame = byVoice && conversation?.turns.at(-1)?.id === lastBefore && !conversation?.listening && !conversation?.busy;
  useEffect(() => {
    if (nothingCame) onClose?.();
  }, [nothingCame, onClose]);
  if (!conversation) return null;
  const ask = (text: string) => act(conversation.plugin, { id: "ask" }, text);
  return (
    <div className="ask">
      {!onPhone && onClose && (
        <div className="ask-head">
          <IconButton icon={mdiClose} label="Close" onClick={onClose} />
        </div>
      )}
      <Turns conversation={conversation} />
      {onPhone ? (
        <PhonePrompt onAsk={ask} />
      ) : (
        <div className="ask-prompt">
          <button className="win prompt" onClick={() => setTyping(true)}>
            <b>❯</b>
            <span>{conversation.listening ? "listening…" : conversation.busy ? "thinking…" : "ask byōbu"}</span>
            <i className="caret" />
          </button>
          {conversation.voice && store.snapshot?.microphone && <HoldToTalk conversation={conversation} />}
        </div>
      )}
      {typing && (
        <Keyboard
          label="Ask byōbu"
          value=""
          onDone={(text) => {
            setTyping(false);
            if (text.trim()) ask(text);
            else if (empty) onClose?.();
          }}
          onCancel={() => {
            setTyping(false);
            if (empty) onClose?.();
          }}
        />
      )}
    </div>
  );
}
