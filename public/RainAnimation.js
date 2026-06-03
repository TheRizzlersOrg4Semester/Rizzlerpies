/* global document */

(() => {
  const container = document.getElementById('rain-container');

  if (!container) {
    return;
  }

  const imageSrc = container.dataset.rainImage || '/public/rain-picture.png';
  const maxDrops = 35;
  const triggerWord = 'claus';
  let typedText = '';
  let rainInterval = null;

  function createDrop() {
    if (container.childElementCount >= maxDrops) {
      return;
    }

    const drop = document.createElement('img');
    const size = 34 + Math.random() * 42;
    const duration = 3 + Math.random() * 3.5;
    const drift = -40 + Math.random() * 80;

    drop.className = 'rain-picture';
    drop.src = imageSrc;
    drop.alt = '';
    drop.style.left = `${Math.random() * 100}vw`;
    drop.style.width = `${size}px`;
    drop.style.setProperty('--rain-duration', `${duration}s`);
    drop.style.setProperty('--rain-drift', `${drift}px`);
    drop.style.setProperty('--rain-spin', `${Math.random() > 0.5 ? 1 : -1}`);

    container.appendChild(drop);
    setTimeout(() => drop.remove(), duration * 1000);
  }

  function startRain() {
    if (rainInterval) {
      return;
    }

    for (let i = 0; i < 8; i += 1) {
      createDrop();
    }

    rainInterval = setInterval(createDrop, 180);
  }

  function handleKeydown(event) {
    if (event.key.length !== 1) {
      return;
    }

    typedText = `${typedText}${event.key.toLowerCase()}`.slice(-triggerWord.length);

    if (typedText === triggerWord) {
      startRain();
      document.removeEventListener('keydown', handleKeydown);
    }
  }

  document.addEventListener('keydown', handleKeydown);
})();
