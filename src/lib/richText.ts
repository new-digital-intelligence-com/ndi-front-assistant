// Clara's words made ready to show or send, on the server and in the browser (the user's requests, 4 Oct 2026):
//
// - Audio tags. Clara's voice model (ElevenLabs' eleven_v3_conversational with expressive mode) has her write
//   tags such as [happy] or [calm] for the voice to act out. Written down they are noise, so they are taken out
//   wherever her words are shown or sent: the website, email, Instagram, Messenger, transcripts. (Telegram has
//   no code of ours in between: there, a rule in her prompt keeps them out of written channels.)
// - Links. Every web address, www. address, bare address such as calendly.com/michael-burian-ndi, and email
//   address in a text is found, so the website can make it clickable (src/components/LinkedText.tsx), and a
//   YouTube link can show the video's picture.

/** [happy], [calm], [laughs softly]: lower-case words in brackets, never the label of a markdown link. */
const AUDIO_TAG = /[ \t]*\[[a-z]+(?:[ -][a-z]+){0,3}\](?!\()[ \t]*/g;

export function stripAudioTags(text: string): string {
  if (!text.includes("[")) return text;
  return text
    .replace(AUDIO_TAG, (match: string, offset: number, whole: string) => {
      const before = offset === 0 ? "\n" : whole[offset - 1];
      const after = whole[offset + match.length] ?? "\n";
      // Between two words a space stays; at the start or end of a line, or before punctuation, nothing does.
      return before === "\n" || after === "\n" || /[.,!?;:)]/.test(after) ? "" : " ";
    })
    .trim();
}

export type Segment = { text: string; href?: string };

const TLDS = "com|ch|de|io|ai|org|net|co|uk|fr|it|eu|app|dev|info|tv|me|us|at|es|nl|be|li";
const LINK = new RegExp(
  [
    String.raw`\[([^\]\n]{1,300})\]\((https?:\/\/[^\s)]+)\)`, // a markdown link: [label](address)
    String.raw`(https?:\/\/[^\s<>"'\]]+)`, // a full address
    String.raw`(www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s<>"'\]]*)`, // www.example.com/…
    String.raw`([a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})`, // an email address
    String.raw`\b((?:[a-z0-9-]+\.)+(?:${TLDS})\b(?:\/[^\s<>"'\]]*)?)`, // calendly.com/…, new-digital-intelligence.com
  ].join("|"),
  "gi",
);

/** Sentence punctuation after an address belongs to the sentence, and so does a ")" with no "(" in it. */
function trimAddress(value: string): string {
  let address = value.replace(/[.,!?;:'"]+$/, "");
  while (address.endsWith(")") && (address.match(/\(/g)?.length ?? 0) < (address.match(/\)/g)?.length ?? 0)) {
    address = address.slice(0, -1).replace(/[.,!?;:'"]+$/, "");
  }
  return address;
}

/** The text cut into plain pieces and links, in order. */
export function linkSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  const push = (piece: Segment) => {
    if (!piece.text) return;
    const previous = segments.at(-1);
    if (!piece.href && previous && !previous.href) previous.text += piece.text;
    else segments.push(piece);
  };
  for (const match of text.matchAll(LINK)) {
    const start = match.index ?? 0;
    const [whole, label, labelled, full, www, email, bare] = match;
    let shown = whole;
    let href: string;
    if (labelled) {
      href = labelled;
    } else {
      shown = trimAddress(full ?? www ?? email ?? bare ?? whole);
      href = full ? shown : email ? `mailto:${shown}` : `https://${shown}`;
    }
    push({ text: text.slice(last, start) });
    push({ text: labelled ? label : shown, href });
    last = start + shown.length;
    if (labelled) last = start + whole.length;
  }
  push({ text: text.slice(last) });
  return segments;
}

/** The text as markdown in which every address is a link (markdown links already there are kept). */
export function linkifyMarkdown(text: string): string {
  return linkSegments(text)
    .map((piece) => (piece.href ? `[${piece.text.replace(/[[\]]/g, "")}](${piece.href.replace(/\)/g, "%29")})` : piece.text))
    .join("");
}

/** The video id of a YouTube address (watch, youtu.be, shorts, embed, live), or null. */
export function youtubeId(href: string): string | null {
  const match = href.match(
    /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i,
  );
  return match ? match[1] : null;
}

/** The YouTube videos a text links to, each once, in order. */
export function youtubeIds(text: string, max = 3): string[] {
  const ids: string[] = [];
  for (const piece of linkSegments(text)) {
    const id = piece.href ? youtubeId(piece.href) : null;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, max);
}
