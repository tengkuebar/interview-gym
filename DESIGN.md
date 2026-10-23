# Interview Gym: Design Spec

Direction: **soft sage**, light default with a dark variant. Sans-serif headings. Chat as message bubbles.
Mood: calm, warm, low-pressure. A quiet room, not a game.

## 1. Colour tokens

All contrast ratios checked against WCAG (AA needs 4.5 for body text, 3 for large text and UI).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F6F4EF` | `#141A17` | Page |
| `--surface` | `#FFFFFF` | `#1C2420` | Cards, character bubbles, inputs |
| `--ink` | `#1F2A27` | `#E9EEEA` | Body text (13.5:1 / 15.0:1) |
| `--ink-muted` | `#5E6B64` | `#93A39A` | Secondary text (5.1:1 / 6.7:1) |
| `--line` | `#E2DED3` | `#2A342F` | Hairline borders |
| `--accent` | `#7A9E8B` | `#8DB9A2` | Fills: send button, user bubble |
| `--on-accent` | `#10201A` | `#0E1A14` | Text on accent (5.7:1 / 8.2:1) |
| `--accent-text` | `#4A7160` | `#8DB9A2` | Accent used as text or icon (5.0:1 / 8.1:1) |
| `--worked-bg` / `--worked-ink` | `#DCE8E0` / `#1F4535` | `#243A30` / `#B5DCC8` | "Worked" feedback chip |
| `--try-bg` / `--try-ink` | `#F2DDD0` / `#6B3A22` | `#3A2C24` / `#E8C2A8` | "Try next" feedback chip (clay) |
| `--focus` | `#4A7160` | `#8DB9A2` | Focus ring (2px, 2px offset) |
| `--danger-ink` | `#8A3B2A` | `#E8A090` | Errors only (never for feedback) |

Rules:
- The raw accent `#7A9E8B` is 2.7:1 on the page background, so **never use it for text or icons on light**. Use `--accent-text`.
- Feedback uses sage ("worked") and clay ("try next"). No red, no scores out of 100.
- One filled accent button per view.
- Dark mode follows `prefers-color-scheme` by default, with a manual toggle stored in `localStorage` (wrapped in try/catch).

## 2. Typography

- **UI and headings:** DM Sans (400, 500). Two weights only.
- **Mono (code, timers):** system mono.
- Scale: caption 12, body 15, chat 16, heading 20, title 28. Line height 1.5 body, 1.25 headings.
- Sentence case everywhere. No terminal punctuation on labels. Verb-first buttons ("Start practice", "End session").

## 3. Shape and layout

- Radii: control 10px, bubble 16px (with a 6px corner on the speaker's side), card 16px.
- Borders: 0.5-1px hairlines with `--line`. Shadows are rare and soft; elevation mostly comes from surface colour.
- Spacing base 4px; page gutters 16px mobile, 24px desktop.
- Chat column max width 720px, centred. Persona panel (name, role, voice picker, hint, rewind) in a side column on wide screens, collapsed into a sheet on narrow ones.
- Desktop first, but usable at 375px.

## 4. Chat bubbles

- **Character:** `--surface` fill, `--line` border, left aligned, small avatar initial in an accent-tinted circle.
- **User:** `--accent` fill with `--on-accent` text, right aligned.
- Max width 80% of the column. Consecutive messages from one speaker group tightly (4px gap), speaker changes get 12px.
- Streaming text grows in place without layout jumps; a subtle three-dot "typing" indicator appears before the first token.
- Each character bubble has a quiet speaker icon button to play the reply aloud, and captions are always visible.

## 5. Key screens

1. **Setup:** pick persona (cards), difficulty (Gentle / Realistic / Tough), optional job ad textarea, voice picker with preview, one primary button "Start practice".
2. **Session:** chat column, side tools (Hint, Suggest a reply, Rewind one turn, Pause), "End session" as a quiet secondary action.
3. **Report:** note-style layout. Summary, "What worked" (sage chips with quotes), "Try next" (one clay card with rewritten answer), small metrics row. Button "Practise again".
4. **History:** list of past sessions with date, persona, one-line takeaway; delete per item.

## 6. Motion (emil-design-eng)

Tokens:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--dur-press: 140ms;
--dur-fast: 160ms;
--dur-base: 220ms;
--dur-exit: 140ms;
```

| Element | Behaviour |
|---|---|
| Buttons, cards, chips | `transform: scale(0.97)` on `:active`, 140ms ease-out |
| Message bubble enter | opacity 0 to 1, translateY 8px to 0, scale 0.97 to 1, 220ms ease-out, via `@starting-style` or a mounted attribute |
| Typing indicator | simple opacity pulse, no bounce |
| Panels and sheets | 220ms ease-out; exits 140ms |
| Hover effects | only inside `@media (hover: hover) and (pointer: fine)`, colour or opacity only |
| Report sections | stagger 50ms between sections, never blocks interaction |
| Theme toggle | no animation on the colour swap |

Rules:
- No animation on keyboard-initiated actions (send with Enter, shortcuts).
- No `transition: all`, no `ease-in`, no `scale(0)`, no keyframes on rapidly triggered UI (use transitions).
- Animate only `transform` and `opacity`.
- `prefers-reduced-motion`: remove movement, keep short opacity fades.
- No bounce anywhere; personality is soft and unhurried.

## 7. Accessibility

- Visible focus ring on every interactive element.
- Minimum 44px touch targets on mobile.
- Colour is never the only signal: feedback chips carry text labels ("Worked", "Try next").
- Captions for all audio; audio never autoplays without the user enabling it in setup.
- Live region announces new character messages for screen readers.

## 8. Components (shadcn/ui base, restyled with the tokens)

Button (primary, secondary, ghost), Card, Textarea, Select, Tabs, Sheet, Tooltip (125ms, instant on adjacent hover), Toast, Chip, Avatar, ThemeToggle, ChatBubble, TypingIndicator, PersonaCard, VoicePicker, ReportSection.

## 9. Implementation notes

- Tokens live as CSS variables in `app/globals.css`, with `[data-theme="dark"]` and a `prefers-color-scheme` fallback; Tailwind reads them via the theme config.
- Fonts via `next/font` (DM Sans) to avoid layout shift.
- Motion in plain CSS first; add `motion` (Framer) only if a gesture needs it.
