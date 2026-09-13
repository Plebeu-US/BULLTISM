(function matrixConsoleSignature() {
  const message = 'Website built by Plebeu. I am not affiliated with this project itself; I only built the website.';
  const glyphs = '01BULLTISM$#@<>/\\{}[]()+=_-*';
  let frame = 0;

  function randomLine(width) {
    let line = '';

    for (let index = 0; index < width; index += 1) {
      line += glyphs[Math.floor(Math.random() * glyphs.length)];
    }

    return line;
  }

  function revealText(text, amount) {
    return text
      .split('')
      .map((char, index) => {
        if (char === ' ') return ' ';
        return index < amount ? char : glyphs[Math.floor(Math.random() * glyphs.length)];
      })
      .join('');
  }

  function draw() {
    const revealAmount = Math.min(message.length, Math.floor(frame * 9));
    const title = revealText(message, revealAmount);
    const matrixBlock = Array.from({ length: 8 }, (_, index) => {
      const width = 54 + ((frame + index) % 10);
      return randomLine(width);
    }).join('\n');

    console.clear();
    console.log(
      `%c${matrixBlock}\n\n%c${title}\n\n%c${matrixBlock}`,
      'color:#35a849;font-family:monospace;font-weight:700;line-height:1.18;',
      'color:#ffdf34;background:#090909;font-family:monospace;font-size:16px;font-weight:900;padding:6px 8px;',
      'color:#35a849;font-family:monospace;font-weight:700;line-height:1.18;',
    );

    frame = frame >= 80 ? 0 : frame + 1;
  }

  draw();
  window.__bulltismConsoleSignature = window.setInterval(draw, 850);
})();
