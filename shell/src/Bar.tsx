// The thin bar along the top: faces as numbered workspaces, like Omarchy's own, then the time.
import { mdiBrightness6, mdiCloudOffOutline, mdiViewGridOutline, mdiWeatherNight } from "@mdi/js";
import { useClock } from "./clock";
import type { Face } from "./faces";
import { Icon } from "./Icon";
import { usePower } from "./power";
import { locale, problem, useStore } from "./store";

type BarProps = {
  faces: Face[];
  // Unset on the home screen, where no face is showing.
  current?: number;
  onFace: (id: string) => void;
  onHome: () => void;
  onPanel: () => void;
};

export function Bar({ faces, current, onFace, onHome, onPanel }: BarProps) {
  const store = useStore();
  const { night } = usePower();
  const clock = useClock(locale(store));
  return (
    <div className="bar">
      <div className="workspaces">
        <button className="launch" aria-label="Open the home screen" onClick={onHome}>
          <Icon path={mdiViewGridOutline} />
        </button>
        {faces.map((face, i) => (
          <button key={face.id} aria-label={`Face ${i + 1}`} aria-current={i === current || undefined} onClick={() => onFace(face.id)}>
            {i + 1}
          </button>
        ))}
      </div>
      <div className="bar-time">
        {clock.weekday} {clock.time}
      </div>
      <div className="tray">
        {problem(store) && <Icon path={mdiCloudOffOutline} />}
        {night && <Icon path={mdiWeatherNight} />}
        <button aria-label="Panel settings" onClick={onPanel}>
          <Icon path={mdiBrightness6} />
        </button>
      </div>
    </div>
  );
}
