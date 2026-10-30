// A real screenshot of the panel or the phone app, in a window. scripts/capture.mjs takes them.
import Image from "next/image";
import { Win } from "./Win";

type ShotProps = {
  name: string;
  alt: string;
  title?: string;
  number?: number;
  focused?: boolean;
  phone?: boolean;
  sizes?: string;
  className?: string;
};

export function Shot({ name, alt, title, number, focused, phone, sizes = "(min-width: 900px) 800px, 100vw", className }: ShotProps) {
  const [width, height] = phone ? [780, 1688] : [2560, 1440];
  return (
    <Win title={title} number={number} focused={focused} className={["shot", className].filter(Boolean).join(" ")}>
      <Image src={`/shots/${name}.webp`} alt={alt} width={width} height={height} sizes={sizes} quality={85} />
    </Win>
  );
}
