// How the manual's Markdown is drawn: headings get an address to link to, links inside the site
// stay inside it, and tables can scroll on a narrow screen.
import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { Children, isValidElement, type ComponentProps, type ReactNode } from "react";
import { Note } from "@/components/Note";
import { Shot } from "@/components/Shot";

function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => (typeof child === "string" ? child : isValidElement<{ children?: ReactNode }>(child) ? textOf(child.props.children) : ""))
    .join("");
}

const anchor = (node: ReactNode) => textOf(node).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function heading(Tag: "h2" | "h3") {
  return function Heading({ children }: { children?: ReactNode }) {
    const id = anchor(children);
    return (
      <Tag id={id}>
        {children}
        <a className="anchor" href={`#${id}`} aria-label={`Link to ${textOf(children)}`}>
          #
        </a>
      </Tag>
    );
  };
}

function SiteLink({ href = "", children, ...rest }: ComponentProps<"a">) {
  return href.startsWith("/") ? <Link href={href}>{children}</Link> : <a href={href} {...rest}>{children}</a>;
}

function ScrollingTable(props: ComponentProps<"table">) {
  return (
    <div className="table-scroll">
      <table {...props} />
    </div>
  );
}

const components: MDXComponents = { h2: heading("h2"), h3: heading("h3"), a: SiteLink, table: ScrollingTable, Note, Shot };

export function useMDXComponents(): MDXComponents {
  return components;
}
