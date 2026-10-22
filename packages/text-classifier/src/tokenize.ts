export function tokenize(text: string): string[] {
  return (text.toLocaleLowerCase().match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/g) ?? []).filter((token) => token.length > 1);
}
