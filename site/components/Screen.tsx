"use client";
// The hero: the real screen folded like a byōbu, which opens flat as the page scrolls. Each leaf
// is the next sixth of the same picture, hinged to the one before, so the folds stay joined at any
// angle. The CSS does the folding, and the buttons here change which face it's showing.
import Image from "next/image";
import { useEffect, useState, type CSSProperties } from "react";

const FACES = [
  { id: "modular", name: "modular", about: "Climate, time, lights, locks and blinds.", alt: "The Modular face: the heating at 20.5 degrees, the time, the next event, and tiles counting lights, locks and blinds." },
  { id: "clock", name: "clock", about: "The time, with the weather and what's coming up.", alt: "The Clock face: a large clock, the weather and the week's agenda." },
  { id: "weather", name: "weather", about: "Now, then the next few hours and the chance of rain.", alt: "The Weather face: 14 degrees and partly cloudy, with bars for rain over the coming hours." },
  { id: "music", name: "now playing", about: "There only while something's playing.", alt: "The Now Playing face: album art, the song Low Tide, a progress bar and playback buttons." },
  { id: "cameras", name: "cameras", about: "Each camera in its own window.", alt: "The Cameras face: pixel-art views of a front door and a garden." },
];
const LEAVES = 6;
const SIZES = "(min-width: 1180px) 1120px, 100vw";

const source = (id: string) => `/shots/${id}.webp`;

function Leaf({ index, id, alt }: { index: number; id: string; alt: string }) {
  return (
    <div className="fold" data-side={index === 0 ? "first" : index % 2 ? "back" : "front"}>
      <div className="leaf" style={{ "--leaf": index } as CSSProperties}>
        <Image src={source(id)} alt={index === 0 ? alt : ""} width={2560} height={1440} sizes={SIZES} quality={85} {...(index === 0 ? { preload: true } : { loading: "eager" })} />
      </div>
      {index + 1 < LEAVES && <Leaf index={index + 1} id={id} alt={alt} />}
    </div>
  );
}

export function Screen() {
  const [face, setFace] = useState(FACES[0]);
  // The other faces load once the page has, so changing face doesn't flash.
  const [settled, setSettled] = useState(false);
  useEffect(() => setSettled(true), []);
  return (
    <section className="screen" aria-label="The panel's faces">
      <div className="folds">
        <Leaf index={0} id={face.id} alt={face.alt} />
      </div>
      <div className="faces-bar">
        <div className="workspaces">
          {FACES.map((other, i) => (
            <button key={other.id} aria-pressed={other === face} onClick={() => setFace(other)}>
              <b>{i + 1}</b> {other.name}
            </button>
          ))}
        </div>
        <p className="dim">{face.about}</p>
      </div>
      {settled && (
        <div hidden>
          {FACES.filter((other) => other !== face).map(({ id }) => (
            <Image key={id} src={source(id)} alt="" width={2560} height={1440} sizes={SIZES} quality={85} loading="eager" />
          ))}
        </div>
      )}
    </section>
  );
}
