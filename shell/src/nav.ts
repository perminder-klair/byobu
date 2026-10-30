// Moving around the shell, for anything that links to a face or an app.
import { createContext } from "react";

export type Navigation = {
  openFace: (id: string) => void;
  openApp: (id: string) => void;
};

export const Nav = createContext<Navigation>({ openFace: () => {}, openApp: () => {} });
