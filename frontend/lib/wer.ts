// Word error rate, used by voice setup to score how well each model heard a sentence.

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

// Whisper writes "40 minutes"; the sentence says "forty minutes". Treat them as the same.
function numberWords(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : "");
}

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/(\d+)/g, (_, d: string) => (Number(d) < 100 ? ` ${numberWords(Number(d))} ` : ` ${d} `))
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/'/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

export type Alignment = { wer: number; swaps: { heard: string; meant: string }[] };

// Edit distance between what should have been said and what was heard, plus the
// one-for-one word swaps ("scrip" for "script"), which make good corrections.
export function align(expected: string, heard: string): Alignment {
  const a = words(expected);
  const b = words(heard);
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  const swaps: { heard: string; meant: string }[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1] && d[i][j] === d[i - 1][j - 1]) {
      i--;
      j--;
    } else if (d[i][j] === d[i - 1][j - 1] + 1) {
      swaps.push({ heard: b[j - 1], meant: a[i - 1] });
      i--;
      j--;
    } else if (d[i][j] === d[i - 1][j] + 1) i--;
    else j--;
  }
  return { wer: a.length ? d[a.length][b.length] / a.length : 0, swaps: swaps.reverse() };
}
