/**
 * NDI's logo, drawn rather than loaded so it stays sharp at any size: "NDI" in heavy red capitals
 * (#fe0100) over "NEW DIGITAL INTELLIGENCE" in black, exactly as wide as the letters. Without the
 * tagline it is the letters alone, for headers where the tagline would be too small to read.
 * Size it with a height, e.g. className="h-7 w-auto".
 */
export function NdiLogo({ tagline = true, className = "" }: { tagline?: boolean; className?: string }) {
  return (
    <svg
      viewBox={tagline ? "0 0 184 106" : "0 0 184 72"}
      overflow="visible"
      role="img"
      aria-label="NDI – New Digital Intelligence"
      className={className}
    >
      <text x="0" y="72" fontSize="99" textLength="184" lengthAdjust="spacingAndGlyphs" fill="#fe0100" className="font-logo">
        NDI
      </text>
      {tagline && (
        <text
          x="4"
          y="104"
          fontSize="11.3"
          fontWeight="700"
          textLength="176"
          lengthAdjust="spacing"
          fill="#000000"
          fontFamily="Arial, Helvetica, sans-serif"
        >
          NEW DIGITAL INTELLIGENCE
        </text>
      )}
    </svg>
  );
}
