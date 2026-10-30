// An icon from @mdi/js, the Material Design Icons set Home Assistant uses.
export function Icon({ path }: { path: string }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
