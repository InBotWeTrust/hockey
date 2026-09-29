function copyWithSelection(value: string): boolean {
  if (typeof document.execCommand !== 'function') return false;

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.readOnly = true;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.append(textarea);
  textarea.focus();
  textarea.select();

  try {
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  } finally {
    textarea.remove();
  }
}

export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // iOS standalone PWAs can expose the API and still reject the write.
  }

  return copyWithSelection(value);
}
