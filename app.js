const textarea = document.getElementById('latex-input');
const convertBtn = document.getElementById('convert-btn');
const statusEl = document.getElementById('status');

function setStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.className = 'status' + (isError ? ' error' : '');
}

function slugify(name) {
  const base = (name || 'resume').trim().replace(/\s+/g, '_').replace(/[^\w-]/g, '');
  return (base || 'resume') + '.docx';
}

convertBtn.addEventListener('click', async () => {
  const latex = textarea.value;
  if (!latex.trim()) {
    setStatus('Paste your LaTeX resume code first.', true);
    return;
  }

  convertBtn.disabled = true;
  setStatus('Converting…', false);

  try {
    const data = window.parseLatexResume(latex);
    const blob = await buildResumeDocxBlob(data);

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = slugify(data.name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    setStatus('Downloaded ' + slugify(data.name) + '.', false);
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Something went wrong while converting.', true);
  } finally {
    convertBtn.disabled = false;
  }
});
