import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";
import { CHAPTERS, FRONT, hrefOf, PARTS, type Chapter } from "@/lib/chapters";

type Props = { params: Promise<{ slug?: string[] }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return CHAPTERS.map((chapter) => ({ slug: chapter === FRONT ? [] : [chapter.slug] }));
}

function chapterFor(slug: string[] = []) {
  if (slug.length === 0) return FRONT;
  return slug.length === 1 && slug[0] !== FRONT.slug ? CHAPTERS.find((chapter) => chapter.slug === slug[0]) : undefined;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const chapter = chapterFor((await params).slug);
  if (!chapter) return {};
  return { title: chapter === FRONT ? "Manual" : `${chapter.title} · Manual`, description: chapter.summary };
}

function Chapters({ current }: { current: Chapter }) {
  let number = 0;
  return PARTS.map(({ name, chapters }) => (
    <div key={name} className="part">
      <div className="part-name">{name}</div>
      {chapters.map((chapter) => (
        <Link key={chapter.slug} href={hrefOf(chapter)} aria-current={chapter === current ? "page" : undefined}>
          <b>{++number}</b>
          {chapter.title}
        </Link>
      ))}
    </div>
  ));
}

export default async function ManualPage({ params }: Props) {
  const chapter = chapterFor((await params).slug);
  if (!chapter) notFound();
  const { default: Content } = await import(`@/content/manual/${chapter.slug}.mdx`);
  const index = CHAPTERS.indexOf(chapter);
  const [previous, next] = [CHAPTERS[index - 1], CHAPTERS[index + 1]];
  return (
    <div className="manual">
      <nav className="contents" aria-label="Chapters">
        <Chapters current={chapter} />
      </nav>
      <div className="chapter">
        <header className="manual-head">
          <Link href="/manual/" aria-label="Manual front page">
            <Wordmark />
          </Link>
          <span>manual</span>
        </header>
        <details className="contents-small">
          <summary>Chapters</summary>
          <nav aria-label="Chapters">
            <Chapters current={chapter} />
          </nav>
        </details>
        <article className="prose">
          <h1>{chapter.title}</h1>
          <Content />
        </article>
        <nav className="pager" aria-label="Next and previous chapters">
          {previous ? (
            <Link href={hrefOf(previous)} rel="prev">
              <span className="dim">previous</span>
              {previous.title}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link className="next" href={hrefOf(next)} rel="next">
              <span className="dim">next</span>
              {next.title}
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}
