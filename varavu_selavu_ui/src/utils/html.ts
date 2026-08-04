/** Escapes HTML metacharacters in untrusted text.
 *
 * Used before building markup for `dangerouslySetInnerHTML`. Escaping the text
 * *first* and only then applying our own markdown substitutions means no
 * attacker-supplied markup can survive into the DOM — expense descriptions and
 * merchant names reflected back through the LLM are untrusted input.
 */
export function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
